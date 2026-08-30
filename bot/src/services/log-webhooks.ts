import {
  ChannelType,
  type AttachmentBuilder,
  type Client,
  type EmbedBuilder,
  type NewsChannel,
  type TextChannel,
  type Webhook,
} from 'discord.js';

export type LogWebhookPersona =
  | 'bot_logs'
  | 'ticket_system'
  | 'score_upload'
  | 'challonge_logs'
  | 'transcripts';

export const LOG_WEBHOOK_USERNAMES: Record<LogWebhookPersona, string> = {
  bot_logs: 'Bot Logs',
  ticket_system: 'Ticket System',
  score_upload: 'Score Upload',
  challonge_logs: 'Challonge Logs',
  transcripts: 'Transcripts',
};

const WEBHOOK_INTERNAL_NAME = 'Nexo Support Logs';
const webhookByChannelId = new Map<string, Webhook>();

function isWebhookChannel(channel: unknown): channel is TextChannel | NewsChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
  );
}

async function getOrCreateWebhook(client: Client, channel: TextChannel | NewsChannel): Promise<Webhook> {
  const cached = webhookByChannelId.get(channel.id);
  if (cached) return cached;

  const botId = client.user?.id;
  const existing = (await channel.fetchWebhooks()).find((hook) => hook.owner?.id === botId);
  const webhook =
    existing ??
    (await channel.createWebhook({
      name: WEBHOOK_INTERNAL_NAME,
      avatar: client.user?.displayAvatarURL({ size: 256 }),
      reason: 'Nexo Support audit log personas',
    }));

  webhookByChannelId.set(channel.id, webhook);
  return webhook;
}

export async function sendLogWebhook(params: {
  client: Client;
  channelId: string;
  persona: LogWebhookPersona;
  embeds?: EmbedBuilder[];
  content?: string;
  files?: AttachmentBuilder[];
}): Promise<boolean> {
  const channel = await params.client.channels.fetch(params.channelId);
  if (!isWebhookChannel(channel)) {
    console.warn(`[log-webhooks] Channel ${params.channelId} cannot host webhooks`);
    return false;
  }

  const payload = {
    username: LOG_WEBHOOK_USERNAMES[params.persona],
    avatarURL: params.client.user?.displayAvatarURL({ size: 256 }),
    allowedMentions: { parse: [] as const },
    embeds: params.embeds,
    content: params.content,
    files: params.files,
  };

  try {
    const webhook = await getOrCreateWebhook(params.client, channel);
    await webhook.send(payload);
    return true;
  } catch {
    webhookByChannelId.delete(params.channelId);
    try {
      const webhook = await getOrCreateWebhook(params.client, channel);
      await webhook.send(payload);
      return true;
    } catch (error) {
      console.error(`[log-webhooks] Webhook send failed in ${params.channelId}:`, error);
      try {
        await channel.send({
          content: params.content,
          embeds: params.embeds,
          files: params.files,
          allowedMentions: { parse: [] },
        });
        return true;
      } catch (fallbackError) {
        console.error(`[log-webhooks] Fallback channel.send failed in ${params.channelId}:`, fallbackError);
        return false;
      }
    }
  }
}
