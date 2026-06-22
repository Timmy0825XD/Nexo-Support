import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { MatchRow } from '../types/match.js';
import type {
  ScheduleStaffRole,
  ScheduleWithDetails,
  StaffAssignmentRow,
  UnassignedFilter,
} from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import { formatChannel, formatRole, formatUser } from './guild-display.js';
import { formatMatchupTitle } from './match-formatting.js';
import { formatScheduleCaptainLine } from './schedule-captain-display.js';
import type { TournamentFormat } from '../services/sheets.js';
import { getActiveAssignments } from '../guards/schedule-permissions.js';
import { parseScheduleUtcInstant, scheduleUtcUnixSeconds } from './schedule-datetime.js';

export const SCHEDULE_ASSIGN_JUDGE_PREFIX = 'schedule:assign:judge:';
export const SCHEDULE_ASSIGN_RECORDER_PREFIX = 'schedule:assign:recorder:';
export const SCHEDULE_CONFIRM_JUDGE_PREFIX = 'schedule:confirm:judge:';
export const SCHEDULE_CONFIRM_RECORDER_PREFIX = 'schedule:confirm:recorder:';

export const SCHEDULE_REMINDER_LEAD_MS = 10 * 60 * 1000;
/** Assignment buttons on the schedule channel post stay active for this long after create/refresh/urgent sync. */
export const SCHEDULE_ASSIGNMENT_BUTTONS_TTL_MS = 10 * 60 * 1000;
/** Max time after match start to still process urgent alerts (avoids stale backlog on deploy). */
export const SCHEDULE_URGENT_GRACE_MS = 30 * 60 * 1000;
export const FAILED_ATTENDANCE_CONFIRM_REASON = 'Failed to confirm presence';

export const UNASSIGNED_PAGE_SIZE = 5;
export const UNASSIGNED_TIMEOUT_MS = 2 * 60 * 1000;

const UNASSIGNED_PREV_ID = 'schedule:unassigned:prev';
const UNASSIGNED_NEXT_ID = 'schedule:unassigned:next';

export function parseCaptainIdsFromScheduleEmbedDescription(description: string): {
  team1CaptainId: string | null;
  team2CaptainId: string | null;
} {
  const team1Match = description.match(/\*\*Team 1 Captain:\*\*[^\n]*<@!?(\d{17,20})>/i);
  const team2Match = description.match(/\*\*Team 2 Captain:\*\*[^\n]*<@!?(\d{17,20})>/i);

  return {
    team1CaptainId: team1Match?.[1] ?? null,
    team2CaptainId: team2Match?.[1] ?? null,
  };
}

export function parseCaptainIdsFromScheduleMessageContent(content: string): string[] {
  const ids = [...content.matchAll(/<@!?(\d{17,20})>/g)].map((match) => match[1]!);
  return [...new Set(ids)];
}

