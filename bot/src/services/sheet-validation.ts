import type { Guild, GuildMember, User } from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { ParsedParticipant, TeamPlayer } from '../types/participant.js';
import { loadTournamentParticipants } from './participants.js';
import {
  SheetsError,
  fetchPublicSheetTable,
  validateParticipantSheet,
  type TournamentFormat,
} from './sheets.js';

const DISCORD_ACCOUNT_MIN_AGE_MS = 60 * 24 * 60 * 60 * 1000; // ~2 months
const BANNED_IDS_CACHE_TTL_MS = 5 * 60 * 1000;

let bannedGameIdsCache: { ids: Set<string>; expiresAt: number } | null = null;

export type SheetValidationIssueCode =
  | 'banned_game_id'
  | 'duplicate_discord_id'
  | 'duplicate_game_id'
  | 'discord_account_too_new'
  | 'discord_id_from_tag'
  | 'invalid_discord_id'
  | 'invalid_game_id'
  | 'missing_discord_id'
  | 'missing_game_id'
  | 'missing_discord_tag'
  | 'not_in_server'
  | 'staff_role'
  | 'tag_mismatch';

export interface SheetValidationIssue {
  code: SheetValidationIssueCode;
  sheetRow: number;
  teamLabel: string;
  playerLabel: string;
  message: string;
}

export interface SheetValidationResult {
  format: TournamentFormat;
  teamCount: number;
  playerCount: number;
  issues: SheetValidationIssue[];
  passed: boolean;
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDiscordTag(tag: string): string {
  const trimmed = tag.trim().replace(/^@+/, '');
  const hashIndex = trimmed.lastIndexOf('#');
  const namePart = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  return namePart.toLowerCase();
}

function isValidDiscordSnowflake(value: string | null): boolean {
  if (!value) return false;
  return /^\d{17,20}$/.test(value.trim());
}

function isValidGameId(value: string | null): boolean {
  if (!value?.trim()) return false;
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) return false;
  // MW in-game IDs are hexadecimal strings (e.g. B05B25680A59EEB7)
  return /^[0-9A-Fa-f]{8,32}$/.test(trimmed);
}

function tagMatchesUser(tag: string, user: User): boolean {
  const normalizedTag = normalizeDiscordTag(tag);
  const candidates = [user.username, user.globalName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.toLowerCase());

  return candidates.includes(normalizedTag);
}

function findMembersByTag(guild: Guild, tag: string): GuildMember[] {
  return [...guild.members.cache.filter((member) => tagMatchesUser(tag, member.user)).values()];
}

type DiscordResolveResult =
  | { kind: 'ok'; member: GuildMember; effectiveId: string }
  | {
      kind: 'resolved_from_tag';
      member: GuildMember;
      effectiveId: string;
      sheetIdLabel: string;
    }
  | { kind: 'tag_mismatch'; member: GuildMember; effectiveId: string }
  | {
      kind: 'unresolved';
      reason: 'missing_id' | 'invalid_id' | 'tag_ambiguous' | 'not_in_server';
    };

async function resolveDiscordForValidation(
  guild: Guild,
  player: TeamPlayer,
): Promise<DiscordResolveResult> {
  const tag = player.discordTag?.trim() ?? '';
  const rawId = player.discordId?.trim() ?? '';
  const hasValidId = isValidDiscordSnowflake(rawId);

  if (!hasValidId) {
    if (!tag) {
      if (!rawId) return { kind: 'unresolved', reason: 'missing_id' };
      return { kind: 'unresolved', reason: 'invalid_id' };
    }

    const tagMembers = findMembersByTag(guild, tag);
    if (tagMembers.length > 1) {
      return { kind: 'unresolved', reason: 'tag_ambiguous' };
    }
    if (tagMembers.length === 1) {
      const member = tagMembers[0]!;
      return {
        kind: 'resolved_from_tag',
        member,
        effectiveId: member.id,
        sheetIdLabel: rawId || 'missing',
      };
    }

    if (!rawId) return { kind: 'unresolved', reason: 'missing_id' };
    return { kind: 'unresolved', reason: 'invalid_id' };
  }

  const memberFromId = await guild.members.fetch(rawId).catch(() => null);
  if (!memberFromId) {
    return { kind: 'unresolved', reason: 'not_in_server' };
  }

  if (tag && !tagMatchesUser(tag, memberFromId.user)) {
    return { kind: 'tag_mismatch', member: memberFromId, effectiveId: rawId };
  }

  return { kind: 'ok', member: memberFromId, effectiveId: rawId };
}

