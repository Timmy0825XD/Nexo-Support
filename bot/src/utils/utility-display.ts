import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type CategoryChannel,
  type EmbedBuilder,
  type Guild,
} from 'discord.js';
import type { CategoryChannelDeleteResult, CategoryChildChannel } from '../services/category-clear.js';
import { formatChannelTypeLabel } from '../services/category-clear.js';
import { embedField, errorEmbed, infoEmbed, successEmbed } from './embeds.js';
import { CUSTOM_EMOJIS } from '../constants/emojis.js';

export const CLEAR_CATEGORY_CONFIRM_ID = 'utility:clear_category:confirm';
export const CLEAR_CATEGORY_CANCEL_ID = 'utility:clear_category:cancel';
export const CLEAR_CATEGORY_TIMEOUT_MS = 60_000;

function formatChannelList(channels: CategoryChildChannel[]): string {
  if (channels.length === 0) {
    return '*This category has no channels.*';
  }

  const lines = channels.slice(0, 20).map(
    (channel) => `• #${channel.name} (${formatChannelTypeLabel(channel.type)})`,
  );
  if (channels.length > 20) {
    lines.push(`*…and ${channels.length - 20} more.*`);
  }
  return lines.join('\n');
}

export function buildClearCategoryConfirmEmbed(params: {
  category: CategoryChannel;
  channels: CategoryChildChannel[];
}): EmbedBuilder {
  return infoEmbed(
    'Clear Category — Confirmation Required',
    [
      `${CUSTOM_EMOJIS.alert} **This action cannot be undone.**`,
      `All **${params.channels.length}** channel(s) under **${params.category.name}** will be permanently deleted.`,
      '',
      '*The category itself will remain empty.*',
    ].join('\n'),
  ).addFields(
    embedField('Category', params.category.name, true),
    embedField('Channels', String(params.channels.length), true),
    embedField('Targets', formatChannelList(params.channels), false),
  );
}

export function buildClearCategoryCancelledEmbed(category: CategoryChannel): EmbedBuilder {
  return errorEmbed(
    'Clear Category Cancelled',
    `No channels were deleted in **${category.name}**.`,
  );
}

export function buildClearCategoryProgressEmbed(category: CategoryChannel): EmbedBuilder {
  return infoEmbed(
    'Clearing Category…',
    `Deleting all channels under **${category.name}**. This may take a moment.`,
  );
}

export function buildClearCategoryResultEmbed(params: {
  category: CategoryChannel;
  results: CategoryChannelDeleteResult[];
}): EmbedBuilder {
  const deletedCount = params.results.filter((result) => result.deleted).length;
  const failed = params.results.filter((result) => !result.deleted);

  const lines = params.results.slice(0, 15).map((result) => {
    if (!result.deleted) {
      return `• #${result.channelName} — ${CUSTOM_EMOJIS.error} ${result.error ?? 'Failed to delete.'}`;
    }
    return `• #${result.channelName} — deleted`;
  });

  if (params.results.length > 15) {
    lines.push(`*…and ${params.results.length - 15} more channel(s).*`);
  }

  const embed = successEmbed(
    'Category Cleared',
    `${CUSTOM_EMOJIS.done} **${params.category.name}** is now empty. **${deletedCount}** channel(s) deleted.`,
  ).addFields(
    embedField('Channels Deleted', String(deletedCount), true),
    embedField('Channels Failed', String(failed.length), true),
    embedField('Results', lines.join('\n') || '*No channels processed.*', false),
  );

  return embed;
}

export function buildClearCategoryConfirmComponents(
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CLEAR_CATEGORY_CONFIRM_ID)
      .setLabel('Confirm Delete')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(CLEAR_CATEGORY_CANCEL_ID)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export function resolveCategoryFromOption(
  guild: Guild,
  categoryId: string,
): CategoryChannel | null {
  const channel = guild.channels.cache.get(categoryId);
  if (!channel || channel.type !== ChannelType.GuildCategory) {
    return null;
  }
  return channel;
}
