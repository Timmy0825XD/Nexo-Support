import type { SupabaseClient } from '@supabase/supabase-js';

export interface TournamentRow {
  id: string;
  guild_id: string;
  name: string;
  closed_ticket_category_id: string;
}

export async function listTournaments(
  supabase: SupabaseClient,
  guildId: string,
): Promise<TournamentRow[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, guild_id, name, closed_ticket_category_id')
    .eq('guild_id', guildId)
    .order('name');

  if (error) {
    throw new Error(`Failed to load tournaments: ${error.message}`);
  }

  return (data as TournamentRow[]) ?? [];
}

export async function getTournamentByName(
  supabase: SupabaseClient,
  guildId: string,
  name: string,
): Promise<TournamentRow | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, guild_id, name, closed_ticket_category_id')
    .eq('guild_id', guildId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load tournament: ${error.message}`);
  }

  return (data as TournamentRow | null) ?? null;
}

export async function searchTournaments(
  supabase: SupabaseClient,
  guildId: string,
  query: string,
  limit = 25,
): Promise<TournamentRow[]> {
  const tournaments = await listTournaments(supabase, guildId);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? tournaments.filter((t) => t.name.toLowerCase().includes(normalized))
    : tournaments;
  return filtered.slice(0, limit);
}
