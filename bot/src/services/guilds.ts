import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SETTINGS_FIELD_KEYS,
  type GuildSettingsEdit,
  type GuildSettingsSetup,
} from '../schemas/guild-settings.js';
import { STAFF_FIELD_KEYS, type StaffConfigEdit, type StaffConfigSet } from '../schemas/staff-config.js';
import type { GuildRow } from '../types/guild.js';

const guildCache = new Map<string, GuildRow>();

export function invalidateGuildCache(guildId: string): void {
  guildCache.delete(guildId);
}

export function isSettingsConfigured(guild: GuildRow | null): boolean {
  if (!guild) return false;
  return SETTINGS_FIELD_KEYS.every((key) => guild[key] !== null && guild[key] !== undefined);
}

export function isStaffConfigured(guild: GuildRow | null): boolean {
  if (!guild) return false;
  return STAFF_FIELD_KEYS.every((key) => guild[key] !== null && guild[key] !== undefined);
}

export async function getGuildConfig(
  supabase: SupabaseClient,
  guildId: string,
): Promise<GuildRow | null> {
  const cached = guildCache.get(guildId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('guilds')
    .select('*')
    .eq('id', guildId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load guild configuration: ${error.message}`);
  }

  if (data) {
    guildCache.set(guildId, data as GuildRow);
  }

  return (data as GuildRow | null) ?? null;
}

async function ensureGuildRow(supabase: SupabaseClient, guildId: string): Promise<void> {
  const existing = await getGuildConfig(supabase, guildId);
  if (existing) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from('guilds').insert({
    id: guildId,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    throw new Error(`Failed to create guild row: ${error.message}`);
  }

  invalidateGuildCache(guildId);
}

async function updateGuild(
  supabase: SupabaseClient,
  guildId: string,
  patch: Record<string, string>,
): Promise<GuildRow> {
  const { data, error } = await supabase
    .from('guilds')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', guildId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update guild configuration: ${error?.message ?? 'unknown error'}`);
  }

  const row = data as GuildRow;
  guildCache.set(guildId, row);
  return row;
}

export async function upsertGuildSettings(
  supabase: SupabaseClient,
  guildId: string,
  settings: GuildSettingsSetup,
): Promise<GuildRow> {
  await ensureGuildRow(supabase, guildId);
  return updateGuild(supabase, guildId, settings);
}

export async function patchGuildSettings(
  supabase: SupabaseClient,
  guildId: string,
  settings: GuildSettingsEdit,
): Promise<GuildRow> {
  const patch = Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;

  return updateGuild(supabase, guildId, patch);
}

export async function upsertStaffConfig(
  supabase: SupabaseClient,
  guildId: string,
  staff: StaffConfigSet,
): Promise<GuildRow> {
  await ensureGuildRow(supabase, guildId);
  return updateGuild(supabase, guildId, staff);
}

export async function patchStaffConfig(
  supabase: SupabaseClient,
  guildId: string,
  staff: StaffConfigEdit,
): Promise<GuildRow> {
  const patch = Object.fromEntries(
    Object.entries(staff).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;

  return updateGuild(supabase, guildId, patch);
}
