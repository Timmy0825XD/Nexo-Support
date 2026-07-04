import type { Guild, GuildEmoji, User } from 'discord.js';
import { infoEmbed, successEmbed, embedField } from './embeds.js';
import {
  formatScheduleDiscordTimestamp,
  formatScheduleUtcLine,
} from './schedule-display.js';

const CUSTOM_EMOJI_PATTERN = /^<a?:(\w+):(\d{17,20})>$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export interface ParsedCustomEmoji {
  id: string;
  name: string;
  animated: boolean;
  url: string;
}

export function parseCustomEmojiInput(input: string): ParsedCustomEmoji | null {
  const trimmed = input.trim();
  const match = trimmed.match(CUSTOM_EMOJI_PATTERN);
  if (match) {
    const animated = trimmed.startsWith('<a:');
    const name = match[1]!;
    const id = match[2]!;
    const extension = animated ? 'gif' : 'png';
    return {
      id,
      name,
      animated,
      url: `https://cdn.discordapp.com/emojis/${id}.${extension}`,
    };
  }

  if (SNOWFLAKE_PATTERN.test(trimmed)) {
    return {
      id: trimmed,
      name: 'emoji',
      animated: false,
      url: `https://cdn.discordapp.com/emojis/${trimmed}.png`,
    };
  }

  return null;
}

export function emojiToTwemojiUrl(emoji: string): string | null {
  const codepoints = [...emoji.trim()]
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join('-');

  if (!codepoints) return null;
  return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codepoints}.png`;
}

export function parseRandomOptions(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function pickRandomOptions(options: string[], count: number): string[] {
  const pool = [...options];
  const picked: string[] = [];

  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const choiceIndex = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(choiceIndex, 1)[0]!);
  }

  return picked;
}

export function tossCoin(): 'Heads' | 'Tails' {
  return Math.random() < 0.5 ? 'Heads' : 'Tails';
}

export function buildUtcUtilityEmbed(params: {
  hour: number;
  minute: number;
  day: number;
  month: number;
  year: number;
}) {
  const utcDate = new Date(
    Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute, 0, 0),
  );

  if (
    utcDate.getUTCFullYear() !== params.year ||
    utcDate.getUTCMonth() !== params.month - 1 ||
    utcDate.getUTCDate() !== params.day ||
    utcDate.getUTCHours() !== params.hour ||
    utcDate.getUTCMinutes() !== params.minute
  ) {
    throw new Error('The provided date and time are not valid in UTC.');
  }

  return infoEmbed('UTC Time', [
    `**UTC Time:** ${formatScheduleUtcLine(utcDate)}`,
    `**Local Time:** ${formatScheduleDiscordTimestamp(utcDate)}`,
  ].join('\n'));
}

export function buildAvatarEmbed(user: User) {
  const avatarUrl = user.displayAvatarURL({ size: 4096, extension: 'png' });
  return infoEmbed(`${user.tag}'s Avatar`, `[Download avatar](${avatarUrl})`)
    .setImage(avatarUrl)
    .addFields(
      embedField('User', `<@${user.id}>`, true),
      embedField('Username', user.tag, true),
    );
}

export function buildTossEmbed(result: 'Heads' | 'Tails') {
  return successEmbed('Coin Toss', `The coin landed on **${result}**!`);
}

export function buildRandomEmbed(choices: string[]) {
  const body =
    choices.length === 1
      ? `**${choices[0]}**`
      : choices.map((choice, index) => `${index + 1}. **${choice}**`).join('\n');

  return successEmbed(
    choices.length === 1 ? 'Random Pick' : 'Random Picks',
    body,
  );
}

export function buildEnlargeEmbed(params: {
  label: string;
  imageUrl: string;
  animated?: boolean;
}) {
  return infoEmbed('Enlarged Emoji', params.label)
    .setImage(params.imageUrl)
    .addFields(embedField('Animated', params.animated ? 'Yes' : 'No', true));
}

export function buildEmojiStealEmbed(emoji: GuildEmoji) {
  return infoEmbed(
    'Emoji Removed',
    `Custom emoji **:${emoji.name}:** was deleted from this server.`,
  )
    .setImage(emoji.url)
    .addFields(
      embedField('Name', emoji.name ?? 'unknown', true),
      embedField('ID', emoji.id, true),
      embedField('Animated', emoji.animated ? 'Yes' : 'No', true),
    );
}

export async function resolveGuildEmoji(guild: Guild, emojiId: string): Promise<GuildEmoji | null> {
  return guild.emojis.cache.get(emojiId) ?? (await guild.emojis.fetch(emojiId).catch(() => null));
}

export function buildClearResultDescription(result: {
  deleted: number;
  skippedPinned: number;
  skippedTooOld: number;
}): string {
  const lines = [`**${result.deleted}** message(s) deleted.`];

  if (result.skippedPinned > 0) {
    lines.push(`**${result.skippedPinned}** pinned message(s) were skipped.`);
  }
  if (result.skippedTooOld > 0) {
    lines.push(
      `**${result.skippedTooOld}** message(s) were older than 14 days and could not be bulk-deleted.`,
    );
  }

  return lines.join('\n');
}
