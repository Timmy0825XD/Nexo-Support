import { z } from 'zod';
import { parseScheduleUtcInstant } from '../utils/schedule-datetime.js';

const snowflake = z.string().min(17).max(20);

export const scheduleCreateSchema = z
  .object({
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    day: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    judge_user_id: snowflake.optional(),
    recorder_user_id: snowflake.optional(),
    remark: z.string().trim().max(130).optional(),
  })
  .superRefine((value, ctx) => {
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute));
    if (
      date.getUTCFullYear() !== value.year ||
      date.getUTCMonth() !== value.month - 1 ||
      date.getUTCDate() !== value.day ||
      date.getUTCHours() !== value.hour ||
      date.getUTCMinutes() !== value.minute
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The provided date and time is not a valid UTC datetime.',
      });
    }
  });

export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;

export const scheduleDeleteSchema = z.object({
  confirm: z.boolean(),
  reason: z.string().trim().optional(),
});

export type ScheduleDeleteInput = z.infer<typeof scheduleDeleteSchema>;

export const unassignedFilterSchema = z.enum([
  'all',
  'missing_judge',
  'missing_recorder',
  'any',
]);

export type UnassignedFilterInput = z.infer<typeof unassignedFilterSchema>;

export const scheduleResignSchema = z.object({
  role: z.enum(['judge', 'recorder', 'both']).default('both'),
  reason: z.string().trim().optional(),
  regenerate_image: z.boolean().default(false),
});

export type ScheduleResignInput = z.infer<typeof scheduleResignSchema>;

export function scheduleCreateToDate(input: ScheduleCreateInput): Date {
  return new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute));
}

const scheduleDateTimeFields = {
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  day: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
} as const;

export const scheduleUpdateSchema = z
  .object({
    ...scheduleDateTimeFields,
    year: z.number().int().min(2025).max(2030).optional(),
    judge_user_id: snowflake.optional(),
    recorder_user_id: snowflake.optional(),
    note: z.string().trim().max(130).optional(),
    remove_judge: z.boolean().optional(),
    remove_recorder: z.boolean().optional(),
    reason: z.string().trim().optional(),
    regenerate_image: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const hasDateChange = [
      value.hour,
      value.minute,
      value.day,
      value.month,
      value.year,
    ].some((part) => part !== undefined);

    const wantsJudgeChange =
      value.judge_user_id !== undefined || value.remove_judge === true;
    const wantsRecorderChange =
      value.recorder_user_id !== undefined || value.remove_recorder === true;

    const hasUpdate =
      hasDateChange ||
      wantsJudgeChange ||
      wantsRecorderChange ||
      value.note !== undefined ||
      value.regenerate_image === true;

    if (!hasUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one field to update.',
      });
    }
  });

export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;

/** @deprecated Use scheduleUpdateSchema */
export const scheduleEditSchema = scheduleUpdateSchema;
/** @deprecated Use ScheduleUpdateInput */
export type ScheduleEditInput = ScheduleUpdateInput;

/** Merge partial date/time fields onto the current schedule instant (UTC). */
export function applyScheduleUpdateDateTime(
  input: ScheduleUpdateInput,
  currentScheduledAt: string | Date,
): Date | undefined {
  return applyScheduleEditDateTime(input, currentScheduledAt);
}

/** Merge partial date/time fields onto the current schedule instant (UTC). */
export function applyScheduleEditDateTime(
  input: Pick<
    ScheduleUpdateInput,
    'hour' | 'minute' | 'day' | 'month' | 'year'
  >,
  currentScheduledAt: string | Date,
): Date | undefined {
  const hasChange =
    input.hour !== undefined ||
    input.minute !== undefined ||
    input.day !== undefined ||
    input.month !== undefined ||
    input.year !== undefined;

  if (!hasChange) return undefined;

  const current = parseScheduleUtcInstant(currentScheduledAt);

  const year = input.year ?? current.getUTCFullYear();
  const month = input.month ?? current.getUTCMonth() + 1;
  const day = input.day ?? current.getUTCDate();
  const hour = input.hour ?? current.getUTCHours();
  const minute = input.minute ?? current.getUTCMinutes();

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    throw new Error('The provided date and time is not a valid UTC datetime.');
  }

  return date;
}

const scoreField = z.number().int().min(0).max(99);

export const scheduleResultsSchema = z.object({
  team_1_score: scoreField,
  team_2_score: scoreField,
  notes: z.string().trim().max(500).optional(),
});

export type ScheduleResultsInput = z.infer<typeof scheduleResultsSchema>;

export const scheduleResultsDeleteSchema = z.object({
  confirm: z.boolean(),
  reason: z.string().trim().optional(),
});

export type ScheduleResultsDeleteInput = z.infer<typeof scheduleResultsDeleteSchema>;

export const SCHEDULE_RESULT_IMAGE_OPTION_NAMES = [
  'image1',
  'image2',
  'image3',
  'image4',
  'image5',
  'image6',
  'image7',
  'image8',
  'image9',
  'image10',
] as const;

export type ScheduleResultImageOptionName = (typeof SCHEDULE_RESULT_IMAGE_OPTION_NAMES)[number];
