import { EmbedBuilder, type Guild, type GuildMember, type Role, type User } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { GuildSettingsEdit } from '../schemas/guild-settings.js';
import type { StaffConfigEdit } from '../schemas/staff-config.js';
import type { GuildRow } from '../types/guild.js';
import { embedField, successEmbed } from './embeds.js';

export const NOT_CONFIGURED = '`Not configured`';
export const DELETED_ROLE = `${CUSTOM_EMOJIS.error} Deleted Role`;
export const DELETED_CHANNEL = `${CUSTOM_EMOJIS.error} Deleted Channel`;
export const DELETED_CATEGORY = `${CUSTOM_EMOJIS.error} Deleted Category`;
export const UNKNOWN_MEMBER = `${CUSTOM_EMOJIS.error} Unknown Member`;

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

const SETTINGS_FIELD_LABELS = {
  adminRole: `${CUSTOM_EMOJIS.role} Admin Role`,
  challongeLogs: `${CUSTOM_EMOJIS.challonge} Challonge Logs`,
  transcriptLogs: `${CUSTOM_EMOJIS.transcript} Transcript Logs`,
  botLogs: `${CUSTOM_EMOJIS.bot_icone} Bot Logs`,
  botLogsChannel: `${CUSTOM_EMOJIS.bot_icone} Bot Logs Channel`,
  thumbnailChannel: `${CUSTOM_EMOJIS.thumbnail} Thumbnail Channel`,
} as const;

const STAFF_FIELD_LABELS = {
  managerRole: `${CUSTOM_EMOJIS.role} Manager Role`,
  staffRole: `${CUSTOM_EMOJIS.settings} Staff Role`,
  judgeRole: '⚖️ Judge Role',
  recorderRole: `${CUSTOM_EMOJIS.camera} Recorder Role`,
  t1Admin: `${CUSTOM_EMOJIS.trophy} T1 Admin`,
  t2Admin: '🥈 T2 Admin',
  bestStaff: `${CUSTOM_EMOJIS.medal} Best Staff`,
  serverHelper: `${CUSTOM_EMOJIS.utility} Server Helper`,
  challongeRole: `${CUSTOM_EMOJIS.challonge} Challonge Role`,
  scheduleChannel: `${CUSTOM_EMOJIS.schedule} Schedule Channel`,
  staffChat: '💬 Staff Chat',
  announcements: `${CUSTOM_EMOJIS.announcement} Announcements`,
  instructions: '📖 Instructions',
  details: `${CUSTOM_EMOJIS.details} Details`,
  updatedAt: `${CUSTOM_EMOJIS.update} Updated At`,
} as const;

export function buildSettingsShowEmbed(guild: Guild, config: GuildRow | null) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(`${CUSTOM_EMOJIS.settings} Current Bot Settings`)
    .setTimestamp();

  if (!config) {
    embed.setDescription(
      `${CUSTOM_EMOJIS.alert} No configuration found.\n\nUse \`/settings setup\` to configure the bot before using tournament commands.`,
    );
    return embed;
  }

  embed.addFields(
    embedField(SETTINGS_FIELD_LABELS.adminRole, formatRole(guild, config.admin_role_id), false),
    embedField(
      SETTINGS_FIELD_LABELS.challongeLogs,
      formatChannel(guild, config.challonge_logs_channel_id),
      false,
    ),
    embedField(
      SETTINGS_FIELD_LABELS.transcriptLogs,
      formatChannel(guild, config.transcript_logs_channel_id),
      false,
    ),
    embedField(
      SETTINGS_FIELD_LABELS.botLogsChannel,
      formatChannel(guild, config.bot_logs_channel_id),
      false,
    ),
    embedField(
      SETTINGS_FIELD_LABELS.thumbnailChannel,
      formatChannel(guild, config.thumbnail_channel_id),
      false,
    ),
  );

  return embed;
}

export function buildSettingsSetupEmbed(guild: Guild, config: GuildRow) {
  return successEmbed('Bot settings updated successfully.')
    .addFields(
      embedField(SETTINGS_FIELD_LABELS.adminRole, formatRole(guild, config.admin_role_id), false),
      embedField(
        SETTINGS_FIELD_LABELS.challongeLogs,
        formatChannel(guild, config.challonge_logs_channel_id),
        false,
      ),
      embedField(
        SETTINGS_FIELD_LABELS.transcriptLogs,
        formatChannel(guild, config.transcript_logs_channel_id),
        false,
      ),
      embedField(
        SETTINGS_FIELD_LABELS.botLogs,
        formatChannel(guild, config.bot_logs_channel_id),
        false,
      ),
      embedField(
        SETTINGS_FIELD_LABELS.thumbnailChannel,
        formatChannel(guild, config.thumbnail_channel_id),
        false,
      ),
    );
}

const SETTINGS_EDIT_LABELS: Record<keyof GuildSettingsEdit, string> = {
  admin_role_id: SETTINGS_FIELD_LABELS.adminRole,
  challonge_logs_channel_id: SETTINGS_FIELD_LABELS.challongeLogs,
  transcript_logs_channel_id: SETTINGS_FIELD_LABELS.transcriptLogs,
  bot_logs_channel_id: SETTINGS_FIELD_LABELS.botLogs,
  thumbnail_channel_id: SETTINGS_FIELD_LABELS.thumbnailChannel,
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
    .addFields(embedField(STAFF_FIELD_LABELS.updatedAt, updatedAt, false));
}

