import { type Client, type EmbedBuilder, type Guild, type GuildMember, type Role, type User } from 'discord.js';
import type { GuildSettingsEdit } from '../schemas/guild-settings.js';
import type { StaffFirePosition, StaffRecruitPosition } from '../schemas/staff-positions.js';
import type { StaffConfigEdit } from '../schemas/staff-config.js';
import type { GuildRow } from '../types/guild.js';
import { LOG_COLORS } from '../constants/log-colors.js';
import {
  buildBotEventLogEmbed,
  buildChallongeCredentialsUpdatedLogEmbed,
  buildChallongeMatchUpdatedLogEmbed,
  buildChallongeTournamentLinkedLogEmbed,
  buildSettingsConfigLogEmbed,
  buildStaffConfigLogEmbed,
} from '../utils/log-embeds.js';
import { formatEmphasizedName, formatMatchScoreBlock, formatMatchupTitle } from '../utils/match-formatting.js';
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
  embed: EmbedBuilder;
}): Promise<void> {
  await sendGuildLog(params.client, params.guild, params.config, 'challonge_logs', params.embed);
}

export async function logBotEvent(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  title: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
  triggeredBy: User;
}): Promise<void> {
  const embed = buildBotEventLogEmbed(
    params.title,
    params.fields,
    params.color,
    params.triggeredBy,
  );
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
  });

  await logChallongeEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    embed: buildChallongeTournamentLinkedLogEmbed({
      tournamentName: params.tournament.name,
      challongeId: params.tournament.challonge_id,
      triggeredBy: params.triggeredBy,
    }),
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
    triggeredBy: params.triggeredBy,
  });

  if (params.changes.challonge_key) {
    await logChallongeEvent({
      client: params.client,
      guild: params.guild,
      config: params.config,
      embed: buildChallongeCredentialsUpdatedLogEmbed({
        tournamentName: params.tournament.name,
        challongeId: params.tournament.challonge_id,
        triggeredBy: params.triggeredBy,
      }),
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
    triggeredBy: params.triggeredBy,
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
  ticketChannelId: string | null;
}): Promise<void> {
  const winnerName = params.winnerSide === 1 ? params.team1Name : params.team2Name;

  await logChallongeEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    embed: buildChallongeMatchUpdatedLogEmbed({
      guild: params.guild,
      tournamentName: params.tournament.name,
      challongeId: params.tournament.challonge_id,
      matchLabel: formatMatchupTitle(params.team1Name, params.team2Name),
      ticketChannelId: params.ticketChannelId,
      scoreLine: `${params.score1} - ${params.score2}`,
      winnerName,
      triggeredBy: params.triggeredBy,
    }),
  });
}

export async function logBracketCorrected(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournament: TournamentRow;
  team1Name: string;
  team2Name: string;
  winnerSide: 1 | 2;
  ticketChannelId: string | null;
  oldScore1: number | null;
  oldScore2: number | null;
  newScore1: number;
  newScore2: number;
}): Promise<void> {
  const winnerName = params.winnerSide === 1 ? params.team1Name : params.team2Name;
  const newScoreLine = `${params.newScore1} - ${params.newScore2}`;
  const scoreLine =
    params.oldScore1 != null && params.oldScore2 != null
      ? `${params.oldScore1} - ${params.oldScore2} / ${newScoreLine}`
      : newScoreLine;

  await logChallongeEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    embed: buildChallongeMatchUpdatedLogEmbed({
      guild: params.guild,
      tournamentName: params.tournament.name,
      challongeId: params.tournament.challonge_id,
      matchLabel: formatMatchupTitle(params.team1Name, params.team2Name),
      ticketChannelId: params.ticketChannelId,
      scoreLine,
      winnerName,
      triggeredBy: params.triggeredBy,
    }),
  });
}

export { buildBotEventLogEmbed };

