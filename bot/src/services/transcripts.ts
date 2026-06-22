import { createTranscript, ExportReturnType } from 'discord-html-transcripts';
import {
  AttachmentBuilder,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { TournamentRow } from '../types/tournament.js';

function buildTranscriptFilename(matchLabel: string): string {
  const safeName = matchLabel
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 60);
  return `${safeName || 'match'}-transcript.html`;
}

async function sendTranscriptAttachment(
  guild: Guild,
  channelId: string,
  attachment: AttachmentBuilder,
  content: string,
): Promise<void> {
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) {
    console.warn(`[transcripts] Channel ${channelId} is not a guild text channel.`);
    return;
  }

  await channel.send({
    content,
    files: [attachment],
  });
}

export async function archiveTranscript(params: {
  guild: Guild;
  channel: TextChannel;
  tournament: TournamentRow;
  guildConfig: GuildRow | null;
  matchLabel: string;
  challongeMatchId: string;
}): Promise<void> {
  const attachment = await createTranscript(params.channel as never, {
    limit: -1,
    returnType: ExportReturnType.Attachment,
    filename: buildTranscriptFilename(params.matchLabel),
    saveImages: true,
    poweredBy: false,
    footerText: 'Exported {number} message{s}',
  });

  const discordAttachment = attachment as AttachmentBuilder;

  const content = [
    `**${params.matchLabel}**`,
    `Server: **${params.guild.name}** · Channel: ${params.channel}`,
    `Tournament: **${params.tournament.name}** | Match ID: \`${params.challongeMatchId}\``,
  ].join('\n');

  await sendTranscriptAttachment(
    params.guild,
    params.tournament.transcript_channel_id,
    discordAttachment,
    content,
  );

  if (params.guildConfig?.transcript_logs_channel_id) {
    await sendTranscriptAttachment(
      params.guild,
      params.guildConfig.transcript_logs_channel_id,
      discordAttachment,
      content,
    );
  }
}

export async function archiveValidationTranscript(params: {
  guild: Guild;
  channel: TextChannel;
  guildConfig: GuildRow | null;
  teamLabel: string;
  transcriptChannelId: string;
}): Promise<void> {
  const attachment = await createTranscript(params.channel as never, {
    limit: -1,
    returnType: ExportReturnType.Attachment,
    filename: buildTranscriptFilename(`validation-${params.teamLabel}`),
    saveImages: true,
    poweredBy: false,
    footerText: 'Exported {number} message{s}',
  });

  const discordAttachment = attachment as AttachmentBuilder;

  const content = [
    `**Role validation — ${params.teamLabel}**`,
    `Server: **${params.guild.name}** · Channel: ${params.channel}`,
    'Support ticket resolved.',
  ].join('\n');

  await sendTranscriptAttachment(
    params.guild,
    params.transcriptChannelId,
    discordAttachment,
    content,
  );

  if (params.guildConfig?.transcript_logs_channel_id) {
    await sendTranscriptAttachment(
      params.guild,
      params.guildConfig.transcript_logs_channel_id,
      discordAttachment,
      content,
    );
  }
}
