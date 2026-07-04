import { z } from 'zod';
import { BAN_DURATION_VALUES } from '../utils/parse-ban-duration.js';

const discordSnowflake = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/, 'Discord user ID must be 17–20 digits.');

export const userBanSchema = z.object({
  discord_id: discordSnowflake,
  time: z.enum(BAN_DURATION_VALUES, {
    errorMap: () => ({ message: 'Invalid ban duration selected.' }),
  }),
  reason: z.string().trim().max(400).optional().default(''),
});

export const userUnbanSchema = z.object({
  discord_id: discordSnowflake,
});

export type UserBanInput = z.infer<typeof userBanSchema>;
export type UserUnbanInput = z.infer<typeof userUnbanSchema>;
