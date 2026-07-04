import type { EmbedBuilder, User } from 'discord.js';
import { embedField, successEmbed } from './embeds.js';
import { CUSTOM_EMOJIS } from '../constants/emojis.js';
import { formatUser } from './guild-display.js';

export function formatDiscordTag(user: User): string {
  if (user.discriminator && user.discriminator !== '0') {
    return user.tag;
  }
  return `@${user.username}`;
}

export function buildUserBannedEmbed(params: {
  targetUser: User | null;
  userId: string;
  durationLabel: string;
  expiresAt: Date | null;
  reason: string;
}): EmbedBuilder {
  const mention = formatUser(params.userId);
  const tag = params.targetUser ? formatDiscordTag(params.targetUser) : '*Unknown user*';
  const accountCreated = params.targetUser
    ? `<t:${Math.floor(params.targetUser.createdTimestamp / 1000)}:F> (<t:${Math.floor(params.targetUser.createdTimestamp / 1000)}:R>)`
    : '*Could not resolve account creation date.*';

  const durationValue = params.expiresAt
    ? `${params.durationLabel}\nExpires: <t:${Math.floor(params.expiresAt.getTime() / 1000)}:F>`
    : params.durationLabel;

  const embed = successEmbed('User Banned', `${CUSTOM_EMOJIS.done} ${mention} has been banned successfully.`).addFields(
    embedField('Player', tag, true),
    embedField('User ID', params.userId, true),
    embedField('Account Created', accountCreated, false),
    embedField('Duration', durationValue, false),
  );

  if (params.reason.trim()) {
    embed.addFields(embedField('Reason', params.reason, false));
  }

  if (params.targetUser) {
    embed.setThumbnail(params.targetUser.displayAvatarURL({ size: 256 }));
  }

  return embed;
}
