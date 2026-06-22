export const SCHEDULE_STAFF_ROLES = ['judge', 'recorder'] as const;

export type ScheduleStaffRole = (typeof SCHEDULE_STAFF_ROLES)[number];

export interface ScheduleRow {
  id: string;
  tournament_id: string;
  match_id: string;
  ticket_channel_id: string;
  scheduled_at: string;
  schedules_message_id: string | null;
  ticket_message_id: string | null;
  thumbnail_url: string | null;
  remark: string | null;
  created_by_discord_user_id: string | null;
  reminder_message_id: string | null;
  reminder_sent_at: string | null;
  urgent_message_id: string | null;
  urgent_sent_at: string | null;
  assignment_buttons_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAssignmentRow {
  id: string;
  schedule_id: string;
  role: ScheduleStaffRole;
  discord_user_id: string;
  resigned_at: string | null;
  resign_reason: string | null;
  attendance_confirmed_at: string | null;
  created_at: string;
}

export interface ScheduleWithDetails extends ScheduleRow {
  match: {
    team1_name: string;
    team2_name: string;
    challonge_match_id: string;
    round: string;
  };
  tournament: {
    name: string;
  };
  staff_assignments: StaffAssignmentRow[];
}

export const SCHEDULE_COLUMNS =
  'id, tournament_id, match_id, ticket_channel_id, scheduled_at, schedules_message_id, ticket_message_id, thumbnail_url, remark, created_by_discord_user_id, reminder_message_id, reminder_sent_at, urgent_message_id, urgent_sent_at, assignment_buttons_expires_at, created_at, updated_at';

export const STAFF_ASSIGNMENT_COLUMNS =
  'id, schedule_id, role, discord_user_id, resigned_at, resign_reason, attendance_confirmed_at, created_at';

export type UnassignedFilter = 'all' | 'missing_judge' | 'missing_recorder' | 'any';

export type ResignRoleChoice = 'judge' | 'recorder' | 'both';
