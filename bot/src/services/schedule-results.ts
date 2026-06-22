import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AttachmentBuilder,
  ChannelType,
  type Attachment,
  type Client,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { MatchScheduleRow } from '../types/match.js';
import type { ScheduleResultRow } from '../types/schedule-result.js';
import { SCHEDULE_RESULT_COLUMNS } from '../types/schedule-result.js';
import type { ScheduleRow, StaffAssignmentRow } from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import { buildScheduleResultEmbed, buildScheduleResultTicketContent } from '../utils/schedule-result-display.js';
import { resolveTournamentFormat } from '../utils/schedule-captain-display.js';
import { parseScheduleUtcInstant } from '../utils/schedule-datetime.js';
import { resolveWinnerSideFromScores } from './matches.js';
import { getScheduleAssignments } from './schedules.js';
import { resolveCaptainsForMatchTeams } from './sheets.js';

export class ScheduleResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleResultError';
  }
}

export class ScheduleResultAlreadyExistsError extends Error {
  constructor() {
    super('A result has already been declared for this schedule.');
    this.name = 'ScheduleResultAlreadyExistsError';
  }
}

export class ScheduleResultNotFoundError extends Error {
  constructor(message = 'No result was found for this schedule.') {
    super(message);
    this.name = 'ScheduleResultNotFoundError';
  }
}

const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

function assertScheduleTimeHasPassed(scheduledAt: string | Date): void {
  const scheduledMs = parseScheduleUtcInstant(scheduledAt).getTime();
  if (Number.isNaN(scheduledMs)) {
    throw new ScheduleResultError('The schedule datetime is invalid.');
  }
  if (Date.now() < scheduledMs) {
    throw new ScheduleResultError(
      'Results cannot be declared before the scheduled match time has passed.',
    );
  }
}

function validateProofAttachments(attachments: Attachment[]): Attachment[] {
  const valid = attachments.filter(Boolean);
  if (valid.length === 0) {
    throw new ScheduleResultError('Attach at least one proof image (image1–image10).');
  }
  if (valid.length > 10) {
    throw new ScheduleResultError('You can attach up to 10 proof images.');
  }

  for (const attachment of valid) {
    if (!IMAGE_CONTENT_TYPES.has(attachment.contentType ?? '')) {
      throw new ScheduleResultError(
        `Invalid proof image "${attachment.name}". Only PNG, JPEG, WEBP, and GIF are allowed.`,
      );
    }
  }

  return valid;
}

async function resolveDiscordUsername(guild: Guild, userId: string): Promise<string> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) return member.user.username;
  const user = await guild.client.users.fetch(userId).catch(() => null);
  return user?.username ?? 'unknown';
}

export async function resolveScheduleMatchCaptains(
  tournament: Pick<TournamentRow, 'sheet_link'>,
  match: Pick<MatchScheduleRow, 'team1_name' | 'team2_name'>,
): Promise<{ team1CaptainId: string | null; team2CaptainId: string | null }> {
  return resolveCaptainsForMatchTeams(
    tournament.sheet_link,
    match.team1_name,
    match.team2_name,
  );
}

