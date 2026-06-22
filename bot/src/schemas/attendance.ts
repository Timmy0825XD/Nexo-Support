import { z } from 'zod';
import { ATTENDANCE_REMARK_DW, MAX_RECORDING_LINKS } from '../types/attendance.js';
import { isValidYouTubeUrl, parseRecordingLinksInput } from '../utils/youtube-url.js';

function optionalRecordingLinksField() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (!value || value.length === 0) return undefined;
      return parseRecordingLinksInput(value);
    })
    .refine(
      (links) => links == null || links.every(isValidYouTubeUrl),
      'All recording links must be valid YouTube URLs.',
    )
    .refine(
      (links) => links == null || links.length <= MAX_RECORDING_LINKS,
      `A maximum of ${MAX_RECORDING_LINKS} recording links is allowed.`,
    );
}

export const attendanceMarkSchema = z.object({
  judge_discord_id: z.string().min(1),
  recorder_discord_id: z.string().min(1),
  team1_score: z.number().int().min(0),
  team2_score: z.number().int().min(0),
  remark: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  link: optionalRecordingLinksField(),
});

export const attendanceDeleteSchema = z.object({
  confirm: z.literal(true),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const linkAddSchema = z.object({
  link: z
    .string()
    .trim()
    .min(1, 'At least one recording link is required.')
    .transform((value) => parseRecordingLinksInput(value))
    .refine((links) => links.length > 0, 'At least one recording link is required.')
    .refine(
      (links) => links.every(isValidYouTubeUrl),
      'All recording links must be valid YouTube URLs.',
    ),
});

export function normalizeRemarkInput(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toUpperCase() === ATTENDANCE_REMARK_DW) return ATTENDANCE_REMARK_DW;
  return trimmed;
}
