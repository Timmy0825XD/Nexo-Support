import { z } from 'zod';

const snowflake = z.string().min(1);
const nonEmptyString = z.string().trim().min(1);

export const tournamentAddSchema = z.object({
  name: nonEmptyString,
  challonge_id: nonEmptyString,
  challonge_key: nonEmptyString,
  sheet_link: z.string().url(),
  admin_role_id: snowflake,
  helper_role_id: snowflake,
  attendance_channel_id: snowflake,
  transcript_channel_id: snowflake,
  rules_channel_id: snowflake,
  deadline_channel_id: snowflake,
  result_channel_id: snowflake,
  closed_ticket_category_id: snowflake,
  ticket_open_category_1_id: snowflake,
  ticket_open_category_2_id: snowflake,
  auto_room_enabled: z.boolean(),
  close_ticket_category_2_id: snowflake.optional(),
  ticket_open_category_3_id: snowflake.optional(),
  ticket_open_category_4_id: snowflake.optional(),
});

export type TournamentAdd = z.infer<typeof tournamentAddSchema>;

export const tournamentEditSchema = z
  .object({
    name: nonEmptyString.optional(),
    challonge_key: nonEmptyString.optional(),
    sheet_link: z.string().url().optional(),
    admin_role_id: snowflake.optional(),
    helper_role_id: snowflake.optional(),
    attendance_channel_id: snowflake.optional(),
    transcript_channel_id: snowflake.optional(),
    rules_channel_id: snowflake.optional(),
    deadline_channel_id: snowflake.optional(),
    result_channel_id: snowflake.optional(),
    closed_ticket_category_id: snowflake.optional(),
    close_ticket_category_2_id: snowflake.optional(),
    ticket_open_category_1_id: snowflake.optional(),
    ticket_open_category_2_id: snowflake.optional(),
    ticket_open_category_3_id: snowflake.optional(),
    ticket_open_category_4_id: snowflake.optional(),
    auto_room_enabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one tournament field must be provided.',
  });

export type TournamentEdit = z.infer<typeof tournamentEditSchema>;

export const TOURNAMENT_EDIT_FIELD_KEYS = [
  'name',
  'sheet_link',
  'admin_role_id',
  'helper_role_id',
  'attendance_channel_id',
  'transcript_channel_id',
  'rules_channel_id',
  'deadline_channel_id',
  'result_channel_id',
  'closed_ticket_category_id',
  'close_ticket_category_2_id',
  'ticket_open_category_1_id',
  'ticket_open_category_2_id',
  'ticket_open_category_3_id',
  'ticket_open_category_4_id',
  'auto_room_enabled',
] as const;

export type TournamentEditFieldKey = (typeof TOURNAMENT_EDIT_FIELD_KEYS)[number];

export type TournamentEditPatch = TournamentEdit & {
  challonge_key_encrypted?: string;
};
