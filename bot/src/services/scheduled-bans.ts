import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduledBanRow } from '../types/scheduled-ban.js';

export async function upsertScheduledBan(
  supabase: SupabaseClient,
  params: {
    guildId: string;
    userId: string;
    expiresAt: Date;
    reason: string;
    bannedByDiscordId: string;
  },
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('scheduled_bans')
    .delete()
    .eq('guild_id', params.guildId)
    .eq('user_id', params.userId);

  if (deleteError) {
    throw new Error(`Failed to replace scheduled ban: ${deleteError.message}`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('scheduled_bans').insert({
    id: crypto.randomUUID(),
    guild_id: params.guildId,
    user_id: params.userId,
    expires_at: params.expiresAt.toISOString(),
    reason: params.reason,
    banned_by_discord_id: params.bannedByDiscordId,
    created_at: now,
  });

  if (error) {
    throw new Error(`Failed to store scheduled ban: ${error.message}`);
  }
}

export async function clearScheduledBan(
  supabase: SupabaseClient,
  guildId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('scheduled_bans')
    .delete()
    .eq('guild_id', guildId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to clear scheduled ban: ${error.message}`);
  }
}

export async function listExpiredScheduledBans(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<ScheduledBanRow[]> {
  const { data, error } = await supabase
    .from('scheduled_bans')
    .select('*')
    .lte('expires_at', now.toISOString())
    .order('expires_at', { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`Failed to load expired scheduled bans: ${error.message}`);
  }

  return (data as ScheduledBanRow[] | null) ?? [];
}

export async function deleteScheduledBanById(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('scheduled_bans').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete scheduled ban: ${error.message}`);
  }
}
