import ExcelJS from 'exceljs';
import type { AttendanceWithMatch } from '../types/attendance.js';
import type { TournamentRow } from '../types/tournament.js';
import {
  aggregateStaffWork,
  calculateAttendancePay,
  classifyAttendanceRole,
  gamesFromScores,
  isDefaultWin,
  isPerGameFormat,
} from '../utils/staff-work-pay.js';
import type { TournamentFormat } from './sheets.js';

export async function buildAttendanceWorkbook(params: {
  tournament: TournamentRow;
  tournamentTypeLabel: string;
  format: TournamentFormat;
  includeDefaultWinSalary: boolean;
  records: AttendanceWithMatch[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const filtered = params.includeDefaultWinSalary
    ? params.records
    : params.records.filter((record) => !isDefaultWin(record.remark));

  const attendanceSheet = workbook.addWorksheet('Attendance Records');
  attendanceSheet.columns = [
    { header: 'Round', key: 'round', width: 16 },
    { header: 'Match', key: 'match', width: 36 },
    { header: 'Judge', key: 'judge', width: 20 },
    { header: 'Recorder', key: 'recorder', width: 20 },
    { header: 'Score', key: 'score', width: 12 },
    { header: 'Remark', key: 'remark', width: 10 },
    { header: 'Links', key: 'links', width: 48 },
    { header: 'Marked At', key: 'markedAt', width: 24 },
  ];

  for (const record of filtered) {
    attendanceSheet.addRow({
      round: record.match?.round ?? '',
      match: record.match
        ? `${record.match.team1_name} vs ${record.match.team2_name}`
        : record.match_id,
      judge: record.judge_discord_id,
      recorder: record.recorder_discord_id,
      score: `${record.team1_score}-${record.team2_score}`,
      remark: record.remark ?? '',
      links: record.recording_links.join('\n'),
      markedAt: record.created_at,
    });
  }
  attendanceSheet.getRow(1).font = { bold: true };

  const workSheet = workbook.addWorksheet('Work Count');
  const stats = aggregateStaffWork(filtered);
  workSheet.columns = [
    { header: 'Section', key: 'section', width: 20 },
    { header: 'User ID', key: 'userId', width: 22 },
    { header: 'Rounds', key: 'rounds', width: 10 },
    { header: 'Matches', key: 'matches', width: 10 },
  ];

  for (const entry of stats.judges) {
    workSheet.addRow({ section: 'Judge', ...entry });
  }
  for (const entry of stats.recorders) {
    workSheet.addRow({ section: 'Recorder', ...entry });
  }
  for (const entry of stats.dual) {
    workSheet.addRow({ section: 'Judge & Recorder', ...entry });
  }
  workSheet.getRow(1).font = { bold: true };

  const paySheet = workbook.addWorksheet('Salary Estimate');
  paySheet.columns = [
    { header: 'User ID', key: 'userId', width: 22 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Rounds', key: 'rounds', width: 10 },
    { header: 'Games', key: 'games', width: 10 },
    { header: 'Gold', key: 'gold', width: 12 },
    { header: 'AC', key: 'ac', width: 10 },
  ];

  const payTotals = new Map<string, number>();
  for (const record of filtered) {
    const games = gamesFromScores(record.team1_score, record.team2_score);
    const hasLinks = record.recording_links.length > 0;
    const userIds = new Set([record.judge_discord_id, record.recorder_discord_id]);

    for (const userId of userIds) {
      const category = classifyAttendanceRole(record, userId);
      if (!category) continue;
      const gold = calculateAttendancePay(params.format, category, games, hasLinks);
      payTotals.set(userId, (payTotals.get(userId) ?? 0) + gold);
      paySheet.addRow({
        userId,
        category,
        rounds: 1,
        games,
        gold,
        ac: gold / 10,
      });
    }
  }
  paySheet.getRow(1).font = { bold: true };

  const infoSheet = workbook.addWorksheet('Tournament Info');
  infoSheet.addRows([
    ['Name', params.tournament.name],
    ['Tournament Type', params.tournamentTypeLabel],
    ['Format Detected', params.format],
    ['Include DW Salary', params.includeDefaultWinSalary ? 'Yes' : 'No'],
    ['Attendance Records', String(filtered.length)],
    ['Challonge ID', params.tournament.challonge_id],
    ['Sheet Link', params.tournament.sheet_link],
  ]);
  infoSheet.getColumn(1).width = 24;
  infoSheet.getColumn(2).width = 48;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function perEventTournamentTypeLabel(format: TournamentFormat): string {
  return isPerGameFormat(format) ? '4v4/5v5 (Per Game)' : '1v1/2v2/3v3 (Per Match)';
}
