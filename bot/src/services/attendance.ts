import type { SupabaseClient } from '@supabase/supabase-js';
import type { Guild } from 'discord.js';
import { formatUser } from '../utils/guild-display.js';

export interface AttendanceRecord {
  id: string;
  tournament_id: string;
  match_id: string;
  judge_discord_id: string;
  recorder_discord_id: string;
  remark: string | null;
  deleted_at: string | null;
  match: { round: string } | null;
}

export interface StaffWorkEntry {
  userId: string;
  matches: number;
  rounds: Set<string>;
}

export interface StaffWorkStats {
  judges: StaffWorkEntry[];
  recorders: StaffWorkEntry[];
  dual: StaffWorkEntry[];
}

function isDefaultWin(remark: string | null): boolean {
  if (!remark) return false;
  const lower = remark.toLowerCase();
  return (
    lower.includes('default') ||
    lower.includes('walkover') ||
    lower.includes('bye') ||
    lower.includes('w/o')
  );
}

export async function fetchAttendanceForTournament(
  supabase: SupabaseClient,
  tournamentId: string,
  includeDefaultWins: boolean,
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, tournament_id, match_id, judge_discord_id, recorder_discord_id, remark, deleted_at, match:matches(round)')
    .eq('tournament_id', tournamentId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to load attendance records: ${error.message}`);
  }

  const records = ((data ?? []) as unknown as Array<
    Omit<AttendanceRecord, 'match'> & { match: { round: string } | { round: string }[] | null }
  >).map((record) => ({
    ...record,
    match: Array.isArray(record.match) ? (record.match[0] ?? null) : record.match,
  })) as AttendanceRecord[];
  if (includeDefaultWins) return records;
  return records.filter((record) => !isDefaultWin(record.remark));
}

export function aggregateStaffWork(records: AttendanceRecord[]): StaffWorkStats {
  const judgeStats = new Map<string, StaffWorkEntry>();
  const recorderStats = new Map<string, StaffWorkEntry>();
  const userRoles = new Map<string, { judge: boolean; recorder: boolean }>();

  const track = (map: Map<string, StaffWorkEntry>, userId: string, round: string) => {
    const existing = map.get(userId) ?? { userId, matches: 0, rounds: new Set<string>() };
    existing.matches += 1;
    existing.rounds.add(round);
    map.set(userId, existing);
  };

  for (const record of records) {
    const round = record.match?.round ?? 'unknown';
    track(judgeStats, record.judge_discord_id, round);
    track(recorderStats, record.recorder_discord_id, round);

    const roles = userRoles.get(record.judge_discord_id) ?? { judge: false, recorder: false };
    roles.judge = true;
    userRoles.set(record.judge_discord_id, roles);

    const recorderRoles = userRoles.get(record.recorder_discord_id) ?? {
      judge: false,
      recorder: false,
    };
    recorderRoles.recorder = true;
    userRoles.set(record.recorder_discord_id, recorderRoles);
  }

  const dualIds = new Set<string>();
  for (const [userId, roles] of userRoles) {
    if (roles.judge && roles.recorder) dualIds.add(userId);
  }

  const buildList = (map: Map<string, StaffWorkEntry>, filter: (id: string) => boolean) =>
    [...map.values()]
      .filter((entry) => filter(entry.userId))
      .sort((a, b) => b.matches - a.matches);

  const dualEntries: StaffWorkEntry[] = [...dualIds]
    .map((userId) => {
      const judge = judgeStats.get(userId);
      const recorder = recorderStats.get(userId);
      const rounds = new Set<string>([
        ...(judge?.rounds ?? []),
        ...(recorder?.rounds ?? []),
      ]);
      return {
        userId,
        matches: (judge?.matches ?? 0) + (recorder?.matches ?? 0),
        rounds,
      };
    })
    .sort((a, b) => b.matches - a.matches);

  return {
    judges: buildList(judgeStats, (id) => {
      const roles = userRoles.get(id);
      return Boolean(roles?.judge && !roles.recorder);
    }),
    recorders: buildList(recorderStats, (id) => {
      const roles = userRoles.get(id);
      return Boolean(roles?.recorder && !roles.judge);
    }),
    dual: dualEntries,
  };
}

export function formatStaffWorkSection(guild: Guild, title: string, entries: StaffWorkEntry[]): string {
  if (entries.length === 0) return `${title}\nNo records found.`;

  const lines = entries.map((entry) => {
    const member = guild.members.cache.get(entry.userId);
    const name = member ? formatUser(member.id) : formatUser(entry.userId);
    return `${name}\n${entry.matches} matches (${entry.rounds.size} rounds)`;
  });

  return `${title}\n${lines.join('\n\n')}`;
}
