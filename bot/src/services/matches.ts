import type { SupabaseClient } from '@supabase/supabase-js';
import type { TournamentRow } from '../types/tournament.js';
import {
  MATCH_FULL_COLUMNS,
  MATCH_LIST_COLUMNS,
  MATCH_SCHEDULE_COLUMNS,
  type MatchListRow,
  type MatchRow,
  type MatchScheduleRow,
  type MatchStatus,
} from '../types/match.js';
import {
  type ChallongeMatchData,
  ALL_MATCH_GROUPS,
  fetchChallongeMatches,
  getChallongeCredentials,
} from './challonge.js';

export function normalizeGroupFilter(group?: string | null): string | undefined {
  const trimmed = group?.trim();
  if (!trimmed || trimmed === ALL_MATCH_GROUPS) {
    return undefined;
  }
  return trimmed;
}

function mapRow(row: MatchRow): MatchRow {
  return {
    ...row,
    team1_score: row.team1_score != null ? Number(row.team1_score) : null,
    team2_score: row.team2_score != null ? Number(row.team2_score) : null,
    winner_side: row.winner_side != null ? Number(row.winner_side) : null,
  };
}

export async function getMatchById(
  supabase: SupabaseClient,
  tournamentId: string,
  matchId: string,
): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_FULL_COLUMNS)
    .eq('tournament_id', tournamentId)
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load match: ${error.message}`);
  }

  return data ? mapRow(data as MatchRow) : null;
}

export async function getMatchForSchedule(
  supabase: SupabaseClient,
  tournamentId: string,
  matchId: string,
): Promise<MatchScheduleRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SCHEDULE_COLUMNS)
    .eq('tournament_id', tournamentId)
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load match: ${error.message}`);
  }

  return data ? (data as MatchScheduleRow) : null;
}

export async function getMatchForScheduleByChallonge(
  supabase: SupabaseClient,
  guildId: string,
  challongeMatchId: string,
): Promise<{ match: MatchScheduleRow; tournamentId: string } | null> {
  const { data: tournaments, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('guild_id', guildId);

  if (tournamentError) {
    throw new Error(`Failed to load tournaments: ${tournamentError.message}`);
  }

  const tournamentIds = (tournaments ?? []).map((row) => (row as { id: string }).id);
  if (tournamentIds.length === 0) return null;

  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SCHEDULE_COLUMNS)
    .eq('challonge_match_id', challongeMatchId)
    .in('tournament_id', tournamentIds)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load match: ${error.message}`);
  }

  if (!data) return null;

  const match = data as MatchScheduleRow;
  return { match, tournamentId: match.tournament_id };
}

export async function getMatchByChallongeMatchIdForGuild(
  supabase: SupabaseClient,
  guildId: string,
  challongeMatchId: string,
): Promise<{ match: MatchRow; tournamentId: string } | null> {
  const { data: tournaments, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('guild_id', guildId);

  if (tournamentError) {
    throw new Error(`Failed to load tournaments: ${tournamentError.message}`);
  }

  const tournamentIds = (tournaments ?? []).map((row) => (row as { id: string }).id);
  if (tournamentIds.length === 0) return null;

  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_FULL_COLUMNS)
    .eq('challonge_match_id', challongeMatchId)
    .in('tournament_id', tournamentIds)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load match: ${error.message}`);
  }

  if (!data) return null;

  const match = mapRow(data as MatchRow);
  return { match, tournamentId: match.tournament_id };
}

