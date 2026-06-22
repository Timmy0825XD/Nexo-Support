import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AttachmentBuilder,
  ChannelType,
  type Client,
  type EmbedBuilder,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { MatchScheduleRow } from '../types/match.js';
import type {
  ResignRoleChoice,
  ScheduleRow,
  ScheduleStaffRole,
  ScheduleWithDetails,
  StaffAssignmentRow,
  UnassignedFilter,
} from '../types/schedule.js';
import {
  SCHEDULE_COLUMNS,
  STAFF_ASSIGNMENT_COLUMNS,
} from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import { getActiveAssignments, hasActiveRoleAssignment } from '../guards/schedule-permissions.js';
import {
  areScheduleAssignmentButtonsActive,
  buildScheduleAssignmentComponents,
  buildScheduleChannelEmbed,
  buildScheduleNotificationContent,
  buildScheduleReminderComponents,
  buildScheduleStaffChatCreateMessage,
  buildStaffAssignedMessage,
  buildStaffResignedMessage,
  buildTicketScheduleEmbed,
  FAILED_ATTENDANCE_CONFIRM_REASON,
  nextScheduleAssignmentButtonsExpiresAt,
  parseCaptainIdsFromScheduleEmbedDescription,
  parseCaptainIdsFromScheduleMessageContent,
  type ScheduleEmbedParams,
} from '../utils/schedule-display.js';
import { logScheduleStaffAssigned } from './guild-logs.js';
import { getGuildConfig } from './guilds.js';
import { deleteScheduleResultForSchedule } from './schedule-results.js';
import {
  applyScheduledPrefix,
  removeScheduledPrefix,
} from '../utils/schedule-channel-name.js';
import { generateScheduleThumbnailBuffer } from '../utils/schedule-thumbnail.js';
import { parseScheduleUtcInstant } from '../utils/schedule-datetime.js';
import { applyOpenTicketPermissions } from '../utils/ticket-permissions.js';
import { resolveCaptainsForMatchTeams } from './sheets.js';
import { resolveTournamentFormat } from '../utils/schedule-captain-display.js';

async function resolveCaptainIds(
  tournament: TournamentRow,
  match: Pick<MatchScheduleRow, 'team1_name' | 'team2_name'>,
): Promise<string[]> {
  const captains = await resolveMatchCaptains(tournament, match);
  return [captains.team1CaptainId, captains.team2CaptainId].filter((id): id is string =>
    Boolean(id),
  );
}

async function resolveMatchCaptains(
  tournament: TournamentRow,
  match: Pick<MatchScheduleRow, 'team1_name' | 'team2_name'>,
): Promise<{ team1CaptainId: string | null; team2CaptainId: string | null }> {
  return resolveCaptainsForMatchTeams(
    tournament.sheet_link,
    match.team1_name,
    match.team2_name,
  );
}

async function readCaptainFallbackFromTicketMessage(params: {
  guild: Guild;
  ticketChannelId: string;
  ticketMessageId: string | null;
}): Promise<{ team1CaptainId: string | null; team2CaptainId: string | null }> {
  if (!params.ticketMessageId) {
    return { team1CaptainId: null, team2CaptainId: null };
  }

  try {
    const channel = await params.guild.channels.fetch(params.ticketChannelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      return { team1CaptainId: null, team2CaptainId: null };
    }

    const message = await channel.messages.fetch(params.ticketMessageId);
    const embedDescription = message.embeds[0]?.description;
    const fromEmbed = embedDescription
      ? parseCaptainIdsFromScheduleEmbedDescription(embedDescription)
      : { team1CaptainId: null, team2CaptainId: null };

    if (fromEmbed.team1CaptainId && fromEmbed.team2CaptainId) {
      return fromEmbed;
    }

    const mentionIds = parseCaptainIdsFromScheduleMessageContent(message.content ?? '');
    if (mentionIds.length >= 2) {
      return {
        team1CaptainId: fromEmbed.team1CaptainId ?? mentionIds[0] ?? null,
        team2CaptainId: fromEmbed.team2CaptainId ?? mentionIds[1] ?? null,
      };
    }

    return fromEmbed;
  } catch {
    return { team1CaptainId: null, team2CaptainId: null };
  }
}

async function resolveDiscordUsername(guild: Guild, userId: string | null): Promise<string> {
  if (!userId) return 'Unknown';
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) return member.user.username;
  const user = await guild.client.users.fetch(userId).catch(() => null);
  return user?.username ?? 'Unknown';
}

async function buildScheduleEmbedParams(params: {
  guild: Guild;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  assignments: StaffAssignmentRow[];
  thumbnailUrl?: string | null;
}): Promise<ScheduleEmbedParams> {
  const captains = await resolveMatchCaptains(params.tournament, params.match);
  let team1CaptainId = captains.team1CaptainId;
  let team2CaptainId = captains.team2CaptainId;

  if (!team1CaptainId || !team2CaptainId) {
    const fallback = await readCaptainFallbackFromTicketMessage({
      guild: params.guild,
      ticketChannelId: params.schedule.ticket_channel_id,
      ticketMessageId: params.schedule.ticket_message_id,
    });
    team1CaptainId = team1CaptainId ?? fallback.team1CaptainId;
    team2CaptainId = team2CaptainId ?? fallback.team2CaptainId;
  }

  const userIds = [
    team1CaptainId,
    team2CaptainId,
    params.schedule.created_by_discord_user_id,
  ];
  await Promise.all(
    userIds
      .filter((id): id is string => Boolean(id))
      .map((id) => params.guild.members.fetch(id).catch(() => null)),
  );

  const createdByUsername = await resolveDiscordUsername(
    params.guild,
    params.schedule.created_by_discord_user_id,
  );
  const tournamentFormat = await resolveTournamentFormat(params.tournament.sheet_link);

  return {
    guild: params.guild,
    tournament: params.tournament,
    match: params.match,
    scheduledAt: params.schedule.scheduled_at,
    assignments: params.assignments,
    thumbnailUrl: params.thumbnailUrl ?? params.schedule.thumbnail_url,
    ticketChannelId: params.schedule.ticket_channel_id,
    team1CaptainId,
    team2CaptainId,
    tournamentFormat,
    createdByUsername,
    createdAt: params.schedule.created_at,
  };
}

export const getScheduleEmbedParams = buildScheduleEmbedParams;

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

export class ScheduleAlreadyExistsError extends Error {
  constructor(matchId: string) {
    super(`An active schedule already exists for match ${matchId}.`);
    this.name = 'ScheduleAlreadyExistsError';
  }
}

