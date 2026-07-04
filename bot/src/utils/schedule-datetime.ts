/** Parse schedule instants as UTC regardless of Postgres/Supabase string format. */
export const MIN_SCHEDULE_CREATE_LEAD_MINUTES = 10;
export const MIN_SCHEDULE_CREATE_LEAD_MS = MIN_SCHEDULE_CREATE_LEAD_MINUTES * 60 * 1000;

export function parseScheduleUtcInstant(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return new Date(Number.NaN);
  }

  if (/[zZ]$|[+-]\d{2}(?::?\d{2})?$/.test(trimmed)) {
    const normalized = trimmed.includes(' ') && !trimmed.includes('T')
      ? trimmed.replace(' ', 'T')
      : trimmed;
    return new Date(normalized);
  }

  const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return new Date(`${isoLike}Z`);
}

export function scheduleUtcUnixSeconds(value: string | Date): number {
  return Math.floor(parseScheduleUtcInstant(value).getTime() / 1000);
}

export function hasMinimumScheduleLeadTime(
  scheduledAt: Date,
  now: Date = new Date(),
): boolean {
  return scheduledAt.getTime() >= now.getTime() + MIN_SCHEDULE_CREATE_LEAD_MS;
}

/** @deprecated Use hasMinimumScheduleLeadTime */
export const hasMinimumScheduleCreateLeadTime = hasMinimumScheduleLeadTime;
