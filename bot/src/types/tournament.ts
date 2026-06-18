export interface TournamentRow {
  id: string;
  guild_id: string;
  name: string;
  challonge_id: string;
  challonge_key_encrypted: string;
  sheet_link: string;
  admin_role_id: string;
  helper_role_id: string;
  attendance_channel_id: string;
  transcript_channel_id: string;
  rules_channel_id: string;
  deadline_channel_id: string;
  result_channel_id: string | null;
  closed_ticket_category_id: string;
  close_ticket_category_2_id: string | null;
  ticket_open_category_1_id: string;
  ticket_open_category_2_id: string;
  ticket_open_category_3_id: string | null;
  ticket_open_category_4_id: string | null;
  schedules_channel_id: string | null;
  auto_room_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type TournamentListRow = Pick<
  TournamentRow,
  'id' | 'guild_id' | 'name' | 'auto_room_enabled' | 'closed_ticket_category_id'
>;

export const MAX_TOURNAMENTS_PER_GUILD = 4;

export const TOURNAMENT_LIST_COLUMNS =
  'id, guild_id, name, auto_room_enabled, closed_ticket_category_id';

export const TOURNAMENT_FULL_COLUMNS = '*';