export class ScheduleNotFoundError extends Error {
  constructor(message = 'No schedule was found for this match ticket.') {
    super(message);
    this.name = 'ScheduleNotFoundError';
  }
}

export class ScheduleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleConfigError';
  }
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

function mapSchedule(row: Record<string, unknown>): ScheduleRow {
  return row as unknown as ScheduleRow;
}

function mapAssignment(row: Record<string, unknown>): StaffAssignmentRow {
  return row as unknown as StaffAssignmentRow;
}

export async function getScheduleByMatchId(
  supabase: SupabaseClient,
  matchId: string,
): Promise<ScheduleRow | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('match_id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load schedule: ${error.message}`);
  }

  return data ? mapSchedule(data) : null;
}

export async function getScheduleForTicket(
  supabase: SupabaseClient,
  ticketChannelId: string,
): Promise<ScheduleRow | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('ticket_channel_id', ticketChannelId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load schedule: ${error.message}`);
  }

  return data ? mapSchedule(data) : null;
}

export async function getScheduleById(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<ScheduleRow | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('id', scheduleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load schedule: ${error.message}`);
  }

  return data ? mapSchedule(data) : null;
}

async function loadScheduleOrThrow(
  supabase: SupabaseClient,
  scheduleId: string,
  context: string,
): Promise<ScheduleRow> {
  const row = await getScheduleById(supabase, scheduleId);
  if (!row) {
    throw new Error(`${context}: schedule not found`);
  }
  return row;
}

export async function getScheduleAssignments(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<StaffAssignmentRow[]> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select(STAFF_ASSIGNMENT_COLUMNS)
    .eq('schedule_id', scheduleId);

  if (error) {
    throw new Error(`Failed to load staff assignments: ${error.message}`);
  }

  return (data ?? []).map(mapAssignment);
}

