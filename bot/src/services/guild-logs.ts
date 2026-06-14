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
  formatChannel,
  formatMember,
  formatRoleFromRole,
  formatRoleList,
  formatUserFromUser,
} from '../utils/guild-display.js';
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

export { buildBotEventLogEmbed };
