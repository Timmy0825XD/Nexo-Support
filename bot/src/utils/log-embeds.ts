import { EmbedBuilder, type Guild, type User } from 'discord.js';
import { LOG_COLORS } from '../constants/log-colors.js';
import type { GuildSettingsEdit } from '../schemas/guild-settings.js';
import type { StaffConfigEdit } from '../schemas/staff-config.js';
import { embedField } from './embeds.js';
import { formatChannel, formatRole, formatUserFromUser } from './guild-display.js';
import { escapeDiscordMarkdown, formatEmphasizedName } from './match-formatting.js';

const SETTINGS_FIELD_LABELS: Record<keyof GuildSettingsEdit, string> = {
  admin_role_id: 'Admin Role',
  challonge_logs_channel_id: 'Challonge Logs',
  transcript_logs_channel_id: 'Transcript Logs',
  bot_logs_channel_id: 'Bot Logs',
  thumbnail_channel_id: 'Thumbnail Channel',
};

const STAFF_FIELD_LABELS: Record<keyof StaffConfigEdit, string> = {
  staff_role_id: 'Staff Role',
  judge_role_id: 'Judge Role',
  recorder_role_id: 'Recorder Role',
  t1_admin_role_id: 'T1 Admin',
  t2_admin_role_id: 'T2 Admin',
  best_staff_role_id: 'Best Staff',
  server_helper_role_id: 'Server Helper',
  manager_role_id: 'Manager Role',
  challonge_mod_role_id: 'Challonge Role',
  schedule_channel_id: 'Schedule Channel',
  staff_chat_channel_id: 'Staff Chat',
  staff_announcement_channel_id: 'Staff Announcements',
  staff_instructions_channel_id: 'Staff Instructions',
  staff_details_channel_id: 'Staff Details',
  event_rules_channel_id: 'Event Rules',
};


function formatUser(user: User): string {
  return formatUserFromUser(user);
}

function applyUserThumbnail(embed: EmbedBuilder, user: User): EmbedBuilder {
  return embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
}

function formatSettingsValue(guild: Guild, key: keyof GuildSettingsEdit, value: string): string {
  if (key.endsWith('_role_id')) return formatRole(guild, value);
  return formatChannel(guild, value);
}

function formatStaffValue(guild: Guild, key: keyof StaffConfigEdit, value: string): string {
  if (key.endsWith('_role_id')) return formatRole(guild, value);
  return formatChannel(guild, value);
}

function buildChangeLines<T extends Record<string, string | undefined>>(
  guild: Guild,
  changes: T,
  labels: Record<keyof T, string>,
  formatValue: (guild: Guild, key: keyof T, value: string) => string,
): string {
  const lines = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const label = labels[key as keyof T];
      const formatted = formatValue(guild, key as keyof T, value as string);
      return `**${label}:** ${formatted}`;
    });

  return lines.length > 0 ? lines.join('\n') : 'No fields listed.';
}

export function buildSettingsConfigLogEmbed(
  guild: Guild,
  action: 'setup' | 'edit',
  triggeredBy: User,
  changes?: GuildSettingsEdit,
) {
  const title = action === 'setup' ? 'Bot Settings Configured' : 'Bot Settings Updated';
  const embed = new EmbedBuilder()
    .setColor(LOG_COLORS.config)
    .setTitle(title)
    .addFields(
      embedField('Triggered By', formatUser(triggeredBy), false),
      embedField(
        'Action',
        action === 'setup' ? 'Initial setup (all fields)' : 'Partial edit',
        false,
      ),
    )
    .setTimestamp();

  if (action === 'edit' && changes) {
    embed.addFields(
      embedField(
        'Modified Settings',
        buildChangeLines(guild, changes, SETTINGS_FIELD_LABELS, formatSettingsValue),
        false,
      ),
    );
  }

  embed.addFields(embedField('UTC Time', `<t:${Math.floor(Date.now() / 1000)}:F>`, false));

  return applyUserThumbnail(embed, triggeredBy);
}

export function buildStaffConfigLogEmbed(
  guild: Guild,
  action: 'set' | 'edit',
  triggeredBy: User,
  changes?: StaffConfigEdit,
) {
  const title = action === 'set' ? 'Staff Configuration Saved' : 'Staff Configuration Updated';
  const embed = new EmbedBuilder()
    .setColor(LOG_COLORS.config)
    .setTitle(title)
    .addFields(
      embedField('Triggered By', formatUser(triggeredBy), false),
      embedField(
        'Action',
        action === 'set' ? 'Initial setup (all fields)' : 'Partial edit',
        false,
      ),
    )
    .setTimestamp();

  if (action === 'edit' && changes) {
    embed.addFields(
      embedField(
        'Modified Settings',
        buildChangeLines(guild, changes, STAFF_FIELD_LABELS, formatStaffValue),
        false,
      ),
    );
  }

  embed.addFields(embedField('UTC Time', `<t:${Math.floor(Date.now() / 1000)}:F>`, false));

  return applyUserThumbnail(embed, triggeredBy);
}

