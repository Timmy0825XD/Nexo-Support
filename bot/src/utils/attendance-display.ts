import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
} from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { AttendanceWithMatch, StaffWorkEntry } from '../types/attendance.js';
import { ATTENDANCE_REMARK_DW } from '../types/attendance.js';
import type { MatchScheduleRow } from '../types/match.js';
import type { TournamentRow } from '../types/tournament.js';
import { formatChannel, formatUser } from './guild-display.js';
import {
  formatEmphasizedName,
  formatInlineScoreLine,
  formatMatchEmbedTitle,
  formatMatchupTitle,
} from './match-formatting.js';

export const LINK_MISSING_PAGE_SIZE = 5;
export const LINK_MISSING_TIMEOUT_MS = 2 * 60 * 1000;

const LINK_MISSING_PREV_ID = 'link_missing:prev';
const LINK_MISSING_NEXT_ID = 'link_missing:next';
const LINK_MISSING_STATUS = 'Awaiting Link';
import {
  formatWorkDonePayAmount,
  isDefaultWin,
  type UserSalaryBreakdown,
  type WorkDoneCurrency,
} from './staff-work-pay.js';

export type AttendanceMatchInfo = Pick<
  MatchScheduleRow,
  'team1_name' | 'team2_name' | 'round' | 'group' | 'ticket_channel_id'
>;

const STAFF_WORK_COLORS = {
  judges: 0xff4d4d,
  recorders: 0x00ff14,
  dual: 0x4da6ff,
} as const;

function formatRecordingLinks(links: string[]): string {
  if (links.length === 0) return '*No links submitted*';
  return links.map((url) => `- [Link](${url})`).join('\n');
}

export function buildEventsRecordingLinksMessage(params: {
  tournamentName: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  links: string[];
}): string {
  const linkLines =
    params.links.length > 0
      ? params.links.map((url) => `- [Link](${url})`).join('\n')
      : '*No links submitted*';

  return [
    `**Tournament:** ${params.tournamentName}`,
    `**Match:** ${formatMatchupTitle(params.team1Name, params.team2Name)}`,
    `**Score:** ${formatInlineScoreLine({
      team1Name: params.team1Name,
      team2Name: params.team2Name,
      score1: params.team1Score,
      score2: params.team2Score,
    })}`,
    '**Links:**',
    linkLines,
  ].join('\n');
}

function resolveUsername(guild: Guild, userId: string): string {
  const member = guild.members.cache.get(userId);
  return member?.user.username ?? userId;
}

function formatStaffWorkLines(guild: Guild, entries: StaffWorkEntry[]): string {
  if (entries.length === 0) return '*No records found.*';

  return entries
    .map((entry) => {
      const name = resolveUsername(guild, entry.userId);
      return `**${name}**\n${entry.matches} matches (${entry.rounds} rounds)`;
    })
    .join('\n\n');
}

function resolveWinnerSide(
  team1Score: number,
  team2Score: number,
): 1 | 2 | undefined {
  if (team1Score > team2Score) return 1;
  if (team2Score > team1Score) return 2;
  return undefined;
}

export function buildStaffWorkReply(params: {
  guild: Guild;
  tournamentName: string;
  includeDefaultWins: boolean;
  judges: StaffWorkEntry[];
  recorders: StaffWorkEntry[];
  dual: StaffWorkEntry[];
}): { content: string; embeds: EmbedBuilder[] } {
  const suffix = params.includeDefaultWins ? 'including default wins' : 'excluding default wins';
  const content = `${CUSTOM_EMOJIS.done} Staff Work Count for ${params.tournamentName} (${suffix})`;

  const embeds = [
    new EmbedBuilder()
      .setColor(STAFF_WORK_COLORS.judges)
      .setTitle('Judges')
      .setDescription(formatStaffWorkLines(params.guild, params.judges))
      .setTimestamp(),
    new EmbedBuilder()
      .setColor(STAFF_WORK_COLORS.recorders)
      .setTitle('Recorders')
      .setDescription(formatStaffWorkLines(params.guild, params.recorders))
      .setTimestamp(),
    new EmbedBuilder()
      .setColor(STAFF_WORK_COLORS.dual)
      .setTitle('Judge & Recorder')
      .setDescription(formatStaffWorkLines(params.guild, params.dual))
      .setTimestamp(),
  ];

  return { content, embeds };
}

