import {
  ChannelType,
  SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteGroups } from '../../autocomplete/groups.js';
import { autocompleteTournaments } from '../../autocomplete/tournaments.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { assertRoomAvailabilityPermission } from '../../guards/tournament-permissions.js';
import { MatchRoomError, createRoomsForMatches } from '../../services/match-rooms.js';
import { getGuildConfig } from '../../services/guilds.js';
import { logRoomsCreated } from '../../services/guild-logs.js';
import {
  getMatchIdsWithRooms,
  isMatchReadyForRoom,
  listMatches,
  listOpenMatchesWithoutRooms,
  normalizeGroupFilter,
  syncMatchesFromChallonge,
} from '../../services/matches.js';
import { getTournamentById } from '../../services/tournaments.js';
import { errorEmbed } from '../../utils/embeds.js';
import { buildRoomsCreatedEmbed } from '../../utils/match-display.js';
import { runAvailableRoomsPagination } from '../../utils/room-available-pagination.js';

export const roomCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('room')
    .setDescription('Tournament match room management')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Manually create tournament match rooms for open bracket matches')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament registered in the bot')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category where ticket rooms will be created')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Maximum number of rooms to create')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(25),
        )
        .addStringOption((option) =>
          option
            .setName('group')
            .setDescription('Optional: filter by bracket group, stage, or round')
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('available')
        .setDescription('Show open tournament matches available for room creation')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament registered in the bot')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('group')
            .setDescription('Optional: filter by bracket group, stage, or round')
            .setRequired(false)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction, { supabase }) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'group') {
      await autocompleteGroups(interaction, supabase);
      return;
    }

    await autocompleteTournaments(interaction, supabase);
  },

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    await interaction.deferReply();
    const guildConfig = await getGuildConfig(supabase, interaction.guild.id);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'available') {
        assertRoomAvailabilityPermission(interaction, guildConfig);
      } else {
        assertOrganiser(interaction, guildConfig);
      }
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    const tournamentId = interaction.options.getString('tournament', true);
    const group = interaction.options.getString('group');
    const tournament = await getTournamentById(supabase, interaction.guild.id, tournamentId);

    if (!tournament) {
      await interaction.editReply({
        embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
      });
      return;
    }

    try {
      await syncMatchesFromChallonge(supabase, tournament);
      const groupFilter = normalizeGroupFilter(group);
      const available = await listOpenMatchesWithoutRooms(supabase, tournament.id, groupFilter);

      if (subcommand === 'available') {
        const emptyState = available.length === 0
          ? await (async () => {
              const [allMatches, roomMatchIds] = await Promise.all([
                listMatches(supabase, tournament.id),
                getMatchIdsWithRooms(supabase, tournament.id),
              ]);
              const scopedMatches = allMatches.filter((match) => !groupFilter || match.group === groupFilter);
              const activeMatches = scopedMatches.filter((match) => match.status !== 'completed');
              return {
                existingRooms: activeMatches.filter(
                  (match) =>
                    isMatchReadyForRoom(match.team1_name, match.team2_name) &&
                    (Boolean(match.ticket_channel_id) || roomMatchIds.has(match.id)),
                ),
                pendingMatches: activeMatches.filter(
                  (match) => !isMatchReadyForRoom(match.team1_name, match.team2_name),
                ),
              };
            })()
          : undefined;

        await runAvailableRoomsPagination(
          interaction,
          tournament.name,
          available,
          groupFilter,
          emptyState,
        );
        return;
      }

      const limit = interaction.options.getInteger('limit', true);
      const category = interaction.options.getChannel('category', true);
      const result = await createRoomsForMatches({
        guild: interaction.guild,
        supabase,
        tournament,
        guildConfig,
        matches: available.slice(0, limit),
        categoryId: category.id,
      });

      await interaction.editReply({
        embeds: [buildRoomsCreatedEmbed(interaction.guild, result)],
      });

      if (guildConfig && result.created.length > 0) {
        void logRoomsCreated({
          client: interaction.client,
          guild: interaction.guild,
          config: guildConfig,
          triggeredBy: interaction.user,
          tournament,
          result,
        });
      }
    } catch (error) {
      const message =
        error instanceof MatchRoomError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to process room command.';
      await interaction.editReply({ embeds: [errorEmbed('Room Error', message)] });
    }
  },
};
