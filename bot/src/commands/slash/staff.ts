import { ZodError } from 'zod';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../types.js';
import { ResourceValidationError, validateStaffResources } from '../../guards/discord-resources.js';
import { PermissionError, assertAdmin } from '../../guards/permissions.js';
import { staffConfigEditSchema, staffConfigSetSchema } from '../../schemas/staff-config.js';
import {
  getGuildConfig,
  isStaffConfigured,
  patchStaffConfig,
  upsertStaffConfig,
} from '../../services/guilds.js';
import { errorEmbed } from '../../utils/embeds.js';
import {
  buildStaffEditEmbed,
  buildStaffSetEmbed,
  buildStaffShowEmbed,
} from '../../utils/guild-display.js';
import { parseStaffConfigEdit, parseStaffConfigSet } from '../../utils/parse-staff-options.js';
import { logStaffConfigChange } from '../../services/guild-logs.js';

function staffConfigOptions(
  subcommand: SlashCommandSubcommandBuilder,
  required: boolean,
): SlashCommandSubcommandBuilder {
  return subcommand
    .addRoleOption((option) =>
      option
        .setName('staff_role')
        .setDescription('Main tournament staff role')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('judge_role')
        .setDescription('Judge role used for match assignments')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('recorder_role')
        .setDescription('Recorder role used for match recordings')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('t1_admin_role')
        .setDescription('Tier 1 tournament administrator role')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('t2_admin_role')
        .setDescription('Tier 2 tournament administrator role')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('best_staff_role')
        .setDescription('Recognition role for outstanding staff members')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('server_helper_role')
        .setDescription('General helper/support staff role')
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option.setName('manager_role').setDescription('Staff management role').setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName('challonge_mod')
        .setDescription('Staff role allowed to manage Challonge-related actions')
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('schedule_channel')
        .setDescription('Channel used for schedule announcements')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('staffchat_channel')
        .setDescription('Main staff communication channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('staff_announcement_channel')
        .setDescription('Staff announcements channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('staff_instructions_channel')
        .setDescription('Staff instructions and guidelines channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('staff_details_channel')
        .setDescription('Staff information and documentation channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    )
    .addChannelOption((option) =>
      option
        .setName('event_rules_channel')
        .setDescription('Event rules and procedures channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(required),
    );
}

export const staffCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff management configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure staff roles and channels')
        .addSubcommand((subcommand) =>
          staffConfigOptions(
            subcommand
              .setName('set')
              .setDescription('Initial complete staff configuration (all fields required)'),
            true,
          ),
        )
        .addSubcommand((subcommand) =>
          staffConfigOptions(
            subcommand
              .setName('edit')
              .setDescription('Update specific staff settings while preserving the rest'),
            false,
          ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('view')
            .setDescription('Display the current staff configuration'),
        ),
    ),

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    const group = interaction.options.getSubcommandGroup(true);
    const subcommand = interaction.options.getSubcommand(true);

    if (group !== 'config') return;

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

    try {
      if (subcommand === 'view') {
        const embed = buildStaffShowEmbed(
          interaction.guild,
          isStaffConfigured(guildConfig) ? guildConfig : null,
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === 'set') {
        const parsed = parseStaffConfigSet(interaction);
        const staff = staffConfigSetSchema.parse(parsed);
        validateStaffResources(interaction.guild, staff);
        const updated = await upsertStaffConfig(supabase, interaction.guild.id, staff);
        await interaction.editReply({
          embeds: [buildStaffSetEmbed(interaction.guild, updated)],
        });
        void logStaffConfigChange({
          client: interaction.client,
          guild: interaction.guild,
          config: updated,
          action: 'set',
          triggeredBy: interaction.user,
        });
        return;
      }

      if (subcommand === 'edit') {
        if (!isStaffConfigured(guildConfig)) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Setup Required',
                'No complete staff configuration found. Run `/staff config set` before editing.',
              ),
            ],
          });
          return;
        }

        const parsed = parseStaffConfigEdit(interaction);
        const changes = staffConfigEditSchema.parse(parsed);
        validateStaffResources(interaction.guild, changes);
        const updated = await patchStaffConfig(supabase, interaction.guild.id, changes);
        const updatedAt = new Date(updated.updated_at).toUTCString();
        await interaction.editReply({
          embeds: [buildStaffEditEmbed(interaction.guild, changes, updatedAt)],
        });
        void logStaffConfigChange({
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
          embeds: [errorEmbed('Invalid Input', 'At least one staff setting must be provided.')],
        });
        return;
      }

      throw error;
    }
  },
};
