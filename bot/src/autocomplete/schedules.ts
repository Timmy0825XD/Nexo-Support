import type { AutocompleteInteraction } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMatches, searchMatches } from '../services/matches.js';
import { searchSchedulesForAutocomplete } from '../services/schedules.js';
import { formatScheduleUtcLine } from '../utils/schedule-display.js';
import { formatMatchupTitle } from '../utils/match-formatting.js';

export async function autocompleteSchedules(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'schedule') {
    await interaction.respond([]);
    return;
  }

  const query = focused.value.toString();
  const schedules = await searchSchedulesForAutocomplete(
    supabase,
    interaction.guildId,
    query,
  );

  await interaction.respond(
    schedules.map((schedule) => {
      const times = formatScheduleUtcLine(schedule.scheduled_at);
      const matchup = formatMatchupTitle(
        schedule.match.team1_name,
        schedule.match.team2_name,
      ).replace(/\*\*/g, '');
      return {
        name: `${matchup} | ${schedule.tournament.name} | ${times}`.slice(0, 100),
        value: schedule.id,
      };
    }),
  );
}

export async function autocompleteScheduledMatches(
  interaction: AutocompleteInteraction,
  supabase: SupabaseClient,
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

  const { data: schedules, error } = await supabase
    .from('schedules')
    .select('match_id, scheduled_at')
    .eq('tournament_id', tournamentId);

  if (error || !schedules?.length) {
    await interaction.respond([]);
    return;
  }

  const scheduleByMatchId = new Map(
    schedules.map((row) => {
      const schedule = row as { match_id: string; scheduled_at: string };
      return [schedule.match_id, schedule.scheduled_at] as const;
    }),
  );

  const query = String(focused.value);
  const matches = query.trim()
    ? await searchMatches(supabase, tournamentId, query)
    : await listMatches(supabase, tournamentId);

  await interaction.respond(
    matches
      .filter((match) => scheduleByMatchId.has(match.id))
      .slice(0, 25)
      .map((match) => {
        const matchup = formatMatchupTitle(match.team1_name, match.team2_name).replace(/\*\*/g, '');
        const scheduledAt = scheduleByMatchId.get(match.id)!;
        const times = formatScheduleUtcLine(scheduledAt);
        return {
          name: `${matchup} | ${times}`.slice(0, 100),
          value: match.id.slice(0, 100),
        };
      }),
  );
}
