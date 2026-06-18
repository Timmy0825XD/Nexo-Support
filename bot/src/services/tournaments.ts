import type { SupabaseClient } from '@supabase/supabase-js';
import type { TournamentAdd, TournamentEdit } from '../schemas/tournament.js';
import type { TournamentListRow, TournamentRow } from '../types/tournament.js';
import {
  MAX_TOURNAMENTS_PER_GUILD,
  TOURNAMENT_FULL_COLUMNS,
  TOURNAMENT_LIST_COLUMNS,
} from '../types/tournament.js';
import { extractSpreadsheetId } from './sheets.js';

export class TournamentLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentLimitError';
  }
}

export class TournamentActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentActiveError';
  }
}

export class TournamentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentConflictError';
  }
}

export type { TournamentListRow, TournamentRow };

function normalizeTournamentName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeChallongeId(challongeId: string): string {
  return challongeId.trim().toLowerCase();
}

function normalizeSheetLink(sheetLink: string): string {
  return extractSpreadsheetId(sheetLink);
}

export async function assertTournamentUnique(
  supabase: SupabaseClient,
  guildId: string,
  input: {
    name: string;
    challonge_id: string;
    sheet_link: string;
  },
  excludeTournamentId?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, challonge_id, sheet_link')
    .eq('guild_id', guildId);

  if (error) {
    throw new Error(`Failed to validate tournament uniqueness: ${error.message}`);
  }

  const normalizedName = normalizeTournamentName(input.name);
  const normalizedChallongeId = normalizeChallongeId(input.challonge_id);
  const normalizedSheetId = normalizeSheetLink(input.sheet_link);

  for (const row of data ?? []) {
    const existing = row as Pick<TournamentRow, 'id' | 'name' | 'challonge_id' | 'sheet_link'>;
    if (excludeTournamentId && existing.id === excludeTournamentId) continue;

    if (normalizeTournamentName(existing.name) === normalizedName) {
      throw new TournamentConflictError(
        `A tournament named **${existing.name}** is already registered in this server.`,
      );
    }

    if (normalizeChallongeId(existing.challonge_id) === normalizedChallongeId) {
      throw new TournamentConflictError(
        `Challonge bracket **${existing.challonge_id}** is already linked to **${existing.name}**.`,
      );
    }

    if (normalizeSheetLink(existing.sheet_link) === normalizedSheetId) {
      throw new TournamentConflictError(
        `That Google Sheet is already linked to **${existing.name}**.`,
      );
    }
  }
}

function mapRow(row: TournamentRow): TournamentRow {
  return {
    ...row,
    auto_room_enabled: Boolean(row.auto_room_enabled),
  };
}

export async function countTournamentsByGuild(
  supabase: SupabaseClient,
  guildId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('tournaments')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId);

  if (error) {
    throw new Error(`Failed to count tournaments: ${error.message}`);
  }

  return count ?? 0;
}

export async function listTournaments(
  supabase: SupabaseClient,
  guildId: string,
): Promise<TournamentListRow[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_LIST_COLUMNS)
    .eq('guild_id', guildId)
    .order('name');

  if (error) {
    throw new Error(`Failed to load tournaments: ${error.message}`);
  }

  return ((data as TournamentListRow[]) ?? []).map((row) => ({
    ...row,
    auto_room_enabled: Boolean(row.auto_room_enabled),
  }));
}

export async function listTournamentRows(
  supabase: SupabaseClient,
  guildId: string,
): Promise<TournamentRow[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_FULL_COLUMNS)
    .eq('guild_id', guildId)
    .order('name');

  if (error) {
    throw new Error(`Failed to load tournaments: ${error.message}`);
  }

  return ((data as TournamentRow[]) ?? []).map(mapRow);
}

export async function getTournamentById(
  supabase: SupabaseClient,
  guildId: string,
  tournamentId: string,
): Promise<TournamentRow | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_FULL_COLUMNS)
    .eq('guild_id', guildId)
    .eq('id', tournamentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load tournament: ${error.message}`);
  }

  return data ? mapRow(data as TournamentRow) : null;
}

export async function getTournamentByName(
  supabase: SupabaseClient,
  guildId: string,
  name: string,
): Promise<TournamentListRow | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_LIST_COLUMNS)
    .eq('guild_id', guildId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load tournament: ${error.message}`);
  }

  if (!data) return null;

  return {
    ...(data as TournamentListRow),
    auto_room_enabled: Boolean((data as TournamentListRow).auto_room_enabled),
  };
}