function formatDiscordIdFromTagMessage(tag: string, sheetIdLabel: string, member: GuildMember): string {
  const sheetPart =
    sheetIdLabel === 'missing'
      ? 'Discord ID is missing'
      : `Discord ID \`${sheetIdLabel}\` is incorrect`;
  return `${sheetPart}. Tag "${tag}" belongs to <@${member.id}> — use ID \`${member.id}\` in the sheet.`;
}

function teamLabel(participant: ParsedParticipant): string {
  return participant.teamName ?? participant.bracketName;
}

function resolveBannedSheetUrl(): string {
  const url = process.env.BANNED_PLAYERS_SHEET_URL?.trim();
  if (!url) {
    throw new SheetsError(
      'Banned players sheet is not configured. Set BANNED_PLAYERS_SHEET_URL in the bot environment.',
    );
  }
  return url;
}

function findBannedIdColumnIndex(headerRow: string[]): number {
  const normalizedHeaders = headerRow.map((header) => header.trim().toLowerCase());
  const exactCandidates = [
    'in-game id',
    'ingame id',
    'game id',
    'player id',
    'uid',
    'id',
  ];

  for (const candidate of exactCandidates) {
    const index = normalizedHeaders.indexOf(candidate);
    if (index >= 0) return index;
  }

  return headerRow.findIndex((header) =>
    /in[- ]?game.*id|game.*id|player.*id/i.test(header.trim()),
  );
}

async function loadBannedGameIds(): Promise<Set<string>> {
  const now = Date.now();
  if (bannedGameIdsCache && bannedGameIdsCache.expiresAt > now) {
    return bannedGameIdsCache.ids;
  }

  const sheetUrl = resolveBannedSheetUrl();
  let headerRow: string[];
  let rows: string[][];

  try {
    ({ headerRow, rows } = await fetchPublicSheetTable(sheetUrl));
  } catch (error) {
    const detail =
      error instanceof SheetsError ? error.message : 'Unknown error while reading the sheet.';
    throw new SheetsError(
      `Banned players sheet could not be loaded. ${detail} Verify BANNED_PLAYERS_SHEET_URL is correct and publicly readable.`,
    );
  }

  const columnIndex = findBannedIdColumnIndex(headerRow);

  if (columnIndex < 0) {
    throw new SheetsError(
      'Banned players sheet is missing a recognizable game ID column (e.g. "Game ID").',
    );
  }

  const ids = new Set<string>();
  for (const row of rows) {
    const raw = (row[columnIndex] ?? '').trim();
    if (!raw) continue;
    ids.add(normalizeLookup(raw));
  }

  bannedGameIdsCache = { ids, expiresAt: now + BANNED_IDS_CACHE_TTL_MS };
  return ids;
}

function collectStaffRoleIds(guildConfig: GuildRow | null): string[] {
  if (!guildConfig) return [];
  return [guildConfig.staff_role_id, guildConfig.judge_role_id, guildConfig.recorder_role_id].filter(
    (roleId): roleId is string => Boolean(roleId),
  );
}

function memberHasStaffRole(
  memberRoles: { has: (roleId: string) => boolean },
  staffRoleIds: string[],
): string | null {
  for (const roleId of staffRoleIds) {
    if (memberRoles.has(roleId)) return roleId;
  }
  return null;
}

