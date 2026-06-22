import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildMember,
  type Role,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { ParsedParticipant, TeamPlayer } from '../types/participant.js';
import { loadTournamentParticipants } from './participants.js';
import { findAvailableCategory } from './match-rooms.js';
import { SheetsError } from './sheets.js';
import { buildValidationRoleWelcomeContent } from '../utils/validation-role-display.js';
import {
  buildValidationChannelName,
  buildValidationTicketPermissionOverwrites,
  buildValidationTicketTopic,
  resolveGuildMemberForPlayer,
} from '../utils/validation-ticket.js';

export class SheetValidationRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetValidationRoleError';
  }
}

export interface ValidationRolePlayerStatus {
  label: string;
  displayName: string;
  discordId: string | null;
  discordTag: string;
  member: GuildMember | null;
  hasRole: boolean;
  issue: 'missing_role' | 'not_in_server' | null;
}

export interface ValidationRoleTeamResult {
  teamLabel: string;
  sheetRow: number;
  players: ValidationRolePlayerStatus[];
  verifiedCount: number;
  totalMembers: number;
  passed: boolean;
  channelId: string | null;
}

export interface ValidationRoleFailedTeam {
  teamLabel: string;
  sheetRow: number;
  reason: string;
}

export interface SheetValidationRoleRunResult {
  totalTeams: number;
  approvedCount: number;
  problemCount: number;
  channelsCreated: number;
  channelsFailed: number;
  approvedTeams: Array<{
    teamLabel: string;
    verifiedCount: number;
    totalMembers: number;
  }>;
  problemTeams: ValidationRoleTeamResult[];
  failedTeams: ValidationRoleFailedTeam[];
}

function teamDisplayLabel(participant: ParsedParticipant): string {
  return participant.teamName?.trim() || participant.bracketName.trim();
}

function formatPlayerIssue(
  member: GuildMember | null,
  hasRole: boolean,
): 'missing_role' | 'not_in_server' | null {
  if (!member) return 'not_in_server';
  if (!hasRole) return 'missing_role';
  return null;
}

function resolvePlayerTag(player: TeamPlayer, member: GuildMember | null): string {
  const sheetTag = player.discordTag?.trim();
  if (sheetTag) return sheetTag.replace(/^@+/, '');
  if (member) return member.user.username;
  return player.label;
}

function formatPlayerDisplayName(player: TeamPlayer, member: GuildMember | null): string {
  if (member) return member.user.username;
  return player.discordTag?.trim() || player.discordId?.trim() || player.label;
}

async function evaluateTeam(params: {
  guild: Guild;
  participant: ParsedParticipant;
  role: Pick<Role, 'id' | 'name'>;
}): Promise<ValidationRoleTeamResult> {
  const players: ValidationRolePlayerStatus[] = [];
  let verifiedCount = 0;

  for (const player of params.participant.players) {
    const member = await resolveGuildMemberForPlayer(params.guild, player);
    const hasRole = member ? member.roles.cache.has(params.role.id) : false;
    const issue = formatPlayerIssue(member, hasRole);

    if (member && hasRole) verifiedCount += 1;

    players.push({
      label: player.label,
      displayName: formatPlayerDisplayName(player, member),
      discordId: member?.id ?? player.discordId,
      discordTag: resolvePlayerTag(player, member),
      member,
      hasRole,
      issue,
    });
  }

  const totalMembers = players.length;
  const passed = players.every((player) => player.member && player.hasRole);

  return {
    teamLabel: teamDisplayLabel(params.participant),
    sheetRow: params.participant.sheetRowIndex,
    players,
    verifiedCount,
    totalMembers,
    passed,
    channelId: null,
  };
}

function pickResponsibleMember(players: ValidationRolePlayerStatus[]): GuildMember | null {
  for (const player of players) {
    if (player.member) return player.member;
  }
  return null;
}

function assertBotCanManageCategory(guild: Guild, category: CategoryChannel): void {
  const me = guild.members.me;
  if (!me) {
    throw new SheetValidationRoleError('Bot member is unavailable in this guild.');
  }

  const permissions = category.permissionsFor(me);
  if (
    !permissions?.has(PermissionFlagsBits.ManageChannels) ||
    !permissions.has(PermissionFlagsBits.ViewChannel)
  ) {
    throw new SheetValidationRoleError(
      `Bot lacks Manage Channels permission in category ${category.name}.`,
    );
  }
}