export async function getScheduleWithDetails(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<ScheduleWithDetails | null> {
  const schedule = await getScheduleById(supabase, scheduleId);
  if (!schedule) return null;

  const { data: matchData, error: matchError } = await supabase
    .from('matches')
    .select('team1_name, team2_name, challonge_match_id, round')
    .eq('id', schedule.match_id)
    .maybeSingle();

  if (matchError || !matchData) {
    throw new Error(`Failed to load match for schedule: ${matchError?.message ?? 'not found'}`);
  }

  const { data: tournamentData, error: tournamentError } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', schedule.tournament_id)
    .maybeSingle();

  if (tournamentError || !tournamentData) {
    throw new Error(
      `Failed to load tournament for schedule: ${tournamentError?.message ?? 'not found'}`,
    );
  }

  const assignments = await getScheduleAssignments(supabase, scheduleId);

  return {
    ...schedule,
    match: matchData as ScheduleWithDetails['match'],
    tournament: tournamentData as ScheduleWithDetails['tournament'],
    staff_assignments: assignments,
  };
}

export async function assertNoActiveSchedule(
  supabase: SupabaseClient,
  matchId: string,
): Promise<void> {
  const existing = await getScheduleByMatchId(supabase, matchId);
  if (existing) {
    throw new ScheduleAlreadyExistsError(matchId);
  }
}

export async function listSchedulesForGuild(
  supabase: SupabaseClient,
  guildId: string,
): Promise<ScheduleWithDetails[]> {
  const { data: tournaments, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('guild_id', guildId);

  if (tournamentError) {
    throw new Error(`Failed to load tournaments: ${tournamentError.message}`);
  }

  const tournamentIds = (tournaments ?? []).map((row) => (row as { id: string }).id);
  if (tournamentIds.length === 0) return [];

  const { data: schedules, error: scheduleError } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .in('tournament_id', tournamentIds)
    .order('scheduled_at', { ascending: true });

  if (scheduleError) {
    throw new Error(`Failed to load schedules: ${scheduleError.message}`);
  }

  const results: ScheduleWithDetails[] = [];
  for (const row of schedules ?? []) {
    const schedule = mapSchedule(row);
    const details = await getScheduleWithDetails(supabase, schedule.id);
    if (details) results.push(details);
  }

  return results;
}

export async function searchSchedulesForAutocomplete(
  supabase: SupabaseClient,
  guildId: string,
  query: string,
): Promise<ScheduleWithDetails[]> {
  const { data: tournaments, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('guild_id', guildId);

  if (tournamentError) {
    throw new Error(`Failed to load tournaments: ${tournamentError.message}`);
  }

  const tournamentRows = tournaments ?? [];
  if (tournamentRows.length === 0) return [];

  const tournamentIds = tournamentRows.map((row) => (row as { id: string }).id);
  const tournamentNameById = new Map(
    tournamentRows.map((row) => {
      const tournament = row as { id: string; name: string };
      return [tournament.id, tournament.name] as const;
    }),
  );

  const { data: schedules, error: scheduleError } = await supabase
    .from('schedules')
    .select('id, tournament_id, match_id, scheduled_at')
    .in('tournament_id', tournamentIds)
    .order('scheduled_at', { ascending: true })
    .limit(150);

  if (scheduleError) {
    throw new Error(`Failed to load schedules: ${scheduleError.message}`);
  }

  const scheduleRows = schedules ?? [];
  if (scheduleRows.length === 0) return [];

  const matchIds = [...new Set(scheduleRows.map((row) => (row as { match_id: string }).match_id))];
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id, team1_name, team2_name, challonge_match_id, round')
    .in('id', matchIds);

  if (matchError) {
    throw new Error(`Failed to load matches for autocomplete: ${matchError.message}`);
  }

  const matchById = new Map(
    (matches ?? []).map((row) => {
      const match = row as ScheduleWithDetails['match'] & { id: string };
      return [match.id, match] as const;
    }),
  );

  const results: ScheduleWithDetails[] = scheduleRows.map((row) => {
    const schedule = row as {
      id: string;
      tournament_id: string;
      match_id: string;
      scheduled_at: string;
    };
    const match = matchById.get(schedule.match_id) ?? {
      team1_name: 'Unknown',
      team2_name: 'Unknown',
      challonge_match_id: '',
      round: '',
    };

    return {
      id: schedule.id,
      tournament_id: schedule.tournament_id,
      match_id: schedule.match_id,
      ticket_channel_id: '',
      scheduled_at: schedule.scheduled_at,
      schedules_message_id: null,
      ticket_message_id: null,
      thumbnail_url: null,
      remark: null,
      created_by_discord_user_id: null,
      reminder_message_id: null,
      reminder_sent_at: null,
      urgent_message_id: null,
      urgent_sent_at: null,
      assignment_buttons_expires_at: null,
      created_at: schedule.scheduled_at,
      updated_at: schedule.scheduled_at,
      match: {
        team1_name: match.team1_name,
        team2_name: match.team2_name,
        challonge_match_id: match.challonge_match_id,
        round: match.round,
      },
      tournament: {
        name: tournamentNameById.get(schedule.tournament_id) ?? 'Unknown',
      },
      staff_assignments: [],
    };
  });

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? results.filter((schedule) => {
        const haystack = [
          schedule.tournament.name,
          schedule.match.team1_name,
          schedule.match.team2_name,
          schedule.match.challonge_match_id,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalized);
      })
    : results;

  return filtered.slice(0, 25);
}

async function addStaffTicketAccess(
  ticketChannel: TextChannel,
  userId: string,
): Promise<void> {
  await ticketChannel.permissionOverwrites.edit(userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  });
}

async function removeStaffTicketAccess(
  ticketChannel: TextChannel,
  userId: string,
): Promise<void> {
  await ticketChannel.permissionOverwrites.delete(userId).catch(() => undefined);
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

/** Generate match banner PNG (local backgrounds + overlay) and upload to thumbnail channel. */
async function publishScheduleThumbnail(params: {
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  tournamentName: string;
  match: MatchScheduleRow;
  scheduledAt: Date;
  distinctBackground?: boolean;
}): Promise<string | null> {
  const channelId = params.guildConfig?.thumbnail_channel_id;
  if (!channelId) return null;

  try {
    const buffer = await generateScheduleThumbnailBuffer({
      tournamentName: params.tournamentName,
      guildName: params.guild.name,
      guildIconUrl: params.guild.iconURL({ extension: 'png', size: 128 }),
      match: params.match,
      scheduledAt: params.scheduledAt,
      distinctBackground: params.distinctBackground,
    });

    const channel = await params.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return null;

    const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });
    const message = await (channel as TextChannel).send({ files: [attachment] });
    return message.attachments.first()?.url ?? null;
  } catch (error) {
    console.warn('[schedules] Thumbnail generation failed:', error);
    return null;
  }
}

async function syncScheduleMessages(params: {
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  assignments: StaffAssignmentRow[];
  thumbnailUrl?: string | null;
  ticketContent?: string | null;
  ticketMentionUserIds?: string[];
  resendTicketMessage?: boolean;
  activateAssignmentButtons?: boolean;
}): Promise<{
  ticketMessageId: string;
  schedulesMessageId: string;
  assignmentButtonsExpiresAt: string | null;
}> {
  const embedParams = await buildScheduleEmbedParams({
    guild: params.guild,
    schedule: params.schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: params.assignments,
    thumbnailUrl: params.thumbnailUrl,
  });

  const ticketChannel = await params.guild.channels.fetch(params.schedule.ticket_channel_id);
  if (!ticketChannel?.isTextBased() || ticketChannel.type !== ChannelType.GuildText) {
    throw new ScheduleError('The match ticket channel is unavailable.');
  }

  const ticketText = ticketChannel as TextChannel;
  const ticketEmbed = buildTicketScheduleEmbed(embedParams);

  const ticketAllowedMentions = params.ticketMentionUserIds?.length
    ? { users: params.ticketMentionUserIds }
    : undefined;

  let ticketMessageId = params.schedule.ticket_message_id;

  if (params.resendTicketMessage) {
    if (ticketMessageId) {
      await deleteDiscordMessage(
        params.client,
        params.schedule.ticket_channel_id,
        ticketMessageId,
      );
    }

    const message = await ticketText.send({
      content: params.ticketContent ?? undefined,
      embeds: [ticketEmbed],
      allowedMentions: ticketAllowedMentions,
    });
    ticketMessageId = message.id;
  } else if (ticketMessageId) {
    try {
      const message = await ticketText.messages.fetch(ticketMessageId);
      const content =
        params.ticketContent !== undefined ? params.ticketContent || null : message.content || null;
      await message.edit({
        content,
        embeds: [ticketEmbed],
        components: [],
        allowedMentions: ticketAllowedMentions,
      });
    } catch {
      const message = await ticketText.send({
        content: params.ticketContent ?? undefined,
        embeds: [ticketEmbed],
        allowedMentions: ticketAllowedMentions,
      });
      ticketMessageId = message.id;
    }
  } else {
    const message = await ticketText.send({
      content: params.ticketContent ?? undefined,
      embeds: [ticketEmbed],
      allowedMentions: ticketAllowedMentions,
    });
    ticketMessageId = message.id;
  }

  const { schedulesMessageId, assignmentButtonsExpiresAt } = await syncSchedulesChannelMessage({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule: params.schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: params.assignments,
    thumbnailUrl: params.thumbnailUrl,
    activateAssignmentButtons: params.activateAssignmentButtons,
  });

  return { ticketMessageId, schedulesMessageId, assignmentButtonsExpiresAt };
}

async function syncSchedulesChannelMessage(params: {
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  assignments: StaffAssignmentRow[];
  thumbnailUrl?: string | null;
  activateAssignmentButtons?: boolean;
}): Promise<{ schedulesMessageId: string; assignmentButtonsExpiresAt: string | null }> {
  const assignmentButtonsExpiresAt = params.activateAssignmentButtons
    ? nextScheduleAssignmentButtonsExpiresAt()
    : params.schedule.assignment_buttons_expires_at;
  const buttonsLocked = !areScheduleAssignmentButtonsActive(assignmentButtonsExpiresAt);
  const embedParams = await buildScheduleEmbedParams({
    guild: params.guild,
    schedule: params.schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: params.assignments,
    thumbnailUrl: params.thumbnailUrl,
  });

  const scheduleChannelId = params.guildConfig?.schedule_channel_id;
  if (!scheduleChannelId) {
    throw new ScheduleConfigError(
      'No schedule channel is configured. Set one with `/staff config set` or `/staff config edit`.',
    );
  }

  const scheduleChannel = await params.guild.channels.fetch(scheduleChannelId);
  if (!scheduleChannel?.isTextBased() || scheduleChannel.type !== ChannelType.GuildText) {
    throw new ScheduleConfigError('The configured schedule channel is unavailable.');
  }

  const scheduleEmbed = buildScheduleChannelEmbed(embedParams);
  const components = buildScheduleAssignmentComponents(params.schedule.id, params.assignments, {
    buttonsLocked,
  });

  const scheduleText = scheduleChannel as TextChannel;
  let schedulesMessageId = params.schedule.schedules_message_id;
  const schedulePayload = {
    content: '',
    embeds: [scheduleEmbed],
    components,
  };
  if (schedulesMessageId) {
    try {
      const message = await scheduleText.messages.fetch(schedulesMessageId);
      await message.edit(schedulePayload);
    } catch {
      const message = await scheduleText.send(schedulePayload);
      schedulesMessageId = message.id;
    }
  } else {
    const message = await scheduleText.send(schedulePayload);
    schedulesMessageId = message.id;
  }

  return { schedulesMessageId, assignmentButtonsExpiresAt };
}

export const syncScheduleChannelPost = syncSchedulesChannelMessage;

async function clearActiveAssignmentConfirmations(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<void> {
  const assignments = await getScheduleAssignments(supabase, scheduleId);
  const activeIds = getActiveAssignments(assignments).map((row) => row.id);
  if (activeIds.length === 0) return;

  const { error } = await supabase
    .from('staff_assignments')
    .update({ attendance_confirmed_at: null })
    .in('id', activeIds);

  if (error) {
    throw new Error(`Failed to reset attendance confirmations: ${error.message}`);
  }
}

export async function resetScheduleReminderWorkflow(params: {
  supabase: SupabaseClient;
  client: Client;
  schedule: ScheduleRow;
  guildConfig: GuildRow | null;
}): Promise<void> {
  await deleteDiscordMessage(
    params.client,
    params.schedule.ticket_channel_id,
    params.schedule.reminder_message_id,
  );
  await deleteDiscordMessage(
    params.client,
    params.guildConfig?.schedule_channel_id,
    params.schedule.urgent_message_id,
  );

  await clearActiveAssignmentConfirmations(params.supabase, params.schedule.id);

  const { error } = await params.supabase
    .from('schedules')
    .update({
      reminder_message_id: null,
      reminder_sent_at: null,
      urgent_message_id: null,
      urgent_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.schedule.id);

  if (error) {
    throw new Error(`Failed to reset schedule reminder workflow: ${error.message}`);
  }
}

export async function refreshScheduleReminderMessage(params: {
  client: Client;
  guild: Guild;
  schedule: ScheduleRow;
  assignments: StaffAssignmentRow[];
}): Promise<void> {
  if (!params.schedule.reminder_message_id || params.schedule.urgent_sent_at) return;

  try {
    const channel = await params.guild.channels.fetch(params.schedule.ticket_channel_id);
    if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) return;

    const message = await (channel as TextChannel).messages.fetch(params.schedule.reminder_message_id);
    await message.edit({
      components: buildScheduleReminderComponents(params.schedule.id, params.assignments),
    });
  } catch {
    // Reminder message may have been deleted.
  }
}

async function notifyTicketStaffChange(
  ticketChannelId: string,
  guild: Guild,
  content: string,
): Promise<void> {
  const channel = await guild.channels.fetch(ticketChannelId);
  if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) return;
  await (channel as TextChannel).send({ content });
}

async function notifyStaffChatNewSchedule(
  guild: Guild,
  guildConfig: GuildRow | null,
): Promise<void> {
  const channelId = guildConfig?.staff_chat_channel_id;
  if (!channelId) return;

  const notification = buildScheduleStaffChatCreateMessage(guild, guildConfig);
  if (!notification) return;

  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) return;

  await (channel as TextChannel).send({
    content: notification.content,
    allowedMentions: { roles: notification.roleIds },
  });
}

