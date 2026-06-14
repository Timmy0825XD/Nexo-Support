import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { EMBED_COLORS } from '../constants/emojis.js';
import type { HelpCategory } from './bot-info.js';
import { formatHelpEntry } from './bot-info.js';

export const HELP_PAGINATION_TIMEOUT_MS = 2 * 60 * 1000;

const HELP_PREV_ID = 'help:prev';
const HELP_NEXT_ID = 'help:next';
const HELP_PAGE_ID = 'help:page';

async function fetchCommandIds(
  interaction: ChatInputCommandInteraction,
): Promise<Map<string, string>> {
  const { client, guildId } = interaction;
  const commands = guildId
    ? await client.application.commands.fetch({ guildId })
    : await client.application.commands.fetch();

  const ids = new Map<string, string>();
  for (const command of commands.values()) {
    ids.set(command.name, command.id);
  }
  return ids;
}

export function buildHelpEmbed(
  category: HelpCategory,
  pageIndex: number,
  totalPages: number,
  botName: string,
  commandIds: Map<string, string>,
): EmbedBuilder {
  const body = category.entries
    .map((entry) => formatHelpEntry(entry, commandIds))
    .join('\n\n')
    .slice(0, 4096);

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(category.title)
    .setDescription(`*${category.subtitle}*\n\n${body}`.slice(0, 4096))
    .setFooter({
      text: `🛡️ Category ${pageIndex + 1} of ${totalPages} • ${botName} Help System`,
    });
}

export function buildHelpComponents(
  pageIndex: number,
  categories: HelpCategory[],
  locked: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const atStart = pageIndex <= 0;
  const atEnd = pageIndex >= categories.length - 1;
  const category = categories[pageIndex]!;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(HELP_PREV_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('◀')
      .setDisabled(locked || atStart),
    new ButtonBuilder()
      .setCustomId(HELP_PAGE_ID)
      .setStyle(ButtonStyle.Primary)
      .setLabel(category.buttonLabel)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(HELP_NEXT_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('▶▶')
      .setDisabled(locked || atEnd),
  );
}

export async function runHelpPagination(
  interaction: ChatInputCommandInteraction,
  categories: HelpCategory[],
): Promise<void> {
  const botName = interaction.client.user?.displayName ?? 'Bot';
  const commandIds = await fetchCommandIds(interaction);
  let currentPage = 0;

  const render = (locked: boolean) => ({
    embeds: [buildHelpEmbed(categories[currentPage]!, currentPage, categories.length, botName, commandIds)],
    components: [buildHelpComponents(currentPage, categories, locked)],
  });

  const message = await interaction.editReply(render(false));
  const collector = message.createMessageComponentCollector({
    time: HELP_PAGINATION_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: 'Only the person who ran `/bot help` can browse these pages.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (buttonInteraction.customId === HELP_PREV_ID && currentPage > 0) {
      currentPage -= 1;
    } else if (buttonInteraction.customId === HELP_NEXT_ID && currentPage < categories.length - 1) {
      currentPage += 1;
    }

    await buttonInteraction.update(render(false));
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply(render(true));
    } catch {
      // Message may have been deleted.
    }
  });
}