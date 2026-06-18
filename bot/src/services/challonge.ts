import type { TournamentRow } from '../types/tournament.js';
import { decryptChallongeKey } from './encryption.js';

export class ChallongeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChallongeError';
  }
}

export interface ChallongeCredentials {
  challongeId: string;
  apiKey: string;
}

export interface ChallongeMatchData {
  challongeMatchId: string;
  round: string;
  group: string;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  winnerSide: number | null;
  status: 'pending' | 'open' | 'completed';
  player1Id: number | null;
  player2Id: number | null;
  winnerId: number | null;
  suggestedPlayOrder: number | null;
}

export interface ChallongeTournamentSummary {
  name: string;
  state: string;
  tournamentType: string;
  groupStageEnabled: boolean;
}

interface ChallongeTournamentResponse {
  tournament?: {
    id?: number;
    name?: string;
    url?: string;
    state?: string;
    tournament_type?: string;
    group_stage_enabled?: boolean;
    participants?: Array<{ participant?: ChallongeParticipant }>;
    matches?: Array<ChallongeMatchEntry>;
    groups?: Array<{ group?: ChallongeGroup }>;
  };
}

interface ChallongeGroup {
  id?: number;
  name?: string;
  number?: number;
}

interface ChallongeParticipant {
  id?: number;
  name?: string;
  display_name?: string;
  group_id?: number | null;
  group_player_ids?: number[];
}

interface ChallongeMatch {
  id?: number;
  state?: string;
  round?: number;
  group_id?: number | null;
  identifier?: string | null;
  player1_id?: number | null;
  player2_id?: number | null;
  player1_is_prereq_match_loser?: boolean;
  player2_is_prereq_match_loser?: boolean;
  winner_id?: number | null;
  scores_csv?: string | null;
  suggested_play_order?: number | null;
}

export interface ChallongeTournamentContext {
  tournamentType: string;
  groupStageEnabled: boolean;
  groupNames: Map<number, string>;
}

export const ALL_MATCH_GROUPS = 'all';

interface ChallongeMatchEntry {
  match?: ChallongeMatch;
  participant1?: { participant?: ChallongeParticipant };
  participant2?: { participant?: ChallongeParticipant };
}

interface ChallongeListResponse<T> {
  [key: string]: T[] | undefined;
}

export function getChallongeCredentials(tournament: TournamentRow): ChallongeCredentials {
  return {
    challongeId: tournament.challonge_id,
    apiKey: decryptChallongeKey(tournament.challonge_key_encrypted),
  };
}

function buildChallongeUrl(path: string, apiKey: string, params?: Record<string, string>): URL {
  const url = new URL(`https://api.challonge.com/v1/${path}`);
  url.searchParams.set('api_key', apiKey);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function challongeFetch(url: URL, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ChallongeError('Unable to reach the Challonge API. Check network connectivity and try again.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new ChallongeError('Invalid Challonge API key. Verify the key and try again.');
  }

  if (response.status === 404) {
    throw new ChallongeError('The requested Challonge resource was not found.');
  }

  if (response.status === 429) {
    throw new ChallongeError('Challonge rate limit reached. Wait a moment and try again.');
  }

  if (!response.ok) {
    throw new ChallongeError(`Challonge API returned an unexpected error (${response.status}).`);
  }

  return response;
}

function participantName(participant: ChallongeParticipant | undefined): string | null {
  if (!participant) return null;
  const name = (participant.display_name ?? participant.name ?? '').trim();
  return name || null;
}

function parseScoresCsv(scoresCsv: string | null | undefined): {
  team1Score: number | null;
  team2Score: number | null;
} {
  if (!scoresCsv?.trim()) {
    return { team1Score: null, team2Score: null };
  }

  const parts = scoresCsv.split('-').map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length !== 2 || parts.some((score) => Number.isNaN(score))) {
    return { team1Score: null, team2Score: null };
  }

  return { team1Score: parts[0] ?? null, team2Score: parts[1] ?? null };
}

function mapChallongeState(state: string | undefined): 'pending' | 'open' | 'completed' {
  if (state === 'complete') return 'completed';
  if (state === 'open') return 'open';
  return 'pending';
}

function resolveWinnerSide(
  player1Id: number | null,
  player2Id: number | null,
  winnerId: number | null,
): number | null {
  if (!winnerId) return null;
  if (winnerId === player1Id) return 1;
  if (winnerId === player2Id) return 2;
  return null;
}

function buildGroupNamesMap(groups: Array<{ group?: ChallongeGroup }>): Map<number, string> {
  const map = new Map<number, string>();
  for (const entry of groups) {
    const group = entry.group;
    if (group?.id == null) continue;
    const label =
      group.name?.trim() ||
      (group.number != null ? `Group ${String.fromCharCode(64 + group.number)}` : `Group ${group.id}`);
    map.set(group.id, label);
  }
  return map;
}

