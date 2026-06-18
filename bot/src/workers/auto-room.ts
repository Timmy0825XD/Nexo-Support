import type { Client } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAutoRoomWorkerTick } from '../services/auto-room.js';

const AUTO_ROOM_INTERVAL_MS = 60_000;

export function startAutoRoomWorker(client: Client, supabase: SupabaseClient): void {
  const tick = () => {
    void runAutoRoomWorkerTick(client, supabase).catch((error) => {
      console.error('[auto-room] Worker tick failed:', error);
    });
  };

  tick();
  setInterval(tick, AUTO_ROOM_INTERVAL_MS);
}
