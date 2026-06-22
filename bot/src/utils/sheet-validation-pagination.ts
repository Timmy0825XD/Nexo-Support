import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { SheetValidationResult } from '../services/sheet-validation.js';
import {
  ISSUE_SECTIONS,
  buildSheetValidationPages,
  type SheetValidationPage,
} from './sheet-validation-display.js';

export const SHEET_VALIDATE_PAGINATION_TIMEOUT_MS = 2 * 60 * 1000;

const VALIDATE_PREV_ID = 'sheet-validate:prev';
const VALIDATE_NEXT_ID = 'sheet-validate:next';
const VALIDATE_PAGE_ID = 'sheet-validate:page';

export function buildSheetValidationPageEmbed(
  page: SheetValidationPage,
  pageIndex: number,
  totalPages: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(page.color)
    .setTitle(page.title)
    .setDescription(page.description.slice(0, 4096))
    .setFooter({
      text: `Section ${pageIndex + 1} of ${totalPages} • Sheet Validation`,
    })
    .setTimestamp();
}

export function buildSheetValidationPageComponents(
  pageIndex: number,
  pages: SheetValidationPage[],
  locked: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const atStart = pageIndex <= 0;
  const atEnd = pageIndex >= pages.length - 1;
  const page = pages[pageIndex]!;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VALIDATE_PREV_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('◀')
      .setDisabled(locked || atStart),
    new ButtonBuilder()
      .setCustomId(VALIDATE_PAGE_ID)
      .setStyle(ButtonStyle.Primary)
      .setLabel(page.buttonLabel)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(VALIDATE_NEXT_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('▶')
      .setDisabled(locked || atEnd),
  );
}

export async function runSheetValidationPagination(
  interaction: ChatInputCommandInteraction,
  result: SheetValidationResult,
  attachment: AttachmentBuilder | null,
): Promise<void> {
  const pages = buildSheetValidationPages(result);
  let currentPage = 0;

  const render = (locked: boolean) => ({
    embeds: [buildSheetValidationPageEmbed(pages[currentPage]!, currentPage, pages.length)],
    components: pages.length > 1 ? [buildSheetValidationPageComponents(currentPage, pages, locked)] : [],
  });

  const initialPayload = {
    ...render(false),
    ...(attachment ? { files: [attachment] } : {}),
  };

  if (pages.length <= 1) {
    await interaction.editReply(initialPayload);
    return;
  }

  const message = await interaction.editReply(initialPayload);
  const collector = message.createMessageComponentCollector({
    time: SHEET_VALIDATE_PAGINATION_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: 'Only the person who ran `/sheet validate` can browse these pages.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (buttonInteraction.customId === VALIDATE_PREV_ID && currentPage > 0) {
      currentPage -= 1;
    } else if (buttonInteraction.customId === VALIDATE_NEXT_ID && currentPage < pages.length - 1) {
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

export function buildSheetValidationPassedEmbed(result: SheetValidationResult): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(`${CUSTOM_EMOJIS.done} Sheet Validation Passed`)
    .setDescription(
      `All **${result.playerCount}** player(s) across **${result.teamCount}** team(s) passed validation (**${result.format}**).`,
    )
    .setTimestamp();
}