async function createValidationTicket(params: {
  guild: Guild;
  guildConfig: GuildRow | null;
  category: CategoryChannel;
  team: ValidationRoleTeamResult;
  role: Pick<Role, 'id' | 'name'>;
  transcriptChannelId: string;
}): Promise<TextChannel> {
  const responsible = pickResponsibleMember(params.team.players);
  if (!responsible) {
    throw new SheetValidationRoleError('No team member is in the server.');
  }

  const channelName = buildValidationChannelName(params.team.teamLabel);
  const overwrites = buildValidationTicketPermissionOverwrites({
    guild: params.guild,
    guildConfig: params.guildConfig,
    participantMemberId: responsible.id,
  });

  const channel = (await params.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: params.category.id,
    topic: buildValidationTicketTopic({
      teamLabel: params.team.teamLabel,
      transcriptChannelId: params.transcriptChannelId,
      sheetRow: params.team.sheetRow,
    }),
    permissionOverwrites: overwrites,
    reason: `Role validation ticket for ${params.team.teamLabel}`,
  })) as TextChannel;

  const issues = params.team.players
    .filter((player): player is ValidationRolePlayerStatus & { issue: 'missing_role' | 'not_in_server' } =>
      player.issue != null,
    )
    .map((player) => ({
      discordId: player.discordId,
      tag: player.discordTag,
      issue: player.issue,
    }));

  const organizerMention = params.guildConfig?.manager_role_id
    ? `<@&${params.guildConfig.manager_role_id}>`
    : 'the organizers';

  await channel.send(
    buildValidationRoleWelcomeContent({
      teamLabel: params.team.teamLabel,
      captainUserId: responsible.id,
      roleMention: `<@&${params.role.id}>`,
      organizerMention,
      issues,
    }),
  );

  return channel;
}

export async function runSheetValidationRole(params: {
  guild: Guild;
  guildConfig: GuildRow | null;
  sheetLink: string;
  role: Pick<Role, 'id' | 'name'>;
  categoryId: string;
  secondaryCategoryId?: string | null;
  transcriptChannelId: string;
}): Promise<SheetValidationRoleRunResult> {
  const categoryIds = [
    params.categoryId,
    params.secondaryCategoryId ?? null,
  ].filter((categoryId): categoryId is string => Boolean(categoryId));

  if (categoryIds.length === 0) {
    throw new SheetValidationRoleError('At least one ticket category is required.');
  }

  const transcriptChannel = await params.guild.channels.fetch(params.transcriptChannelId);
  if (!transcriptChannel?.isTextBased() || transcriptChannel.isDMBased()) {
    throw new SheetValidationRoleError('Transcript channel must be a guild text channel.');
  }

  const category = await findAvailableCategory(params.guild, categoryIds);
  if (!category) {
    throw new SheetValidationRoleError(
      'All configured ticket categories are full (50 channels each). Add another category or close unused tickets.',
    );
  }

  assertBotCanManageCategory(params.guild, category);

  let participants;
  try {
    ({ participants } = await loadTournamentParticipants(params.sheetLink));
  } catch (error) {
    if (error instanceof SheetsError) throw error;
    throw new SheetValidationRoleError(
      error instanceof Error ? error.message : 'Failed to load participant sheet.',
    );
  }

  if (participants.length === 0) {
    throw new SheetValidationRoleError('The participant sheet has no teams to validate.');
  }

  const approvedTeams: SheetValidationRoleRunResult['approvedTeams'] = [];
  const problemTeams: ValidationRoleTeamResult[] = [];
  const failedTeams: ValidationRoleFailedTeam[] = [];
  let channelsCreated = 0;
  let channelsFailed = 0;

  for (const participant of participants) {
    const team = await evaluateTeam({
      guild: params.guild,
      participant,
      role: params.role,
    });

    if (team.passed) {
      approvedTeams.push({
        teamLabel: team.teamLabel,
        verifiedCount: team.verifiedCount,
        totalMembers: team.totalMembers,
      });
      continue;
    }

    let activeCategory = category;
    const refreshedCategory = await findAvailableCategory(params.guild, categoryIds);
    if (!refreshedCategory) {
      failedTeams.push({
        teamLabel: team.teamLabel,
        sheetRow: team.sheetRow,
        reason: 'Ticket categories are full.',
      });
      channelsFailed += 1;
      problemTeams.push(team);
      continue;
    }
    activeCategory = refreshedCategory;

    try {
      const channel = await createValidationTicket({
        guild: params.guild,
        guildConfig: params.guildConfig,
        category: activeCategory,
        team,
        role: params.role,
        transcriptChannelId: params.transcriptChannelId,
      });
      team.channelId = channel.id;
      channelsCreated += 1;
    } catch (error) {
      channelsFailed += 1;
      failedTeams.push({
        teamLabel: team.teamLabel,
        sheetRow: team.sheetRow,
        reason:
          error instanceof SheetValidationRoleError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Failed to create support ticket.',
      });
    }

    problemTeams.push(team);
  }

  return {
    totalTeams: participants.length,
    approvedCount: approvedTeams.length,
    problemCount: problemTeams.length,
    channelsCreated,
    channelsFailed,
    approvedTeams,
    problemTeams,
    failedTeams,
  };
}
