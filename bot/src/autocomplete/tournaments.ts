import type { AutocompleteInteraction } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchTournaments } from '../services/tournaments.js';

export type TournamentAutocompleteMode = 'name' | 'id';

export function resolveTournamentAutocompleteMode(
  interaction: AutocompleteInteraction,
): TournamentAutocompleteMode {
  const focused = interaction.options.getFocused(true);

  if (interaction.commandName === 'staff') {
    return 'name';
  }

  if (
    interaction.commandName === 'get' ||
    interaction.commandName === 'link' ||
    interaction.commandName === 'work_done'
  ) {
    return 'name';
  }

  if (focused.name === 'id') {
    return 'id';
  }

  if (interaction.commandName === 'tournament') {
    return 'id';
  }

  if (
    interaction.commandName === 'room' ||
    interaction.commandName === 'auto_room' ||
    interaction.commandName === 'correct_bracket' ||
    interaction.commandName === 'schedule' ||
    interaction.commandName === 'team' ||
    interaction.commandName === 'upload_score'
  ) {
    return 'id';
  }

  return 'name';
}

export async function autocompleteTournaments(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'tournament' && focused.name !== 'id') {
    await interaction.respond([]);
    return;
  }

  const mode = resolveTournamentAutocompleteMode(interaction);
  const tournaments = await searchTournaments(
    supabase,
    interaction.guildId,
    String(focused.value),
  );

  await interaction.respond(
    tournaments.map((tournament) => {
      if (mode === 'name') {
        return {
          name: tournament.name.slice(0, 100),
          value: tournament.name.slice(0, 100),
        };
      }

      return {
        name: tournament.name.slice(0, 100),
        value: tournament.id.slice(0, 100),
      };
    }),
  );
}
