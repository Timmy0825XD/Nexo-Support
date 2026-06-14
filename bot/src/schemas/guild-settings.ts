import { z } from 'zod';

const snowflake = z.string().min(1);

export const guildSettingsSetupSchema = z.object({
  admin_role_id: snowflake,
  challonge_logs_channel_id: snowflake,
  transcript_logs_channel_id: snowflake,
  bot_logs_channel_id: snowflake,
  thumbnail_channel_id: snowflake,
});

export const guildSettingsEditSchema = z
  .object({
    admin_role_id: snowflake.optional(),
    challonge_logs_channel_id: snowflake.optional(),
    transcript_logs_channel_id: snowflake.optional(),
    bot_logs_channel_id: snowflake.optional(),
    thumbnail_channel_id: snowflake.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one setting must be provided.',
  });

export type GuildSettingsSetup = z.infer<typeof guildSettingsSetupSchema>;
export type GuildSettingsEdit = z.infer<typeof guildSettingsEditSchema>;

export const SETTINGS_FIELD_KEYS = [
  'admin_role_id',
  'challonge_logs_channel_id',
  'transcript_logs_channel_id',
  'bot_logs_channel_id',
  'thumbnail_channel_id',
] as const;

export type SettingsFieldKey = (typeof SETTINGS_FIELD_KEYS)[number];
