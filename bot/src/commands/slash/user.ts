import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import { logUserBanned, logUserUnbanned } from '../../services/guild-logs.js';
import { banUser, unbanUser, UserModerationError } from '../../services/user-moderation.js';
import { userBanSchema, userUnbanSchema } from '../../schemas/user-moderation.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { CUSTOM_EMOJIS } from '../../constants/emojis.js';
import { formatUser } from '../../utils/guild-display.js';
import { buildUserBannedEmbed } from '../../utils/user-moderation-display.js';
import { ZodError } from 'zod';

export const userCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('User moderation utilities')
    .setDefaultMemberPermissions(null)
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban a user by Discord ID')
        .addStringOption((option) =>
          option
            .setName('discord_id')
            .setDescription('Discord user ID to ban')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('time')
            .setDescription('Ban duration')
            .setRequired(true)
            .addChoices(
              { name: '7 days', value: '7_days' },
              { name: '1 month', value: '1_month' },
              { name: '2 months', value: '2_months' },
              { name: '6 months', value: '6_months' },
              { name: 'Permanent', value: 'permanent' },
            ),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for the ban').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unban')
        .setDescription('Remove a ban by Discord ID')
        .addStringOption((option) =>
          option
            .setName('discord_id')
            .setDescription('Discord user ID to unban')
            .setRequired(true),
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

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'ban') {
        const input = userBanSchema.parse({
          discord_id: interaction.options.getString('discord_id', true),
          time: interaction.options.getString('time', true),
          reason: interaction.options.getString('reason') ?? undefined,
        });

        const result = await banUser({ interaction, supabase, input });

        if (guildConfig) {
          await logUserBanned({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            targetUser: result.targetUser,
            targetUserId: result.userId,
            reason: result.reason,
            durationLabel: result.durationLabel,
            expiresAt: result.expiresAt,
          });
        }

        await interaction.editReply({
          embeds: [
            buildUserBannedEmbed({
              targetUser: result.targetUser,
              userId: result.userId,
              durationLabel: result.durationLabel,
              expiresAt: result.expiresAt,
              reason: result.reason,
            }),
          ],
        });
        return;
      }

      if (subcommand === 'unban') {
        const input = userUnbanSchema.parse({
          discord_id: interaction.options.getString('discord_id', true),
        });

        const result = await unbanUser({ interaction, supabase, input });

        if (guildConfig) {
          await logUserUnbanned({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            targetUserId: result.userId,
          });
        }

        await interaction.editReply({
          embeds: [
            successEmbed(
              'User Unbanned',
              `${CUSTOM_EMOJIS.done} ${formatUser(result.userId)} has been unbanned successfully.`,
            ),
          ],
        });
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues[0]?.message ?? 'Invalid input.';
        await interaction.editReply({ embeds: [errorEmbed('Invalid Input', message)] });
        return;
      }

      if (error instanceof UserModerationError || error instanceof PermissionError) {
        await interaction.editReply({ embeds: [errorEmbed('Ban Error', error.message)] });
        return;
      }

      console.error('[user command]', error);
      await interaction.editReply({
        embeds: [errorEmbed('Ban Error', 'Something went wrong while processing the request.')],
      });
    }
  },
};