/** @deprecated Use buildStaffWorkReply — returns embeds only for backwards compatibility. */
export function buildStaffWorkEmbeds(params: {
  guild: Guild;
  tournamentName: string;
  includeDefaultWins: boolean;
  judges: StaffWorkEntry[];
  recorders: StaffWorkEntry[];
  dual: StaffWorkEntry[];
}): EmbedBuilder[] {
  return buildStaffWorkReply(params).embeds;
}

export function buildAttendanceMarkedEmbed(params: {
  guild: Guild;
  tournament: TournamentRow;
  match: AttendanceMatchInfo;
  attendance: AttendanceWithMatch;
}): EmbedBuilder {
  const winnerSide = resolveWinnerSide(
    params.attendance.team1_score,
    params.attendance.team2_score,
  );

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(`${CUSTOM_EMOJIS.done} Attendance Marked Successfully`)
    .setDescription(
      formatInlineScoreLine({
        team1Name: params.match.team1_name,
        team2Name: params.match.team2_name,
        score1: params.attendance.team1_score,
        score2: params.attendance.team2_score,
        winnerSide,
      }),
    )
    .addFields(
      { name: 'Tournament', value: params.tournament.name, inline: false },
      { name: 'Judge', value: formatUser(params.attendance.judge_discord_id), inline: true },
      {
        name: 'Recorder',
        value: formatUser(params.attendance.recorder_discord_id),
        inline: true,
      },
      {
        name: 'Channel',
        value: formatChannel(params.guild, params.attendance.ticket_channel_id),
        inline: false,
      },
      {
        name: 'Recording Link',
        value: formatRecordingLinks(params.attendance.recording_links),
        inline: false,
      },
    )
    .setFooter({ text: params.guild.name })
    .setTimestamp(new Date(params.attendance.created_at));

  if (isDefaultWin(params.attendance.remark)) {
    embed.addFields({ name: 'Remark', value: ATTENDANCE_REMARK_DW, inline: true });
  }

  return embed;
}

export function buildAttendanceDeletedEmbed(params: {
  guild: Guild;
  tournament: TournamentRow;
  match: AttendanceMatchInfo;
  reason?: string | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.error)
    .setTitle(`${CUSTOM_EMOJIS.error} Attendance Deleted`)
    .setDescription(formatMatchEmbedTitle(params.match.team1_name, params.match.team2_name))
    .addFields(
      { name: 'Tournament', value: params.tournament.name, inline: false },
      {
        name: 'Channel',
        value: formatChannel(params.guild, params.match.ticket_channel_id ?? ''),
        inline: true,
      },
    )
    .setFooter({ text: params.guild.name })
    .setTimestamp();

  if (params.reason) {
    embed.addFields({ name: 'Reason', value: params.reason, inline: false });
  }

  return embed;
}

export function buildGetAttendanceEmbed(params: {
  guild: Guild;
  tournamentName: string;
  userId: string;
  records: AttendanceWithMatch[];
  pageIndex: number;
  pageSize: number;
}): EmbedBuilder {
  const start = params.pageIndex * params.pageSize;
  const pageRecords = params.records.slice(start, start + params.pageSize);
  const totalPages = Math.max(1, Math.ceil(params.records.length / params.pageSize));

  if (pageRecords.length === 0) {
    return new EmbedBuilder()
      .setColor(EMBED_COLORS.info)
      .setTitle('Attendance Records')
      .setDescription(
        `No attendance records found for ${formatUser(params.userId)} in **${params.tournamentName}**.`,
      )
      .setTimestamp();
  }

  const lines = pageRecords.map((record) => {
    const matchup =
      record.match != null
        ? formatMatchEmbedTitle(record.match.team1_name, record.match.team2_name)
        : 'Unknown match';
    const role =
      record.judge_discord_id === record.recorder_discord_id
        ? 'Judge & Recorder'
        : record.judge_discord_id === params.userId
          ? 'Judge'
          : 'Recorder';
    const links =
      record.recording_links.length > 0
        ? `${record.recording_links.length} link(s)`
        : 'Missing links';
    const remark = isDefaultWin(record.remark) ? ` · ${ATTENDANCE_REMARK_DW}` : '';
    const winnerSide = resolveWinnerSide(record.team1_score, record.team2_score);
    return [
      matchup,
      `*${record.match?.round ?? 'Unknown round'}* · **${role}**${remark}`,
      formatInlineScoreLine({
        team1Name: record.match?.team1_name ?? 'Team 1',
        team2Name: record.match?.team2_name ?? 'Team 2',
        score1: record.team1_score,
        score2: record.team2_score,
        winnerSide,
      }),
      `Links: ${links}`,
    ].join('\n');
  });

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(`Attendance — ${params.tournamentName}`)
    .setDescription(
      `Records for ${formatUser(params.userId)} · Page ${params.pageIndex + 1}/${totalPages}\n\n${lines.join('\n\n')}`,
    )
    .setTimestamp();
}

