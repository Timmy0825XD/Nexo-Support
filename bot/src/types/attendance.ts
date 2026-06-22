export const ATTENDANCE_COLUMNS =
  'id, tournament_id, match_id, ticket_channel_id, judge_discord_id, recorder_discord_id, team1_score, team2_score, remark, recording_links, created_by_discord_user_id, ticket_message_id, attendance_channel_message_id, deleted_at, deleted_reason, created_at, updated_at' as const;

export const MAX_RECORDING_LINKS = 7;

export const ATTENDANCE_REMARK_DW = 'DW';

export interface AttendanceRow {
  id: string;
  tournament_id: string;
  match_id: string;
  ticket_channel_id: string;
  judge_discord_id: string;
  recorder_discord_id: string;
  team1_score: number;
  team2_score: number;
  remark: string | null;
  recording_links: string[];
  created_by_discord_user_id: string | null;
  ticket_message_id: string | null;
  attendance_channel_message_id: string | null;
  deleted_at: string | null;
  deleted_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceWithMatch extends AttendanceRow {
  match: {
    round: string;
    group: string;
    team1_name: string;
    team2_name: string;
  } | null;
}

export type StaffWorkCategory = 'judge' | 'recorder' | 'dual';

export interface StaffWorkEntry {
  userId: string;
  matches: number;
  rounds: number;
}

export interface StaffWorkStats {
  judges: StaffWorkEntry[];
  recorders: StaffWorkEntry[];
  dual: StaffWorkEntry[];
}

export interface LinkPaymentDiscount {
  userId: string;
  matchLabel: string;
  roundLabel: string;
  attendanceMarkedAt: string;
  kind: 'dual_downgrade' | 'recorder_withheld';
  linksSubmitted: number;
  games: number;
  expectedGold: number;
  appliedGold: number;
  discountGold: number;
}