export async function getMatchIdsWithRooms(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('match_rooms')
    .select('match_id')
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(`Failed to load match rooms: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.match_id as string));
}

export async function listDistinctGroups(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('group')
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(`Failed to load match groups: ${error.message}`);
  }

  const groups = new Set<string>();
  for (const row of data ?? []) {
    const group = (row as { group: string }).group;
    if (group) groups.add(group);
  }

  return [...groups].sort((a, b) => a.localeCompare(b));
}

export async function listMatches(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<MatchListRow[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_LIST_COLUMNS)
    .eq('tournament_id', tournamentId)
    .order('round')
    .order('group');

  if (error) {
    throw new Error(`Failed to load matches: ${error.message}`);
  }

  return ((data as MatchListRow[]) ?? []).map((row) => mapRow(row as MatchRow));
}

export async function searchMatches(
  supabase: SupabaseClient,
  tournamentId: string,
  query: string,
  limit = 25,
): Promise<MatchListRow[]> {
  const matches = await listMatches(supabase, tournamentId);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? matches.filter(
        (match) =>
          match.team1_name.toLowerCase().includes(normalized) ||
          match.team2_name.toLowerCase().includes(normalized) ||
          match.round.toLowerCase().includes(normalized) ||
          match.group.toLowerCase().includes(normalized) ||
          match.challonge_match_id.includes(normalized),
      )
    : matches;

  return filtered.slice(0, limit);
}

export function isMatchReadyForRoom(team1Name: string, team2Name: string): boolean {
  if (!isMatchReadyTeamName(team1Name) || !isMatchReadyTeamName(team2Name)) {
    return false;
  }
  return true;
}

function isMatchReadyTeamName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.toUpperCase() === 'TBD') return false;

  const placeholderPatterns = [
    /^(\d+)(st|nd|rd|th)\s+(in|en)\s+group/i,
    /^(\d+)(st|nd|rd|th)\s+(in|en)\s+grupo/i,
    /^winner of/i,
    /^loser of/i,
    /^w\s*$/i,
    /^l\s*$/i,
  ];

  return !placeholderPatterns.some((pattern) => pattern.test(trimmed));
}

export async function listOpenMatchesWithoutRooms(
  supabase: SupabaseClient,
  tournamentId: string,
  group?: string | null,
): Promise<MatchListRow[]> {
  const groupFilter = normalizeGroupFilter(group);
  const roomMatchIds = await getMatchIdsWithRooms(supabase, tournamentId);
  const matches = await listMatches(supabase, tournamentId);

  return matches.filter((match) => {
    if (match.status !== 'open') return false;
    if (match.ticket_channel_id) return false;
    if (roomMatchIds.has(match.id)) return false;
    if (!isMatchReadyForRoom(match.team1_name, match.team2_name)) return false;
    if (groupFilter && match.group !== groupFilter) return false;
    return true;
  });
}

export async function syncMatchesFromChallonge(
  supabase: SupabaseClient,
  tournament: TournamentRow,
): Promise<{ synced: number; created: number; updated: number }> {
  const { challongeId, apiKey } = getChallongeCredentials(tournament);
  const challongeMatches = await fetchChallongeMatches(challongeId, apiKey);

  const { data: existingRows, error: existingError } = await supabase
    .from('matches')
    .select('id, challonge_match_id, ticket_channel_id')
    .eq('tournament_id', tournament.id);

  if (existingError) {
    throw new Error(`Failed to load existing matches: ${existingError.message}`);
  }

  const existingByChallongeId = new Map(
    (existingRows ?? []).map((row) => [
      (row as { challonge_match_id: string }).challonge_match_id,
      row as { id: string; challonge_match_id: string; ticket_channel_id: string | null },
    ]),
  );

  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const challongeMatch of challongeMatches) {
    const existing = existingByChallongeId.get(challongeMatch.challongeMatchId);
    const payload = {
      tournament_id: tournament.id,
      challonge_match_id: challongeMatch.challongeMatchId,
      round: challongeMatch.round,
      group: challongeMatch.group,
      team1_name: challongeMatch.team1Name,
      team2_name: challongeMatch.team2Name,
      team1_score: challongeMatch.team1Score,
      team2_score: challongeMatch.team2Score,
      winner_side: challongeMatch.winnerSide,
      status: challongeMatch.status,
      updated_at: now,
    };

    if (existing) {
      const { error } = await supabase
        .from('matches')
        .update({
          ...payload,
          ticket_channel_id: existing.ticket_channel_id,
        })
        .eq('id', existing.id);

      if (error) {
        throw new Error(`Failed to update match ${existing.id}: ${error.message}`);
      }
      updated += 1;
    } else {
      const { error } = await supabase.from('matches').insert({
        id: crypto.randomUUID(),
        ...payload,
        ticket_channel_id: null,
        created_at: now,
      });

      if (error) {
        throw new Error(`Failed to create match: ${error.message}`);
      }
      created += 1;
    }
  }

  return { synced: challongeMatches.length, created, updated };
}

export async function markMatchCompleted(
  supabase: SupabaseClient,
  matchId: string,
  scores: { team1Score: number; team2Score: number; winnerSide: 1 | 2 },
): Promise<MatchRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('matches')
    .update({
      team1_score: scores.team1Score,
      team2_score: scores.team2Score,
      winner_side: scores.winnerSide,
      status: 'completed' satisfies MatchStatus,
      updated_at: now,
    })
    .eq('id', matchId)
    .select(MATCH_FULL_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update match scores: ${error?.message ?? 'unknown error'}`);
  }

  return mapRow(data as MatchRow);
}

export async function updateMatchScores(
  supabase: SupabaseClient,
  matchId: string,
  scores: { team1Score: number; team2Score: number; winnerSide: 1 | 2 },
): Promise<MatchRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('matches')
    .update({
      team1_score: scores.team1Score,
      team2_score: scores.team2Score,
      winner_side: scores.winnerSide,
      updated_at: now,
    })
    .eq('id', matchId)
    .select(MATCH_FULL_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update match scores: ${error?.message ?? 'unknown error'}`);
  }

  return mapRow(data as MatchRow);
}

export function resolveWinnerSideFromScores(
  score1: number,
  score2: number,
  override?: 1 | 2 | null,
): 1 | 2 {
  if (override === 1 || override === 2) return override;
  if (score1 === score2) {
    throw new Error('Scores cannot be tied. Provide a winner override if needed.');
  }
  return score1 > score2 ? 1 : 2;
}

export async function getChallongeMatchMeta(
  tournament: TournamentRow,
  challongeMatchId: string,
): Promise<ChallongeMatchData | null> {
  const { challongeId, apiKey } = getChallongeCredentials(tournament);
  const matches = await fetchChallongeMatches(challongeId, apiKey);
  return matches.find((match) => match.challongeMatchId === challongeMatchId) ?? null;
}

export async function recordBracketCorrection(
  supabase: SupabaseClient,
  params: {
    tournamentId: string;
    matchId: string;
    oldTeam1Score: number | null;
    oldTeam2Score: number | null;
    newTeam1Score: number;
    newTeam2Score: number;
    correctedByDiscordId: string;
  },
): Promise<void> {
  const { error } = await supabase.from('bracket_corrections').insert({
    id: crypto.randomUUID(),
    tournament_id: params.tournamentId,
    match_id: params.matchId,
    old_team1_score: params.oldTeam1Score,
    old_team2_score: params.oldTeam2Score,
    new_team1_score: params.newTeam1Score,
    new_team2_score: params.newTeam2Score,
    corrected_by_discord_id: params.correctedByDiscordId,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to record bracket correction: ${error.message}`);
  }
}