export async function getScheduleResultByScheduleId(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<ScheduleResultRow | null> {
  const { data, error } = await supabase
    .from('schedule_results')
    .select(SCHEDULE_RESULT_COLUMNS)
    .eq('schedule_id', scheduleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load schedule result: ${error.message}`);
  }

  return (data as ScheduleResultRow | null) ?? null;
}

async function deleteDiscordMessage(
  client: Client,
  channelId: string | null | undefined,
  messageId: string | null | undefined,
): Promise<void> {
  if (!channelId || !messageId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const message = await channel.messages.fetch(messageId);
    await message.delete();
  } catch {
    // Message may already be deleted.
  }
}

export async function deleteScheduleResultMessage(
  client: Client,
  result: Pick<
    ScheduleResultRow,
    'result_channel_id' | 'results_message_id' | 'ticket_message_id'
  >,
  ticketChannelId?: string | null,
): Promise<void> {
  await deleteDiscordMessage(client, result.result_channel_id, result.results_message_id);
  if (result.ticket_message_id && ticketChannelId) {
    await deleteDiscordMessage(client, ticketChannelId, result.ticket_message_id);
  }
}

export async function declareScheduleResult(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  assignments: StaffAssignmentRow[];
  team1Score: number;
  team2Score: number;
  notes?: string;
  proofAttachments: Attachment[];
  declaredByUserId: string;
}): Promise<ScheduleResultRow> {
  assertScheduleTimeHasPassed(params.schedule.scheduled_at);

  const existing = await getScheduleResultByScheduleId(params.supabase, params.schedule.id);
  if (existing) {
    throw new ScheduleResultAlreadyExistsError();
  }

  const resultChannelId = params.tournament.result_channel_id;
  if (!resultChannelId) {
    throw new ScheduleResultError(
      'This tournament has no results channel configured. Set one with `/tournament edit`.',
    );
  }

  const resultChannel = await params.guild.channels.fetch(resultChannelId);
  if (!resultChannel?.isTextBased() || resultChannel.type !== ChannelType.GuildText) {
    throw new ScheduleResultError('The tournament results channel is unavailable.');
  }

  const winnerSide = (() => {
    try {
      return resolveWinnerSideFromScores(params.team1Score, params.team2Score);
    } catch (error) {
      throw new ScheduleResultError(
        error instanceof Error ? error.message : 'Invalid scores provided.',
      );
    }
  })();
  const proofAttachments = validateProofAttachments(params.proofAttachments);
  const declaredAt = new Date();
  const captains = await resolveScheduleMatchCaptains(params.tournament, params.match);
  const declaredByUsername = await resolveDiscordUsername(params.guild, params.declaredByUserId);
  const tournamentFormat = await resolveTournamentFormat(params.tournament.sheet_link);

  await Promise.all(
    [captains.team1CaptainId, captains.team2CaptainId]
      .filter((id): id is string => Boolean(id))
      .map((id) => params.guild.members.fetch(id).catch(() => null)),
  );

  const embedParams = {
    guild: params.guild,
    tournament: params.tournament,
    match: params.match,
    scheduledAt: params.schedule.scheduled_at,
    declaredAt,
    declaredByUsername,
    tournamentFormat,
    ticketChannelId: params.schedule.ticket_channel_id,
    team1CaptainId: captains.team1CaptainId,
    team2CaptainId: captains.team2CaptainId,
    assignments: params.assignments,
    team1Score: params.team1Score,
    team2Score: params.team2Score,
    winnerSide,
    notes: params.notes,
    thumbnailUrl: params.schedule.thumbnail_url,
  };

  const ticketChannel = await params.guild.channels.fetch(params.schedule.ticket_channel_id);
  if (!ticketChannel?.isTextBased() || ticketChannel.type !== ChannelType.GuildText) {
    throw new ScheduleResultError('The match ticket channel is unavailable.');
  }

  const captainIds = [captains.team1CaptainId, captains.team2CaptainId].filter(
    (id): id is string => Boolean(id),
  );
  const ticketNotification = buildScheduleResultTicketContent(captainIds);
  const ticketFiles = proofAttachments.map(
    (attachment, index) =>
      new AttachmentBuilder(attachment.url, { name: attachment.name ?? `proof-${index + 1}.png` }),
  );

  const ticketMessage = await (ticketChannel as TextChannel).send({
    content: ticketNotification.content,
    embeds: [buildScheduleResultEmbed(embedParams)],
    files: ticketFiles,
    allowedMentions: ticketNotification.mentionUserIds.length
      ? { users: ticketNotification.mentionUserIds }
      : undefined,
  });

  const transcriptMessageUrl = `https://discord.com/channels/${params.guild.id}/${params.schedule.ticket_channel_id}/${ticketMessage.id}`;

  const resultsEmbed = buildScheduleResultEmbed({
    ...embedParams,
    titleMessageUrl: transcriptMessageUrl,
  });

  const files = proofAttachments.map(
    (attachment, index) =>
      new AttachmentBuilder(attachment.url, { name: attachment.name ?? `proof-${index + 1}.png` }),
  );

  const resultsMessage = await (resultChannel as TextChannel)
    .send({
      embeds: [resultsEmbed],
      files,
    })
    .catch(async (error) => {
      await ticketMessage.delete().catch(() => undefined);
      throw error;
    });

  await ticketMessage
    .edit({
      embeds: [
        buildScheduleResultEmbed({
          ...embedParams,
          titleMessageUrl: transcriptMessageUrl,
        }),
      ],
    })
    .catch(() => undefined);

  const proofImageUrls = resultsMessage.attachments.map((attachment) => attachment.url);
  const rowTimestamps = new Date().toISOString();

  const row = {
    id: crypto.randomUUID(),
    schedule_id: params.schedule.id,
    tournament_id: params.tournament.id,
    match_id: params.match.id,
    team1_score: params.team1Score,
    team2_score: params.team2Score,
    winner_side: winnerSide,
    notes: params.notes?.trim() || null,
    proof_image_urls: proofImageUrls,
    results_message_id: resultsMessage.id,
    ticket_message_id: ticketMessage.id,
    result_channel_id: resultChannelId,
    declared_by_discord_user_id: params.declaredByUserId,
    declared_at: declaredAt.toISOString(),
    created_at: rowTimestamps,
    updated_at: rowTimestamps,
  };

  const { data, error } = await params.supabase
    .from('schedule_results')
    .insert(row)
    .select(SCHEDULE_RESULT_COLUMNS)
    .single();

  if (error) {
    await resultsMessage.delete().catch(() => undefined);
    await ticketMessage.delete().catch(() => undefined);
    throw new Error(`Failed to save schedule result: ${error.message}`);
  }

  return data as ScheduleResultRow;
}

export async function deleteScheduleResult(params: {
  supabase: SupabaseClient;
  client: Client;
  scheduleId: string;
  ticketChannelId?: string | null;
}): Promise<ScheduleResultRow> {
  const result = await getScheduleResultByScheduleId(params.supabase, params.scheduleId);
  if (!result) {
    throw new ScheduleResultNotFoundError();
  }

  await deleteScheduleResultMessage(
    params.client,
    result,
    params.ticketChannelId ?? null,
  );

  const { error } = await params.supabase.from('schedule_results').delete().eq('id', result.id);

  if (error) {
    throw new Error(`Failed to delete schedule result: ${error.message}`);
  }

  return result;
}

export async function deleteScheduleResultForSchedule(params: {
  supabase: SupabaseClient;
  client: Client;
  scheduleId: string;
  ticketChannelId?: string | null;
}): Promise<void> {
  const result = await getScheduleResultByScheduleId(params.supabase, params.scheduleId);
  if (!result) return;

  await deleteScheduleResultMessage(
    params.client,
    result,
    params.ticketChannelId ?? null,
  );
  await params.supabase.from('schedule_results').delete().eq('id', result.id);
}

export async function getScheduleResultCaptainIds(
  tournament: TournamentRow,
  match: Pick<MatchScheduleRow, 'team1_name' | 'team2_name'>,
): Promise<string[]> {
  const captains = await resolveScheduleMatchCaptains(tournament, match);
  return [captains.team1CaptainId, captains.team2CaptainId].filter((id): id is string =>
    Boolean(id),
  );
}

export async function getScheduleResultAssignments(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<StaffAssignmentRow[]> {
  return getScheduleAssignments(supabase, scheduleId);
}
