const SCHEDULE_PREFIX = '🔴';

export function stripSchedulePrefix(name: string): string {
  return name.replace(/^[✅🔴]+/u, '');
}

export function applyScheduledPrefix(name: string): string {
  const base = stripSchedulePrefix(name);
  return `${SCHEDULE_PREFIX}${base}`.slice(0, 100);
}

export function removeScheduledPrefix(name: string): string {
  return stripSchedulePrefix(name).slice(0, 100);
}
