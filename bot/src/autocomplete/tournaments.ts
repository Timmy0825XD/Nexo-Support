import type { AutocompleteInteraction } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchTournaments } from '../services/tournaments.js';

export async function autocompleteTournaments(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'tournament') {
    await interaction.respond([]);
    return;
  }

  const tournaments = await searchTournaments(
    supabase,
    interaction.guildId,
    String(focused.value),
  );

  await interaction.respond(
    tournaments.map((tournament) => ({
      name: tournament.name.slice(0, 100),
      value: tournament.name.slice(0, 100),
    })),
  );
}