export async function logScheduleCreated(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  schedule: { id: string; scheduled_at: string };
  tournamentName: string;
  matchLabel: string;
  ticketChannelId: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Created',
    fields: [
      { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
      { name: 'Match', value: params.matchLabel, inline: true },
      { name: 'Scheduled At', value: `\`${params.schedule.scheduled_at}\``, inline: false },
      { name: 'Ticket', value: formatChannel(params.guild, params.ticketChannelId), inline: true },
      { name: 'Schedule ID', value: params.schedule.id, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleUpdated(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  schedule: { id: string; scheduled_at: string };
  tournamentName: string;
  matchLabel: string;
  ticketChannelId: string;
  reason?: string;
}): Promise<void> {
  const fields = [
    { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
    { name: 'Match', value: params.matchLabel, inline: true },
    { name: 'Scheduled At', value: `\`${params.schedule.scheduled_at}\``, inline: false },
    { name: 'Ticket', value: formatChannel(params.guild, params.ticketChannelId), inline: true },
    { name: 'Schedule ID', value: params.schedule.id, inline: true },
    triggeredByField(params.triggeredBy),
  ];
  if (params.reason?.trim()) {
    fields.push({ name: 'Reason', value: params.reason.trim(), inline: false });
  }
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Updated',
    fields,
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleDeleted(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  matchLabel: string;
  ticketChannelId: string;
  reason?: string;
}): Promise<void> {
  const fields = [
    { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
    { name: 'Match', value: params.matchLabel, inline: true },
    { name: 'Ticket', value: formatChannel(params.guild, params.ticketChannelId), inline: true },
    triggeredByField(params.triggeredBy),
  ];
  if (params.reason?.trim()) {
    fields.push({ name: 'Reason', value: params.reason.trim(), inline: false });
  }
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Deleted',
    fields,
    color: LOG_COLORS.danger,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleRefreshed(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  scheduleId: string;
  tournamentName: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Refreshed',
    fields: [
      { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
      { name: 'Schedule ID', value: params.scheduleId, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleResign(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  scheduleId: string;
  roles: Array<'judge' | 'recorder'>;
  reason?: string;
  tournamentName: string;
}): Promise<void> {
  const fields = [
    { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
    {
      name: 'Roles',
      value: params.roles.map((role) => (role === 'judge' ? 'Judge' : 'Recorder')).join(', '),
      inline: true,
    },
    { name: 'Schedule ID', value: params.scheduleId, inline: true },
    triggeredByField(params.triggeredBy),
  ];
  if (params.reason?.trim()) {
    fields.push({ name: 'Reason', value: params.reason.trim(), inline: false });
  }
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Resignation',
    fields,
    color: LOG_COLORS.warning,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleStaffAssigned(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  scheduleId: string;
  role: 'judge' | 'recorder';
  tournamentName: string;
  matchLabel: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Staff Assigned',
    fields: [
      { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
      { name: 'Match', value: params.matchLabel, inline: true },
      {
        name: 'Role',
        value: params.role === 'judge' ? 'Judge' : 'Recorder',
        inline: true,
      },
      { name: 'Assignee', value: formatUserFromUser(params.triggeredBy), inline: true },
      { name: 'Schedule ID', value: params.scheduleId, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleResultDeclared(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  winnerSide: 1 | 2;
  resultChannelId: string;
  scheduleId: string;
  notes?: string | null;
}): Promise<void> {
  const fields = [
    { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
    {
      name: 'Match',
      value: formatMatchupTitle(params.team1Name, params.team2Name),
      inline: true,
    },
    {
      name: 'Score',
      value: formatMatchScoreBlock({
        team1Name: params.team1Name,
        team2Name: params.team2Name,
        score1: params.team1Score,
        score2: params.team2Score,
        winnerSide: params.winnerSide,
      }),
      inline: false,
    },
    {
      name: 'Results Channel',
      value: formatChannel(params.guild, params.resultChannelId),
      inline: true,
    },
    { name: 'Schedule ID', value: params.scheduleId, inline: true },
    triggeredByField(params.triggeredBy),
  ];

  if (params.notes?.trim()) {
    fields.push({ name: 'Notes', value: params.notes.trim(), inline: false });
  }

  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Result Declared',
    fields,
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logScheduleResultDeleted(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  matchLabel: string;
  scheduleId: string;
  reason?: string;
}): Promise<void> {
  const fields = [
    { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
    { name: 'Match', value: params.matchLabel, inline: true },
    { name: 'Schedule ID', value: params.scheduleId, inline: true },
    triggeredByField(params.triggeredBy),
  ];

  if (params.reason?.trim()) {
    fields.push({ name: 'Reason', value: params.reason.trim(), inline: false });
  }

  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Schedule Result Deleted',
    fields,
    color: LOG_COLORS.warning,
    triggeredBy: params.triggeredBy,
  });
}

export async function logAttendanceMarked(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  matchLabel: string;
  ticketChannelId: string;
  attendanceId: string;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Attendance Marked',
    fields: [
      { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
      { name: 'Match', value: params.matchLabel, inline: true },
      { name: 'Ticket', value: formatChannel(params.guild, params.ticketChannelId), inline: true },
      { name: 'Attendance ID', value: params.attendanceId, inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logAttendanceDeleted(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  matchLabel: string;
  ticketChannelId: string;
  reason?: string;
}): Promise<void> {
  const fields = [
    { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
    { name: 'Match', value: params.matchLabel, inline: true },
    { name: 'Ticket', value: formatChannel(params.guild, params.ticketChannelId), inline: true },
    triggeredByField(params.triggeredBy),
  ];

  if (params.reason) {
    fields.push({ name: 'Reason', value: params.reason, inline: false });
  }

  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Attendance Deleted',
    fields,
    color: LOG_COLORS.warning,
    triggeredBy: params.triggeredBy,
  });
}

export async function logRecordingLinkAdded(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  matchLabel: string;
  linkIndex: number;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Recording Link Added',
    fields: [
      { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
      { name: 'Match', value: params.matchLabel, inline: true },
      { name: 'Link #', value: String(params.linkIndex), inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.config,
    triggeredBy: params.triggeredBy,
  });
}

export async function logRecordingLinkDeleted(params: {
  client: Client;
  guild: Guild;
  config: GuildRow;
  triggeredBy: User;
  tournamentName: string;
  matchLabel: string;
  deletedCount: number;
}): Promise<void> {
  await logBotEvent({
    client: params.client,
    guild: params.guild,
    config: params.config,
    title: 'Recording Links Deleted',
    fields: [
      { name: 'Tournament', value: formatEmphasizedName(params.tournamentName), inline: true },
      { name: 'Match', value: params.matchLabel, inline: true },
      { name: 'Links Removed', value: String(params.deletedCount), inline: true },
      triggeredByField(params.triggeredBy),
    ],
    color: LOG_COLORS.warning,
    triggeredBy: params.triggeredBy,
  });
}