function buildGroupNamesFromParticipants(
  participants: Array<{ participant?: ChallongeParticipant }>,
): Map<number, string> {
  const groupIds = new Set<number>();
  for (const entry of participants) {
    const groupId = entry.participant?.group_id;
    if (groupId != null) groupIds.add(groupId);
  }

  const map = new Map<number, string>();
  [...groupIds].sort((a, b) => a - b).forEach((groupId, index) => {
    map.set(groupId, `Group ${String.fromCharCode(65 + index)}`);
  });
  return map;
}

function buildGroupPlayerMap(
  participants: Array<{ participant?: ChallongeParticipant }>,
): Map<number, ChallongeParticipant> {
  const map = new Map<number, ChallongeParticipant>();
  for (const entry of participants) {
    const participant = entry.participant;
    if (!participant) continue;
    for (const groupPlayerId of participant.group_player_ids ?? []) {
      map.set(groupPlayerId, participant);
    }
  }
  return map;
}

function resolveGroupLabel(
  match: ChallongeMatch,
  context: ChallongeTournamentContext,
): string {
  const round = match.round ?? 0;
  const groupId = match.group_id;
  const tournamentType = context.tournamentType.toLowerCase();

  if (groupId != null) {
    const groupName = context.groupNames.get(groupId);
    if (groupName) {
      return `${groupName} · Round ${round}`;
    }
    if (context.groupStageEnabled) {
      return `Stage 1 · Group ${groupId} · Round ${round}`;
    }
    return `Group ${groupId} · Round ${round}`;
  }

  if (tournamentType.includes('double elimination')) {
    const identifier = match.identifier?.trim().toUpperCase() ?? '';
    if (identifier === 'GF' || identifier.includes('GRAND FINAL')) {
      return 'Grand Finals';
    }

    const isLosersBracket =
      round < 0 ||
      Boolean(match.player1_is_prereq_match_loser) ||
      Boolean(match.player2_is_prereq_match_loser);

    if (isLosersBracket) {
      return `Losers · Round ${Math.abs(round)}`;
    }

    return `Winners · Round ${round}`;
  }

  if (context.groupStageEnabled) {
    return `Stage 2 · Round ${round}`;
  }

  return `Round ${round}`;
}

function resolveTeamName(
  playerId: number | null,
  inlineParticipant: ChallongeParticipant | undefined,
  participantMap: Map<number, ChallongeParticipant>,
  groupPlayerMap: Map<number, ChallongeParticipant>,
): string {
  const inlineName = participantName(inlineParticipant);
  if (inlineName) return inlineName;

  if (playerId != null) {
    const mappedName = participantName(participantMap.get(playerId));
    if (mappedName) return mappedName;

    const groupPlayerName = participantName(groupPlayerMap.get(playerId));
    if (groupPlayerName) return groupPlayerName;
  }

  return 'TBD';
}

function mapMatchEntry(
  entry: ChallongeMatchEntry,
  context: ChallongeTournamentContext,
  participantMap: Map<number, ChallongeParticipant>,
  groupPlayerMap: Map<number, ChallongeParticipant>,
): ChallongeMatchData | null {
  const match = entry.match;
  if (!match?.id) return null;

  const player1Id = match.player1_id ?? null;
  const player2Id = match.player2_id ?? null;
  const team1Name = resolveTeamName(
    player1Id,
    entry.participant1?.participant,
    participantMap,
    groupPlayerMap,
  );
  const team2Name = resolveTeamName(
    player2Id,
    entry.participant2?.participant,
    participantMap,
    groupPlayerMap,
  );
  const { team1Score, team2Score } = parseScoresCsv(match.scores_csv);

  return {
    challongeMatchId: String(match.id),
    round: match.round != null ? String(match.round) : '0',
    group: resolveGroupLabel(match, context),
    team1Name,
    team2Name,
    team1Score,
    team2Score,
    winnerSide: resolveWinnerSide(player1Id, player2Id, match.winner_id ?? null),
    status: mapChallongeState(match.state),
    player1Id,
    player2Id,
    winnerId: match.winner_id ?? null,
    suggestedPlayOrder: match.suggested_play_order ?? null,
  };
}

