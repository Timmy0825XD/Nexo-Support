import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteTournaments } from '../../autocomplete/tournaments.js';
import { PermissionError } from '../../guards/permissions.js';
import { assertTeamListPermission } from '../../guards/tournament-permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  findParticipantByDiscordId,
  findParticipantByGameLookup,
  isSheetsParticipantError,
  loadTournamentParticipants,
} from '../../services/participants.js';
import { getTournamentById } from '../../services/tournaments.js';
import { errorEmbed } from '../../utils/embeds.js';
import {
  buildParticipantListEmbed,
  buildTeamInfoEmbed,
  formatParticipantMentions,
} from '../../utils/team-display.js';

export const teamCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Tournament participant and team information')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('Get detailed information about a tournament participant or team')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament registered in the bot')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Discord user to look up (requires user or gameid_username)')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('gameid_username')
            .setDescription('In-game ID or in-game name to look up')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Display all tournament participant and team information in this channel')
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
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      try {
        assertTeamListPermission(interaction, guildConfig);
      } catch (error) {
        const message =
          error instanceof PermissionError
            ? error.message
            : 'You do not have permission to run this command.';
        await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
        return;
      }
    }

    const tournamentId = interaction.options.getString('tournament', true);
    const tournament = await getTournamentById(supabase, interaction.guild.id, tournamentId);

    if (!tournament) {
      await interaction.editReply({
        embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
      });
      return;
    }

    try {
      const { participants } = await loadTournamentParticipants(tournament.sheet_link);

      if (participants.length === 0) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'No Participants',
              'The tournament sheet does not contain any registered participants yet.',
            ),
          ],
        });
        return;
      }

      if (subcommand === 'info') {
        const targetUser = interaction.options.getUser('user');
        const gameLookup = interaction.options.getString('gameid_username')?.trim();

        if (!targetUser && !gameLookup) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Missing Lookup',
                'Provide either a **user** or **gameid_username** to search the participant sheet.',
              ),
            ],
          });
          return;
        }

        let participant = null;

        if (targetUser) {
          participant = findParticipantByDiscordId(participants, targetUser.id);
        } else if (gameLookup) {
          const match = findParticipantByGameLookup(participants, gameLookup);
          participant = match?.participant ?? null;
        }

        if (!participant) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Participant Not Found',
                'No participant matched that lookup in the configured Google Sheet.',
              ),
            ],
          });
          return;
        }

        await interaction.editReply({
          embeds: [
            buildTeamInfoEmbed({
              tournament,
              participant,
            }),
          ],
        });
        return;
      }

      const [firstParticipant, ...remainingParticipants] = participants;

      await interaction.editReply({
        content: formatParticipantMentions(firstParticipant),
        embeds: [buildParticipantListEmbed(firstParticipant)],
      });

      for (const participant of remainingParticipants) {
        await interaction.followUp({
          content: formatParticipantMentions(participant),
          embeds: [buildParticipantListEmbed(participant)],
        });
      }
    } catch (error) {
      const message = isSheetsParticipantError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Failed to load tournament participants.';
      await interaction.editReply({ embeds: [errorEmbed('Participant Lookup Failed', message)] });
    }
  },
};