function pushIssue(
  issues: SheetValidationIssue[],
  issue: Omit<SheetValidationIssue, 'message'> & { message?: string },
): void {
  const defaults: Record<SheetValidationIssueCode, string> = {
    banned_game_id: 'In-game ID is on the banned players list.',
    duplicate_discord_id: 'Discord ID is registered on more than one team.',
    duplicate_game_id: 'In-game ID is registered on more than one team.',
    discord_account_too_new: 'Discord account is younger than 2 months.',
    discord_id_from_tag:
      'Discord ID in the sheet is wrong; the correct ID was resolved from the tag.',
    invalid_discord_id: 'Discord ID is missing or invalid.',
    invalid_game_id: 'In-game ID is missing or invalid.',
    missing_discord_id: 'Discord ID is missing.',
    missing_game_id: 'In-game ID is missing.',
    missing_discord_tag: 'Discord tag/username is missing.',
    not_in_server: 'User is not a member of this server.',
    staff_role: 'User has a staff, judge, or recorder role.',
    tag_mismatch: 'Discord tag does not match the Discord ID.',
  };

  issues.push({
    ...issue,
    message: issue.message ?? defaults[issue.code],
  });
}

async function validatePlayer(params: {
  guild: Guild;
  guildConfig: GuildRow | null;
  participant: ParsedParticipant;
  player: TeamPlayer;
  bannedGameIds: Set<string>;
  staffRoleIds: string[];
  discordIdOwners: Map<string, { sheetRow: number; teamLabel: string; playerLabel: string }>;
  gameIdOwners: Map<string, { sheetRow: number; teamLabel: string; playerLabel: string }>;
  issues: SheetValidationIssue[];
}): Promise<void> {
  const { participant, player } = params;
  const team = teamLabel(participant);
  const base = {
    sheetRow: participant.sheetRowIndex,
    teamLabel: team,
    playerLabel: player.label,
  };

  if (!player.discordTag?.trim()) {
    pushIssue(params.issues, { ...base, code: 'missing_discord_tag' });
  }

  const discordResolution = await resolveDiscordForValidation(params.guild, player);

  if (discordResolution.kind === 'resolved_from_tag') {
    const tag = player.discordTag!.trim();
    pushIssue(params.issues, {
      ...base,
      code: 'discord_id_from_tag',
      message: formatDiscordIdFromTagMessage(
        tag,
        discordResolution.sheetIdLabel,
        discordResolution.member,
      ),
    });
  } else if (discordResolution.kind === 'tag_mismatch') {
    pushIssue(params.issues, {
      ...base,
      code: 'tag_mismatch',
      message: `Sheet tag "${player.discordTag?.trim()}" does not match @${discordResolution.member.user.username}.`,
    });
  } else if (discordResolution.kind === 'unresolved') {
    switch (discordResolution.reason) {
      case 'missing_id':
        pushIssue(params.issues, { ...base, code: 'missing_discord_id' });
        break;
      case 'invalid_id':
        pushIssue(params.issues, { ...base, code: 'invalid_discord_id' });
        break;
      case 'tag_ambiguous':
        pushIssue(params.issues, {
          ...base,
          code: 'invalid_discord_id',
          message: `Discord ID is invalid and tag "${player.discordTag?.trim()}" matches multiple members in this server.`,
        });
        break;
      case 'not_in_server':
        pushIssue(params.issues, { ...base, code: 'not_in_server' });
        break;
      default:
        break;
    }
  }

  const effectiveMember =
    discordResolution.kind === 'ok' ||
    discordResolution.kind === 'resolved_from_tag' ||
    discordResolution.kind === 'tag_mismatch'
      ? discordResolution.member
      : null;
  const effectiveId =
    discordResolution.kind === 'ok' ||
    discordResolution.kind === 'resolved_from_tag' ||
    discordResolution.kind === 'tag_mismatch'
      ? discordResolution.effectiveId
      : null;

  if (effectiveId) {
    const priorDiscord = params.discordIdOwners.get(effectiveId);
    if (priorDiscord) {
      pushIssue(params.issues, {
        ...base,
        code: 'duplicate_discord_id',
        message: `Discord ID is already used by ${priorDiscord.teamLabel} (${priorDiscord.playerLabel}, row ${priorDiscord.sheetRow}).`,
      });
    } else {
      params.discordIdOwners.set(effectiveId, {
        sheetRow: participant.sheetRowIndex,
        teamLabel: team,
        playerLabel: player.label,
      });
    }
  }

  if (!player.inGameId?.trim()) {
    pushIssue(params.issues, { ...base, code: 'missing_game_id' });
  } else if (!isValidGameId(player.inGameId)) {
    pushIssue(params.issues, { ...base, code: 'invalid_game_id' });
  } else {
    const normalizedGameId = normalizeLookup(player.inGameId);
    if (params.bannedGameIds.has(normalizedGameId)) {
      pushIssue(params.issues, { ...base, code: 'banned_game_id' });
    }

    const priorGame = params.gameIdOwners.get(normalizedGameId);
    if (priorGame) {
      pushIssue(params.issues, {
        ...base,
        code: 'duplicate_game_id',
        message: `In-game ID is already used by ${priorGame.teamLabel} (${priorGame.playerLabel}, row ${priorGame.sheetRow}).`,
      });
    } else {
      params.gameIdOwners.set(normalizedGameId, {
        sheetRow: participant.sheetRowIndex,
        teamLabel: team,
        playerLabel: player.label,
      });
    }
  }

  if (!effectiveMember) {
    return;
  }

  const staffRoleId = memberHasStaffRole(effectiveMember.roles.cache, params.staffRoleIds);
  if (staffRoleId) {
    pushIssue(params.issues, {
      ...base,
      code: 'staff_role',
      message: 'User has a staff, judge, or recorder role and cannot register as a participant.',
    });
  }

  const accountAgeMs = Date.now() - effectiveMember.user.createdAt.getTime();
  if (accountAgeMs < DISCORD_ACCOUNT_MIN_AGE_MS) {
    pushIssue(params.issues, { ...base, code: 'discord_account_too_new' });
  }
}

