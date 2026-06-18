import type { Client, Guild } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GuildRow } from '../types/guild.js';
import type { TournamentRow } from '../types/tournament.js';
import {
  fetchChallongeTournamentSummary,
  getChallongeCredentials,
} from './challonge.js';
import { getGuildConfig } from './guilds.js';
import { type CreateRoomsResult, runAutoRoomCreation } from './match-rooms.js';
import {
  listOpenMatchesWithoutRooms,
  syncMatchesFromChallonge,
} from './matches.js';
import { listTournamentRows } from './tournaments.js';
import { isMatchEligibleForAutoRoom } from '../utils/auto-room-stage.js';

export const AUTO_ROOM_MAX_PER_TICK = 3;
export const AUTO_ROOM_MAX_MANUAL_RUN = 25;

export async function processTournamentAutoRooms(params: {
  guild: Guild;
  supabase: SupabaseClient;
  tournament: TournamentRow;
  guildConfig: GuildRow | null;
  maxRooms?: number;
}): Promise<CreateRoomsResult | null> {
  const { challongeId, apiKey } = getChallongeCredentials(params.tournament);
  const summary = await fetchChallongeTournamentSummary(challongeId, apiKey);

  await syncMatchesFromChallonge(params.supabase, params.tournament);
  const openMatches = await listOpenMatchesWithoutRooms(params.supabase, params.tournament.id);
  const available = openMatches.filter((match) => isMatchEligibleForAutoRoom(match.group, summary));

  if (available.length === 0) {
    return null;
  }

  return runAutoRoomCreation({
    guild: params.guild,
    supabase: params.supabase,
    tournament: params.tournament,
    guildConfig: params.guildConfig,
    matches: available,
    maxRooms: params.maxRooms ?? AUTO_ROOM_MAX_PER_TICK,
  });
}

export async function runAutoRoomWorkerTick(
  client: Client,
  supabase: SupabaseClient,
): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const guildConfig = await getGuildConfig(supabase, guild.id);
    const tournaments = await listTournamentRows(supabase, guild.id);
    const enabledTournaments = tournaments.filter((tournament) => tournament.auto_room_enabled);

    for (const tournament of enabledTournaments) {
      try {
        await processTournamentAutoRooms({
          guild,
          supabase,
          tournament,
          guildConfig,
        });
      } catch (error) {
        console.error(
          `[auto-room] Failed for tournament ${tournament.id} in guild ${guild.id}:`,
          error,
        );
      }
    }
  }
}
