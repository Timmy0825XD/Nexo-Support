import { EmbedBuilder, type Guild, type GuildMember, type Role, type User } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { GuildSettingsEdit } from '../schemas/guild-settings.js';
import type { StaffConfigEdit } from '../schemas/staff-config.js';
import type { GuildRow } from '../types/guild.js';
import { embedField, successEmbed } from './embeds.js';

export const NOT_CONFIGURED = '`Not configured`';
export const DELETED_ROLE = '❌ Deleted Role';
export const DELETED_CHANNEL = '❌ Deleted Channel';
export const DELETED_CATEGORY = '❌ Deleted Category';
export const UNKNOWN_MEMBER = '❌ Unknown Member';

export function formatRole(guild: Guild, roleId: string | null | undefined): string {
  if (!roleId) return NOT_CONFIGURED;
  const role = guild.roles.cache.get(roleId);
  return role ? formatRoleFromRole(role) : DELETED_ROLE;
}

export function formatRoleFromRole(role: Role | null | undefined): string {
  if (!role) return DELETED_ROLE;
  return `<@&${role.id}>`;
}

export function formatChannel(guild: Guild, channelId: string | null | undefined): string {
  if (!channelId) return NOT_CONFIGURED;
  const channel = guild.channels.cache.get(channelId);
  return channel ? `<#${channel.id}>` : DELETED_CHANNEL;
}

export function formatCategory(guild: Guild, categoryId: string | null | undefined): string {
  if (!categoryId) return NOT_CONFIGURED;
  const category = guild.channels.cache.get(categoryId);
  return category ? `<#${category.id}>` : DELETED_CATEGORY;
}

export function formatUser(userId: string | null | undefined): string {
  if (!userId) return NOT_CONFIGURED;
  return `<@${userId}>`;
}

export function formatUserFromUser(user: User | null | undefined): string {
  if (!user) return NOT_CONFIGURED;
  return `<@${user.id}>`;
}

export function formatMember(member: GuildMember | null | undefined): string {
  if (!member) return UNKNOWN_MEMBER;
  return `<@${member.id}>`;
}

export function formatRoleList(guild: Guild, roleIds: string[]): string {
  if (roleIds.length === 0) return 'None';
  return roleIds.map((roleId) => formatRole(guild, roleId)).join(', ');
}

export function buildSettingsShowEmbed(guild: Guild, config: GuildRow | null) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle('⚙️ Current Bot Settings')
    .setTimestamp();

  if (!config) {
    embed.setDescription(
      '⚠️ No configuration found.\n\nUse `/settings setup` to configure the bot before using tournament commands.',
    );
    return embed;
  }

  embed.addFields(
    embedField('👑 Admin Role', formatRole(guild, config.admin_role_id), false),
    embedField('📋 Challonge Logs', formatChannel(guild, config.challonge_logs_channel_id), false),
    embedField(
      '📜 Transcript Logs',
      formatChannel(guild, config.transcript_logs_channel_id),
      false,
    ),
    embedField('🤖 Bot Logs Channel', formatChannel(guild, config.bot_logs_channel_id), false),
    embedField('🖼️ Thumbnail Channel', formatChannel(guild, config.thumbnail_channel_id), false),
  );

  return embed;
}

export function buildSettingsSetupEmbed(guild: Guild, config: GuildRow) {
  return successEmbed('Bot settings updated successfully.')
    .addFields(
      embedField('👑 Admin Role', formatRole(guild, config.admin_role_id), false),
      embedField('📋 Challonge Logs', formatChannel(guild, config.challonge_logs_channel_id), false),
      embedField(
        '📜 Transcript Logs',
        formatChannel(guild, config.transcript_logs_channel_id),
        false,
      ),
      embedField('🤖 Bot Logs', formatChannel(guild, config.bot_logs_channel_id), false),
      embedField('🖼️ Thumbnail Channel', formatChannel(guild, config.thumbnail_channel_id), false),
    );
}

const SETTINGS_EDIT_LABELS: Record<keyof GuildSettingsEdit, string> = {
  admin_role_id: '👑 Admin Role',
  challonge_logs_channel_id: '📋 Challonge Logs',
  transcript_logs_channel_id: '📜 Transcript Logs',
  bot_logs_channel_id: '🤖 Bot Logs',
  thumbnail_channel_id: '🖼️ Thumbnail Channel',
};

export function buildSettingsEditEmbed(
  guild: Guild,
  changes: GuildSettingsEdit,
  updatedAt: string,
) {
  const fields = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const label = SETTINGS_EDIT_LABELS[key as keyof GuildSettingsEdit];
      const formatted = key.endsWith('_role_id')
        ? formatRole(guild, value)
        : formatChannel(guild, value);
      return embedField(label, formatted, false);
    });

  return successEmbed('Settings Updated Successfully', 'Modified Settings:')
    .addFields(...fields)
    .addFields(embedField('🕒 Updated At', updatedAt, false));
}

