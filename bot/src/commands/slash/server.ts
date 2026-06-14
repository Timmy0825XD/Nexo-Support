import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { PermissionError, assertOrganiser } from '../../guards/permissions.js';
import { getGuildConfig } from '../../services/guilds.js';
import { buildBanlistExcel } from '../../utils/export.js';
import { embedField, errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { formatUser, formatUserFromUser } from '../../utils/guild-display.js';
import {
  fetchGuildMemberStats,
  getGuildBoostStats,
  getGuildChannelStats,
  getGuildEmojiStats,
} from '../../utils/guild-stats.js';

export const serverCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Server information and moderation utilities')
    .setDefaultMemberPermissions(null)
    .addSubcommand((sub) =>
      sub.setName('info').setDescription('View detailed server statistics'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('banlist')
        .setDescription('View all banned users or export them to Excel')
        .addBooleanOption((option) =>
          option.setName('excel').setDescription('Export ban list as an Excel file').setRequired(false),
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'info') {
      const guild = interaction.guild;
      const owner = await guild.fetchOwner();
      const memberStats = await fetchGuildMemberStats(guild);
      const channelStats = getGuildChannelStats(guild);
      const emojiStats = getGuildEmojiStats(guild);
      const boostStats = await getGuildBoostStats(guild);

      const embed = infoEmbed('Server Information', '✅ Server information retrieved successfully.')
        .addFields(
          embedField('Name', guild.name, true),
          embedField('ID', guild.id, true),
          embedField('Owner', formatUserFromUser(owner.user), true),
          embedField(
            'Members',
            `Total: ${memberStats.total}\nHumans: ${memberStats.humans}\nBots: ${memberStats.bots}`,
            true,
          ),
          embedField('Roles', `Total: ${guild.roles.cache.size}`, true),
          embedField(
            'Channels',
            `Text: ${channelStats.text}\nVoice: ${channelStats.voice}\nCategories: ${channelStats.categories}`,
            true,
          ),
          embedField(
            'Emojis',
            `Total: ${emojiStats.total}\nAnimated: ${emojiStats.animated}\nStatic: ${emojiStats.static}`,
            true,
          ),
          embedField(
            'Boost Information',
            `Level: ${boostStats.level}\nCount: ${boostStats.count}\nBoosters: ${boostStats.boosters}`,
            true,
          ),
          embedField('Created At', guild.createdAt.toString(), false),
        );

      if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
      if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 512 }));

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'banlist') {
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

      const me = interaction.guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Missing Permission',
              'I need the Ban Members permission to retrieve the ban list.',
            ),
          ],
        });
        return;
      }

      const exportExcel = interaction.options.getBoolean('excel') ?? false;
      const bans = await interaction.guild.bans.fetch();
      const rows = [...bans.values()].map((ban) => ({
        username: ban.user.username,
        userId: ban.user.id,
      }));

      if (exportExcel) {
        const buffer = await buildBanlistExcel(rows);
        const attachment = new AttachmentBuilder(buffer, { name: 'banlist.xlsx' });
        const embed = successEmbed(
          'Ban List Export',
          `📊 Total banned users: ${rows.length}\n📄 Excel file generated successfully.\n\n✅ Ban list retrieved successfully.\n📄 Excel file generated and uploaded successfully.`,
        );
        await interaction.editReply({ embeds: [embed], files: [attachment] });
        return;
      }

      const maxInline = 50;
      const listed = rows.slice(0, maxInline);
      const lines = listed.map((row) => formatUser(row.userId)).join('\n');
      const truncated =
        rows.length > maxInline ? `\n\n...and ${rows.length - maxInline} more.` : '';

      const embed = infoEmbed(
        'Banned Users',
        `📋 Banned users list generated successfully.\n\n✅ Ban list retrieved successfully.`,
      ).addFields(
        embedField('Total banned users', String(rows.length), false),
        embedField('Users', lines + truncated || 'No banned users.', false),
      );

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
