import type { AutocompleteInteraction } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchAttendedMatchesForAutocomplete } from '../services/attendance.js';
import { resolveTournamentAutocompleteMode } from './tournaments.js';
import { getTournamentByName, searchTournaments } from '../services/tournaments.js';

export async function autocompleteAttendedMatches(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
): Promise<void> {
  const tournamentName = interaction.options.getString('tournament');
  if (!tournamentName) {
    await interaction.respond([]);
    return;
  }

  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const tournament = await getTournamentByName(supabase, interaction.guildId, tournamentName);
  if (!tournament) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  const matches = await searchAttendedMatchesForAutocomplete(
    supabase,
    tournament.id,
    focused.value,
  );

  await interaction.respond(
    matches.map((match) => ({
      name: match.label,
      value: match.label,
    })),
  );
}

export async function autocompleteAttendanceTournaments(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const mode = resolveTournamentAutocompleteMode(interaction);
  const focused = interaction.options.getFocused(true);
  const tournaments = await searchTournaments(
    supabase,
    interaction.guildId,
    focused.value,
  );

  await interaction.respond(
    tournaments.map((tournament) => ({
      name: tournament.name.slice(0, 100),
      value: mode === 'name' ? tournament.name.slice(0, 100) : tournament.id.slice(0, 100),
    })),
  );
}