export function buildStaffShowEmbed(guild: Guild, config: GuildRow | null) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle('🏅 Staff Configuration')
    .setTimestamp();

  if (!config) {
    embed.setDescription(
      '⚠️ No staff configuration found.\n\nUse `/staff config set` to configure the staff system.',
    );
    return embed;
  }

  embed.addFields(
    embedField('👑 Manager Role', formatRole(guild, config.manager_role_id), false),
    embedField('⚙️ Staff Role', formatRole(guild, config.staff_role_id), false),
    embedField('⚖️ Judge Role', formatRole(guild, config.judge_role_id), false),
    embedField('🎥 Recorder Role', formatRole(guild, config.recorder_role_id), false),
    embedField('🏆 T1 Admin', formatRole(guild, config.t1_admin_role_id), false),
    embedField('🥈 T2 Admin', formatRole(guild, config.t2_admin_role_id), false),
    embedField('⭐ Best Staff', formatRole(guild, config.best_staff_role_id), false),
    embedField('🛠️ Server Helper', formatRole(guild, config.server_helper_role_id), false),
    embedField('🏆 Challonge Role', formatRole(guild, config.challonge_mod_role_id), false),
    embedField('📅 Schedule Channel', formatChannel(guild, config.schedule_channel_id), false),
    embedField('💬 Staff Chat', formatChannel(guild, config.staff_chat_channel_id), false),
    embedField(
      '📢 Announcements',
      formatChannel(guild, config.staff_announcement_channel_id),
      false,
    ),
    embedField(
      '📖 Instructions',
      formatChannel(guild, config.staff_instructions_channel_id),
      false,
    ),
    embedField('📋 Details', formatChannel(guild, config.staff_details_channel_id), false),
    embedField('📜 Event Rules', formatChannel(guild, config.event_rules_channel_id), false),
  );

  return embed;
}

export function buildStaffSetEmbed(guild: Guild, config: GuildRow) {
  return successEmbed('Staff Configuration Updated Successfully').addFields(
    embedField('👑 Manager Role', formatRole(guild, config.manager_role_id), false),
    embedField('⚙️ Staff Role', formatRole(guild, config.staff_role_id), false),
    embedField('⚖️ Judge Role', formatRole(guild, config.judge_role_id), false),
    embedField('🎥 Recorder Role', formatRole(guild, config.recorder_role_id), false),
    embedField('🏆 T1 Admin', formatRole(guild, config.t1_admin_role_id), false),
    embedField('🥈 T2 Admin', formatRole(guild, config.t2_admin_role_id), false),
    embedField('⭐ Best Staff', formatRole(guild, config.best_staff_role_id), false),
    embedField('🛠️ Server Helper', formatRole(guild, config.server_helper_role_id), false),
    embedField('🏆 Challonge Role', formatRole(guild, config.challonge_mod_role_id), false),
    embedField('📅 Schedule Channel', formatChannel(guild, config.schedule_channel_id), false),
    embedField('💬 Staff Chat', formatChannel(guild, config.staff_chat_channel_id), false),
    embedField(
      '📢 Announcements',
      formatChannel(guild, config.staff_announcement_channel_id),
      false,
    ),
    embedField(
      '📖 Instructions',
      formatChannel(guild, config.staff_instructions_channel_id),
      false,
    ),
    embedField('📋 Details', formatChannel(guild, config.staff_details_channel_id), false),
    embedField('📜 Event Rules', formatChannel(guild, config.event_rules_channel_id), false),
  );
}

const STAFF_EDIT_LABELS: Record<keyof StaffConfigEdit, string> = {
  staff_role_id: '⚙️ Staff Role',
  judge_role_id: '⚖️ Judge Role',
  recorder_role_id: '🎥 Recorder Role',
  t1_admin_role_id: '🏆 T1 Admin',
  t2_admin_role_id: '🥈 T2 Admin',
  best_staff_role_id: '⭐ Best Staff',
  server_helper_role_id: '🛠️ Server Helper',
  manager_role_id: '👑 Manager Role',
  challonge_mod_role_id: '🏆 Challonge Role',
  schedule_channel_id: '📅 Schedule Channel',
  staff_chat_channel_id: '💬 Staff Chat',
  staff_announcement_channel_id: '📢 Announcements',
  staff_instructions_channel_id: '📖 Instructions',
  staff_details_channel_id: '📋 Details',
  event_rules_channel_id: '📜 Event Rules',
};

export function buildStaffEditEmbed(guild: Guild, changes: StaffConfigEdit, updatedAt: string) {
  const fields = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const label = STAFF_EDIT_LABELS[key as keyof StaffConfigEdit];
      const formatted = key.endsWith('_role_id')
        ? formatRole(guild, value)
        : formatChannel(guild, value);
      return embedField(label, formatted, false);
    });

  return successEmbed('Staff Configuration Updated Successfully', 'Modified Settings:')
    .addFields(...fields)
    .addFields(embedField('🕒 Updated At', updatedAt, false));
}
