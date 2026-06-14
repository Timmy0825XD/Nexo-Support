import { ZodError } from 'zod';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../types.js';
import {
  ResourceValidationError,
  validateSettingsResources,
} from '../../guards/discord-resources.js';
import { PermissionError, assertAdmin } from '../../guards/permissions.js';
import {
  guildSettingsEditSchema,
  guildSettingsSetupSchema,
} from '../../schemas/guild-settings.js';
import {
  getGuildConfig,
  isSettingsConfigured,
  patchGuildSettings,
  upsertGuildSettings,
} from '../../services/guilds.js';
import { errorEmbed } from '../../utils/embeds.js';
import {
  buildSettingsEditEmbed,
  buildSettingsSetupEmbed,
  buildSettingsShowEmbed,
} from '../../utils/guild-display.js';
import { parseSettingsEdit, parseSettingsSetup } from '../../utils/parse-settings-options.js';
import { logSettingsChange } from '../../services/guild-logs.js';

function settingsOptionFields(
  subcommand: SlashCommandSubcommandBuilder,
  required: boolean,
): SlashCommandSubcommandBuilder {
  return subcommand
    .addRoleOption((option) =>
      option
        .setName('admin_role')
        .setDescription('Tournament organiser/admin role')
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('challonge_logs')
        .setDescription('Channel where Challonge actions and bracket changes are logged')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('transcript_logs')
        .setDescription('Channel used to archive ticket transcripts')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('bot_logs')
        .setDescription('Channel used for bot events, errors, and moderation logs')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('thumbnail_channel')
        .setDescription('Channel used to publish generated schedule thumbnails')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    );
}

export const settingsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure global bot settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      settingsOptionFields(
        subcommand
          .setName('setup')
          .setDescription('Initial complete server configuration (all fields required)'),
        true,
      ),
    )
    .addSubcommand((subcommand) =>
      settingsOptionFields(
        subcommand
          .setName('edit')
          .setDescription('Update specific settings while preserving the rest'),
        false,
      ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('show').setDescription('Display the current bot configuration'),
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
      assertAdmin(interaction, guildConfig);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'show') {
        const embed = buildSettingsShowEmbed(
          interaction.guild,
          guildConfig && isSettingsConfigured(guildConfig) ? guildConfig : null,
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === 'setup') {
        const parsed = parseSettingsSetup(interaction);
        const settings = guildSettingsSetupSchema.parse(parsed);
        validateSettingsResources(interaction.guild, settings);
        const updated = await upsertGuildSettings(supabase, interaction.guild.id, settings);
        await interaction.editReply({
          embeds: [buildSettingsSetupEmbed(interaction.guild, updated)],
        });
        void logSettingsChange({
          client: interaction.client,
          guild: interaction.guild,
          config: updated,
          action: 'setup',
          triggeredBy: interaction.user,
        });
        return;
      }

      if (subcommand === 'edit') {
        if (!isSettingsConfigured(guildConfig)) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Setup Required',
                'No complete configuration found. Run `/settings setup` before editing settings.',
              ),
            ],
          });
          return;
        }

        const parsed = parseSettingsEdit(interaction);
        const changes = guildSettingsEditSchema.parse(parsed);
        validateSettingsResources(interaction.guild, changes);
        const updated = await patchGuildSettings(supabase, interaction.guild.id, changes);
        const updatedAt = new Date(updated.updated_at).toUTCString();
        await interaction.editReply({
          embeds: [buildSettingsEditEmbed(interaction.guild, changes, updatedAt)],
        });
        void logSettingsChange({
          client: interaction.client,
          guild: interaction.guild,
          config: updated,
          action: 'edit',
          triggeredBy: interaction.user,
          changes,
        });
      }
    } catch (error) {
      if (error instanceof ResourceValidationError) {
        await interaction.editReply({ embeds: [errorEmbed('Validation Failed', error.message)] });
        return;
      }

      if (error instanceof ZodError) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Input', 'At least one setting must be provided.')],
        });
        return;
      }

      throw error;
    }
  },
};
