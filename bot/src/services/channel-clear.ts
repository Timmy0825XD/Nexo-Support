import type { GuildTextBasedChannel, Message } from 'discord.js';

const BULK_DELETE_LIMIT = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export class ChannelClearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelClearError';
  }
}

export interface ChannelClearResult {
  deleted: number;
  skippedPinned: number;
  skippedTooOld: number;
}

function isBulkDeletable(message: Message): boolean {
  return Date.now() - message.createdTimestamp < BULK_DELETE_MAX_AGE_MS;
}

async function deleteMessageBatch(
  channel: GuildTextBasedChannel,
  messages: Message[],
): Promise<{ deleted: number; skippedTooOld: number }> {
  if (messages.length === 0) {
    return { deleted: 0, skippedTooOld: 0 };
  }

  const bulkEligible = messages.length > 1 && messages.every(isBulkDeletable);
  if (bulkEligible) {
    await channel.bulkDelete(messages, true);
    return { deleted: messages.length, skippedTooOld: 0 };
  }

  let deleted = 0;
  let skippedTooOld = 0;

  for (const message of messages) {
    try {
      await message.delete();
      deleted += 1;
    } catch {
      skippedTooOld += 1;
    }
  }

  return { deleted, skippedTooOld };
}

async function collectRecentMessages(
  channel: GuildTextBasedChannel,
  predicate: (message: Message) => boolean,
  maxCount?: number,
): Promise<{ messages: Message[]; skippedPinned: number }> {
  const collected: Message[] = [];
  let skippedPinned = 0;
  let before: string | undefined;

  while (maxCount === undefined || collected.length < maxCount) {
    const batch = await channel.messages.fetch({
      limit: Math.min(
        BULK_DELETE_LIMIT,
        maxCount === undefined ? BULK_DELETE_LIMIT : maxCount - collected.length,
      ),
      before,
    });

    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (message.pinned) {
        skippedPinned += 1;
        continue;
      }
      if (!predicate(message)) {
        return { messages: collected, skippedPinned };
      }
      collected.push(message);
      if (maxCount !== undefined && collected.length >= maxCount) {
        return { messages: collected, skippedPinned };
      }
    }

    before = batch.last()?.id;
    if (!before) break;
  }

  return { messages: collected, skippedPinned };
}

export async function clearChannelByNumber(
  channel: GuildTextBasedChannel,
  number: number,
): Promise<ChannelClearResult> {
  if (number < 1 || number > 1000) {
    throw new ChannelClearError('Number must be between 1 and 1000.');
  }

  const { messages, skippedPinned } = await collectRecentMessages(
    channel,
    () => true,
    number,
  );

  let deleted = 0;
  let skippedTooOld = 0;

  for (let index = 0; index < messages.length; index += BULK_DELETE_LIMIT) {
    const chunk = messages.slice(index, index + BULK_DELETE_LIMIT);
    const result = await deleteMessageBatch(channel, chunk);
    deleted += result.deleted;
    skippedTooOld += result.skippedTooOld;
  }

  return { deleted, skippedPinned, skippedTooOld };
}

export async function clearChannelByDays(
  channel: GuildTextBasedChannel,
  days: number,
): Promise<ChannelClearResult> {
  if (days < 1 || days > 14) {
    throw new ChannelClearError('Days must be between 1 and 14 (Discord bulk delete limit).');
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const { messages, skippedPinned } = await collectRecentMessages(
    channel,
    (message) => message.createdTimestamp >= cutoff,
  );

  let deleted = 0;
  let skippedTooOld = 0;

  for (let index = 0; index < messages.length; index += BULK_DELETE_LIMIT) {
    const chunk = messages.slice(index, index + BULK_DELETE_LIMIT);
    const result = await deleteMessageBatch(channel, chunk);
    deleted += result.deleted;
    skippedTooOld += result.skippedTooOld;
  }

  return { deleted, skippedPinned, skippedTooOld };
}
