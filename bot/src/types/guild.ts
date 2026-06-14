export interface GuildRow {
  id: string;
  prefix: string;
  admin_role_id: string | null;
  challonge_mod_role_id: string | null;
  challonge_logs_channel_id: string | null;
  transcript_logs_channel_id: string | null;
  closed_category_id: string | null;
  schedule_channel_id: string | null;
  results_channel_id: string | null;
  bot_logs_channel_id: string | null;
  thumbnail_channel_id: string | null;
  staff_role_id: string | null;
  judge_role_id: string | null;
  recorder_role_id: string | null;
  t1_admin_role_id: string | null;
  t2_admin_role_id: string | null;
  best_staff_role_id: string | null;
  server_helper_role_id: string | null;
  manager_role_id: string | null;
  staff_chat_channel_id: string | null;
  staff_announcement_channel_id: string | null;
  staff_instructions_channel_id: string | null;
  staff_details_channel_id: string | null;
  event_rules_channel_id: string | null;
  created_at: string;
  updated_at: string;
}
