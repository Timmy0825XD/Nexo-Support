import { type Client, type EmbedBuilder, type Guild, type User } from 'discord.js';
import type { GuildSettingsEdit } from '../schemas/guild-settings.js';
import type { StaffConfigEdit } from '../schemas/staff-config.js';
import type { GuildRow } from '../types/guild.js';
import {
  buildBotEventLogEmbed,
  buildChallongeLogEmbed,
  buildSettingsConfigLogEmbed,
  buildStaffConfigLogEmbed,
} from '../utils/log-embeds.js';

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
}): Promise<void> {
  const embed = buildBotEventLogEmbed(params.title, params.fields);
  await sendGuildLog(params.client, params.guild, params.config, 'bot_logs', embed);
}

export { buildBotEventLogEmbed };
