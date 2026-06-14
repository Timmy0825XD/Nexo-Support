import { z } from 'zod';

const snowflake = z.string().min(1);

export const staffConfigSetSchema = z.object({
  staff_role_id: snowflake,
  judge_role_id: snowflake,
  recorder_role_id: snowflake,
  t1_admin_role_id: snowflake,
  t2_admin_role_id: snowflake,
  best_staff_role_id: snowflake,
  server_helper_role_id: snowflake,
  manager_role_id: snowflake,
  challonge_mod_role_id: snowflake,
  schedule_channel_id: snowflake,
  staff_chat_channel_id: snowflake,
  staff_announcement_channel_id: snowflake,
  staff_instructions_channel_id: snowflake,
  staff_details_channel_id: snowflake,
  event_rules_channel_id: snowflake,
});

export type StaffConfigSet = z.infer<typeof staffConfigSetSchema>;

export const staffConfigEditSchema = z
  .object({
    staff_role_id: snowflake.optional(),
    judge_role_id: snowflake.optional(),
    recorder_role_id: snowflake.optional(),
    t1_admin_role_id: snowflake.optional(),
    t2_admin_role_id: snowflake.optional(),
    best_staff_role_id: snowflake.optional(),
    server_helper_role_id: snowflake.optional(),
    manager_role_id: snowflake.optional(),
    challonge_mod_role_id: snowflake.optional(),
    schedule_channel_id: snowflake.optional(),
    staff_chat_channel_id: snowflake.optional(),
    staff_announcement_channel_id: snowflake.optional(),
    staff_instructions_channel_id: snowflake.optional(),
    staff_details_channel_id: snowflake.optional(),
    event_rules_channel_id: snowflake.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one staff setting must be provided.',
  });

export type StaffConfigEdit = z.infer<typeof staffConfigEditSchema>;

export const STAFF_FIELD_KEYS = [
  'staff_role_id',
  'judge_role_id',
  'recorder_role_id',
  't1_admin_role_id',
  't2_admin_role_id',
  'best_staff_role_id',
  'server_helper_role_id',
  'manager_role_id',
  'challonge_mod_role_id',
  'schedule_channel_id',
  'staff_chat_channel_id',
  'staff_announcement_channel_id',
  'staff_instructions_channel_id',
  'staff_details_channel_id',
  'event_rules_channel_id',
] as const;

export type StaffFieldKey = (typeof STAFF_FIELD_KEYS)[number];
