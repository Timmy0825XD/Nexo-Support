import { PermissionFlagsBits, type Client } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteScheduledBanById,
  listExpiredScheduledBans,
} from '../services/scheduled-bans.js';

const BAN_EXPIRY_INTERVAL_MS = 60_000;

export function startBanExpiryWorker(client: Client, supabase: SupabaseClient): void {
  const tick = () => {
    void runBanExpiryWorkerTick(client, supabase).catch((error) => {
      console.error('[ban-expiry] Worker tick failed:', error);
    });
  };

  tick();
  setInterval(tick, BAN_EXPIRY_INTERVAL_MS);
}

async function runBanExpiryWorkerTick(
  client: Client,
  supabase: SupabaseClient,
): Promise<void> {
  const expired = await listExpiredScheduledBans(supabase);
  if (expired.length === 0) {
    return;
  }

  for (const row of expired) {
    const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
    if (!guild) {
      await deleteScheduledBanById(supabase, row.id);
      continue;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      console.warn(
        `[ban-expiry] Missing Ban Members permission in guild ${guild.id}; skipping ${row.user_id}`,
      );
      continue;
    }

    try {
      await guild.members.unban(row.user_id, 'Temporary ban expired');
      await deleteScheduledBanById(supabase, row.id);
      console.info(`[ban-expiry] Unbanned ${row.user_id} in guild ${guild.id}`);
    } catch (error) {
      console.error(
        `[ban-expiry] Failed to unban ${row.user_id} in guild ${guild.id}:`,
        error,
      );
    }
  }
}
