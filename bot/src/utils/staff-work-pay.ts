import type { Guild } from 'discord.js';
import type { TournamentFormat } from '../services/sheets.js';
import type {
  AttendanceWithMatch,
  LinkPaymentDiscount,
  StaffWorkCategory,
  StaffWorkEntry,
  StaffWorkStats,
} from '../types/attendance.js';
import { ATTENDANCE_REMARK_DW } from '../types/attendance.js';

export const SALARY_RATES = {
  perEvent: { judge: 450, recorder: 450, dual: 575 },
  perGame: { judge: 325, recorder: 325, dual: 425 },
} as const;

export function isDefaultWin(remark: string | null | undefined): boolean {
  return remark?.trim().toUpperCase() === ATTENDANCE_REMARK_DW;
}

export function isPerGameFormat(format: TournamentFormat): boolean {
  return format === '4vs4' || format === '5vs5';
}

export function gamesFromScores(team1Score: number, team2Score: number): number {
  return team1Score + team2Score;
}

export function classifyAttendanceRole(
  record: Pick<AttendanceWithMatch, 'judge_discord_id' | 'recorder_discord_id' | 'recording_links'>,
  userId: string,
): StaffWorkCategory | null {
  const isJudge = record.judge_discord_id === userId;
  const isRecorder = record.recorder_discord_id === userId;
  if (!isJudge && !isRecorder) return null;

  const samePerson = record.judge_discord_id === record.recorder_discord_id;
  const hasLinks = record.recording_links.length > 0;

  if (samePerson && userId === record.judge_discord_id) {
    return hasLinks ? 'dual' : 'judge';
  }

  if (isJudge) return 'judge';
  if (isRecorder) return 'recorder';
  return null;
}

function payRateForCategory(
  format: TournamentFormat,
  category: StaffWorkCategory,
): number {
  const table = isPerGameFormat(format) ? SALARY_RATES.perGame : SALARY_RATES.perEvent;
  if (category === 'dual') return table.dual;
  if (category === 'recorder') return table.recorder;
  return table.judge;
}

export function calculateAttendancePay(
  format: TournamentFormat,
  category: StaffWorkCategory,
  games: number,
  hasLinks: boolean,
): number {
  if (category === 'recorder' && !hasLinks) return 0;

  const rate = payRateForCategory(format, category);
  if (isPerGameFormat(format)) return rate * games;
  return rate;
}

function trackEntry(
  map: Map<string, StaffWorkEntry>,
  userId: string,
  games: number,
): void {
  const existing = map.get(userId) ?? { userId, matches: 0, rounds: 0 };
  existing.rounds += 1;
  existing.matches += games;
  map.set(userId, existing);
}

export function aggregateStaffWork(records: AttendanceWithMatch[]): StaffWorkStats {
  const judgeStats = new Map<string, StaffWorkEntry>();
  const recorderStats = new Map<string, StaffWorkEntry>();
  const dualStats = new Map<string, StaffWorkEntry>();

  for (const record of records) {
    const games = gamesFromScores(record.team1_score, record.team2_score);
    const samePerson = record.judge_discord_id === record.recorder_discord_id;
    const hasLinks = record.recording_links.length > 0;

    if (samePerson) {
      if (hasLinks) {
        trackEntry(dualStats, record.judge_discord_id, games);
      } else {
        trackEntry(judgeStats, record.judge_discord_id, games);
      }
      continue;
    }

    trackEntry(judgeStats, record.judge_discord_id, games);
    trackEntry(recorderStats, record.recorder_discord_id, games);
  }

  const sortEntries = (map: Map<string, StaffWorkEntry>) =>
    [...map.values()].sort((a, b) => b.matches - a.matches || b.rounds - a.rounds);

  return {
    judges: sortEntries(judgeStats),
    recorders: sortEntries(recorderStats),
    dual: sortEntries(dualStats),
  };
}

export function buildLinkPaymentDiscounts(
  records: AttendanceWithMatch[],
  format: TournamentFormat,
): LinkPaymentDiscount[] {
  const discounts: LinkPaymentDiscount[] = [];

  for (const record of records) {
    const games = gamesFromScores(record.team1_score, record.team2_score);
    const hasLinks = record.recording_links.length > 0;
    const samePerson = record.judge_discord_id === record.recorder_discord_id;
    const matchLabel =
      record.match != null
        ? `${record.match.team1_name} vs ${record.match.team2_name}`
        : 'Unknown match';
    const roundLabel = record.match?.round?.trim() || record.match?.group?.trim() || 'Unknown';

    if (samePerson && !hasLinks) {
      const expected = calculateAttendancePay(format, 'dual', games, true);
      const applied = calculateAttendancePay(format, 'judge', games, true);
      if (expected > applied) {
        discounts.push({
          userId: record.judge_discord_id,
          matchLabel,
          roundLabel,
          attendanceMarkedAt: record.created_at,
          kind: 'dual_downgrade',
          linksSubmitted: 0,
          games,
          expectedGold: expected,
          appliedGold: applied,
          discountGold: expected - applied,
        });
      }
      continue;
    }

    if (!samePerson && !hasLinks) {
      const expected = calculateAttendancePay(format, 'recorder', games, true);
      if (expected > 0) {
        discounts.push({
          userId: record.recorder_discord_id,
          matchLabel,
          roundLabel,
          attendanceMarkedAt: record.created_at,
          kind: 'recorder_withheld',
          linksSubmitted: 0,
          games,
          expectedGold: expected,
          appliedGold: 0,
          discountGold: expected,
        });
      }
    }
  }

  return discounts.sort(
    (a, b) => new Date(a.attendanceMarkedAt).getTime() - new Date(b.attendanceMarkedAt).getTime(),
  );
}

