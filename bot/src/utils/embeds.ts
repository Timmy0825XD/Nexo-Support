import { EmbedBuilder, type APIEmbedField } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';

type EmbedFieldInput = Omit<APIEmbedField, 'name'> & { name: string };

const DISCORD_EMOJI_LEADING = /^(<a?:\w+:\d+>)/;

/** Drop a leading emoji from the description when the title already starts with the same one. */
export function stripDuplicateStatusEmoji(title: string, description: string): string {
  const titleEmoji = title.match(DISCORD_EMOJI_LEADING)?.[1];
  if (!titleEmoji) return description;

  const trimmed = description.trimStart();
  if (!trimmed.startsWith(titleEmoji)) return description;

  return trimmed.slice(titleEmoji.length).trimStart();
}

export function successEmbed(title: string, description?: string) {
  const fullTitle = `${CUSTOM_EMOJIS.done} ${title}`;
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(fullTitle)
    .setTimestamp();

  if (description) embed.setDescription(stripDuplicateStatusEmoji(fullTitle, description));
  return embed;
}

export function errorEmbed(title: string, description?: string) {
  const fullTitle = `${CUSTOM_EMOJIS.error} ${title}`;
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.error)
    .setTitle(fullTitle)
    .setTimestamp();

  if (description) embed.setDescription(stripDuplicateStatusEmoji(fullTitle, description));
  return embed;
}

export function infoEmbed(title: string, description?: string) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(title)
    .setTimestamp();

  if (description) embed.setDescription(stripDuplicateStatusEmoji(title, description));
  return embed;
}

export function embedField(name: string, value: string, inline = true): EmbedFieldInput {
  return { name, value, inline };
}

export { CUSTOM_EMOJIS, EMBED_COLORS };
