import type { Guild } from 'discord.js';
import { ChannelType } from 'discord.js';

export interface GuildMemberStats {
  total: number;
  humans: number;
  bots: number;
}

export interface GuildChannelStats {
  text: number;
  voice: number;
  categories: number;
}

export interface GuildEmojiStats {
  total: number;
  animated: number;
  static: number;
}

export async function fetchGuildMemberStats(guild: Guild): Promise<GuildMemberStats> {
  const members = await guild.members.fetch();
  let bots = 0;
  for (const member of members.values()) {
    if (member.user.bot) bots += 1;
  }
  const total = members.size;
  return { total, humans: total - bots, bots };
}

export function getGuildChannelStats(guild: Guild): GuildChannelStats {
  let text = 0;
  let voice = 0;
  let categories = 0;

  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
      text += 1;
    } else if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
      voice += 1;
    } else if (channel.type === ChannelType.GuildCategory) {
      categories += 1;
    }
  }

  return { text, voice, categories };
}

export function getGuildEmojiStats(guild: Guild): GuildEmojiStats {
  const emojis = guild.emojis.cache;
  let animated = 0;
  for (const emoji of emojis.values()) {
    if (emoji.animated) animated += 1;
  }
  const total = emojis.size;
  return { total, animated, static: total - animated };
}

export async function getGuildBoostStats(guild: Guild): Promise<{
  level: number;
  count: number;
  boosters: number;
}> {
  const fetched = guild.available ? guild : await guild.fetch();
  return {
    level: fetched.premiumTier,
    count: fetched.premiumSubscriptionCount ?? 0,
    boosters: fetched.members.cache.filter((m) => m.premiumSince).size,
  };
}