export async function validateParticipantSheetData(params: {
  sheetLink: string;
  guild: Guild;
  guildConfig: GuildRow | null;
}): Promise<SheetValidationResult> {
  try {
    await validateParticipantSheet(params.sheetLink);
  } catch (error) {
    const detail =
      error instanceof SheetsError ? error.message : 'Unknown error while reading the sheet.';
    throw new SheetsError(`Participant sheet could not be validated. ${detail}`);
  }

  const { format, participants } = await loadTournamentParticipants(params.sheetLink);
  const bannedGameIds = await loadBannedGameIds();
  const staffRoleIds = collectStaffRoleIds(params.guildConfig);

  await params.guild.members.fetch().catch(() => undefined);

  const issues: SheetValidationIssue[] = [];
  const discordIdOwners = new Map<
    string,
    { sheetRow: number; teamLabel: string; playerLabel: string }
  >();
  const gameIdOwners = new Map<
    string,
    { sheetRow: number; teamLabel: string; playerLabel: string }
  >();

  let playerCount = 0;
  for (const participant of participants) {
    for (const player of participant.players) {
      playerCount += 1;
      await validatePlayer({
        guild: params.guild,
        guildConfig: params.guildConfig,
        participant,
        player,
        bannedGameIds,
        staffRoleIds,
        discordIdOwners,
        gameIdOwners,
        issues,
      });
    }
  }

  return {
    format,
    teamCount: participants.length,
    playerCount,
    issues,
    passed: issues.length === 0,
  };
}
