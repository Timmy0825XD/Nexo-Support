import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../../constants/emojis.js';
import { loadSlashCommands } from '../loader.js';
import { embedField, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { buildHelpCategories, getBotVersion } from '../../utils/bot-info.js';
import { runHelpPagination } from '../../utils/help-pagination.js';
import { formatMemoryUsage, formatUptime } from '../../utils/uptime.js';

export const botCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Bot information and command reference')
    .setDefaultMemberPermissions(null)
    .addSubcommand((sub) =>
      sub.setName('about').setDescription('View detailed bot information and statistics'),
    )
    .addSubcommand((sub) =>
      sub.setName('help').setDescription('Display all available bot commands'),
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'about') {
      const client = interaction.client;
      const totalMembers = client.guilds.cache.reduce(
        (sum, guild) => sum + guild.memberCount,
        0,
      );
      const createdAt = client.user?.createdAt.toUTCString() ?? 'Unknown';
      const guildName = interaction.guild.name;

      const embed = infoEmbed(
        `Created with ❤️ for - ${guildName} -`,
        '✅ Bot information retrieved successfully.',
      )
        .setColor(EMBED_COLORS.success)
        .setThumbnail(client.user?.displayAvatarURL() ?? null)
        .addFields(
          embedField('Name', client.user?.tag ?? 'Unknown', true),
          embedField('ID', client.user?.id ?? 'Unknown', true),
          embedField('Created On', createdAt, false),
          embedField(`${CUSTOM_EMOJIS.servers} Servers`, `\`${client.guilds.cache.size}\``, true),
          embedField('Members', `\`${totalMembers}\``, true),
          embedField('Uptime', formatUptime(), true),
          embedField('Memory Usage', formatMemoryUsage(), true),
          embedField('Platform', process.platform, true),
          embedField('Node', process.version, true),
          embedField('Bot Version', getBotVersion(), true),
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'help') {
      const categories = buildHelpCategories(loadSlashCommands());

      if (categories.length === 0) {
        await interaction.editReply({
          embeds: [infoEmbed('Command List', 'No commands are currently registered.')],
        });
        return;
      }

      await runHelpPagination(interaction, categories);
    }
  },
};
