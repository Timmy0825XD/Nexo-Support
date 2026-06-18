import { type Client, type EmbedBuilder, type Guild, type GuildMember, type Role, type User } from 'discord.js';
import type { GuildSettingsEdit } from '../schemas/guild-settings.js';
import type { StaffFirePosition, StaffRecruitPosition } from '../schemas/staff-positions.js';
import type { StaffConfigEdit } from '../schemas/staff-config.js';
import type { GuildRow } from '../types/guild.js';
import { LOG_COLORS } from '../constants/log-colors.js';
import {
  buildBotEventLogEmbed,
  buildChallongeLogEmbed,
  buildSettingsConfigLogEmbed,
  buildStaffConfigLogEmbed,
} from '../utils/log-embeds.js';
import {
  formatCompactScoreLine,
  formatEmphasizedName,
  formatMatchScoreBlock,
  formatMatchupTitle,
} from '../utils/match-formatting.js';
import {
  formatChannel,
  formatMember,
  formatRoleFromRole,
  formatRoleList,
  formatUserFromUser,
} from '../utils/guild-display.js';
import type { TournamentEdit } from '../schemas/tournament.js';
import type { TournamentRow } from '../types/tournament.js';
import type { StaffRoleChangeResult } from './staff-hr.js';
import type { BulkRoleResult } from './roles.js';

export type GuildLogTarget = 'bot_logs' | 'challonge_logs';

const LOG_CHANNEL_KEYS: Record<GuildLogTarget, keyof GuildRow> = {
  bot_logs: 'bot_logs_channel_id',
  challonge_logs: 'challonge_logs_channel_id',
};

/**
 * Sends an embed to a guild log channel configured via /settings setup.
 * Failures are logged to console and never thrown — audit logs must not break commands.
 */
export async function sendGuildLog(
  client: Client,
  guild: Guild,
  config: GuildRow,
  target: GuildLogTarget,
  embed: EmbedBuilder,
): Promise<boolean> {
  const channelId = config[LOG_CHANNEL_KEYS[target]];
  if (!channelId) {
    console.warn(`[guild-logs] No ${target} channel configured for guild ${guild.id}`);
    return false;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      console.warn(`[guild-logs] Channel ${channelId} is not a guild text channel`);
      return false;
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(`[guild-logs] Failed to send ${target} log in guild ${guild.id}:`, error);
    return false;
  }
}

export async function logSettingsChange(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  action: 'setup' | 'edit';
  triggeredBy: User;
  changes?: GuildSettingsEdit;
}): Promise<void> {
  const embed = buildSettingsConfigLogEmbed(
    params.guild,
    params.action,
    params.triggeredBy,
    params.changes,
  );
  await sendGuildLog(params.client, params.guild, params.config, 'bot_logs', embed);
}

export async function logStaffConfigChange(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  action: 'set' | 'edit';
  triggeredBy: User;
  changes?: StaffConfigEdit;
}): Promise<void> {
  const embed = buildStaffConfigLogEmbed(
    params.guild,
    params.action,
    params.triggeredBy,
    params.changes,
  );
  await sendGuildLog(params.client, params.guild, params.config, 'bot_logs', embed);
}

export async function logChallongeEvent(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  title: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}): Promise<void> {
  const embed = buildChallongeLogEmbed(params.title, params.fields);
  await sendGuildLog(params.client, params.guild, params.config, 'challonge_logs', embed);
}

export async function logBotEvent(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  title: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
}): Promise<void> {
  const embed = buildBotEventLogEmbed(params.title, params.fields, params.color);
  await sendGuildLog(params.client, params.guild, params.config, 'bot_logs', embed);
}

function triggeredByField(user: User) {
  return { name: 'Triggered By', value: formatUserFromUser(user), inline: true } as const;
}

