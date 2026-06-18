import { SlashCommandBuilder, ChannelType } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { PermissionError } from '../../guards/permissions.js';
import { assertUploadScorePermission } from '../../guards/tournament-permissions.js';
import { ChallongeError, getChallongeCredentials, reportMatchScore } from '../../services/challonge.js';
import { getGuildConfig } from '../../services/guilds.js';
import { logScoreUploaded } from '../../services/guild-logs.js';
import {
  getChallongeMatchMeta,
  getMatchById,
  markMatchCompleted,
  resolveWinnerSideFromScores,
} from '../../services/matches.js';
import { getTournamentById } from '../../services/tournaments.js';
import { AUTO_ROOM_MAX_PER_TICK, processTournamentAutoRooms } from '../../services/auto-room.js';
import { archiveTranscript } from '../../services/transcripts.js';
import {
  finalizeMatchTicket,
  resolveTicketFromChannel,
} from '../../services/tickets.js';
import { errorEmbed } from '../../utils/embeds.js';
import { formatChannel } from '../../utils/guild-display.js';
import { buildScoreUploadedEmbed } from '../../utils/match-display.js';

export const uploadScoreCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('upload_score')
    .setDescription('Upload match results from the current ticket to Challonge and finalize it')
    .setDefaultMemberPermissions(null)
    .addIntegerOption((option) =>
      option.setName('score1').setDescription('Team/Player 1 score').setRequired(true).setMinValue(0),
    )
    .addIntegerOption((option) =>
      option.setName('score2').setDescription('Team/Player 2 score').setRequired(true).setMinValue(0),
    )
    .addStringOption((option) =>
      option.setName('note').setDescription('Optional match or result note').setRequired(false),
    ),

  async autocomplete(interaction) {
    if (!interaction.responded) {
      await interaction.respond([]).catch(() => undefined);
    }
  },

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isTextBased() || channel.isDMBased() || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Ticket Channel Required',
            'Run `/upload_score` inside the match ticket channel you want to finalize.',
          ),
        ],
      });
      return;
    }

    await interaction.deferReply();

    const guildConfig = await getGuildConfig(supabase, interaction.guild.id);
    const score1 = interaction.options.getInteger('score1', true);
    const score2 = interaction.options.getInteger('score2', true);
    const note = interaction.options.getString('note');

    const ticketContext = await resolveTicketFromChannel(
      supabase,
      interaction.guild.id,
      channel,
      guildConfig,
    );

    if (!ticketContext) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Invalid Ticket',
            'This channel is not linked to a tournament match. Use `/upload_score` only inside match ticket channels.',
          ),
        ],
      });
      return;
    }

    const tournament = await getTournamentById(
      supabase,
      interaction.guild.id,
      ticketContext.tournamentId,
    );
    if (!tournament) {
      await interaction.editReply({
        embeds: [errorEmbed('Tournament Not Found', 'The linked tournament no longer exists.')],
      });
      return;
    }

    try {
      assertUploadScorePermission(interaction, guildConfig, tournament);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    const match = await getMatchById(supabase, tournament.id, ticketContext.matchId);
    if (!match) {
      await interaction.editReply({
        embeds: [errorEmbed('Match Not Found', 'The linked match no longer exists.')],
      });
      return;
    }

    if (match.status === 'completed') {
      await interaction.editReply({
        embeds: [errorEmbed('Match Completed', 'This match is already marked as completed.')],
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

      await markMatchCompleted(supabase, match.id, {
        team1Score: score1,
        team2Score: score2,
        winnerSide,
      });

      const matchLabel = `${match.team1_name} vs ${match.team2_name}`;

      await finalizeMatchTicket({
        guild: interaction.guild,
        channel,
        closedCategoryId: tournament.closed_ticket_category_id,
      });

      await interaction.editReply({
        embeds: [
          buildScoreUploadedEmbed({
            team1Name: match.team1_name,
            team2Name: match.team2_name,
            score1,
            score2,
            winnerSide,
            note,
            tournamentName: tournament.name,
            matchGroup: match.group,
            challongeMatchId: match.challonge_match_id,
            archiveChannelLine: `📁 Ticket archivado en ${formatChannel(interaction.guild, tournament.transcript_channel_id)}.`,
          }),
        ],
      });

      if (guildConfig) {
        void logScoreUploaded({
          client: interaction.client,
          guild: interaction.guild,
          config: guildConfig,
          triggeredBy: interaction.user,
          tournament,
          team1Name: match.team1_name,
          team2Name: match.team2_name,
          winnerSide,
          score1,
          score2,
          note,
        });
      }

      if (tournament.auto_room_enabled) {
        void processTournamentAutoRooms({
          guild: interaction.guild,
          supabase,
          tournament,
          guildConfig,
          maxRooms: AUTO_ROOM_MAX_PER_TICK,
        }).catch((autoRoomError) => {
          console.error('[upload_score] Auto room follow-up failed:', autoRoomError);
        });
      }

      void archiveTranscript({
        guild: interaction.guild,
        channel,
        tournament,
        guildConfig,
        matchLabel,
        challongeMatchId: match.challonge_match_id,
      }).catch((error) => {
        console.error('[upload_score] Failed to archive transcript:', error);
      });
    } catch (error) {
      const message =
        error instanceof ChallongeError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to upload score.';
      await interaction.editReply({ embeds: [errorEmbed('Upload Failed', message)] }).catch(() => undefined);
    }
  },
};