export type LinkMissingRow = {
  team1Name: string;
  team2Name: string;
  recorderId: string;
  markedAt: string;
};

function formatLinkMissingBlock(row: LinkMissingRow, index: number): string {
  const unix = Math.floor(new Date(row.markedAt).getTime() / 1000);

  return [
    `${index + 1}. ${formatEmphasizedName(row.team1Name)} _VS_ ${formatEmphasizedName(row.team2Name)}`,
    `> **Recorder:** ${formatUser(row.recorderId)}`,
    `> **Date:** <t:${unix}:R>`,
    `> **Status:** ${LINK_MISSING_STATUS}`,
  ].join('\n');
}

export function buildLinkMissingEmbed(params: {
  tournamentName?: string;
  rows: LinkMissingRow[];
  pageIndex: number;
  expired?: boolean;
}): EmbedBuilder {
  const title = params.expired
    ? '⚠️ Missing Recording Links (Expired)'
    : '⚠️ Missing Recording Links';

  if (params.rows.length === 0) {
    return new EmbedBuilder()
      .setColor(EMBED_COLORS.success)
      .setTitle(`${CUSTOM_EMOJIS.done} Missing Recording Links`)
      .setDescription('No attendance records are missing recording links.')
      .setTimestamp();
  }

  const totalPages = Math.max(1, Math.ceil(params.rows.length / LINK_MISSING_PAGE_SIZE));
  const start = params.pageIndex * LINK_MISSING_PAGE_SIZE;
  const pageRows = params.rows.slice(start, start + LINK_MISSING_PAGE_SIZE);
  const header = [
    params.tournamentName ? `📊 **Tournament:** ${params.tournamentName}` : null,
    `🔗 **Missing Links:** ${params.rows.length} match${params.rows.length === 1 ? '' : 'es'} need attention`,
    '─────────────',
  ]
    .filter((line): line is string => line != null)
    .join('\n');
  const body = pageRows.map((row, index) => formatLinkMissingBlock(row, start + index)).join('\n\n');
  const footerParts = [
    `Page ${params.pageIndex + 1}/${totalPages}`,
    `${params.rows.length} total missing`,
  ];
  if (params.expired) footerParts.push('Session expired');

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.warning)
    .setTitle(title)
    .setDescription(`${header}\n\n${body}`.slice(0, 4096))
    .setFooter({ text: footerParts.join(' • ') })
    .setTimestamp();
}

