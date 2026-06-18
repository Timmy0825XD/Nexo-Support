import type { AutocompleteInteraction } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMatches, searchMatches } from '../services/matches.js';

function formatMatchLabel(
  team1: string,
  team2: string,
  round: string,
  group: string,
): string {
  return `${team1} vs ${team2} (${group}, R${round})`.slice(0, 100);
}

export async function autocompleteMatches(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
  options?: { openOnly?: boolean; includeCompleted?: boolean },
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'match') {
    await interaction.respond([]);
    return;
  }

  const tournamentId = interaction.options.getString('tournament');
  if (!tournamentId) {
    await interaction.respond([]);
    return;
  }

  const query = String(focused.value);
  const matches = query.trim()
    ? await searchMatches(supabase, tournamentId, query)
    : await listMatches(supabase, tournamentId);

  const filtered = matches.filter((match) => {
    if (options?.includeCompleted) return true;
    if (options?.openOnly && match.status === 'completed') return false;
    return true;
  });

  await interaction.respond(
    filtered.slice(0, 25).map((match) => ({
      name: formatMatchLabel(match.team1_name, match.team2_name, match.round, match.group),
      value: match.id.slice(0, 100),
    })),
  );
}