export function buildBotEventLogEmbed(
  title: string,
  fields: Array<{ name: string; value: string; inline?: boolean }>,
  color: number = LOG_COLORS.bot,
  triggeredBy?: User,
) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();

  for (const field of fields) {
    embed.addFields(embedField(field.name, field.value, field.inline ?? false));
  }

  embed.addFields(embedField('UTC Time', `<t:${Math.floor(Date.now() / 1000)}:F>`, false));

  if (triggeredBy) {
    applyUserThumbnail(embed, triggeredBy);
  }

  return embed;
}

export function formatChallongeLogDateTime(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function buildChallongeTournamentLink(tournamentName: string, challongeId: string): string {
  const label = escapeDiscordMarkdown(tournamentName.trim());
  const slug = encodeURIComponent(challongeId.trim());
  return `[${label}](https://challonge.com/${slug})`;
}

function buildChallongeDetailsDescription(
  intro: string,
  lines: string[],
  triggeredBy: User,
  occurredAt: Date = new Date(),
): string {
  return [
    intro,
    ...lines,
    `**Date & Time:** ${formatChallongeLogDateTime(occurredAt)}`,
    `**Triggered By:** ${formatUserFromUser(triggeredBy)}`,
  ].join('\n');
}

export function buildChallongeLogEmbed(
  title: string,
  description: string,
  triggeredBy: User,
): EmbedBuilder {
  return applyUserThumbnail(
    new EmbedBuilder()
      .setColor(LOG_COLORS.challonge)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp(),
    triggeredBy,
  );
}

export function buildChallongeMatchUpdatedLogEmbed(params: {
  guild: Guild;
  tournamentName: string;
  challongeId: string;
  matchLabel: string;
  ticketChannelId: string | null;
  scoreLine: string;
  winnerName: string;
  triggeredBy: User;
  occurredAt?: Date;
}): EmbedBuilder {
  const channelLine = params.ticketChannelId
    ? formatChannel(params.guild, params.ticketChannelId)
    : '*No ticket channel*';

  const description = buildChallongeDetailsDescription(
    'The match has been updated with the following details:',
    [
      `**Tournament:** ${buildChallongeTournamentLink(params.tournamentName, params.challongeId)}`,
      `**Match:** ${params.matchLabel}`,
      `**Channel:** ${channelLine}`,
      `**Score:** ${params.scoreLine}`,
      `**Winner:** ${formatEmphasizedName(params.winnerName)}`,
    ],
    params.triggeredBy,
    params.occurredAt,
  );

  return buildChallongeLogEmbed(
    ':white_check_mark: Match Updated Successfully',
    description,
    params.triggeredBy,
  );
}

export function buildChallongeTournamentLinkedLogEmbed(params: {
  tournamentName: string;
  challongeId: string;
  triggeredBy: User;
  occurredAt?: Date;
}): EmbedBuilder {
  const description = buildChallongeDetailsDescription(
    'The tournament has been linked to Challonge with the following details:',
    [
      `**Tournament:** ${buildChallongeTournamentLink(params.tournamentName, params.challongeId)}`,
      `**Challonge ID:** \`${params.challongeId}\``,
    ],
    params.triggeredBy,
    params.occurredAt,
  );

  return buildChallongeLogEmbed(
    ':white_check_mark: Tournament Linked to Challonge',
    description,
    params.triggeredBy,
  );
}

export function buildChallongeCredentialsUpdatedLogEmbed(params: {
  tournamentName: string;
  challongeId: string;
  triggeredBy: User;
  occurredAt?: Date;
}): EmbedBuilder {
  const description = buildChallongeDetailsDescription(
    'The tournament Challonge credentials were updated with the following details:',
    [
      `**Tournament:** ${buildChallongeTournamentLink(params.tournamentName, params.challongeId)}`,
      `**Challonge ID:** \`${params.challongeId}\``,
    ],
    params.triggeredBy,
    params.occurredAt,
  );

  return buildChallongeLogEmbed(':key: Tournament Credentials Updated', description, params.triggeredBy);
}
