import { MessageFlags, SlashCommandBuilder, ChannelType } from 'discord.js';

import type { SlashCommand } from '../types.js';

import { assertAdmin, PermissionError } from '../../guards/permissions.js';

import { getGuildConfig } from '../../services/guilds.js';

import { SheetsError, TOURNAMENT_FORMATS, type TournamentFormat } from '../../services/sheets.js';

import { validateParticipantSheetData } from '../../services/sheet-validation.js';
import {
  runSheetValidationRole,
  SheetValidationRoleError,
} from '../../services/sheet-validation-role.js';
import { errorEmbed } from '../../utils/embeds.js';
import { buildSheetHeadersEmbed } from '../../utils/sheet-headers-display.js';
import { buildSheetValidationReportAttachment } from '../../utils/sheet-validation-display.js';
import {
  buildValidationRoleReportAttachment,
  buildValidationRoleSummaryEmbed,
} from '../../utils/validation-role-display.js';

import {

  buildSheetValidationPassedEmbed,

  runSheetValidationPagination,

} from '../../utils/sheet-validation-pagination.js';



function isTournamentFormat(value: string): value is TournamentFormat {

  return (TOURNAMENT_FORMATS as string[]).includes(value);

}



export const sheetCommand: SlashCommand = {

  data: new SlashCommandBuilder()

    .setName('sheet')

    .setDescription('Google Sheet templates and utilities for tournament registration')

    .setDefaultMemberPermissions(null)

    .addSubcommand((subcommand) =>

      subcommand

        .setName('headers')

        .setDescription('Show copy-paste header row for a tournament registration sheet')

        .addStringOption((option) =>

          option

            .setName('format')

            .setDescription('Tournament team size format')

            .setRequired(true)

            .addChoices(

              { name: '1vs1', value: '1vs1' },

              { name: '2vs2', value: '2vs2' },

              { name: '3vs3', value: '3vs3' },

              { name: '4vs4', value: '4vs4' },

              { name: '5vs5', value: '5vs5' },

              { name: 'All formats', value: 'all' },

            ),

        ),

    )

    .addSubcommand((subcommand) =>

      subcommand

        .setName('validate')

        .setDescription('Validate participant sheet data before creating a tournament (Admin only)')

        .addStringOption((option) =>

          option

            .setName('sheet_link')

            .setDescription('Google Sheet link with participant registration data')

            .setRequired(true),

        ),

    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('validation_role')
        .setDescription(
          'Open support tickets for teams missing a required role (e.g. Verified)',
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role every player must have (typically Verified)')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('sheet')
            .setDescription('Google Sheet link with participant registration data')
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Primary category for validation support tickets')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('transcript')
            .setDescription('Channel where resolved ticket transcripts are archived')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('secondary_category')
            .setDescription('Fallback category if the primary one reaches 50 channels')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    ),



  async execute(interaction, context) {

    const subcommand = interaction.options.getSubcommand();



    if (subcommand === 'headers') {

      const formatOption = interaction.options.getString('format', true);



      if (formatOption === 'all') {

        const [firstFormat, ...remainingFormats] = TOURNAMENT_FORMATS;

        await interaction.reply({ embeds: [buildSheetHeadersEmbed(firstFormat)] });



        for (const format of remainingFormats) {

          await interaction.followUp({ embeds: [buildSheetHeadersEmbed(format)] });

        }

        return;

      }



      if (!isTournamentFormat(formatOption)) {

        await interaction.reply({

          embeds: [errorEmbed('Invalid Format', 'Select a supported tournament format.')],

        });

        return;

      }



      await interaction.reply({ embeds: [buildSheetHeadersEmbed(formatOption)] });

      return;

    }



    if (subcommand === 'validate') {

      if (!interaction.inGuild() || !interaction.guild) {

        await interaction.reply({

          embeds: [errorEmbed('Guild Only', 'This command can only be used inside a server.')],

          flags: MessageFlags.Ephemeral,

        });

        return;

      }



      const guildConfig = await getGuildConfig(context.supabase, interaction.guild.id);



      try {

        assertAdmin(interaction, guildConfig);

      } catch (error) {

        const message =

          error instanceof PermissionError

            ? error.message

            : 'You do not have permission to run this command.';

        await interaction.reply({

          embeds: [errorEmbed('Permission Denied', message)],

          flags: MessageFlags.Ephemeral,

        });

        return;

      }



      const sheetLink = interaction.options.getString('sheet_link', true);

      await interaction.deferReply();



      try {

        const result = await validateParticipantSheetData({

          sheetLink,

          guild: interaction.guild,

          guildConfig,

        });



        const attachment = buildSheetValidationReportAttachment(result);



        if (result.passed) {

          await interaction.editReply({

            embeds: [buildSheetValidationPassedEmbed(result)],

          });

          return;

        }



        await runSheetValidationPagination(interaction, result, attachment);

      } catch (error) {

        const message =

          error instanceof SheetsError

            ? error.message

            : error instanceof Error

              ? error.message

              : 'Failed to validate the participant sheet.';

        await interaction.editReply({
          embeds: [errorEmbed('Sheet Validation Error', message)],
        });
      }

      return;
    }

    if (subcommand === 'validation_role') {
      if (!interaction.inGuild() || !interaction.guild) {
        await interaction.reply({
          embeds: [errorEmbed('Guild Only', 'This command can only be used inside a server.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const guildConfig = await getGuildConfig(context.supabase, interaction.guild.id);

      try {
        assertAdmin(interaction, guildConfig);
      } catch (error) {
        const message =
          error instanceof PermissionError
            ? error.message
            : 'You do not have permission to run this command.';
        await interaction.reply({
          embeds: [errorEmbed('Permission Denied', message)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const roleOption = interaction.options.getRole('role', true);
      const sheetLink = interaction.options.getString('sheet', true);
      const category = interaction.options.getChannel('category', true, [
        ChannelType.GuildCategory,
      ]);
      const transcriptChannel = interaction.options.getChannel('transcript', true, [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
      ]);
      const secondaryCategory = interaction.options.getChannel('secondary_category', false, [
        ChannelType.GuildCategory,
      ]);

      await interaction.deferReply();

      const role =
        interaction.guild.roles.cache.get(roleOption.id) ??
        (await interaction.guild.roles.fetch(roleOption.id).catch(() => null));
      if (!role) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Role', 'The selected role could not be resolved in this server.')],
        });
        return;
      }

      try {
        const result = await runSheetValidationRole({
          guild: interaction.guild,
          guildConfig,
          sheetLink,
          role,
          categoryId: category.id,
          secondaryCategoryId: secondaryCategory?.id ?? null,
          transcriptChannelId: transcriptChannel.id,
        });

        const embed = buildValidationRoleSummaryEmbed(result, role.name);
        const attachment = buildValidationRoleReportAttachment(result, role.name);

        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });
      } catch (error) {
        const message =
          error instanceof SheetValidationRoleError || error instanceof SheetsError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Failed to run role validation.';
        await interaction.editReply({
          embeds: [errorEmbed('Role Validation Error', message)],
        });
      }
    }
  },
};