export function buildStaffShowEmbed(guild: Guild, config: GuildRow | null) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(`${CUSTOM_EMOJIS.medal} Staff Configuration`)
    .setTimestamp();

  if (!config) {
    embed.setDescription(
      `${CUSTOM_EMOJIS.alert} No staff configuration found.\n\nUse \`/staff config set\` to configure the staff system.`,
    );
    return embed;
  }

  embed.addFields(
    embedField(STAFF_FIELD_LABELS.managerRole, formatRole(guild, config.manager_role_id), false),
    embedField(STAFF_FIELD_LABELS.staffRole, formatRole(guild, config.staff_role_id), false),
    embedField(STAFF_FIELD_LABELS.judgeRole, formatRole(guild, config.judge_role_id), false),
    embedField(STAFF_FIELD_LABELS.recorderRole, formatRole(guild, config.recorder_role_id), false),
    embedField(STAFF_FIELD_LABELS.t1Admin, formatRole(guild, config.t1_admin_role_id), false),
    embedField(STAFF_FIELD_LABELS.t2Admin, formatRole(guild, config.t2_admin_role_id), false),
    embedField(STAFF_FIELD_LABELS.bestStaff, formatRole(guild, config.best_staff_role_id), false),
    embedField(STAFF_FIELD_LABELS.serverHelper, formatRole(guild, config.server_helper_role_id), false),
    embedField(STAFF_FIELD_LABELS.challongeRole, formatRole(guild, config.challonge_mod_role_id), false),
    embedField(STAFF_FIELD_LABELS.scheduleChannel, formatChannel(guild, config.schedule_channel_id), false),
    embedField(STAFF_FIELD_LABELS.staffChat, formatChannel(guild, config.staff_chat_channel_id), false),
    embedField(
      STAFF_FIELD_LABELS.announcements,
      formatChannel(guild, config.staff_announcement_channel_id),
      false,
    ),
    embedField(
      STAFF_FIELD_LABELS.instructions,
      formatChannel(guild, config.staff_instructions_channel_id),
      false,
    ),
    embedField(STAFF_FIELD_LABELS.details, formatChannel(guild, config.staff_details_channel_id), false),
  );

  return embed;
}

export function buildStaffSetEmbed(guild: Guild, config: GuildRow) {
  return successEmbed('Staff Configuration Updated Successfully').addFields(
    embedField(STAFF_FIELD_LABELS.managerRole, formatRole(guild, config.manager_role_id), false),
    embedField(STAFF_FIELD_LABELS.staffRole, formatRole(guild, config.staff_role_id), false),
    embedField(STAFF_FIELD_LABELS.judgeRole, formatRole(guild, config.judge_role_id), false),
    embedField(STAFF_FIELD_LABELS.recorderRole, formatRole(guild, config.recorder_role_id), false),
    embedField(STAFF_FIELD_LABELS.t1Admin, formatRole(guild, config.t1_admin_role_id), false),
    embedField(STAFF_FIELD_LABELS.t2Admin, formatRole(guild, config.t2_admin_role_id), false),
    embedField(STAFF_FIELD_LABELS.bestStaff, formatRole(guild, config.best_staff_role_id), false),
    embedField(STAFF_FIELD_LABELS.serverHelper, formatRole(guild, config.server_helper_role_id), false),
    embedField(STAFF_FIELD_LABELS.challongeRole, formatRole(guild, config.challonge_mod_role_id), false),
    embedField(STAFF_FIELD_LABELS.scheduleChannel, formatChannel(guild, config.schedule_channel_id), false),
    embedField(STAFF_FIELD_LABELS.staffChat, formatChannel(guild, config.staff_chat_channel_id), false),
    embedField(
      STAFF_FIELD_LABELS.announcements,
      formatChannel(guild, config.staff_announcement_channel_id),
      false,
    ),
    embedField(
      STAFF_FIELD_LABELS.instructions,
      formatChannel(guild, config.staff_instructions_channel_id),
      false,
    ),
    embedField(STAFF_FIELD_LABELS.details, formatChannel(guild, config.staff_details_channel_id), false),
  );
}

const STAFF_EDIT_LABELS: Record<keyof StaffConfigEdit, string> = {
  staff_role_id: STAFF_FIELD_LABELS.staffRole,
  judge_role_id: STAFF_FIELD_LABELS.judgeRole,
  recorder_role_id: STAFF_FIELD_LABELS.recorderRole,
  t1_admin_role_id: STAFF_FIELD_LABELS.t1Admin,
  t2_admin_role_id: STAFF_FIELD_LABELS.t2Admin,
  best_staff_role_id: STAFF_FIELD_LABELS.bestStaff,
  server_helper_role_id: STAFF_FIELD_LABELS.serverHelper,
  manager_role_id: STAFF_FIELD_LABELS.managerRole,
  challonge_mod_role_id: STAFF_FIELD_LABELS.challongeRole,
  schedule_channel_id: STAFF_FIELD_LABELS.scheduleChannel,
  staff_chat_channel_id: STAFF_FIELD_LABELS.staffChat,
  staff_announcement_channel_id: STAFF_FIELD_LABELS.announcements,
  staff_instructions_channel_id: STAFF_FIELD_LABELS.instructions,
  staff_details_channel_id: STAFF_FIELD_LABELS.details,
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
    .addFields(embedField(STAFF_FIELD_LABELS.updatedAt, updatedAt, false));
}
