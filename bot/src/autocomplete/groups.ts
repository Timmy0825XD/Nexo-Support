import type { AutocompleteInteraction } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_MATCH_GROUPS } from '../services/challonge.js';
import { listDistinctGroups, syncMatchesFromChallonge } from '../services/matches.js';
import { getTournamentById } from '../services/tournaments.js';

const ALL_MATCHES_OPTION = {
  name: 'All matches (no filter)',
  value: ALL_MATCH_GROUPS,
};

export async function autocompleteGroups(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'group') {
    await interaction.respond([]);
    return;
  }

  const tournamentId = interaction.options.getString('tournament');
  if (!tournamentId) {
    await interaction.respond([ALL_MATCHES_OPTION]);
    return;
  }

  const tournament = await getTournamentById(supabase, interaction.guildId, tournamentId);
  if (!tournament) {
    await interaction.respond([ALL_MATCHES_OPTION]);
    return;
  }

  let groups = await listDistinctGroups(supabase, tournament.id);
  if (groups.length === 0) {
    try {
      await syncMatchesFromChallonge(supabase, tournament);
      groups = await listDistinctGroups(supabase, tournament.id);
    } catch (error) {
      console.error('[autocomplete/groups] Failed to sync matches:', error);
    }
  }

  const query = String(focused.value).trim().toLowerCase();
  const filteredGroups = query
    ? groups.filter((group) => group.toLowerCase().includes(query))
    : groups;

  const options = [
    ALL_MATCHES_OPTION,
    ...filteredGroups.map((group) => ({
      name: group.slice(0, 100),
      value: group.slice(0, 100),
    })),
  ];

  await interaction.respond(options.slice(0, 25));
}
