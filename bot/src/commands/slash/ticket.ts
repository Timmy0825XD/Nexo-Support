import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  logTicketClosed,
  logTicketDeleted,
  logTicketReopened,
} from '../../services/guild-logs.js';
import {
  TicketError,
  clearTicketRecords,
  closeTicketChannel,
  findTicketByChannel,
  getTicketChannel,
  reopenTicketChannel,
  resolveTicketClosedState,
} from '../../services/tickets.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

export const ticketCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Match ticket management')
    .setDefaultMemberPermissions(null)
    .addSubcommand((sub) =>
      sub.setName('close').setDescription('Close the current match ticket'),
    )
    .addSubcommand((sub) =>
      sub.setName('reopen').setDescription('Reopen a previously closed match ticket'),
    )
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('Permanently delete the current match ticket channel'),
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

      const isClosed = resolveTicketClosedState(textChannel, context.closedCategoryId);
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'close') {
        if (isClosed) {
          await interaction.editReply({
            embeds: [errorEmbed('Already Closed', 'This ticket is already closed.')],
          });
          return;
        }

        await closeTicketChannel(interaction.guild, textChannel, context.closedCategoryId);
        await interaction.editReply({
          embeds: [successEmbed('Ticket Closed', '✅ Ticket closed successfully.')],
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

        await reopenTicketChannel(interaction.guild, textChannel, context.openCategoryId);
        await interaction.editReply({
          embeds: [successEmbed('Ticket Reopened', '✅ Ticket reopened successfully.')],
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
          embeds: [successEmbed('Ticket Deleted', '✅ Ticket deleted successfully.')],
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