export async function logStaffRecruitment(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  target: GuildMember;
  position: StaffRecruitPosition;
  result: StaffRoleChangeResult;
}): Promise<void> {
  const fields = [
    { name: 'Target', value: formatMember(params.target), inline: true },
    { name: 'Position', value: params.position, inline: true },
    triggeredByField(params.triggeredBy),
    { name: 'Roles Added', value: formatRoleList(params.guild, params.result.added), inline: false },
  ];

  if (params.result.notes.length > 0) {
    fields.push({ name: 'Notes', value: params.result.notes.join('\n'), inline: false });
  }

  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Staff Recruited',
    fields,
    color: LOG_COLORS.config,
  });
}

export async function logStaffRemoval(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  target: GuildMember;
  position: StaffFirePosition;
  result: StaffRoleChangeResult;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Staff Removed',
    fields: [
      { name: 'Target', value: formatMember(params.target), inline: true },
      { name: 'Position', value: params.position, inline: true },
      triggeredByField(params.triggeredBy),
      {
        name: 'Roles Removed',
        value: formatRoleList(params.guild, params.result.removed),
        inline: false,
      },
    ],
    color: LOG_COLORS.danger,
  });
}

export async function logRoleUserChange(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  target: GuildMember;
  role: Role;
  action: 'added' | 'removed';
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: params.action === 'added' ? 'Role Added to User' : 'Role Removed from User',
    fields: [
      { name: 'Target', value: formatMember(params.target), inline: true },
      { name: 'Role', value: formatRoleFromRole(params.role), inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: params.action === 'added' ? LOG_COLORS.bot : LOG_COLORS.danger,
  });
}

export async function logBulkRoleChange(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  role: Role;
  action: 'added' | 'removed';
  result: BulkRoleResult;
}): Promise<void> {
  const actionLabel = params.action === 'added' ? 'Added To' : 'Removed From';
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: params.action === 'added' ? 'Bulk Role Assignment' : 'Bulk Role Removal',
    fields: [
      { name: 'Role', value: formatRoleFromRole(params.role), inline: true },
      triggeredByField(params.triggeredBy),
      { name: actionLabel, value: `${params.result.processed} members`, inline: true },
      { name: 'Skipped', value: `${params.result.skipped} members`, inline: true },
      ...(params.result.failed > 0
        ? [{ name: 'Failed', value: `${params.result.failed} members`, inline: true }]
        : []),
    ],
    color: params.action === 'added' ? LOG_COLORS.bot : LOG_COLORS.danger,
  });
}

export async function logTicketClosed(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  channelId: string;
  matchId: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Ticket Closed',
    fields: [
      { name: 'Channel', value: formatChannel(params.guild, params.channelId), inline: true },
      { name: 'Match ID', value: params.matchId, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.warning,
  });
}

export async function logTicketReopened(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  channelId: string;
  matchId: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Ticket Reopened',
    fields: [
      { name: 'Channel', value: formatChannel(params.guild, params.channelId), inline: true },
      { name: 'Match ID', value: params.matchId, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.config,
  });
}

export async function logTicketDeleted(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  channelId: string;
  matchId: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Ticket Deleted',
    fields: [
      { name: 'Channel', value: formatChannel(params.guild, params.channelId), inline: true },
      { name: 'Match ID', value: params.matchId, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.danger,
  });
}

export async function logTournamentCreated(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Tournament Registered',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Tournament ID', value: params.tournament.id, inline: true },
      { name: 'Challonge ID', value: params.tournament.challonge_id, inline: true },
      triggeredByField(params.triggeredBy),
      {
        name: 'Auto Room',
        value: params.tournament.auto_room_enabled ? 'Enabled' : 'Disabled',
        inline: true,
      },
    ],
    color: LOG_COLORS.config,
  });

  await logChallongeEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Tournament Linked to Challonge',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Challonge ID', value: params.tournament.challonge_id, inline: true },
      triggeredByField(params.triggeredBy),
    ],
  });
}

