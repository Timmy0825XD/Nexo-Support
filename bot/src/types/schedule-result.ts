export interface ScheduleResultRow {
  id: string;
  schedule_id: string;
  tournament_id: string;
  match_id: string;
  team1_score: number;
  team2_score: number;
  winner_side: 1 | 2;
  notes: string | null;
  proof_image_urls: string[];
  results_message_id: string;
  ticket_message_id: string | null;
  result_channel_id: string;
  declared_by_discord_user_id: string;
  declared_at: string;
  created_at: string;
  updated_at: string;
}

export const SCHEDULE_RESULT_COLUMNS =
  'id, schedule_id, tournament_id, match_id, team1_score, team2_score, winner_side, notes, proof_image_urls, results_message_id, ticket_message_id, result_channel_id, declared_by_discord_user_id, declared_at, created_at, updated_at';