export async function searchTournaments(
  supabase: SupabaseClient,
  guildId: string,
  query: string,
  limit = 25,
): Promise<TournamentListRow[]> {
  const tournaments = await listTournaments(supabase, guildId);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? tournaments.filter(
        (t) =>
          t.name.toLowerCase().includes(normalized) ||
          t.id.toLowerCase().includes(normalized),
      )
    : tournaments;
  return filtered.slice(0, limit);
}

export async function hasActiveMatches(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<boolean> {
  const { count: roomCount, error: roomError } = await supabase
    .from('match_rooms')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (roomError) {
    throw new Error(`Failed to check match rooms: ${roomError.message}`);
  }

  if ((roomCount ?? 0) > 0) {
    return true;
  }

  const { count: matchCount, error: matchError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .in('status', ['pending', 'open']);

  if (matchError) {
    throw new Error(`Failed to check active matches: ${matchError.message}`);
  }

  return (matchCount ?? 0) > 0;
}

export async function createTournament(
  supabase: SupabaseClient,
  guildId: string,
  input: TournamentAdd & { challonge_key_encrypted: string },
): Promise<TournamentRow> {
  const count = await countTournamentsByGuild(supabase, guildId);
  if (count >= MAX_TOURNAMENTS_PER_GUILD) {
    throw new TournamentLimitError(
      `This server already has the maximum of ${MAX_TOURNAMENTS_PER_GUILD} tournaments configured.`,
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      id: crypto.randomUUID(),
      guild_id: guildId,
      name: input.name,
      challonge_id: input.challonge_id,
      challonge_key_encrypted: input.challonge_key_encrypted,
      sheet_link: input.sheet_link,
      admin_role_id: input.admin_role_id,
      helper_role_id: input.helper_role_id,
      attendance_channel_id: input.attendance_channel_id,
      transcript_channel_id: input.transcript_channel_id,
      rules_channel_id: input.rules_channel_id,
      deadline_channel_id: input.deadline_channel_id,
      result_channel_id: input.result_channel_id ?? null,
      closed_ticket_category_id: input.closed_ticket_category_id,
      close_ticket_category_2_id: input.close_ticket_category_2_id ?? null,
      ticket_open_category_1_id: input.ticket_open_category_1_id,
      ticket_open_category_2_id: input.ticket_open_category_2_id,
      ticket_open_category_3_id: input.ticket_open_category_3_id ?? null,
      ticket_open_category_4_id: input.ticket_open_category_4_id ?? null,
      auto_room_enabled: false,
      created_at: now,
      updated_at: now,
    })
    .select(TOURNAMENT_FULL_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create tournament: ${error?.message ?? 'unknown error'}`);
  }

  return mapRow(data as TournamentRow);
}

export async function patchTournament(
  supabase: SupabaseClient,
  guildId: string,
  tournamentId: string,
  patch: TournamentEdit & { challonge_key_encrypted?: string },
): Promise<TournamentRow> {
  const updatePayload = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;

  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('tournaments')
    .update(updatePayload)
    .eq('guild_id', guildId)
    .eq('id', tournamentId)
    .select(TOURNAMENT_FULL_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update tournament: ${error?.message ?? 'unknown error'}`);
  }

  return mapRow(data as TournamentRow);
}

export async function deleteTournament(
  supabase: SupabaseClient,
  guildId: string,
  tournamentId: string,
): Promise<TournamentRow> {
  const existing = await getTournamentById(supabase, guildId, tournamentId);
  if (!existing) {
    throw new Error('Tournament not found.');
  }

  if (await hasActiveMatches(supabase, tournamentId)) {
    throw new TournamentActiveError(
      'Cannot delete this tournament while active match rooms or open matches exist.',
    );
  }

  const { error } = await supabase
    .from('tournaments')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', tournamentId);

  if (error) {
    throw new Error(`Failed to delete tournament: ${error.message}`);
  }

  return existing;
}