export async function logTournamentUpdated(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
  changes: TournamentEdit & { challonge_key?: string };
}): Promise<void> {
  const changedFields = Object.keys(params.changes)
    .filter((key) => params.changes[key as keyof typeof params.changes] !== undefined)
    .join(', ');

  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Tournament Updated',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Tournament ID', value: params.tournament.id, inline: true },
      triggeredByField(params.triggeredBy),
      { name: 'Changed Fields', value: changedFields || 'None listed', inline: false },
    ],
    color: LOG_COLORS.config,
  });

  if (params.changes.challonge_key) {
    await logChallongeEvent({
      client: params.client,
      guild: params.guild,
      config: params.config,
      title: 'Tournament Challonge Credentials Updated',
      fields: [
        { name: 'Tournament', value: params.tournament.name, inline: true },
        { name: 'Challonge ID', value: params.tournament.challonge_id, inline: true },
        triggeredByField(params.triggeredBy),
      ],
    });
  }
}

export async function logTournamentDeleted(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Tournament Deleted',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Tournament ID', value: params.tournament.id, inline: true },
      { name: 'Challonge ID', value: params.tournament.challonge_id, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.danger,
  });
}

export async function logRoomsCreated(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
  result: {
    created: Array<{ channelId: string; channelName: string; matchId: string }>;
  };
}): Promise<void> {
  const roomLines = params.result.created
    .map((room) => `${formatChannel(params.guild, room.channelId)} (${room.channelName})`)
    .join('\n');

  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Match Rooms Created',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Rooms Created', value: String(params.result.created.length), inline: true },
      triggeredByField(params.triggeredBy),
      { name: 'Channels', value: roomLines || 'None', inline: false },
    ],
    color: LOG_COLORS.config,
  });
}

export async function logAutoRoomToggled(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
  enabled: boolean;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: params.enabled ? 'Auto Room Enabled' : 'Auto Room Disabled',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Tournament ID', value: params.tournament.id, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: params.enabled ? LOG_COLORS.config : LOG_COLORS.danger,
  });
}

export async function logScoreUploaded(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
  team1Name: string;
  team2Name: string;
  winnerSide: 1 | 2;
  score1: number;
  score2: number;
  note?: string | null;
}): Promise<void> {
  const fields = [
    { name: 'Torneo', value: formatEmphasizedName(params.tournament.name), inline: true },
    {
      name: 'Partido',
      value: formatMatchupTitle(params.team1Name, params.team2Name),
      inline: false,
    },
    {
      name: 'Marcador',
      value: formatMatchScoreBlock({
        team1Name: params.team1Name,
        team2Name: params.team2Name,
        score1: params.score1,
        score2: params.score2,
        winnerSide: params.winnerSide,
      }),
      inline: false,
    },
    {
      name: 'Resumen',
      value: formatCompactScoreLine({
        team1Name: params.team1Name,
        team2Name: params.team2Name,
        score1: params.score1,
        score2: params.score2,
      }),
      inline: false,
    },
    triggeredByField(params.triggeredBy),
  ];

  if (params.note?.trim()) {
    fields.push({ name: 'Nota', value: `*${params.note.trim()}*`, inline: false });
  }

  await logChallongeEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Score Uploaded',
    fields,
  });
}

export async function logBracketCorrected(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
  matchLabel: string;
  oldScore1: number | null;
  oldScore2: number | null;
  newScore1: number;
  newScore2: number;
}): Promise<void> {
  await logChallongeEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Bracket Score Corrected',
    fields: [
      { name: 'Tournament', value: params.tournament.name, inline: true },
      { name: 'Match', value: params.matchLabel, inline: false },
      {
        name: 'Old Score',
        value: `${params.oldScore1 ?? '?'} - ${params.oldScore2 ?? '?'}`,
        inline: true,
      },
      {
        name: 'New Score',
        value: `${params.newScore1} - ${params.newScore2}`,
        inline: true,
      },
      triggeredByField(params.triggeredBy),
    ],
  });
}

export { buildBotEventLogEmbed };
