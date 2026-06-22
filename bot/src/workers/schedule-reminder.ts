import type { Client } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runScheduleReminderWorkerTick } from '../services/schedule-reminders.js';

const SCHEDULE_REMINDER_INTERVAL_MS = 60_000;

export function startScheduleReminderWorker(client: Client, supabase: SupabaseClient): void {
  const tick = () => {
    void runScheduleReminderWorkerTick(client, supabase).catch((error) => {
      console.error('[schedule-reminder] Worker tick failed:', error);
    });
  };

  tick();
  setInterval(tick, SCHEDULE_REMINDER_INTERVAL_MS);
}