export function buildLinkMissingComponents(
  pageIndex: number,
  totalRows: number,
  locked: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const totalPages = Math.max(1, Math.ceil(totalRows / LINK_MISSING_PAGE_SIZE));

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(LINK_MISSING_PREV_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('«')
      .setDisabled(locked || pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId('link_missing:page')
      .setStyle(ButtonStyle.Secondary)
      .setLabel(`${pageIndex + 1}/${totalPages}`)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(LINK_MISSING_NEXT_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('»')
      .setDisabled(locked || pageIndex >= totalPages - 1),
  );
}

export async function runLinkMissingPagination(
  interaction: ChatInputCommandInteraction,
  params: {
    tournamentName?: string;
    rows: LinkMissingRow[];
  },
): Promise<void> {
  let currentPage = 0;

  const render = (locked: boolean) => ({
    embeds: [
      buildLinkMissingEmbed({
        tournamentName: params.tournamentName,
        rows: params.rows,
        pageIndex: currentPage,
        expired: locked,
      }),
    ],
    components:
      params.rows.length > LINK_MISSING_PAGE_SIZE
        ? [buildLinkMissingComponents(currentPage, params.rows.length, locked)]
        : [],
  });

  const message = await interaction.editReply(render(false));
  if (params.rows.length <= LINK_MISSING_PAGE_SIZE) return;

  const totalPages = Math.ceil(params.rows.length / LINK_MISSING_PAGE_SIZE);
  const collector = message.createMessageComponentCollector({
    time: LINK_MISSING_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: 'Only the person who ran `/link missing` can browse these pages.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (buttonInteraction.customId === LINK_MISSING_PREV_ID && currentPage > 0) {
      currentPage -= 1;
    } else if (buttonInteraction.customId === LINK_MISSING_NEXT_ID && currentPage < totalPages - 1) {
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

export function buildWorkDoneEmbed(params: {
  guild: Guild;
  tournamentName: string;
  username: string;
  tournamentTypeLabel: string;
  salary: UserSalaryBreakdown;
  currency: WorkDoneCurrency;
  botAvatarUrl?: string | null;
}): EmbedBuilder {
  const formatAmount = (gold: number) => formatWorkDonePayAmount(gold, params.currency);

  return new EmbedBuilder()
    .setColor(0x0066ff)
    .setTitle(`💰 Salary Calculation for ${params.username}`)
    .addFields(
      { name: '🏆 Tournament', value: params.tournamentName, inline: false },
      { name: '🏆 Tournament Type', value: params.tournamentTypeLabel, inline: false },
      { name: '👨‍⚖️ Judge Salary', value: formatAmount(params.salary.judgeGold), inline: false },
      {
        name: '📼 Recorder Salary',
        value: formatAmount(params.salary.recorderGold),
        inline: false,
      },
      {
        name: '🎭 Both Roles Salary',
        value: formatAmount(params.salary.dualGold),
        inline: false,
      },
      { name: '💵 Total Salary', value: formatAmount(params.salary.totalGold), inline: false },
    )
    .setFooter({
      text: '⚠️ Salary is subject to change based on actual work done',
      iconURL: params.botAvatarUrl ?? undefined,
    })
    .setTimestamp();
}

export const WORK_DONE_CURRENCY_TIMEOUT_MS = 2 * 60 * 1000;

const WORK_DONE_GOLD_PREFIX = 'work_done:gold:';
const WORK_DONE_AC_PREFIX = 'work_done:ac:';

export function buildWorkDoneSessionId(
  tournamentId: string,
  userId: string,
  tournamentType: string,
): string {
  return `${tournamentId}:${userId}:${tournamentType}`;
}

export function buildWorkDoneComponents(
  sessionId: string,
  currency: WorkDoneCurrency,
  locked: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WORK_DONE_GOLD_PREFIX}${sessionId}`)
      .setLabel('Gold')
      .setEmoji('🪙')
      .setStyle(currency === 'gold' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(`${WORK_DONE_AC_PREFIX}${sessionId}`)
      .setLabel('ArtCoin')
      .setEmoji('🔷')
      .setStyle(currency === 'ac' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(locked),
  );
}

export function attachWorkDoneCurrencyCollector(params: {
  message: Message;
  sessionId: string;
  buildPayload: (currency: WorkDoneCurrency) => {
    embed: EmbedBuilder;
  };
  initialCurrency?: WorkDoneCurrency;
}): void {
  let currency = params.initialCurrency ?? 'ac';

  const collector = params.message.createMessageComponentCollector({
    filter: (interaction) =>
      interaction.isButton() &&
      (interaction.customId === `${WORK_DONE_GOLD_PREFIX}${params.sessionId}` ||
        interaction.customId === `${WORK_DONE_AC_PREFIX}${params.sessionId}`),
    time: WORK_DONE_CURRENCY_TIMEOUT_MS,
  });

  collector.on('collect', async (interaction) => {
    if (!interaction.isButton()) return;
    currency =
      interaction.customId === `${WORK_DONE_GOLD_PREFIX}${params.sessionId}` ? 'gold' : 'ac';
    const { embed } = params.buildPayload(currency);
    await interaction.update({
      embeds: [embed],
      components: [buildWorkDoneComponents(params.sessionId, currency, false)],
    });
  });

  collector.on('end', async () => {
    const { embed } = params.buildPayload(currency);
    await params.message
      .edit({
        embeds: [embed],
        components: [buildWorkDoneComponents(params.sessionId, currency, true)],
      })
      .catch(() => undefined);
  });
}
