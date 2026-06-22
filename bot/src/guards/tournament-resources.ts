import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type TextBasedChannel,
} from 'discord.js';
import type { TournamentAdd, TournamentEdit } from '../schemas/tournament.js';
import { ResourceValidationError } from './discord-resources.js';

const TEXT_CHANNEL_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
] as const;

const CATEGORY_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageChannels,
] as const;

function assertRoleInGuild(guild: Guild, roleId: string, label: string): void {
  if (!guild.roles.cache.get(roleId)) {
    throw new ResourceValidationError(`${label} does not exist in this server.`);
  }
}

function getGuildChannel(guild: Guild, channelId: string, label: string): GuildBasedChannel {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    throw new ResourceValidationError(`${label} does not exist in this server.`);
  }
  return channel;
}

function assertTextChannel(guild: Guild, channelId: string, label: string): TextBasedChannel {
  const channel = getGuildChannel(guild, channelId, label);
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    throw new ResourceValidationError(`${label} must be a text channel.`);
  }
  return channel as TextBasedChannel;
}

function assertCategory(guild: Guild, categoryId: string, label: string): void {
  const channel = getGuildChannel(guild, categoryId, label);
  if (channel.type !== ChannelType.GuildCategory) {
    throw new ResourceValidationError(`${label} must be a category channel.`);
  }
}

function assertBotAccess(
  channel: GuildBasedChannel | TextBasedChannel,
  label: string,
  requiredPerms: readonly bigint[],
): void {
  if (!('guild' in channel) || !channel.guild) {
    throw new ResourceValidationError(`${label} must belong to this server.`);
  }

  const me = channel.guild.members.me;
  if (!me) {
    throw new ResourceValidationError('Bot member is not available in this server.');
  }

  const permissions = channel.permissionsFor(me);
  if (!permissions) {
    throw new ResourceValidationError(`Cannot evaluate bot permissions for ${label}.`);
  }

  const missing = requiredPerms.filter((perm) => !permissions.has(perm));
  if (missing.length > 0) {
    throw new ResourceValidationError(
      `Bot lacks required permissions in ${label}. Ensure the bot can view and manage the selected resource.`,
    );
  }
}

function validateTextChannelField(guild: Guild, channelId: string | undefined, label: string): void {
  if (!channelId) return;
  const channel = assertTextChannel(guild, channelId, label);
  assertBotAccess(channel, label, TEXT_CHANNEL_PERMS);
}

function validateCategoryField(guild: Guild, categoryId: string | undefined, label: string): void {
  if (!categoryId) return;
  assertCategory(guild, categoryId, label);
  const channel = guild.channels.cache.get(categoryId);
  if (channel) {
    assertBotAccess(channel, label, CATEGORY_PERMS);
  }
}

export function validateTournamentResources(
  guild: Guild,
  tournament: TournamentAdd | TournamentEdit,
): void {
  if (tournament.admin_role_id) {
    assertRoleInGuild(guild, tournament.admin_role_id, 'Admin role');
  }
  if (tournament.helper_role_id) {
    assertRoleInGuild(guild, tournament.helper_role_id, 'Helper role');
  }

  validateTextChannelField(guild, tournament.attendance_channel_id, 'Attendance channel');
  validateTextChannelField(guild, tournament.transcript_channel_id, 'Transcript channel');
  validateTextChannelField(guild, tournament.rules_channel_id, 'Rules channel');
  validateTextChannelField(guild, tournament.deadline_channel_id, 'Deadline channel');
  validateTextChannelField(guild, tournament.result_channel_id, 'Result channel');
  validateTextChannelField(guild, tournament.events_links_channel_id, 'Events links channel');

  validateCategoryField(guild, tournament.closed_ticket_category_id, 'Closed ticket category');
  validateCategoryField(guild, tournament.close_ticket_category_2_id, 'Secondary closed ticket category');
  validateCategoryField(guild, tournament.ticket_open_category_1_id, 'Ticket open category 1');
  validateCategoryField(guild, tournament.ticket_open_category_2_id, 'Ticket open category 2');
  validateCategoryField(guild, tournament.ticket_open_category_3_id, 'Ticket open category 3');
  validateCategoryField(guild, tournament.ticket_open_category_4_id, 'Ticket open category 4');
}
