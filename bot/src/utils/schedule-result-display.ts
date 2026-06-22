import { EmbedBuilder, type Guild } from 'discord.js';
import { EMBED_COLORS } from '../constants/emojis.js';
import type { MatchRow } from '../types/match.js';
import type { StaffAssignmentRow } from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import { getActiveAssignments } from '../guards/schedule-permissions.js';
import { formatChannel, formatUser } from './guild-display.js';
import { formatInlineScoreLine } from './match-formatting.js';
import { formatScheduleCaptainLine } from './schedule-captain-display.js';
import type { TournamentFormat } from '../services/sheets.js';
import {
  formatScheduleDiscordTimestamp,
  formatScheduleFooterDate,
  formatScheduleUtcLine,
} from './schedule-display.js';

function formatResultEmbedTitle(
  team1Name: string,
  team2Name: string,
  titleMessageUrl?: string | null,
): string {
  const text = `🏆 ${team1Name.trim().toUpperCase()} 🆚 ${team2Name.trim().toUpperCase()}`;
  return titleMessageUrl ? `[${text}](${titleMessageUrl})` : text;
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

function formatResultScoreLine(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  winnerSide: 1 | 2;
}): string {
  return formatInlineScoreLine(params);
}

function formatResultEmbedFooter(declaredByUsername: string, declaredAt: string | Date): string {
  return `Uploaded by @${declaredByUsername}•${formatScheduleFooterDate(declaredAt)}`;
}

export interface ScheduleResultEmbedParams {
  guild: Guild;
  tournament: Pick<TournamentRow, 'name'>;
  match: Pick<MatchRow, 'team1_name' | 'team2_name' | 'round'>;
  scheduledAt: string | Date;
  declaredAt: string | Date;
  declaredByUsername: string;
  tournamentFormat: TournamentFormat;
  ticketChannelId: string;
  team1CaptainId: string | null;
  team2CaptainId: string | null;
  assignments: StaffAssignmentRow[];
  team1Score: number;
  team2Score: number;
  winnerSide: 1 | 2;
  notes?: string | null;
  thumbnailUrl?: string | null;
  titleMessageUrl?: string | null;
}

export function buildScheduleResultEmbed(params: ScheduleResultEmbedParams): EmbedBuilder {
  const lines = [
    `**Result UTC Time:** ${formatScheduleUtcLine(params.scheduledAt)}`,
    `**Result Local Time:** ${formatScheduleDiscordTimestamp(params.scheduledAt)}`,
    '',
    `**__Tournament:__** ${params.tournament.name}`,
    `**Channel:** ${formatChannel(params.guild, params.ticketChannelId)}`,
    '',
    `**Team 1 Captain:** ${formatCaptainLine(params.guild, params.team1CaptainId, params.match.team1_name, params.tournamentFormat)}`,
    `**Team 2 Captain:** ${formatCaptainLine(params.guild, params.team2CaptainId, params.match.team2_name, params.tournamentFormat)}`,
    '',
    '**__Staffs:__**',
    formatStaffJudgeLine(params.assignments),
    formatStaffRecorderLine(params.assignments),
    '',
    '**__Results:__**',
    formatResultScoreLine({
      team1Name: params.match.team1_name,
      team2Name: params.match.team2_name,
      score1: params.team1Score,
      score2: params.team2Score,
      winnerSide: params.winnerSide,
    }),
  ];

  if (params.notes?.trim()) {
    lines.push('', `**Remarks:** ${params.notes.trim()}`);
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(
      formatResultEmbedTitle(
        params.match.team1_name,
        params.match.team2_name,
        params.titleMessageUrl,
      ),
    )
    .setDescription(lines.join('\n'))
    .setFooter({
      text: formatResultEmbedFooter(params.declaredByUsername, params.declaredAt),
    });

  if (params.thumbnailUrl) {
    embed.setImage(params.thumbnailUrl);
  }

  return embed;
}

export interface ScheduleResultTicketNotification {
  content: string;
  mentionUserIds: string[];
}

export function buildScheduleResultTicketContent(captainIds: string[]): ScheduleResultTicketNotification {
  const mentionUserIds = [...new Set(captainIds.filter(Boolean))];
  const mentions = mentionUserIds.map((id) => formatUser(id));
  const suffix = 'The results of the Schedule have been **Uploaded**, please **Check**.';

  if (mentions.length === 0) {
    return { content: suffix, mentionUserIds: [] };
  }

  return {
    content: `${mentions.join(' ')} — ${suffix}`,
    mentionUserIds,
  };
}

export function buildScheduleResultSuccessMessage(guild: Guild, resultChannelId: string): string {
  return `✅ Match result posted to ${formatChannel(guild, resultChannelId)}.`;
}

export function buildScheduleResultDeleteConfirmation(matchLabel: string, reason?: string): string {
  const reasonText = reason?.trim() || 'Not provided';
  return `The result for **${matchLabel}** has been deleted successfully. Reason: ${reasonText}`;
}
