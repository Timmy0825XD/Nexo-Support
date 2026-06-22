import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteMatches } from '../../autocomplete/matches.js';
import { autocompleteTournaments } from '../../autocomplete/tournaments.js';
import { PermissionError } from '../../guards/permissions.js';
import { assertCorrectBracketPermission } from '../../guards/tournament-permissions.js';
import { ChallongeError, getChallongeCredentials, reportMatchScore } from '../../services/challonge.js';
import { getGuildConfig } from '../../services/guilds.js';
import { logBracketCorrected } from '../../services/guild-logs.js';
import {
  getChallongeMatchMeta,
  getMatchById,
  recordBracketCorrection,
  resolveWinnerSideFromScores,
  syncMatchesFromChallonge,
  updateMatchScores,
} from '../../services/matches.js';
import { getTournamentById } from '../../services/tournaments.js';
import { errorEmbed } from '../../utils/embeds.js';
import { buildBracketCorrectedEmbed } from '../../utils/match-display.js';

export const correctBracketCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('correct_bracket')
    .setDescription('Correct incorrect scores uploaded to the tournament bracket')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) =>
      option
        .setName('tournament')
        .setDescription('Tournament registered in the bot')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('match')
        .setDescription('Match to correct')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option.setName('score1').setDescription('Team/Player 1 score').setRequired(true).setMinValue(0),
    )
    .addIntegerOption((option) =>
      option.setName('score2').setDescription('Team/Player 2 score').setRequired(true).setMinValue(0),
    ),

  async autocomplete(interaction, { supabase }) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'match') {
      await autocompleteMatches(interaction, supabase, { includeCompleted: true });
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

    try {
      assertCorrectBracketPermission(interaction, guildConfig);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    const tournamentId = interaction.options.getString('tournament', true);
    const matchId = interaction.options.getString('match', true);
    const score1 = interaction.options.getInteger('score1', true);
    const score2 = interaction.options.getInteger('score2', true);

    const tournament = await getTournamentById(supabase, interaction.guild.id, tournamentId);
    if (!tournament) {
      await interaction.editReply({
        embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
      });
      return;
    }

    const match = await getMatchById(supabase, tournament.id, matchId);
    if (!match) {
      await interaction.editReply({
        embeds: [errorEmbed('Match Not Found', 'The selected match does not exist.')],
      });
      return;
    }

    let winnerSide: 1 | 2;
    try {
      winnerSide = resolveWinnerSideFromScores(score1, score2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid scores provided.';
      await interaction.editReply({ embeds: [errorEmbed('Invalid Scores', message)] });
      return;
    }

    try {
      const credentials = getChallongeCredentials(tournament);
      const challongeMeta = await getChallongeMatchMeta(tournament, match.challonge_match_id);

      await recordBracketCorrection(supabase, {
        tournamentId: tournament.id,
        matchId: match.id,
        oldTeam1Score: match.team1_score,
        oldTeam2Score: match.team2_score,
        newTeam1Score: score1,
        newTeam2Score: score2,
        correctedByDiscordId: interaction.user.id,
      });

      await reportMatchScore({
        challongeId: credentials.challongeId,
        apiKey: credentials.apiKey,
        challongeMatchId: match.challonge_match_id,
        score1,
        score2,
        winnerSide,
        player1Id: challongeMeta?.player1Id ?? null,
        player2Id: challongeMeta?.player2Id ?? null,
      });

      await updateMatchScores(supabase, match.id, {
        team1Score: score1,
        team2Score: score2,
        winnerSide,
      });
      await syncMatchesFromChallonge(supabase, tournament);

      const matchLabel = `${match.team1_name} vs ${match.team2_name}`;
      await interaction.editReply({
        embeds: [
          buildBracketCorrectedEmbed({
            team1Name: match.team1_name,
            team2Name: match.team2_name,
            oldScore1: match.team1_score,
            oldScore2: match.team2_score,
            newScore1: score1,
            newScore2: score2,
          }),
        ],
      });

      if (guildConfig) {
        void logBracketCorrected({
          client: interaction.client,
          guild: interaction.guild,
          config: guildConfig,
          triggeredBy: interaction.user,
          tournament,
          team1Name: match.team1_name,
          team2Name: match.team2_name,
          winnerSide,
          ticketChannelId: match.ticket_channel_id,
          oldScore1: match.team1_score,
          oldScore2: match.team2_score,
          newScore1: score1,
          newScore2: score2,
        });
      }
    } catch (error) {
      const message =
        error instanceof ChallongeError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to correct bracket score.';
      await interaction.editReply({ embeds: [errorEmbed('Correction Failed', message)] });
    }
  },
};
