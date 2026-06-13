import { EmbedBuilder, type APIEmbedField } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';

type EmbedFieldInput = Omit<APIEmbedField, 'name'> & { name: string };

export function successEmbed(title: string, description?: string) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(`${CUSTOM_EMOJIS.done} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  return embed;
}

export function errorEmbed(title: string, description?: string) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.error)
    .setTitle(`${CUSTOM_EMOJIS.error} ${title}`)
    .setTimestamp();

  if (description) embed.setDescription(description);
  return embed;
}

export function infoEmbed(title: string, description?: string) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(title)
    .setTimestamp();

  if (description) embed.setDescription(description);
  return embed;
}

export function embedField(name: string, value: string, inline = true): EmbedFieldInput {
  return { name, value, inline };
}

export { CUSTOM_EMOJIS, EMBED_COLORS };
