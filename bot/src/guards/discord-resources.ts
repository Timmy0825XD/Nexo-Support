import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type TextBasedChannel,
} from 'discord.js';
import type { GuildSettingsEdit, GuildSettingsSetup } from '../schemas/guild-settings.js';
import type { StaffConfigEdit, StaffConfigSet } from '../schemas/staff-config.js';

export class ResourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceValidationError';
  }
}

const STANDARD_CHANNEL_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
] as const;

const THUMBNAIL_CHANNEL_PERMS = [
  ...STANDARD_CHANNEL_PERMS,
  PermissionFlagsBits.AttachFiles,
] as const;

function assertRoleInGuild(guild: Guild, roleId: string, label: string): void {
  const role = guild.roles.cache.get(roleId);
  if (!role) {
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

function assertBotChannelAccess(
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
      `Bot lacks required permissions in ${label}. Ensure View Channel, Send Messages, and Embed Links are granted.`,
    );
  }
}

function validateSettingsChannel(
  guild: Guild,
  channelId: string,
  label: string,
  extraPerms: readonly bigint[] = STANDARD_CHANNEL_PERMS,
): void {
  const channel = assertTextChannel(guild, channelId, label);
  assertBotChannelAccess(channel, label, extraPerms);
}

export function validateSettingsResources(
  guild: Guild,
  settings: GuildSettingsSetup | GuildSettingsEdit,
): void {
  if (settings.admin_role_id) {
    assertRoleInGuild(guild, settings.admin_role_id, 'Admin role');
  }
  if (settings.challonge_logs_channel_id) {
    validateSettingsChannel(guild, settings.challonge_logs_channel_id, 'Challonge logs channel');
  }
  if (settings.transcript_logs_channel_id) {
    validateSettingsChannel(
      guild,
      settings.transcript_logs_channel_id,
      'Transcript logs channel',
    );
  }
  if (settings.bot_logs_channel_id) {
    validateSettingsChannel(guild, settings.bot_logs_channel_id, 'Bot logs channel');
  }
  if (settings.thumbnail_channel_id) {
    validateSettingsChannel(
      guild,
      settings.thumbnail_channel_id,
      'Thumbnail channel',
      THUMBNAIL_CHANNEL_PERMS,
    );
  }
}

export function validateStaffResources(guild: Guild, staff: StaffConfigSet | StaffConfigEdit): void {
  if (staff.staff_role_id) {
    assertRoleInGuild(guild, staff.staff_role_id, 'Staff role');
  }
  if (staff.judge_role_id) {
    assertRoleInGuild(guild, staff.judge_role_id, 'Judge role');
  }
  if (staff.recorder_role_id) {
    assertRoleInGuild(guild, staff.recorder_role_id, 'Recorder role');
  }
  if (staff.t1_admin_role_id) {
    assertRoleInGuild(guild, staff.t1_admin_role_id, 'T1 admin role');
  }
  if (staff.t2_admin_role_id) {
    assertRoleInGuild(guild, staff.t2_admin_role_id, 'T2 admin role');
  }
  if (staff.best_staff_role_id) {
    assertRoleInGuild(guild, staff.best_staff_role_id, 'Best staff role');
  }
  if (staff.server_helper_role_id) {
    assertRoleInGuild(guild, staff.server_helper_role_id, 'Server helper role');
  }
  if (staff.manager_role_id) {
    assertRoleInGuild(guild, staff.manager_role_id, 'Manager role');
  }
  if (staff.challonge_mod_role_id) {
    assertRoleInGuild(guild, staff.challonge_mod_role_id, 'Challonge moderator role');
  }

  const staffChannels: Array<{ id: string | undefined; label: string }> = [
    { id: staff.schedule_channel_id, label: 'Schedule channel' },
    { id: staff.staff_chat_channel_id, label: 'Staff chat channel' },
    { id: staff.staff_announcement_channel_id, label: 'Staff announcement channel' },
    { id: staff.staff_instructions_channel_id, label: 'Staff instructions channel' },
    { id: staff.staff_details_channel_id, label: 'Staff details channel' },
    { id: staff.event_rules_channel_id, label: 'Event rules channel' },
  ];

  for (const { id, label } of staffChannels) {
    if (id) {
      validateSettingsChannel(guild, id, label);
    }
  }
}