export function formatScheduleUtcLine(scheduledAt: string | Date): string {
  const date = parseScheduleUtcInstant(scheduledAt);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function formatScheduleDiscordTimestamp(scheduledAt: string | Date): string {
  const unix = scheduleUtcUnixSeconds(scheduledAt);
  return `<t:${unix}:f> (<t:${unix}:R>)`;
}

function formatScheduleEmbedTitle(team1Name: string, team2Name: string): string {
  return `${team1Name.trim().toUpperCase()} VS ${team2Name.trim().toUpperCase()}`;
}

export function formatScheduleFooterDate(createdAt: string | Date): string {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatCaptainLine(
  guild: Guild,
  userId: string | null,
  teamName: string,
  format: TournamentFormat,
): string {
  return formatScheduleCaptainLine(guild, userId, teamName, format);
}

function formatStaffJudgeLine(assignments: StaffAssignmentRow[]): string {
  const judge = getActiveAssignments(assignments).find((row) => row.role === 'judge');
  const value = judge ? formatUser(judge.discord_user_id) : '';
  return `:man_judge: **Judge:** ${value}`.trimEnd();
}

function formatStaffRecorderLine(assignments: StaffAssignmentRow[]): string {
  const recorder = getActiveAssignments(assignments).find((row) => row.role === 'recorder');
  const value = recorder ? formatUser(recorder.discord_user_id) : '';
  return `:video_camera: **Recorder:** ${value}`.trimEnd();
}

export interface ScheduleEmbedParams {
  guild: Guild;
  tournament: Pick<TournamentRow, 'name'>;
  match: Pick<MatchRow, 'team1_name' | 'team2_name' | 'challonge_match_id' | 'round'>;
  scheduledAt: string | Date;
  assignments: StaffAssignmentRow[];
  thumbnailUrl?: string | null;
  ticketChannelId?: string;
  team1CaptainId: string | null;
  team2CaptainId: string | null;
  tournamentFormat: TournamentFormat;
  createdByUsername: string;
  createdAt: string | Date;
}

function buildScheduleEmbedDescription(params: ScheduleEmbedParams, includeChannel: boolean): string {
  const lines = [
    `**UTC Time:** ${formatScheduleUtcLine(params.scheduledAt)}`,
    `**Local Time:** ${formatScheduleDiscordTimestamp(params.scheduledAt)}`,
    '',
    `**__Tournament:__** ${params.tournament.name}`,
    `**__Round:__** ${params.match.round?.trim() || 'TBD'}`,
  ];

  if (includeChannel && params.ticketChannelId) {
    lines.push('', `**Channel:** ${formatChannel(params.guild, params.ticketChannelId)}`);
  }

  lines.push(
    '',
    `**Team 1 Captain:** ${formatCaptainLine(params.guild, params.team1CaptainId, params.match.team1_name, params.tournamentFormat)}`,
    `**Team 2 Captain:** ${formatCaptainLine(params.guild, params.team2CaptainId, params.match.team2_name, params.tournamentFormat)}`,
    '',
    '**__Staffs:__**',
    formatStaffJudgeLine(params.assignments),
    formatStaffRecorderLine(params.assignments),
  );

  return lines.join('\n');
}

function buildScheduleEmbedFooter(params: ScheduleEmbedParams): string {
  return `Created by ${params.createdByUsername}•${formatScheduleFooterDate(params.createdAt)}`;
}

function buildScheduleEmbedBase(params: ScheduleEmbedParams, includeChannel: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(formatScheduleEmbedTitle(params.match.team1_name, params.match.team2_name))
    .setDescription(buildScheduleEmbedDescription(params, includeChannel))
    .setFooter({ text: buildScheduleEmbedFooter(params) });

  if (params.thumbnailUrl) {
    embed.setImage(params.thumbnailUrl);
  }

  return embed;
}

/** Schedule channel embed — includes ticket channel link and assignment buttons. */
export function buildScheduleChannelEmbed(params: ScheduleEmbedParams): EmbedBuilder {
  return buildScheduleEmbedBase(params, true);
}

/** Ticket channel embed — no channel line, updated on staff changes. */
export function buildTicketScheduleEmbed(params: ScheduleEmbedParams): EmbedBuilder {
  return buildScheduleEmbedBase(params, false);
}

export function formatStaffRoleLabel(role: ScheduleStaffRole): string {
  return role === 'judge' ? 'Judge' : 'Recorder';
}

export const SCHEDULE_STAFF_TAKE_ROLE_URL =
  'https://tenor.com/view/check-schedule-f1livegp-gif-25992214';

export interface ScheduleStaffChatNotification {
  content: string;
  roleIds: string[];
}

/** Posted to staff chat when a schedule is created. */
export function buildScheduleStaffChatCreateMessage(
  guild: Guild,
  guildConfig: { judge_role_id?: string | null; recorder_role_id?: string | null } | null,
): ScheduleStaffChatNotification | null {
  const parts: string[] = [];
  const roleIds: string[] = [];

  if (guildConfig?.judge_role_id) {
    parts.push(formatRole(guild, guildConfig.judge_role_id));
    roleIds.push(guildConfig.judge_role_id);
  }
  if (guildConfig?.recorder_role_id) {
    parts.push(formatRole(guild, guildConfig.recorder_role_id));
    roleIds.push(guildConfig.recorder_role_id);
  }
  if (parts.length === 0) return null;

  return {
    content: `${parts.join(' - ')} **New schedule**, [take on a role.](${SCHEDULE_STAFF_TAKE_ROLE_URL})`,
    roleIds,
  };
}

export function areScheduleAssignmentButtonsActive(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export function nextScheduleAssignmentButtonsExpiresAt(from: Date = new Date()): string {
  return new Date(from.getTime() + SCHEDULE_ASSIGNMENT_BUTTONS_TTL_MS).toISOString();
}

export function buildScheduleAssignmentComponents(
  scheduleId: string,
  assignments: StaffAssignmentRow[],
  options?: { buttonsLocked?: boolean },
): ActionRowBuilder<ButtonBuilder>[] {
  const locked = options?.buttonsLocked ?? false;
  const hasJudge = getActiveAssignments(assignments).some((row) => row.role === 'judge');
  const hasRecorder = getActiveAssignments(assignments).some((row) => row.role === 'recorder');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SCHEDULE_ASSIGN_JUDGE_PREFIX}${scheduleId}`)
      .setLabel('Judge')
      .setEmoji('👨‍⚖️')
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked || hasJudge),
    new ButtonBuilder()
      .setCustomId(`${SCHEDULE_ASSIGN_RECORDER_PREFIX}${scheduleId}`)
      .setLabel('Recorder')
      .setEmoji('🎥')
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked || hasRecorder),
  );

  return [row];
}

export function buildStaffAssignedMessage(userId: string, role: ScheduleStaffRole): string {
  const emoji = role === 'judge' ? '👨‍⚖️' : '🎥';
  return `${formatUser(userId)} assigned as **${formatStaffRoleLabel(role)}** ${emoji}`;
}

export function buildScheduleAssignmentSuccessMessage(role: ScheduleStaffRole): string {
  return `**Assignment Complete:** You are now assigned as **${formatStaffRoleLabel(role)}** for this match.`;
}

export function buildScheduleConfirmSuccessMessage(
  role: ScheduleStaffRole,
  userId: string,
): string {
  return `${formatUser(userId)} Attendance confirmed as ${formatStaffRoleLabel(role)} for this match.`;
}

export function buildScheduleReminderEmbed(params: ScheduleEmbedParams): EmbedBuilder {
  const embed = buildScheduleEmbedBase(params, false);
  embed.setFooter({ text: 'Staff Confirmation Required | Confirm before match time' });
  return embed;
}

export function buildScheduleReminderComponents(
  scheduleId: string,
  assignments: StaffAssignmentRow[],
): ActionRowBuilder<ButtonBuilder>[] {
  const active = getActiveAssignments(assignments);
  const judge = active.find((row) => row.role === 'judge');
  const recorder = active.find((row) => row.role === 'recorder');

  const row = new ActionRowBuilder<ButtonBuilder>();

  if (judge) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${SCHEDULE_CONFIRM_JUDGE_PREFIX}${scheduleId}`)
        .setLabel('Confirmed')
        .setEmoji('👨‍⚖️')
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(judge.attendance_confirmed_at)),
    );
  }

  if (recorder) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${SCHEDULE_CONFIRM_RECORDER_PREFIX}${scheduleId}`)
        .setLabel('Confirmed')
        .setEmoji('🎥')
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(recorder.attendance_confirmed_at)),
    );
  }

  return row.components.length > 0 ? [row] : [];
}

export interface ScheduleReminderNotification {
  content: string;
  mentionUserIds: string[];
}

export function buildScheduleReminderContent(params: {
  guild: Guild;
  captainIds: string[];
  staffUserIds: string[];
  rulesChannelId?: string | null;
}): ScheduleReminderNotification {
  const mentionUserIds = [...new Set([...params.captainIds, ...params.staffUserIds].filter(Boolean))];
  const mentions = mentionUserIds.map((id) => formatUser(id));
  const rulesLine = params.rulesChannelId
    ? `Please make sure to read and follow the rules stated in ${formatChannel(params.guild, params.rulesChannelId)}.`
    : 'Please make sure to read and follow the tournament rules before the match.';

  if (mentions.length === 0) {
    return { content: rulesLine, mentionUserIds: [] };
  }

  return {
    content: `${mentions.join(' ')} — ${rulesLine}`,
    mentionUserIds,
  };
}

export interface ScheduleUrgentNotification {
  content: string;
  roleIds: string[];
}

export function buildScheduleUrgentContent(
  guild: Guild,
  guildConfig: { judge_role_id?: string | null; recorder_role_id?: string | null } | null,
  missingRoles: ScheduleStaffRole[],
): ScheduleUrgentNotification | null {
  const parts: string[] = [];
  const roleIds: string[] = [];

  if (missingRoles.includes('judge') && guildConfig?.judge_role_id) {
    parts.push(formatRole(guild, guildConfig.judge_role_id));
    roleIds.push(guildConfig.judge_role_id);
  }
  if (missingRoles.includes('recorder') && guildConfig?.recorder_role_id) {
    parts.push(formatRole(guild, guildConfig.recorder_role_id));
    roleIds.push(guildConfig.recorder_role_id);
  }

  if (parts.length === 0) return null;

  return {
    content: `${parts.join(' ')} — 🚨 URGENT STAFF REPLACEMENT NEEDED!`,
    roleIds,
  };
}

export interface ScheduleUrgentFailure {
  role: ScheduleStaffRole;
  userId: string;
}

export function buildScheduleUrgentEmbed(
  params: ScheduleEmbedParams,
  failures: ScheduleUrgentFailure[],
  missingRoles: ScheduleStaffRole[],
): EmbedBuilder {
  const baseDescription = buildScheduleEmbedDescription(params, true);
  const unix = scheduleUtcUnixSeconds(params.scheduledAt);
  const failedRoles = new Set(failures.map((failure) => failure.role));

  const failureLines = failures.map((failure) => {
    const emoji = failure.role === 'judge' ? '👨‍⚖️' : '📸';
    return `${emoji} **${formatStaffRoleLabel(failure.role)}** ${formatUser(failure.userId)} failed to confirm presence`;
  });

  const unassignedLines = missingRoles
    .filter((role) => !failedRoles.has(role))
    .map((role) => {
      const emoji = role === 'judge' ? '👨‍⚖️' : '📸';
      return `${emoji} **${formatStaffRoleLabel(role)}** — No staff assigned`;
    });

  const urgencyBlock = [
    '',
    '🚨 **URGENT: Staff Replacement Needed!**',
    `Match starts <t:${unix}:R>!`,
    ...failureLines,
    ...unassignedLines,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.error)
    .setTitle(formatScheduleEmbedTitle(params.match.team1_name, params.match.team2_name))
    .setDescription(`${baseDescription}${urgencyBlock}`)
    .setFooter({ text: `🚨 IMMEDIATE ACTION REQUIRED — Match starts <t:${unix}:R>` })
    .setTimestamp();

  if (params.thumbnailUrl) {
    embed.setImage(params.thumbnailUrl);
  }

  return embed;
}

export function parseScheduleConfirmCustomId(
  customId: string,
): { role: ScheduleStaffRole; scheduleId: string } | null {
  if (customId.startsWith(SCHEDULE_CONFIRM_JUDGE_PREFIX)) {
    return {
      role: 'judge',
      scheduleId: customId.slice(SCHEDULE_CONFIRM_JUDGE_PREFIX.length),
    };
  }
  if (customId.startsWith(SCHEDULE_CONFIRM_RECORDER_PREFIX)) {
    return {
      role: 'recorder',
      scheduleId: customId.slice(SCHEDULE_CONFIRM_RECORDER_PREFIX.length),
    };
  }
  return null;
}

export function buildStaffResignedMessage(userId: string, role: ScheduleStaffRole): string {
  const label = formatStaffRoleLabel(role);
  return [
    `${formatUser(userId)} has resigned as **${label}** for this match.`,
    '⏳ These positions are now available for other staff to claim.',
  ].join('\n');
}

export function buildScheduleDeleteConfirmation(matchLabel: string, reason?: string): string {
  const reasonText = reason?.trim() || 'Not provided';
  return `The Schedule **${matchLabel}** has been deleted successfully. Reason: ${reasonText}`;
}

export function buildScheduleRefreshSuccessEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle('♻️ Schedule Buttons Refreshed')
    .setDescription(
      'Assignment buttons on the schedule channel post were refreshed for **10 minutes**. Filled roles stay disabled.',
    )
    .setTimestamp();
}

export interface UnassignedScheduleEntry {
  schedule: ScheduleWithDetails;
  missingRoles: ScheduleStaffRole[];
}

export function filterUnassignedSchedules(
  schedules: ScheduleWithDetails[],
  filter: UnassignedFilter,
): UnassignedScheduleEntry[] {
  const entries: UnassignedScheduleEntry[] = [];

  for (const schedule of schedules) {
    const missingJudge = !getActiveAssignments(schedule.staff_assignments).some(
      (row) => row.role === 'judge',
    );
    const missingRecorder = !getActiveAssignments(schedule.staff_assignments).some(
      (row) => row.role === 'recorder',
    );

    const missingRoles: ScheduleStaffRole[] = [];
    if (missingJudge) missingRoles.push('judge');
    if (missingRecorder) missingRoles.push('recorder');

    if (missingRoles.length === 0) continue;

    const include =
      filter === 'all' ||
      filter === 'any' ||
      (filter === 'missing_judge' && missingJudge) ||
      (filter === 'missing_recorder' && missingRecorder);

    if (include) {
      entries.push({ schedule, missingRoles });
    }
  }

  return entries;
}

function formatMissingRoles(roles: ScheduleStaffRole[]): string {
  return roles.map((role) => (role === 'judge' ? 'Judge' : 'Recorder')).join(', ');
}

function formatUnassignedBlock(
  entry: UnassignedScheduleEntry,
  guild: Guild,
  scheduleChannelId: string | null | undefined,
): string {
  const { schedule, missingRoles } = entry;
  const utcLine = formatScheduleUtcLine(schedule.scheduled_at);
  const scheduleLink =
    schedule.schedules_message_id && scheduleChannelId
      ? `[Schedule post](https://discord.com/channels/${guild.id}/${scheduleChannelId}/${schedule.schedules_message_id})`
      : '*No schedule post*';

  return [
    `**${schedule.tournament.name}**`,
    formatMatchupTitle(schedule.match.team1_name, schedule.match.team2_name),
    `🕐 \`${utcLine}\``,
    `🎫 ${formatChannel(guild, schedule.ticket_channel_id)}`,
    `📢 ${scheduleLink}`,
    `⚠️ Missing: **${formatMissingRoles(missingRoles)}**`,
  ].join('\n');
}