async function insertStaffAssignment(
  supabase: SupabaseClient,
  scheduleId: string,
  role: ScheduleStaffRole,
  userId: string,
): Promise<StaffAssignmentRow> {
  const assignment: StaffAssignmentRow = {
    id: crypto.randomUUID(),
    schedule_id: scheduleId,
    role,
    discord_user_id: userId,
    resigned_at: null,
    resign_reason: null,
    attendance_confirmed_at: null,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('staff_assignments').insert({
    id: assignment.id,
    schedule_id: scheduleId,
    role,
    discord_user_id: userId,
    created_at: assignment.created_at,
  });
  if (error) {
    throw new Error(`Failed to assign ${role}: ${error.message}`);
  }

  return assignment;
}

async function assignInitialStaffOnCreateSchedule(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  ticketChannel: TextChannel;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  judgeUserId?: string;
  recorderUserId?: string;
}): Promise<ScheduleRow> {
  if (!params.judgeUserId && !params.recorderUserId) {
    return params.schedule;
  }

  if (params.judgeUserId) {
    await insertStaffAssignment(params.supabase, params.schedule.id, 'judge', params.judgeUserId);
    await addStaffTicketAccess(params.ticketChannel, params.judgeUserId);
    await notifyTicketStaffChange(
      params.ticketChannel.id,
      params.guild,
      buildStaffAssignedMessage(params.judgeUserId, 'judge'),
    );
  }

  if (params.recorderUserId) {
    await insertStaffAssignment(
      params.supabase,
      params.schedule.id,
      'recorder',
      params.recorderUserId,
    );
    await addStaffTicketAccess(params.ticketChannel, params.recorderUserId);
    await notifyTicketStaffChange(
      params.ticketChannel.id,
      params.guild,
      buildStaffAssignedMessage(params.recorderUserId, 'recorder'),
    );
  }

  const loadedAssignments = await getScheduleAssignments(params.supabase, params.schedule.id);
  const captainIds = await resolveCaptainIds(params.tournament, params.match);
  await applyOpenTicketPermissions({
    channel: params.ticketChannel,
    guild: params.guild,
    tournament: params.tournament,
    guildConfig: params.guildConfig,
    participantMemberIds: [
      ...captainIds,
      ...getActiveAssignments(loadedAssignments).map((row) => row.discord_user_id),
    ],
  });

  const { ticketMessageId, schedulesMessageId } = await syncScheduleMessages({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule: params.schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: loadedAssignments,
    thumbnailUrl: params.schedule.thumbnail_url,
  });

  const { error: updateError } = await params.supabase
    .from('schedules')
    .update({
      ticket_message_id: ticketMessageId,
      schedules_message_id: schedulesMessageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.schedule.id);

  if (updateError) {
    throw new Error(`Failed to update schedule after staff assignment: ${updateError.message}`);
  }

  return loadScheduleOrThrow(
    params.supabase,
    params.schedule.id,
    'Failed to load schedule after staff assignment',
  );
}

async function finalizeStaffAssignment(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  schedule: ScheduleWithDetails;
  role: ScheduleStaffRole;
  userId: string;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  triggeredBy?: { id: string; username: string };
}): Promise<void> {
  try {
    const ticketChannel = await params.guild.channels.fetch(params.schedule.ticket_channel_id);
    if (ticketChannel?.isTextBased() && ticketChannel.type === ChannelType.GuildText) {
      await addStaffTicketAccess(ticketChannel as TextChannel, params.userId);
    }

    const updated = await getScheduleWithDetails(params.supabase, params.schedule.id);
    if (!updated) return;

    const { ticketMessageId, schedulesMessageId } = await syncScheduleMessages({
      client: params.client,
      guild: params.guild,
      guildConfig: params.guildConfig,
      schedule: updated,
      tournament: params.tournament,
      match: params.match,
      assignments: updated.staff_assignments,
      thumbnailUrl: updated.thumbnail_url,
    });

    await notifyTicketStaffChange(
      params.schedule.ticket_channel_id,
      params.guild,
      buildStaffAssignedMessage(params.userId, params.role),
    );

    await params.supabase
      .from('schedules')
      .update({
        ticket_message_id: ticketMessageId,
        schedules_message_id: schedulesMessageId,
      })
      .eq('id', updated.id);

    await refreshScheduleReminderMessage({
      client: params.client,
      guild: params.guild,
      schedule: updated,
      assignments: updated.staff_assignments,
    });

    if (params.guildConfig && params.triggeredBy) {
      void logScheduleStaffAssigned({
        client: params.client,
        guild: params.guild,
        config: params.guildConfig,
        triggeredBy: params.triggeredBy as import('discord.js').User,
        scheduleId: params.schedule.id,
        role: params.role,
        tournamentName: params.tournament.name,
        matchLabel: `${params.match.team1_name} vs ${params.match.team2_name}`,
      });
    }
  } catch (error) {
    console.warn('[schedules] Background staff assignment sync failed:', error);
  }
}

