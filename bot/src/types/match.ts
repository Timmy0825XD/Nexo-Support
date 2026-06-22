export type MatchStatus = 'pending' | 'open' | 'completed';

export interface MatchRow {
  id: string;
  tournament_id: string;
  challonge_match_id: string;
  round: string;
  group: string;
  team1_name: string;
  team2_name: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_side: number | null;
  status: MatchStatus;
  ticket_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MatchListRow = Pick<
  MatchRow,
  | 'id'
  | 'tournament_id'
  | 'challonge_match_id'
  | 'round'
  | 'group'
  | 'team1_name'
  | 'team2_name'
  | 'team1_score'
  | 'team2_score'
  | 'winner_side'
  | 'status'
  | 'ticket_channel_id'
>;

export const MATCH_FULL_COLUMNS = '*';

export const MATCH_LIST_COLUMNS =
  'id, tournament_id, challonge_match_id, round, group, team1_name, team2_name, team1_score, team2_score, winner_side, status, ticket_channel_id';

/** Fields needed for schedule create — excludes post-score data (scores, winner, status). */
export type MatchScheduleRow = Pick<
  MatchRow,
  | 'id'
  | 'tournament_id'
  | 'challonge_match_id'
  | 'round'
  | 'group'
  | 'team1_name'
  | 'team2_name'
  | 'ticket_channel_id'
>;

export const MATCH_SCHEDULE_COLUMNS =
  'id, tournament_id, challonge_match_id, round, group, team1_name, team2_name, ticket_channel_id';