export function buildUnassignedEmbed(
  guild: Guild,
  entries: UnassignedScheduleEntry[],
  pageIndex: number,
  filter: UnassignedFilter,
  scheduleChannelId: string | null | undefined,
): EmbedBuilder {
  if (entries.length === 0) {
    return new EmbedBuilder()
      .setColor(EMBED_COLORS.success)
      .setTitle(`${CUSTOM_EMOJIS.done} All Matches Staffed`)
      .setDescription('No pending matches are missing staff.')
      .setTimestamp();
  }

  const totalPages = Math.max(1, Math.ceil(entries.length / UNASSIGNED_PAGE_SIZE));
  const start = pageIndex * UNASSIGNED_PAGE_SIZE;
  const pageEntries = entries.slice(start, start + UNASSIGNED_PAGE_SIZE);
  const body = pageEntries
    .map((entry) => formatUnassignedBlock(entry, guild, scheduleChannelId))
    .join('\n\n');

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.warning)
    .setTitle('⚠️ Unassigned Matches Found')
    .setDescription(
      `Filter: **${filter}**\nStaff assignments are still pending.\n\n${body}`,
    )
    .setFooter({ text: `Page ${pageIndex + 1}/${totalPages}` })
    .setTimestamp();
}

export function buildUnassignedComponents(
  pageIndex: number,
  totalEntries: number,
  locked: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const totalPages = Math.max(1, Math.ceil(totalEntries / UNASSIGNED_PAGE_SIZE));

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(UNASSIGNED_PREV_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Previous')
      .setDisabled(locked || pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(UNASSIGNED_NEXT_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Next')
      .setDisabled(locked || pageIndex >= totalPages - 1),
  );
}

export async function runUnassignedPagination(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  entries: UnassignedScheduleEntry[],
  filter: UnassignedFilter,
  scheduleChannelId: string | null | undefined,
): Promise<void> {
  let currentPage = 0;

  const render = (locked: boolean) => ({
    embeds: [buildUnassignedEmbed(guild, entries, currentPage, filter, scheduleChannelId)],
    components:
      entries.length > UNASSIGNED_PAGE_SIZE
        ? [buildUnassignedComponents(currentPage, entries.length, locked)]
        : [],
  });

  const message = await interaction.editReply(render(false));
  if (entries.length <= UNASSIGNED_PAGE_SIZE) return;

  const totalPages = Math.ceil(entries.length / UNASSIGNED_PAGE_SIZE);
  const collector = message.createMessageComponentCollector({
    time: UNASSIGNED_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: 'Only the person who ran `/schedule unassigned` can browse these pages.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (buttonInteraction.customId === UNASSIGNED_PREV_ID && currentPage > 0) {
      currentPage -= 1;
    } else if (buttonInteraction.customId === UNASSIGNED_NEXT_ID && currentPage < totalPages - 1) {
      currentPage += 1;
    }

    await buttonInteraction.update(render(false));
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply(render(true));
    } catch {
      // Message may have been deleted.
    }
  });
}

