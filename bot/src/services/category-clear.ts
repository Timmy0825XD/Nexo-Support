import type { CategoryChannel, Guild, GuildBasedChannel } from 'discord.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

export class CategoryClearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryClearError';
  }
}

export interface CategoryChildChannel {
  id: string;
  name: string;
  type: ChannelType;
}

export interface CategoryChannelDeleteResult {
  channelId: string;
  channelName: string;
  deleted: boolean;
  error?: string;
}

const CHANNEL_TYPE_LABELS: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildDirectory]: 'Directory',
};

export function formatChannelTypeLabel(type: ChannelType): string {
  return CHANNEL_TYPE_LABELS[type] ?? 'Channel';
}

export function listCategoryChildChannels(guild: Guild, categoryId: string): CategoryChildChannel[] {
  return guild.channels.cache
    .filter((channel) => channel.parentId === categoryId)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function assertBotCanDeleteCategoryChannels(
  guild: Guild,
  channels: CategoryChildChannel[],
): void {
  const me = guild.members.me;
  if (!me) {
    throw new CategoryClearError('Bot member is not available in this server.');
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new CategoryClearError('I need the **Manage Channels** permission in this server.');
  }

  const blocked = channels.filter((channel) => {
    const permissions = me.permissionsIn(channel.id);
    return (
      !permissions.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.ManageChannels)
    );
  });

  if (blocked.length > 0) {
    const names = blocked.slice(0, 5).map((channel) => `#${channel.name}`).join(', ');
    const suffix = blocked.length > 5 ? ` (+${blocked.length - 5} more)` : '';
    throw new CategoryClearError(
      `I need View Channel and Manage Channels in: ${names}${suffix}.`,
    );
  }
}

export async function deleteCategoryChildChannels(
  guild: Guild,
  channels: CategoryChildChannel[],
): Promise<CategoryChannelDeleteResult[]> {
  const results: CategoryChannelDeleteResult[] = [];

  for (const entry of channels) {
    const channel = guild.channels.cache.get(entry.id) as GuildBasedChannel | undefined;
    if (!channel || channel.parentId === null) {
      results.push({
        channelId: entry.id,
        channelName: entry.name,
        deleted: false,
        error: 'Channel is no longer available.',
      });
      continue;
    }

    try {
      await channel.delete(`Category cleared by utility command`);
      results.push({
        channelId: entry.id,
        channelName: entry.name,
        deleted: true,
      });
    } catch (error) {
      results.push({
        channelId: entry.id,
        channelName: entry.name,
        deleted: false,
        error: error instanceof Error ? error.message : 'Failed to delete channel.',
      });
    }
  }

  return results;
}
