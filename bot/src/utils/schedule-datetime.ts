/** Parse schedule instants as UTC regardless of Postgres/Supabase string format. */
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