async function fetchChallongeTournamentPayload(
  challongeId: string,
  apiKey: string,
): Promise<NonNullable<ChallongeTournamentResponse['tournament']>> {
  const url = buildChallongeUrl(`tournaments/${encodeURIComponent(challongeId)}.json`, apiKey, {
    include_participants: '1',
    include_matches: '1',
    include_groups: '1',
  });
  const response = await challongeFetch(url);
  const payload = (await response.json()) as ChallongeTournamentResponse;
  const tournament = payload.tournament;
  if (!tournament) {
    throw new ChallongeError('Challonge returned an empty tournament response.');
  }
  return tournament;
}

function inferGroupStageEnabled(
  tournament: NonNullable<ChallongeTournamentResponse['tournament']>,
): boolean {
  if (tournament.group_stage_enabled) return true;
  if (tournament.state === 'group_stages_underway') return true;

  return (tournament.matches ?? []).some((entry) => entry.match?.group_id != null);
}

function buildTournamentSummary(
  tournament: NonNullable<ChallongeTournamentResponse['tournament']>,
): ChallongeTournamentSummary {
  return {
    name: tournament.name ?? tournament.url ?? 'unknown',
    state: tournament.state ?? 'unknown',
    tournamentType: tournament.tournament_type ?? 'single elimination',
    groupStageEnabled: inferGroupStageEnabled(tournament),
  };
}

export async function fetchChallongeTournamentSummary(
  challongeId: string,
  apiKey: string,
): Promise<ChallongeTournamentSummary> {
  const tournament = await fetchChallongeTournamentPayload(challongeId, apiKey);
  return buildTournamentSummary(tournament);
}
export async function verifyChallongeCredentials(
  challongeId: string,
  apiKey: string,
): Promise<{ name: string }> {
  const summary = await fetchChallongeTournamentSummary(challongeId, apiKey);
  return { name: summary.name };
}

export async function fetchChallongeMatches(
  challongeId: string,
  apiKey: string,
): Promise<ChallongeMatchData[]> {
  const tournament = await fetchChallongeTournamentPayload(challongeId, apiKey);

  const participants = tournament.participants ?? [];
  const participantMap = new Map<number, ChallongeParticipant>();
  for (const entry of participants) {
    const participant = entry.participant;
    if (participant?.id != null) {
      participantMap.set(participant.id, participant);
    }
  }

  const groupPlayerMap = buildGroupPlayerMap(participants);
  const groupNamesFromApi = buildGroupNamesMap(tournament.groups ?? []);
  const groupNames =
    groupNamesFromApi.size > 0 ? groupNamesFromApi : buildGroupNamesFromParticipants(participants);

  const context: ChallongeTournamentContext = {
    tournamentType: tournament.tournament_type ?? 'single elimination',
    groupStageEnabled: inferGroupStageEnabled(tournament),
    groupNames,
  };

  const embeddedMatches = (tournament.matches ?? [])
    .map((entry) => mapMatchEntry(entry, context, participantMap, groupPlayerMap))
    .filter((match): match is ChallongeMatchData => match != null);

  if (embeddedMatches.length > 0) {
    return embeddedMatches.sort(
      (a, b) => (a.suggestedPlayOrder ?? Number.MAX_SAFE_INTEGER) - (b.suggestedPlayOrder ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const matchesUrl = buildChallongeUrl(
    `tournaments/${encodeURIComponent(challongeId)}/matches.json`,
    apiKey,
    { include_participants: '1' },
  );
  const matchesResponse = await challongeFetch(matchesUrl);
  const matchesPayload = (await matchesResponse.json()) as ChallongeListResponse<ChallongeMatchEntry>;

  return (matchesPayload.matches ?? [])
    .map((entry) => mapMatchEntry(entry, context, participantMap, groupPlayerMap))
    .filter((match): match is ChallongeMatchData => match != null)
    .sort(
      (a, b) => (a.suggestedPlayOrder ?? Number.MAX_SAFE_INTEGER) - (b.suggestedPlayOrder ?? Number.MAX_SAFE_INTEGER),
    );
}

export async function reportMatchScore(params: {
  challongeId: string;
  apiKey: string;
  challongeMatchId: string;
  score1: number;
  score2: number;
  winnerSide: 1 | 2;
  player1Id: number | null;
  player2Id: number | null;
}): Promise<void> {
  const winnerId =
    params.winnerSide === 1 ? params.player1Id : params.player2Id;

  if (!winnerId) {
    throw new ChallongeError('Cannot report score: match participant IDs are missing from Challonge.');
  }

  const url = buildChallongeUrl(
    `tournaments/${encodeURIComponent(params.challongeId)}/matches/${encodeURIComponent(params.challongeMatchId)}.json`,
    params.apiKey,
  );

  const body = new URLSearchParams();
  body.set('match[scores_csv]', `${params.score1}-${params.score2}`);
  body.set('match[winner_id]', String(winnerId));

  await challongeFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}
