import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteTournaments } from '../../autocomplete/tournaments.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import { logAutoRoomToggled, logRoomsCreated } from '../../services/guild-logs.js';
import { MatchRoomError, type CreateRoomsResult } from '../../services/match-rooms.js';
import { AUTO_ROOM_MAX_MANUAL_RUN, processTournamentAutoRooms } from '../../services/auto-room.js';
import { fetchChallongeTournamentSummary, getChallongeCredentials } from '../../services/challonge.js';
import { isGroupStageStillActive, isTwoStageTournament } from '../../utils/auto-room-stage.js';
import {
  getTournamentById,
  patchTournament,
} from '../../services/tournaments.js';
import { errorEmbed } from '../../utils/embeds.js';
import {
  buildAutoRoomStatusEmbed,
  buildRoomsCreatedEmbed,
} from '../../utils/match-display.js';

export const autoRoomCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('auto_room')
    .setDescription('Automatic tournament room creation controls')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('run')
        .setDescription('Manually trigger automatic tournament room creation')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament registered in the bot')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('stop')
        .setDescription('Stop automatic room creation for a tournament')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament registered in the bot')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable automatic tournament room creation')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament registered in the bot')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction, { supabase }) {
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

    try {
      assertOrganiser(interaction, guildConfig);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    const tournamentId = interaction.options.getString('tournament', true);
    const tournament = await getTournamentById(supabase, interaction.guild.id, tournamentId);

    if (!tournament) {
      await interaction.editReply({
        embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'stop') {
        const updated = await patchTournament(supabase, interaction.guild.id, tournament.id, {
          auto_room_enabled: false,
        });

        await interaction.editReply({
          embeds: [buildAutoRoomStatusEmbed(false, updated.name)],
        });

        if (guildConfig) {
          void logAutoRoomToggled({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournament: updated,
            enabled: false,
          });
        }
        return;
      }

      if (subcommand === 'toggle') {
        const updated = await patchTournament(supabase, interaction.guild.id, tournament.id, {
          auto_room_enabled: !tournament.auto_room_enabled,
        });

        await interaction.editReply({
          embeds: [buildAutoRoomStatusEmbed(updated.auto_room_enabled, updated.name)],
        });

        if (guildConfig) {
          void logAutoRoomToggled({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournament: updated,
            enabled: updated.auto_room_enabled,
          });
        }
        return;
      }

      await patchTournament(supabase, interaction.guild.id, tournament.id, {
        auto_room_enabled: true,
      });

      const result: CreateRoomsResult | null = await processTournamentAutoRooms({
        guild: interaction.guild,
        supabase,
        tournament,
        guildConfig,
        maxRooms: AUTO_ROOM_MAX_MANUAL_RUN,
      });

      if (result && result.created.length > 0) {
        await interaction.editReply({
          embeds: [buildRoomsCreatedEmbed(interaction.guild, result)],
        });

        if (guildConfig) {
          void logRoomsCreated({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournament,
            result,
          });
        }
        return;
      }

      const { challongeId, apiKey } = getChallongeCredentials(tournament);
      const summary = await fetchChallongeTournamentSummary(challongeId, apiKey);
      const groupStageActive = isTwoStageTournament(summary) && isGroupStageStillActive(summary);

      const statusLines = [
        `${tournament.name}`,
        '',
        'Automatic room creation is **enabled**.',
      ];

      if (groupStageActive) {
        statusLines.push(
          '',
          'Group stage is open on Challonge — auto rooms are created for **group matches only**.',
          'Final-bracket tickets will be created automatically once the main bracket starts.',
        );
      }

      if (result && (result.warnings.length > 0 || result.errors.length > 0)) {
        statusLines.push('', '*Some matches could not be processed this run.*');
      } else {
        statusLines.push('', 'No new ready matches needed rooms right now.');
      }

      if (result && (result.warnings.length > 0 || result.errors.length > 0)) {
        await interaction.editReply({
          embeds: [buildRoomsCreatedEmbed(interaction.guild, result)],
        });
        return;
      }

      await interaction.editReply({
        embeds: [buildAutoRoomStatusEmbed(true, statusLines.join('\n'))],
      });
    } catch (error) {
      const message =
        error instanceof MatchRoomError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to process auto room command.';
      await interaction.editReply({ embeds: [errorEmbed('Auto Room Error', message)] });
    }
  },
};
