import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  logBulkRoleChange,
  logRoleUserChange,
} from '../../services/guild-logs.js';
import {
  ROLE_LIST_INLINE_THRESHOLD,
  addRoleToAllMembers,
  collectRoleMembers,
  removeRoleFromAllMembers,
  summarizeRoleMembers,
  toggleUserRole,
} from '../../services/roles.js';
import { buildCsvBuffer } from '../../utils/export.js';
import { embedField, errorEmbed, successEmbed } from '../../utils/embeds.js';
import {
  formatMember,
  formatRoleFromRole,
  formatUser,
} from '../../utils/guild-display.js';

export const roleCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Role management utilities')
    .setDefaultMemberPermissions(null)
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Add or remove a role from a specific user')
        .addUserOption((option) =>
          option.setName('target').setDescription('User to modify').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to add or remove').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View information and members of a role')
        .addRoleOption((option) =>
          option.setName('role').setDescription('The role to retrieve information about').setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('add')
        .setDescription('Add roles to members')
        .addSubcommand((sub) =>
          sub
            .setName('all')
            .setDescription('Add a role to all eligible members')
            .addRoleOption((option) =>
              option.setName('role').setDescription('The role to add to all eligible members').setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('remove')
        .setDescription('Remove roles from members')
        .addSubcommand((sub) =>
          sub
            .setName('all')
            .setDescription('Remove a role from all members who have it')
            .addRoleOption((option) =>
              option
                .setName('role')
                .setDescription('The role to remove from all members')
                .setRequired(true),
            ),
        ),
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

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(true);

    try {
      if (subcommand === 'user') {
        const target = interaction.options.getUser('target', true);
        const role = interaction.options.getRole('role', true);
        const targetMember = await interaction.guild.members.fetch(target.id);
        const guildRole = interaction.guild.roles.cache.get(role.id);
        if (!guildRole) {
          await interaction.editReply({
            embeds: [errorEmbed('Invalid Role', 'The selected role no longer exists.')],
          });
          return;
        }

        const result = await toggleUserRole(interaction.guild, member, targetMember, guildRole);
        const message =
          result.action === 'added'
            ? `✅ Role ${formatRoleFromRole(guildRole)} has been added to ${formatMember(targetMember)}.`
            : `✅ Role ${formatRoleFromRole(guildRole)} has been removed from ${formatMember(targetMember)}.`;

        await interaction.editReply({ embeds: [successEmbed('Role Updated', message)] });

        if (guildConfig) {
          void logRoleUserChange({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            target: targetMember,
            role: guildRole,
            action: result.action,
          });
        }
        return;
      }

      if (subcommand === 'list') {
        const role = interaction.options.getRole('role', true);
        const guildRole = interaction.guild.roles.cache.get(role.id);
        if (!guildRole) {
          await interaction.editReply({
            embeds: [errorEmbed('Invalid Role', 'The selected role no longer exists.')],
          });
          return;
        }

        await guildRole.guild.members.fetch();
        const members = collectRoleMembers(guildRole);
        const stats = summarizeRoleMembers(members);

        const baseDescription = `Role: ${formatRoleFromRole(guildRole)}\n\nTotal Members: ${stats.total}\nHuman Members: ${stats.humans}\nBot Members: ${stats.bots}`;

        if (members.length <= ROLE_LIST_INLINE_THRESHOLD) {
          const memberLines =
            members.length === 0
              ? 'No members.'
              : members.map((m) => formatUser(m.userId)).join('\n');

          await interaction.editReply({
            embeds: [
              successEmbed(
                'Role Information',
                `${baseDescription}\n\nMembers:\n${memberLines}\n\n📋 Role information displayed successfully.\n\n✅ Role information retrieved successfully.`,
              ).addFields(embedField('Role ID', guildRole.id, true)),
            ],
          });
          return;
        }

        const csv = buildCsvBuffer(
          members.map((m) => ({
            username: m.username,
            displayName: m.displayName,
            userId: m.userId,
            isBot: m.isBot,
          })),
          ['username', 'displayName', 'userId', 'isBot'],
        );
        const attachment = new AttachmentBuilder(csv, { name: `${guildRole.name}-members.csv` });

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Role Information',
              `${baseDescription}\n\n📄 Member list is too large to display.\nPlease check the attached CSV file.\n\n✅ Role information retrieved successfully.\n📄 Member list exported as CSV.`,
            ).addFields(embedField('Role ID', guildRole.id, true)),
          ],
          files: [attachment],
        });
        return;
      }

      if (group === 'add' && subcommand === 'all') {
        const role = interaction.options.getRole('role', true);
        const guildRole = interaction.guild.roles.cache.get(role.id);
        if (!guildRole) {
          await interaction.editReply({
            embeds: [errorEmbed('Invalid Role', 'The selected role no longer exists.')],
          });
          return;
        }

        const result = await addRoleToAllMembers(interaction.guild, member, guildRole);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Role Assignment Completed',
              `✅ Role assignment completed.\n\nRole: ${formatRoleFromRole(guildRole)}\nAdded To: ${result.processed} members\nSkipped: ${result.skipped} members (already had role)`,
            ),
          ],
        });

        if (guildConfig) {
          void logBulkRoleChange({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            role: guildRole,
            action: 'added',
            result,
          });
        }
        return;
      }

      if (group === 'remove' && subcommand === 'all') {
        const role = interaction.options.getRole('role', true);
        const guildRole = interaction.guild.roles.cache.get(role.id);
        if (!guildRole) {
          await interaction.editReply({
            embeds: [errorEmbed('Invalid Role', 'The selected role no longer exists.')],
          });
          return;
        }

        const result = await removeRoleFromAllMembers(interaction.guild, member, guildRole);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Role Removal Completed',
              `✅ Role removal completed.\n\nRole: ${formatRoleFromRole(guildRole)}\nRemoved From: ${result.processed} members\nSkipped: ${result.skipped} members (did not have role)`,
            ),
          ],
        });

        if (guildConfig) {
          void logBulkRoleChange({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            role: guildRole,
            action: 'removed',
            result,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to manage roles.';
      await interaction.editReply({ embeds: [errorEmbed('Role Error', message)] });
    }
  },
};
