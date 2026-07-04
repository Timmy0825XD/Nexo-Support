import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { CUSTOM_EMOJIS } from '../../constants/emojis.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { assertTicketAddPermission } from '../../guards/tournament-permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  logTicketClosed,
  logTicketDeleted,
  logTicketReopened,
} from '../../services/guild-logs.js';
import {
  TicketError,
  addUserToOpenTicket,
  clearTicketRecords,
  closeTicketChannel,
  collectPreservedTicketMemberIds,
  findTicketByChannel,
  getTicketChannel,
  reopenTicketChannel,
  resolveOpenTicketMemberIds,
  resolveTicketClosedState,
} from '../../services/tickets.js';
import { getMatchById } from '../../services/matches.js';
import { getTournamentById } from '../../services/tournaments.js';
import { archiveValidationTranscript } from '../../services/transcripts.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { formatUser } from '../../utils/guild-display.js';
import { parseValidationTicketTopic } from '../../utils/validation-ticket.js';

export const ticketCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Match and support ticket management')
    .setDefaultMemberPermissions(null)
    .addSubcommand((sub) =>
      sub.setName('close').setDescription('Close the current match ticket'),
    )
    .addSubcommand((sub) =>
      sub.setName('reopen').setDescription('Reopen a previously closed match ticket'),
    )
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('Permanently delete the current match ticket channel'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a user to the current match ticket with captain permissions')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to add to this ticket').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('transcript')
        .setDescription('Archive and delete a role validation support ticket'),
    ),

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

    const channel = interaction.channel;
    if (!channel?.isTextBased() || channel.isDMBased()) {
      await interaction.editReply({
        embeds: [
          errorEmbed('Invalid Channel', 'This command can only be used inside a text channel.'),
        ],
      });
      return;
    }

    const textChannel = await getTicketChannel(interaction.guild, channel.id);
    if (!textChannel) {
      await interaction.editReply({
        embeds: [errorEmbed('Invalid Channel', 'This command requires a guild text channel.')],
      });
      return;
    }

    const validationTicket = parseValidationTicketTopic(textChannel.topic);

    if (subcommand === 'transcript') {
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

      if (!validationTicket) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Invalid Ticket',
              'This command only works inside role validation support ticket channels.',
            ),
          ],
        });
        return;
      }

      try {
        await archiveValidationTranscript({
          guild: interaction.guild,
          channel: textChannel,
          guildConfig,
          teamLabel: validationTicket.teamLabel,
          transcriptChannelId: validationTicket.transcriptChannelId,
        });

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Ticket Transcribed',
              `${CUSTOM_EMOJIS.transcript} Transcript archived and the support ticket will be deleted.`,
            ),
          ],
        });

        await textChannel.delete('Role validation ticket transcribed by organiser');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to archive validation ticket transcript.';
        await interaction.editReply({ embeds: [errorEmbed('Transcript Error', message)] });
      }
      return;
    }

    if (validationTicket) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Support Ticket',
            'Use `/ticket transcript` to archive and close this role validation support ticket.',
          ),
        ],
      });
      return;
    }

    try {
      const context = await findTicketByChannel(
        supabase,
        interaction.guild.id,
        textChannel.id,
        guildConfig,
      );

      if (!context) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Invalid Ticket',
              'This command only works inside valid match ticket channels.',
            ),
          ],
        });
        return;
      }

      const tournament = await getTournamentById(
        supabase,
        interaction.guild.id,
        context.matchRoom.tournament_id,
      );
      if (!tournament) {
        await interaction.editReply({
          embeds: [errorEmbed('Tournament Not Found', 'The linked tournament no longer exists.')],
        });
        return;
      }

      const match = await getMatchById(supabase, tournament.id, context.match.id);
      if (!match) {
        await interaction.editReply({
          embeds: [errorEmbed('Match Not Found', 'The linked match no longer exists.')],
        });
        return;
      }

      const isClosed = resolveTicketClosedState(textChannel, context.closedCategoryId);

      if (subcommand === 'add') {
        try {
          assertTicketAddPermission(interaction, guildConfig, tournament);
        } catch (error) {
          const message =
            error instanceof PermissionError
              ? error.message
              : 'You do not have permission to run this command.';
          await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
          return;
        }

        if (isClosed) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Ticket Closed',
                'Users can only be added while the ticket is open. Reopen the ticket first.',
              ),
            ],
          });
          return;
        }

        const targetUser = interaction.options.getUser('user', true);
        await addUserToOpenTicket({
          guild: interaction.guild,
          channel: textChannel,
          userId: targetUser.id,
        });

        await interaction.editReply({
          embeds: [
            successEmbed(
              'User Added to Ticket',
              `${CUSTOM_EMOJIS.captain} ${formatUser(targetUser.id)} now has captain-level access to this ticket.`,
            ),
          ],
        });
        return;
      }

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

      if (subcommand === 'close') {
        if (isClosed) {
          await interaction.editReply({
            embeds: [errorEmbed('Already Closed', 'This ticket is already closed.')],
          });
          return;
        }

        await closeTicketChannel({
          guild: interaction.guild,
          channel: textChannel,
          closedCategoryId: context.closedCategoryId,
          tournament,
          guildConfig,
        });
        await interaction.editReply({
          embeds: [successEmbed('Ticket Closed', `${CUSTOM_EMOJIS.done} Ticket closed successfully.`)],
        });

        if (guildConfig) {
          void logTicketClosed({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            channelId: textChannel.id,
            matchId: context.match.id,
          });
        }
        return;
      }

      if (subcommand === 'reopen') {
        if (!isClosed) {
          await interaction.editReply({
            embeds: [errorEmbed('Already Open', 'This ticket is already open.')],
          });
          return;
        }

        if (!context.openCategoryId) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Missing Category',
                'Cannot reopen this ticket because the original open category is unknown.',
              ),
            ],
          });
          return;
        }

        const participantMemberIds = await resolveOpenTicketMemberIds({
          supabase,
          ticketChannelId: textChannel.id,
          tournament,
          match,
        });
        const preservedMemberIds = collectPreservedTicketMemberIds(textChannel);
        const mergedMemberIds = [...new Set([...participantMemberIds, ...preservedMemberIds])];

        await reopenTicketChannel({
          guild: interaction.guild,
          channel: textChannel,
          openCategoryId: context.openCategoryId,
          tournament,
          guildConfig,
          participantMemberIds: mergedMemberIds,
        });
        await interaction.editReply({
          embeds: [successEmbed('Ticket Reopened', `${CUSTOM_EMOJIS.done} Ticket reopened successfully.`)],
        });

        if (guildConfig) {
          void logTicketReopened({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            channelId: textChannel.id,
            matchId: context.match.id,
          });
        }
        return;
      }

      if (subcommand === 'delete') {
        await clearTicketRecords(supabase, textChannel.id, context);

        if (guildConfig) {
          void logTicketDeleted({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            channelId: textChannel.id,
            matchId: context.match.id,
          });
        }

        await interaction.editReply({
          embeds: [successEmbed('Ticket Deleted', `${CUSTOM_EMOJIS.done} Ticket deleted successfully.`)],
        });

        await textChannel.delete('Match ticket deleted by organiser');
      }
    } catch (error) {
      const message =
        error instanceof TicketError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to process ticket command.';
      await interaction.editReply({ embeds: [errorEmbed('Ticket Error', message)] });
    }
  },
};