export function goldToAc(gold: number): number {
  return gold / 10;
}

export function formatGoldAc(gold: number): string {
  return `${gold} gold (${goldToAc(gold)} AC)`;
}

export function tournamentTypeToSalaryFormat(
  tournamentType: 'per_match' | 'per_game',
): TournamentFormat {
  return tournamentType === 'per_game' ? '5vs5' : '3vs3';
}

export interface UserSalaryBreakdown {
  judgeGold: number;
  recorderGold: number;
  dualGold: number;
  totalGold: number;
}

export function calculateUserSalary(
  records: AttendanceWithMatch[],
  userId: string,
  tournamentType: 'per_match' | 'per_game',
): UserSalaryBreakdown {
  const format = tournamentTypeToSalaryFormat(tournamentType);
  let judgeGold = 0;
  let recorderGold = 0;
  let dualGold = 0;

  for (const record of records) {
    const category = classifyAttendanceRole(record, userId);
    if (!category) continue;

    const games = gamesFromScores(record.team1_score, record.team2_score);
    const hasLinks = record.recording_links.length > 0;
    const gold = calculateAttendancePay(format, category, games, hasLinks);

    if (category === 'judge') judgeGold += gold;
    else if (category === 'recorder') recorderGold += gold;
    else dualGold += gold;
  }

  return {
    judgeGold,
    recorderGold,
    dualGold,
    totalGold: judgeGold + recorderGold + dualGold,
  };
}

export type WorkDoneCurrency = 'gold' | 'ac';

export function formatWorkDonePayAmount(gold: number, currency: WorkDoneCurrency): string {
  if (currency === 'gold') return `${gold} 🪙`;
  const ac = goldToAc(gold);
  const value = Number.isInteger(ac) ? String(ac) : ac.toFixed(1);
  return `${value} AC`;
}

function resolveUserTag(guild: Guild | undefined, userId: string): string {
  if (!guild) return userId;
  const member = guild.members.cache.get(userId);
  return member ? `@${member.user.username}` : userId;
}

export function buildLinkDiscountReportText(params: {
  guild?: Guild;
  tournamentName: string;
  format: TournamentFormat;
  includeDefaultWins: boolean;
  discounts: LinkPaymentDiscount[];
}): string {
  const lines: string[] = [
    `Staff Work — Link payment adjustments (${params.tournamentName})`,
    `Generated: ${new Date().toISOString()}`,
    `Tournament format: ${params.format}`,
    `Default wins: ${params.includeDefaultWins ? 'included' : 'excluded'}`,
    '',
  ];

  if (params.discounts.length === 0) {
    lines.push('No link-related payment adjustments for this tournament.');
    return lines.join('\n');
  }

  for (const entry of params.discounts) {
    const title =
      entry.kind === 'dual_downgrade'
        ? 'DISCOUNT — Dual role downgraded to Judge (missing recording link)'
        : 'DISCOUNT — Recorder pay withheld (missing recording link)';

    lines.push(title);
    lines.push(`User: ${resolveUserTag(params.guild, entry.userId)}`);
    lines.push(`Match: ${entry.matchLabel}`);
    lines.push(`Round: ${entry.roundLabel}`);
    lines.push(`Attendance marked: ${entry.attendanceMarkedAt}`);
    lines.push(`Links submitted: ${entry.linksSubmitted}`);
    lines.push(`Games counted: ${entry.games}`);
    lines.push(`Expected pay: ${formatGoldAc(entry.expectedGold)}`);
    lines.push(`Applied pay: ${formatGoldAc(entry.appliedGold)}`);
    lines.push(`Discount: ${formatGoldAc(entry.discountGold)}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const totalDiscount = params.discounts.reduce((sum, row) => sum + row.discountGold, 0);
  lines.push(`Total discount: ${formatGoldAc(totalDiscount)}`);
  return lines.join('\n');
}

export interface UserWorkSummary {
  judgeRounds: number;
  judgeMatches: number;
  recorderRounds: number;
  recorderMatches: number;
  dualRounds: number;
  dualMatches: number;
  defaultWins: number;
  missingLinks: number;
}

export function summarizeUserWork(
  records: AttendanceWithMatch[],
  userId: string,
): UserWorkSummary {
  const summary: UserWorkSummary = {
    judgeRounds: 0,
    judgeMatches: 0,
    recorderRounds: 0,
    recorderMatches: 0,
    dualRounds: 0,
    dualMatches: 0,
    defaultWins: 0,
    missingLinks: 0,
  };

  for (const record of records) {
    const category = classifyAttendanceRole(record, userId);
    if (!category) continue;

    const games = gamesFromScores(record.team1_score, record.team2_score);
    if (isDefaultWin(record.remark)) summary.defaultWins += 1;

    if (category === 'judge') {
      summary.judgeRounds += 1;
      summary.judgeMatches += games;
    } else if (category === 'recorder') {
      summary.recorderRounds += 1;
      summary.recorderMatches += games;
      if (record.recording_links.length === 0) summary.missingLinks += 1;
    } else {
      summary.dualRounds += 1;
      summary.dualMatches += games;
    }
  }

  return summary;
}