export interface ScheduleTicketNotification {
  content: string;
  mentionUserIds: string[];
}

export function buildScheduleNotificationContent(params: {
  captainIds: string[];
}): ScheduleTicketNotification {
  const mentionUserIds = [...new Set(params.captainIds.filter(Boolean))];
  const mentions = mentionUserIds.map((id) => formatUser(id));
  const suffix = 'Your schedule has been created or modified, please check the date and time.';

  if (mentions.length === 0) {
    return { content: suffix, mentionUserIds: [] };
  }

  return {
    content: `${mentions.join(' ')} — ${suffix}`,
    mentionUserIds,
  };
}

export function parseScheduleAssignCustomId(
  customId: string,
): { role: ScheduleStaffRole; scheduleId: string } | null {
  if (customId.startsWith(SCHEDULE_ASSIGN_JUDGE_PREFIX)) {
    return {
      role: 'judge',
      scheduleId: customId.slice(SCHEDULE_ASSIGN_JUDGE_PREFIX.length),
    };
  }
  if (customId.startsWith(SCHEDULE_ASSIGN_RECORDER_PREFIX)) {
    return {
      role: 'recorder',
      scheduleId: customId.slice(SCHEDULE_ASSIGN_RECORDER_PREFIX.length),
    };
  }
  return null;
}