export function memberHasStaffRoleForAssignment(
  memberRoles: Set<string>,
  guildConfig: GuildRow | null,
  role: ScheduleStaffRole,
): boolean {
  if (role === 'judge') {
    return Boolean(guildConfig?.judge_role_id && memberRoles.has(guildConfig.judge_role_id));
  }
  return Boolean(guildConfig?.recorder_role_id && memberRoles.has(guildConfig.recorder_role_id));
}

export async function validateScheduleStaffUser(
  guild: Guild,
  guildConfig: GuildRow | null,
  userId: string,
  role: ScheduleStaffRole,
): Promise<void> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new ScheduleError(`The selected ${role} user is not a member of this server.`);
  }
  const roleIds = new Set(member.roles.cache.keys());
  if (!memberHasStaffRoleForAssignment(roleIds, guildConfig, role)) {
    throw new ScheduleError(
      `The selected user does not have the ${role === 'judge' ? 'Judge' : 'Recorder'} role required for this assignment.`,
    );
  }
}

export async function createSchedule(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  ticketChannel: TextChannel;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  guildConfig: GuildRow | null;
  scheduledAt: Date;
  remark?: string;
  judgeUserId?: string;
  recorderUserId?: string;
  createdByUserId: string;
}): Promise<{ schedule: ScheduleRow; thumbnailGenerated: boolean }> {
  if (!params.guildConfig?.schedule_channel_id) {
    throw new ScheduleConfigError(
      'No schedule channel is configured. Set one with `/staff config set` or `/staff config edit` before scheduling matches.',
    );
  }

  await assertNoActiveSchedule(params.supabase, params.match.id);

  if (params.judgeUserId) {
    await validateScheduleStaffUser(params.guild, params.guildConfig, params.judgeUserId, 'judge');
  }
  if (params.recorderUserId) {
    await validateScheduleStaffUser(
      params.guild,
      params.guildConfig,
      params.recorderUserId,
      'recorder',
    );
  }

  const scheduledAtIso = params.scheduledAt.toISOString();
  const rowTimestamps = new Date().toISOString();
  const scheduleId = crypto.randomUUID();
  const { error: insertError } = await params.supabase.from('schedules').insert({
    id: scheduleId,
    tournament_id: params.tournament.id,
    match_id: params.match.id,
    ticket_channel_id: params.ticketChannel.id,
    scheduled_at: scheduledAtIso,
    remark: params.remark ?? null,
    created_by_discord_user_id: params.createdByUserId,
    created_at: rowTimestamps,
    updated_at: rowTimestamps,
  });

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      throw new ScheduleAlreadyExistsError(params.match.id);
    }
    throw new Error(`Failed to create schedule: ${insertError.message}`);
  }

  const schedule = await loadScheduleOrThrow(
    params.supabase,
    scheduleId,
    'Failed to load schedule after insert',
  );

  let thumbnailGenerated = false;

  try {
    const captainIds = await resolveCaptainIds(params.tournament, params.match);
    await applyOpenTicketPermissions({
      channel: params.ticketChannel,
      guild: params.guild,
      tournament: params.tournament,
      guildConfig: params.guildConfig,
      participantMemberIds: captainIds,
    });

    const thumbnailUrl = await publishScheduleThumbnail({
      client: params.client,
      guild: params.guild,
      guildConfig: params.guildConfig,
      tournamentName: params.tournament.name,
      match: params.match,
      scheduledAt: params.scheduledAt,
      distinctBackground: true,
    });
    thumbnailGenerated = Boolean(thumbnailUrl);

    const scheduleWithRemark = { ...schedule, remark: params.remark ?? null };
    const ticketNotification = buildScheduleNotificationContent({ captainIds });

    const { ticketMessageId, schedulesMessageId, assignmentButtonsExpiresAt } =
      await syncScheduleMessages({
        client: params.client,
        guild: params.guild,
        guildConfig: params.guildConfig,
        schedule: scheduleWithRemark,
        tournament: params.tournament,
        match: params.match,
        assignments: [],
        thumbnailUrl,
        ticketContent: ticketNotification.content,
        ticketMentionUserIds: ticketNotification.mentionUserIds,
        activateAssignmentButtons: true,
      });

    await notifyStaffChatNewSchedule(params.guild, params.guildConfig);

    const scheduledName = applyScheduledPrefix(params.ticketChannel.name);
    if (params.ticketChannel.name !== scheduledName) {
      await params.ticketChannel.setName(scheduledName, 'Match scheduled');
    }

    const { error: updateError } = await params.supabase
      .from('schedules')
      .update({
        ticket_message_id: ticketMessageId,
        schedules_message_id: schedulesMessageId,
        thumbnail_url: thumbnailUrl,
        assignment_buttons_expires_at: assignmentButtonsExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id);

    if (updateError) {
      throw new Error(`Failed to update schedule messages: ${updateError.message}`);
    }
  } catch (error) {
    await params.supabase.from('staff_assignments').delete().eq('schedule_id', schedule.id);
    await params.supabase.from('schedules').delete().eq('id', schedule.id);
    throw error;
  }

  let refreshed = await loadScheduleOrThrow(
    params.supabase,
    schedule.id,
    'Failed to load schedule after updating messages',
  );

  if (params.judgeUserId || params.recorderUserId) {
    try {
      refreshed = await assignInitialStaffOnCreateSchedule({
        supabase: params.supabase,
        client: params.client,
        guild: params.guild,
        guildConfig: params.guildConfig,
        ticketChannel: params.ticketChannel,
        schedule: refreshed,
        tournament: params.tournament,
        match: params.match,
        judgeUserId: params.judgeUserId,
        recorderUserId: params.recorderUserId,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      throw new ScheduleError(
        `Schedule was created and published, but staff assignment failed: ${detail}`,
      );
    }
  }

  return { schedule: refreshed, thumbnailGenerated };
}

export async function deleteSchedule(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  ticketChannel: TextChannel;
  schedule: ScheduleRow;
  guildConfig: GuildRow | null;
  reason?: string;
}): Promise<void> {
  await deleteScheduleResultForSchedule({
    supabase: params.supabase,
    client: params.client,
    scheduleId: params.schedule.id,
    ticketChannelId: params.schedule.ticket_channel_id,
  });

  const assignments = await getScheduleAssignments(params.supabase, params.schedule.id);
  const active = getActiveAssignments(assignments);

  await deleteDiscordMessage(
    params.client,
    params.schedule.ticket_channel_id,
    params.schedule.ticket_message_id,
  );
  await deleteDiscordMessage(
    params.client,
    params.schedule.ticket_channel_id,
    params.schedule.reminder_message_id,
  );
  await deleteDiscordMessage(
    params.client,
    params.guildConfig?.schedule_channel_id,
    params.schedule.schedules_message_id,
  );
  await deleteDiscordMessage(
    params.client,
    params.guildConfig?.schedule_channel_id,
    params.schedule.urgent_message_id,
  );

  for (const assignment of active) {
    await removeStaffTicketAccess(params.ticketChannel, assignment.discord_user_id);
  }

  await params.supabase.from('staff_assignments').delete().eq('schedule_id', params.schedule.id);
  const { error } = await params.supabase.from('schedules').delete().eq('id', params.schedule.id);

  if (error) {
    throw new Error(`Failed to delete schedule: ${error.message}`);
  }

  const baseName = removeScheduledPrefix(params.ticketChannel.name);
  if (params.ticketChannel.name !== baseName) {
    try {
      await params.ticketChannel.setName(baseName, 'Schedule deleted');
    } catch (renameError) {
      console.warn('[schedules] Could not rename ticket channel after delete:', renameError);
    }
  }
}

async function removeActiveStaffRole(params: {
  supabase: SupabaseClient;
  guild: Guild;
  ticketChannel: TextChannel | null;
  scheduleId: string;
  role: ScheduleStaffRole;
  reason?: string;
}): Promise<void> {
  const assignments = await getScheduleAssignments(params.supabase, params.scheduleId);
  const active = getActiveAssignments(assignments).find((row) => row.role === params.role);
  if (!active) {
    throw new ScheduleError(
      `No ${params.role === 'judge' ? 'Judge' : 'Recorder'} is currently assigned to this schedule.`,
    );
  }

  const now = new Date().toISOString();
  const { error } = await params.supabase
    .from('staff_assignments')
    .update({
      resigned_at: now,
      resign_reason: params.reason ?? null,
    })
    .eq('id', active.id);

  if (error) {
    throw new Error(`Failed to remove ${params.role}: ${error.message}`);
  }

  if (params.ticketChannel) {
    await removeStaffTicketAccess(params.ticketChannel, active.discord_user_id);
    await notifyTicketStaffChange(
      params.ticketChannel.id,
      params.guild,
      buildStaffResignedMessage(active.discord_user_id, active.role),
    );
  }
}

export async function removeStaffForFailedConfirmation(params: {
  supabase: SupabaseClient;
  guild: Guild;
  ticketChannel: TextChannel | null;
  scheduleId: string;
  role: ScheduleStaffRole;
}): Promise<void> {
  await removeActiveStaffRole({
    supabase: params.supabase,
    guild: params.guild,
    ticketChannel: params.ticketChannel,
    scheduleId: params.scheduleId,
    role: params.role,
    reason: FAILED_ATTENDANCE_CONFIRM_REASON,
  });
}

async function replaceOrAssignStaffRole(params: {
  supabase: SupabaseClient;
  guild: Guild;
  ticketChannel: TextChannel;
  scheduleId: string;
  role: ScheduleStaffRole;
  userId: string;
  reason?: string;
  assignments: StaffAssignmentRow[];
}): Promise<StaffAssignmentRow[]> {
  const active = getActiveAssignments(params.assignments).find((row) => row.role === params.role);
  if (active?.discord_user_id === params.userId) {
    return params.assignments;
  }

  if (active) {
    await removeActiveStaffRole({
      supabase: params.supabase,
      guild: params.guild,
      ticketChannel: params.ticketChannel,
      scheduleId: params.scheduleId,
      role: params.role,
      reason: params.reason,
    });
    params.assignments = await getScheduleAssignments(params.supabase, params.scheduleId);
  }

  const assignment = await insertStaffAssignment(
    params.supabase,
    params.scheduleId,
    params.role,
    params.userId,
  );
  await addStaffTicketAccess(params.ticketChannel, params.userId);
  await notifyTicketStaffChange(
    params.ticketChannel.id,
    params.guild,
    buildStaffAssignedMessage(params.userId, params.role),
  );

  return [...params.assignments, assignment];
}

export async function updateSchedule(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  ticketChannel: TextChannel;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  guildConfig: GuildRow | null;
  scheduledAt?: Date;
  note?: string;
  judgeUserId?: string;
  recorderUserId?: string;
  removeJudge?: boolean;
  removeRecorder?: boolean;
  reason?: string;
  regenerateImage?: boolean;
}): Promise<{ schedule: ScheduleRow; thumbnailRegenerated: boolean }> {
  if (params.judgeUserId) {
    await validateScheduleStaffUser(params.guild, params.guildConfig, params.judgeUserId, 'judge');
  }
  if (params.recorderUserId) {
    await validateScheduleStaffUser(
      params.guild,
      params.guildConfig,
      params.recorderUserId,
      'recorder',
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.scheduledAt) {
    updates.scheduled_at = params.scheduledAt.toISOString();
  }
  if (params.note !== undefined) {
    updates.remark = params.note.trim() ? params.note.trim() : null;
  }

  const scheduledAtChanged = Boolean(
    params.scheduledAt &&
      params.scheduledAt.toISOString() !== params.schedule.scheduled_at,
  );

  if (scheduledAtChanged) {
    await resetScheduleReminderWorkflow({
      supabase: params.supabase,
      client: params.client,
      schedule: params.schedule,
      guildConfig: params.guildConfig,
    });
  }

  const { error: updateError } = await params.supabase
    .from('schedules')
    .update(updates)
    .eq('id', params.schedule.id);

  if (updateError) {
    throw new Error(`Failed to update schedule: ${updateError.message}`);
  }

  let schedule = await loadScheduleOrThrow(
    params.supabase,
    params.schedule.id,
    'Failed to load schedule after update',
  );
  let assignments = await getScheduleAssignments(params.supabase, schedule.id);

  if (params.removeJudge) {
    await removeActiveStaffRole({
      supabase: params.supabase,
      guild: params.guild,
      ticketChannel: params.ticketChannel,
      scheduleId: schedule.id,
      role: 'judge',
      reason: params.reason,
    });
    assignments = await getScheduleAssignments(params.supabase, schedule.id);
  }

  if (params.removeRecorder) {
    await removeActiveStaffRole({
      supabase: params.supabase,
      guild: params.guild,
      ticketChannel: params.ticketChannel,
      scheduleId: schedule.id,
      role: 'recorder',
      reason: params.reason,
    });
    assignments = await getScheduleAssignments(params.supabase, schedule.id);
  }

  if (params.judgeUserId) {
    assignments = await replaceOrAssignStaffRole({
      supabase: params.supabase,
      guild: params.guild,
      ticketChannel: params.ticketChannel,
      scheduleId: schedule.id,
      role: 'judge',
      userId: params.judgeUserId,
      reason: params.reason,
      assignments,
    });
  }

  if (params.recorderUserId) {
    assignments = await replaceOrAssignStaffRole({
      supabase: params.supabase,
      guild: params.guild,
      ticketChannel: params.ticketChannel,
      scheduleId: schedule.id,
      role: 'recorder',
      userId: params.recorderUserId,
      reason: params.reason,
      assignments,
    });
  }

  let thumbnailUrl = schedule.thumbnail_url;
  let thumbnailRegenerated = false;
  const shouldRegenerateThumbnail = Boolean(params.scheduledAt || params.regenerateImage);

  if (shouldRegenerateThumbnail) {
    const regenerated = await publishScheduleThumbnail({
      client: params.client,
      guild: params.guild,
      guildConfig: params.guildConfig,
      tournamentName: params.tournament.name,
      match: params.match,
      scheduledAt: params.scheduledAt ?? parseScheduleUtcInstant(schedule.scheduled_at),
      distinctBackground: false,
    });
    if (regenerated) {
      thumbnailUrl = regenerated;
      thumbnailRegenerated = true;
      schedule = { ...schedule, thumbnail_url: regenerated };
    }
  }

  const captainIds = await resolveCaptainIds(params.tournament, params.match);
  const ticketNotification = buildScheduleNotificationContent({ captainIds });

  const { ticketMessageId, schedulesMessageId } = await syncScheduleMessages({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule,
    tournament: params.tournament,
    match: params.match,
    assignments,
    thumbnailUrl,
    ticketContent: ticketNotification.content,
    ticketMentionUserIds: ticketNotification.mentionUserIds,
    resendTicketMessage: true,
  });

  const { error: finalError } = await params.supabase
    .from('schedules')
    .update({
      ticket_message_id: ticketMessageId,
      schedules_message_id: schedulesMessageId,
      thumbnail_url: thumbnailUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', schedule.id);

  if (finalError) {
    throw new Error(`Failed to finalize schedule update: ${finalError.message}`);
  }

  const finalSchedule = await loadScheduleOrThrow(
    params.supabase,
    schedule.id,
    'Failed to load schedule after finalize',
  );
  await refreshScheduleReminderMessage({
    client: params.client,
    guild: params.guild,
    schedule: finalSchedule,
    assignments,
  });

  return { schedule: finalSchedule, thumbnailRegenerated };
}

export async function getScheduleShowEmbed(params: {
  guild: Guild;
  schedule: ScheduleWithDetails;
  tournament: TournamentRow;
  match: MatchScheduleRow;
}): Promise<EmbedBuilder> {
  const embedParams = await buildScheduleEmbedParams({
    guild: params.guild,
    schedule: params.schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: params.schedule.staff_assignments,
    thumbnailUrl: params.schedule.thumbnail_url,
  });

  return buildScheduleChannelEmbed(embedParams);
}

export async function assignStaffRole(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  scheduleId: string;
  role: ScheduleStaffRole;
  userId: string;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  schedule?: ScheduleWithDetails;
  triggeredBy?: import('discord.js').User;
}): Promise<StaffAssignmentRow[]> {
  const schedule =
    params.schedule ?? (await getScheduleWithDetails(params.supabase, params.scheduleId));
  if (!schedule) {
    throw new ScheduleNotFoundError('Schedule not found.');
  }

  if (hasActiveRoleAssignment(schedule.staff_assignments, params.role)) {
    throw new ScheduleError(`A ${params.role} is already assigned to this schedule.`);
  }

  const assignment = await insertStaffAssignment(
    params.supabase,
    params.scheduleId,
    params.role,
    params.userId,
  );
  const optimisticAssignments = [...schedule.staff_assignments, assignment];

  void finalizeStaffAssignment({
    supabase: params.supabase,
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule,
    role: params.role,
    userId: params.userId,
    tournament: params.tournament,
    match: params.match,
    triggeredBy: params.triggeredBy,
  });

  return optimisticAssignments;
}

export async function refreshSchedulePosts(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  guildConfig: GuildRow | null;
  scheduleId: string;
  tournament: TournamentRow;
  match: MatchScheduleRow;
}): Promise<ScheduleWithDetails> {
  const schedule = await getScheduleWithDetails(params.supabase, params.scheduleId);
  if (!schedule) {
    throw new ScheduleNotFoundError('Schedule not found.');
  }

  if (!schedule.schedules_message_id) {
    throw new ScheduleError(
      'This schedule has no post in the schedule channel. Create or restore it before refreshing buttons.',
    );
  }

  const { schedulesMessageId, assignmentButtonsExpiresAt } = await syncSchedulesChannelMessage({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: schedule.staff_assignments,
    thumbnailUrl: schedule.thumbnail_url,
    activateAssignmentButtons: true,
  });

  const { error } = await params.supabase
    .from('schedules')
    .update({
      schedules_message_id: schedulesMessageId,
      assignment_buttons_expires_at: assignmentButtonsExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', schedule.id);

  if (error) {
    throw new Error(`Failed to refresh schedule: ${error.message}`);
  }

  const refreshed = await getScheduleWithDetails(params.supabase, schedule.id);
  if (!refreshed) {
    throw new ScheduleNotFoundError('Schedule not found after refresh.');
  }

  return refreshed;
}

export async function regenerateScheduleThumbnail(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  scheduleId: string;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  guildConfig: GuildRow | null;
}): Promise<string | null> {
  const schedule = await getScheduleWithDetails(params.supabase, params.scheduleId);
  if (!schedule) {
    throw new ScheduleNotFoundError('Schedule not found.');
  }

  const thumbnailUrl = await publishScheduleThumbnail({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    tournamentName: params.tournament.name,
    match: params.match,
    scheduledAt: parseScheduleUtcInstant(schedule.scheduled_at),
    distinctBackground: false,
  });

  if (!thumbnailUrl) return null;

  await syncScheduleMessages({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule: { ...schedule, thumbnail_url: thumbnailUrl },
    tournament: params.tournament,
    match: params.match,
    assignments: schedule.staff_assignments,
    thumbnailUrl,
  });

  await params.supabase
    .from('schedules')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', schedule.id);

  return thumbnailUrl;
}

export async function resignFromSchedule(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  ticketChannel: TextChannel;
  schedule: ScheduleRow;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  guildConfig: GuildRow | null;
  userId: string;
  roles: Array<'judge' | 'recorder'>;
  reason?: string;
  regenerateImage: boolean;
}): Promise<{ regenerated: boolean }> {
  const assignments = await getScheduleAssignments(params.supabase, params.schedule.id);
  const active = getActiveAssignments(assignments).filter(
    (row) =>
      row.discord_user_id === params.userId && params.roles.includes(row.role),
  );

  if (active.length === 0) {
    throw new ScheduleError('You are not assigned to the selected role(s) on this schedule.');
  }

  const now = new Date().toISOString();
  for (const assignment of active) {
    await params.supabase
      .from('staff_assignments')
      .update({
        resigned_at: now,
        resign_reason: params.reason ?? null,
      })
      .eq('id', assignment.id);

    await removeStaffTicketAccess(params.ticketChannel, assignment.discord_user_id);
    await notifyTicketStaffChange(
      params.ticketChannel.id,
      params.guild,
      buildStaffResignedMessage(assignment.discord_user_id, assignment.role),
    );
  }

  const updated = await getScheduleWithDetails(params.supabase, params.schedule.id);
  if (!updated) {
    throw new ScheduleNotFoundError('Schedule not found after resignation.');
  }

  await syncScheduleMessages({
    client: params.client,
    guild: params.guild,
    guildConfig: params.guildConfig,
    schedule: updated,
    tournament: params.tournament,
    match: params.match,
    assignments: updated.staff_assignments,
    thumbnailUrl: updated.thumbnail_url,
  });

  await refreshScheduleReminderMessage({
    client: params.client,
    guild: params.guild,
    schedule: updated,
    assignments: updated.staff_assignments,
  });

  let regenerated = false;
  if (params.regenerateImage) {
    const url = await regenerateScheduleThumbnail({
      supabase: params.supabase,
      client: params.client,
      guild: params.guild,
      scheduleId: params.schedule.id,
      tournament: params.tournament,
      match: params.match,
      guildConfig: params.guildConfig,
    });
    regenerated = Boolean(url);
  }

  return { regenerated };
}

export async function disableExpiredScheduleAssignmentButtons(
  client: Client,
  supabase: SupabaseClient,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .not('assignment_buttons_expires_at', 'is', null)
    .lte('assignment_buttons_expires_at', now)
    .not('schedules_message_id', 'is', null);

  if (error) {
    console.error('[schedules] Failed to load expired assignment buttons:', error.message);
    return;
  }

  for (const row of rows ?? []) {
    try {
      await lockScheduleAssignmentButtons({
        client,
        supabase,
        schedule: row as ScheduleRow,
      });
    } catch (lockError) {
      console.error(
        `[schedules] Failed to lock assignment buttons for ${(row as ScheduleRow).id}:`,
        lockError,
      );
    }
  }
}

async function lockScheduleAssignmentButtons(params: {
  client: Client;
  supabase: SupabaseClient;
  schedule: ScheduleRow;
}): Promise<void> {
  const { data: tournamentRow, error: tournamentError } = await params.supabase
    .from('tournaments')
    .select('guild_id')
    .eq('id', params.schedule.tournament_id)
    .maybeSingle();

  if (tournamentError || !tournamentRow) return;

  const guild = await params.client.guilds
    .fetch((tournamentRow as { guild_id: string }).guild_id)
    .catch(() => null);
  if (!guild) return;

  const guildConfig = await getGuildConfig(params.supabase, guild.id);
  const scheduleChannelId = guildConfig?.schedule_channel_id;
  if (!scheduleChannelId || !params.schedule.schedules_message_id) return;

  const assignments = await getScheduleAssignments(params.supabase, params.schedule.id);
  const channel = await guild.channels.fetch(scheduleChannelId);
  if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) return;

  const message = await (channel as TextChannel).messages
    .fetch(params.schedule.schedules_message_id)
    .catch(() => null);

  if (message) {
    await message.edit({
      components: buildScheduleAssignmentComponents(params.schedule.id, assignments, {
        buttonsLocked: true,
      }),
    });
  }

  const { error } = await params.supabase
    .from('schedules')
    .update({
      assignment_buttons_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.schedule.id);

  if (error) {
    throw new Error(`Failed to clear assignment button expiry: ${error.message}`);
  }
}

export async function listUnassignedSchedules(
  supabase: SupabaseClient,
  guildId: string,
  filter: UnassignedFilter,
): Promise<ScheduleWithDetails[]> {
  const schedules = await listSchedulesForGuild(supabase, guildId);
  return schedules.filter((schedule) => {
    const missingJudge = !hasActiveRoleAssignment(schedule.staff_assignments, 'judge');
    const missingRecorder = !hasActiveRoleAssignment(schedule.staff_assignments, 'recorder');
    if (!missingJudge && !missingRecorder) return false;

    if (filter === 'all') return missingJudge && missingRecorder;
    if (filter === 'any') return missingJudge || missingRecorder;
    if (filter === 'missing_judge') return missingJudge;
    return missingRecorder;
  });
}

export function resolveResignRoles(role: ResignRoleChoice): Array<'judge' | 'recorder'> {
  if (role === 'both') return ['judge', 'recorder'];
  return [role];
}
