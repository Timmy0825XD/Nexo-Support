import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client, Guild, TextChannel } from 'discord.js';
import {
  ATTENDANCE_COLUMNS,
  ATTENDANCE_REMARK_DW,
  MAX_RECORDING_LINKS,
  type AttendanceRow,
  type AttendanceWithMatch,
} from '../types/attendance.js';
import type { MatchScheduleRow } from '../types/match.js';
import type { ScheduleRow } from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import {
  buildAttendanceDeletedEmbed,
  buildAttendanceMarkedEmbed,
  buildEventsRecordingLinksMessage,
  type AttendanceMatchInfo,
} from '../utils/attendance-display.js';
import { isDefaultWin } from '../utils/staff-work-pay.js';
import { isValidYouTubeUrl, normalizeYouTubeUrl } from '../utils/youtube-url.js';
import { parseScheduleUtcInstant } from '../utils/schedule-datetime.js';
import { getMatchForSchedule } from './matches.js';

export class AttendanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttendanceError';
  }
}

export class AttendanceAlreadyExistsError extends AttendanceError {
  constructor() {
    super('Attendance already exists for this match.');
    this.name = 'AttendanceAlreadyExistsError';
  }
}

export class AttendanceNotFoundError extends AttendanceError {
  constructor(message = 'No attendance record found for this match.') {
    super(message);
    this.name = 'AttendanceNotFoundError';
  }
}

function parseRecordingLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function mapAttendance(row: Record<string, unknown>): AttendanceRow {
  return {
    id: String(row.id),
    tournament_id: String(row.tournament_id),
    match_id: String(row.match_id),
    ticket_channel_id: String(row.ticket_channel_id),
    judge_discord_id: String(row.judge_discord_id),
    recorder_discord_id: String(row.recorder_discord_id),
    team1_score: Number(row.team1_score),
    team2_score: Number(row.team2_score),
    remark: row.remark != null ? String(row.remark) : null,
    recording_links: parseRecordingLinks(row.recording_links),
    created_by_discord_user_id:
      row.created_by_discord_user_id != null ? String(row.created_by_discord_user_id) : null,
    ticket_message_id: row.ticket_message_id != null ? String(row.ticket_message_id) : null,
    attendance_channel_message_id:
      row.attendance_channel_message_id != null
        ? String(row.attendance_channel_message_id)
        : null,
    deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
    deleted_reason: row.deleted_reason != null ? String(row.deleted_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAttendanceWithMatch(row: Record<string, unknown>): AttendanceWithMatch {
  const attendance = mapAttendance(row);
  const rawMatch = row.match;
  let match: AttendanceWithMatch['match'] = null;

  if (rawMatch && typeof rawMatch === 'object') {
    const matchRow = Array.isArray(rawMatch) ? rawMatch[0] : rawMatch;
    if (matchRow && typeof matchRow === 'object') {
      match = {
        round: String((matchRow as Record<string, unknown>).round ?? ''),
        group: String((matchRow as Record<string, unknown>).group ?? ''),
        team1_name: String((matchRow as Record<string, unknown>).team1_name ?? ''),
        team2_name: String((matchRow as Record<string, unknown>).team2_name ?? ''),
      };
    }
  }

  return { ...attendance, match };
}

export async function getActiveAttendanceForMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<AttendanceRow | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('match_id', matchId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load attendance: ${error.message}`);
  }

  return data ? mapAttendance(data) : null;
}

export async function getActiveAttendanceForTicket(
  supabase: SupabaseClient,
  ticketChannelId: string,
): Promise<AttendanceRow | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('ticket_channel_id', ticketChannelId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load attendance: ${error.message}`);
  }

  return data ? mapAttendance(data) : null;
}

export async function getAttendanceWithDetails(
  supabase: SupabaseClient,
  attendanceId: string,
): Promise<AttendanceWithMatch | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`${ATTENDANCE_COLUMNS}, match:matches(round, group, team1_name, team2_name)`)
    .eq('id', attendanceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load attendance: ${error.message}`);
  }

  return data ? mapAttendanceWithMatch(data as Record<string, unknown>) : null;
}

export async function fetchAttendanceForTournament(
  supabase: SupabaseClient,
  tournamentId: string,
  includeDefaultWins: boolean,
): Promise<AttendanceWithMatch[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`${ATTENDANCE_COLUMNS}, match:matches(round, group, team1_name, team2_name)`)
    .eq('tournament_id', tournamentId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to load attendance records: ${error.message}`);
  }

  const records = (data ?? []).map((row) => mapAttendanceWithMatch(row as Record<string, unknown>));
  if (includeDefaultWins) return records;
  return records.filter((record) => !isDefaultWin(record.remark));
}

export async function fetchAttendanceForUser(
  supabase: SupabaseClient,
  tournamentId: string,
  userId: string,
): Promise<AttendanceWithMatch[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`${ATTENDANCE_COLUMNS}, match:matches(round, group, team1_name, team2_name)`)
    .eq('tournament_id', tournamentId)
    .is('deleted_at', null)
    .or(`judge_discord_id.eq.${userId},recorder_discord_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load attendance records: ${error.message}`);
  }

  return (data ?? []).map((row) => mapAttendanceWithMatch(row as Record<string, unknown>));
}

export async function searchAttendedMatchesForAutocomplete(
  supabase: SupabaseClient,
  tournamentId: string,
  query: string,
): Promise<Array<{ matchId: string; label: string }>> {
  const { data, error } = await supabase
    .from('attendance')
    .select('match_id, match:matches(round, group, team1_name, team2_name)')
    .eq('tournament_id', tournamentId)
    .is('deleted_at', null)
    .limit(50);

  if (error) {
    throw new Error(`Failed to search attended matches: ${error.message}`);
  }

  const normalized = query.trim().toLowerCase();
  const choices: Array<{ matchId: string; label: string }> = [];

  for (const row of data ?? []) {
    const matchRaw = (row as { match: unknown }).match;
    const match = Array.isArray(matchRaw) ? matchRaw[0] : matchRaw;
    if (!match || typeof match !== 'object') continue;

    const matchRow = match as {
      round: string;
      group: string;
      team1_name: string;
      team2_name: string;
    };
    const label = `${matchRow.round} · ${matchRow.team1_name} vs ${matchRow.team2_name}`;
    if (normalized && !label.toLowerCase().includes(normalized)) continue;

    choices.push({
      matchId: String((row as { match_id: string }).match_id),
      label: label.slice(0, 100),
    });
  }

  return choices.slice(0, 25);
}

export interface MissingLinkRow {
  matchLabel: string;
  roundLabel: string;
  team1Name: string;
  team2Name: string;
  recorderId: string;
  markedAt: string;
}

export async function fetchMissingLinksForRecorder(
  supabase: SupabaseClient,
  recorderId: string,
  tournamentId?: string,
): Promise<MissingLinkRow[]> {
  let query = supabase
    .from('attendance')
    .select(`${ATTENDANCE_COLUMNS}, match:matches(round, group, team1_name, team2_name)`)
    .eq('recorder_discord_id', recorderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (tournamentId) {
    query = query.eq('tournament_id', tournamentId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load missing links: ${error.message}`);
  }

  return mapMissingLinkRows(data ?? []);
}

export async function fetchMissingLinksForTournament(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<MissingLinkRow[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`${ATTENDANCE_COLUMNS}, match:matches(round, group, team1_name, team2_name)`)
    .eq('tournament_id', tournamentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load missing links: ${error.message}`);
  }

  return mapMissingLinkRows(data ?? []);
}

function mapMissingLinkRows(rows: unknown[]): MissingLinkRow[] {
  const result: MissingLinkRow[] = [];
  for (const raw of rows) {
    const record = mapAttendanceWithMatch(raw as Record<string, unknown>);
    if (record.recording_links.length > 0) continue;
    result.push({
      matchLabel: record.match
        ? `${record.match.team1_name} vs ${record.match.team2_name}`
        : 'Unknown match',
      roundLabel: record.match?.round?.trim() || record.match?.group?.trim() || 'Unknown',
      team1Name: record.match?.team1_name ?? 'Team 1',
      team2Name: record.match?.team2_name ?? 'Team 2',
      recorderId: record.recorder_discord_id,
      markedAt: record.created_at,
    });
  }
  return result;
}

async function syncAttendanceEmbedMessages(params: {
  client: Client;
  guild: Guild;
  tournament: TournamentRow;
  match: AttendanceMatchInfo;
  attendance: AttendanceWithMatch;
}): Promise<{ ticketMessageId: string | null; attendanceChannelMessageId: string | null }> {
  const embed = buildAttendanceMarkedEmbed({
    guild: params.guild,
    tournament: params.tournament,
    match: params.match,
    attendance: params.attendance,
  });

  let ticketMessageId = params.attendance.ticket_message_id;
  let attendanceChannelMessageId = params.attendance.attendance_channel_message_id;

  const ticketChannel = await params.client.channels
    .fetch(params.attendance.ticket_channel_id)
    .catch(() => null);

  if (ticketChannel?.isTextBased() && !ticketChannel.isDMBased()) {
    if (ticketMessageId) {
      const message = await ticketChannel.messages.fetch(ticketMessageId).catch(() => null);
      if (message) {
        await message.edit({ embeds: [embed] });
      } else {
        const sent = await ticketChannel.send({ embeds: [embed] });
        ticketMessageId = sent.id;
      }
    }
  }

  const attendanceChannel = await params.client.channels
    .fetch(params.tournament.attendance_channel_id)
    .catch(() => null);

  if (attendanceChannel?.isTextBased() && !attendanceChannel.isDMBased()) {
    if (attendanceChannelMessageId) {
      const message = await attendanceChannel.messages.fetch(attendanceChannelMessageId).catch(() => null);
      if (message) {
        await message.edit({ embeds: [embed] });
      } else {
        const sent = await attendanceChannel.send({ embeds: [embed] });
        attendanceChannelMessageId = sent.id;
      }
    }
  }

  return { ticketMessageId, attendanceChannelMessageId };
}

async function publishRecordingLinksToEventsChannel(params: {
  client: Client;
  guild: Guild;
  eventsLinksChannelId: string | null | undefined;
  tournamentName: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  links: string[];
}): Promise<void> {
  const channelId = params.eventsLinksChannelId;
  if (!channelId || params.links.length === 0) return;

  const channel = await params.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  await channel.send(
    buildEventsRecordingLinksMessage({
      tournamentName: params.tournamentName,
      team1Name: params.team1Name,
      team2Name: params.team2Name,
      team1Score: params.team1Score,
      team2Score: params.team2Score,
      links: params.links,
    }),
  );
}

function normalizeRecordingLinksInput(links: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const link of links) {
    const value = normalizeYouTubeUrl(link);
    if (!value || seen.has(value)) continue;
    if (!isValidYouTubeUrl(value)) {
      throw new AttendanceError('All recording links must be valid YouTube URLs.');
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export async function markAttendance(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  ticketChannel: TextChannel;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  schedule: ScheduleRow;
  createdByUserId: string;
  judgeDiscordId: string;
  recorderDiscordId: string;
  team1Score: number;
  team2Score: number;
  remark?: string;
  initialLinks?: string[];
}): Promise<AttendanceWithMatch> {
  const existing = await getActiveAttendanceForMatch(params.supabase, params.match.id);
  if (existing) {
    throw new AttendanceAlreadyExistsError();
  }

  const now = new Date();
  const scheduledAt = parseScheduleUtcInstant(params.schedule.scheduled_at);
  if (now.getTime() < scheduledAt.getTime()) {
    throw new AttendanceError('Attendance cannot be marked before the scheduled time.');
  }

  const recordingLinks = normalizeRecordingLinksInput(params.initialLinks ?? []);
  if (recordingLinks.length > MAX_RECORDING_LINKS) {
    throw new AttendanceError(`A maximum of ${MAX_RECORDING_LINKS} recording links is allowed.`);
  }
  const rowTimestamps = new Date().toISOString();

  const { data, error } = await params.supabase
    .from('attendance')
    .insert({
      id: crypto.randomUUID(),
      tournament_id: params.tournament.id,
      match_id: params.match.id,
      ticket_channel_id: params.ticketChannel.id,
      judge_discord_id: params.judgeDiscordId,
      recorder_discord_id: params.recorderDiscordId,
      team1_score: params.team1Score,
      team2_score: params.team2Score,
      remark: params.remark ?? null,
      recording_links: recordingLinks,
      created_by_discord_user_id: params.createdByUserId,
      created_at: rowTimestamps,
      updated_at: rowTimestamps,
    })
    .select(ATTENDANCE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to mark attendance: ${error.message}`);
  }

  let attendance = mapAttendanceWithMatch({
    ...(data as Record<string, unknown>),
    match: {
      round: params.match.round,
      group: params.match.group,
      team1_name: params.match.team1_name,
      team2_name: params.match.team2_name,
    },
  });

  const embed = buildAttendanceMarkedEmbed({
    guild: params.guild,
    tournament: params.tournament,
    match: params.match,
    attendance,
  });

  const ticketMessage = await params.ticketChannel.send({ embeds: [embed] });
  let attendanceChannelMessageId: string | null = null;

  const attendanceChannel = await params.client.channels
    .fetch(params.tournament.attendance_channel_id)
    .catch(() => null);

  if (attendanceChannel?.isTextBased() && !attendanceChannel.isDMBased()) {
    const attendanceMessage = await attendanceChannel.send({ embeds: [embed] });
    attendanceChannelMessageId = attendanceMessage.id;
  }

  const { error: updateError } = await params.supabase
    .from('attendance')
    .update({
      ticket_message_id: ticketMessage.id,
      attendance_channel_message_id: attendanceChannelMessageId,
    })
    .eq('id', attendance.id);

  if (updateError) {
    throw new Error(`Failed to store attendance message IDs: ${updateError.message}`);
  }

  attendance = {
    ...attendance,
    ticket_message_id: ticketMessage.id,
    attendance_channel_message_id: attendanceChannelMessageId,
  };

  if (recordingLinks.length > 0) {
    await publishRecordingLinksToEventsChannel({
      client: params.client,
      guild: params.guild,
      eventsLinksChannelId: params.tournament.events_links_channel_id,
      tournamentName: params.tournament.name,
      team1Name: params.match.team1_name,
      team2Name: params.match.team2_name,
      team1Score: params.team1Score,
      team2Score: params.team2Score,
      links: recordingLinks,
    });
  }

  return attendance;
}

export async function deleteAttendance(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  tournament: TournamentRow;
  match: MatchScheduleRow;
  attendance: AttendanceRow;
  deletedByUserId: string;
  reason?: string;
}): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { error } = await params.supabase
    .from('attendance')
    .update({
      deleted_at: deletedAt,
      deleted_reason: params.reason ?? null,
    })
    .eq('id', params.attendance.id);

  if (error) {
    throw new Error(`Failed to delete attendance: ${error.message}`);
  }

  const deletedEmbed = buildAttendanceDeletedEmbed({
    guild: params.guild,
    tournament: params.tournament,
    match: params.match,
    reason: params.reason,
  });

  const ticketChannel = await params.client.channels
    .fetch(params.attendance.ticket_channel_id)
    .catch(() => null);

  if (ticketChannel?.isTextBased() && !ticketChannel.isDMBased() && params.attendance.ticket_message_id) {
    const message = await ticketChannel.messages
      .fetch(params.attendance.ticket_message_id)
      .catch(() => null);
    if (message) await message.edit({ embeds: [deletedEmbed] });
  }

  const attendanceChannel = await params.client.channels
    .fetch(params.tournament.attendance_channel_id)
    .catch(() => null);

  if (
    attendanceChannel?.isTextBased() &&
    !attendanceChannel.isDMBased() &&
    params.attendance.attendance_channel_message_id
  ) {
    const message = await attendanceChannel.messages
      .fetch(params.attendance.attendance_channel_message_id)
      .catch(() => null);
    if (message) await message.delete().catch(() => undefined);
  }
}

export async function addRecordingLinks(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  tournament: TournamentRow;
  attendanceId: string;
  links: string[];
}): Promise<AttendanceWithMatch> {
  const attendance = await getAttendanceWithDetails(params.supabase, params.attendanceId);
  if (!attendance || attendance.deleted_at) {
    throw new AttendanceNotFoundError();
  }

  const normalizedLinks = normalizeRecordingLinksInput(params.links);
  if (normalizedLinks.length === 0) {
    throw new AttendanceError('At least one recording link is required.');
  }

  const duplicateLinks = normalizedLinks.filter((link) => attendance.recording_links.includes(link));
  if (duplicateLinks.length > 0) {
    throw new AttendanceError(
      'One or more recording links are already attached to this attendance record.',
    );
  }

  const updatedLinks = [...attendance.recording_links, ...normalizedLinks];
  if (updatedLinks.length > MAX_RECORDING_LINKS) {
    throw new AttendanceError(`A maximum of ${MAX_RECORDING_LINKS} recording links is allowed.`);
  }

  const { error } = await params.supabase
    .from('attendance')
    .update({ recording_links: updatedLinks })
    .eq('id', attendance.id);

  if (error) {
    throw new Error(`Failed to add recording link: ${error.message}`);
  }

  const match = await getMatchForSchedule(params.supabase, params.tournament.id, attendance.match_id);

  if (!match) {
    throw new AttendanceError('Match data is unavailable for this attendance record.');
  }

  const matchInfo = {
    team1_name: match.team1_name,
    team2_name: match.team2_name,
    round: match.round,
    group: match.group,
    ticket_channel_id: match.ticket_channel_id,
  };

  const refreshed: AttendanceWithMatch = {
    ...attendance,
    recording_links: updatedLinks,
    match: attendance.match ?? {
      round: match.round,
      group: match.group,
      team1_name: match.team1_name,
      team2_name: match.team2_name,
    },
  };

  const messageIds = await syncAttendanceEmbedMessages({
    client: params.client,
    guild: params.guild,
    tournament: params.tournament,
    match: matchInfo,
    attendance: refreshed,
  });

  if (
    messageIds.ticketMessageId !== refreshed.ticket_message_id ||
    messageIds.attendanceChannelMessageId !== refreshed.attendance_channel_message_id
  ) {
    await params.supabase
      .from('attendance')
      .update({
        ticket_message_id: messageIds.ticketMessageId,
        attendance_channel_message_id: messageIds.attendanceChannelMessageId,
      })
      .eq('id', attendance.id);
  }

  await publishRecordingLinksToEventsChannel({
    client: params.client,
    guild: params.guild,
    eventsLinksChannelId: params.tournament.events_links_channel_id,
    tournamentName: params.tournament.name,
    team1Name: match.team1_name,
    team2Name: match.team2_name,
    team1Score: attendance.team1_score,
    team2Score: attendance.team2_score,
    links: normalizedLinks,
  });

  return {
    ...refreshed,
    ticket_message_id: messageIds.ticketMessageId,
    attendance_channel_message_id: messageIds.attendanceChannelMessageId,
  };
}

export async function deleteAllRecordingLinks(params: {
  supabase: SupabaseClient;
  client: Client;
  guild: Guild;
  tournament: TournamentRow;
  attendanceId: string;
}): Promise<AttendanceWithMatch & { deletedCount: number }> {
  const attendance = await getAttendanceWithDetails(params.supabase, params.attendanceId);
  if (!attendance || attendance.deleted_at) {
    throw new AttendanceNotFoundError();
  }

  const deletedCount = attendance.recording_links.length;
  if (deletedCount === 0) {
    throw new AttendanceError('This attendance record has no recording links.');
  }

  const { error } = await params.supabase
    .from('attendance')
    .update({ recording_links: [] })
    .eq('id', attendance.id);

  if (error) {
    throw new Error(`Failed to delete recording links: ${error.message}`);
  }

  const match = await getMatchForSchedule(params.supabase, params.tournament.id, attendance.match_id);

  if (!match) {
    throw new AttendanceError('Match data is unavailable for this attendance record.');
  }

  const matchInfo = {
    team1_name: match.team1_name,
    team2_name: match.team2_name,
    round: match.round,
    group: match.group,
    ticket_channel_id: match.ticket_channel_id,
  };

  const refreshed: AttendanceWithMatch = {
    ...attendance,
    recording_links: [],
    match: attendance.match ?? {
      round: match.round,
      group: match.group,
      team1_name: match.team1_name,
      team2_name: match.team2_name,
    },
  };

  await syncAttendanceEmbedMessages({
    client: params.client,
    guild: params.guild,
    tournament: params.tournament,
    match: matchInfo,
    attendance: refreshed,
  });

  return { ...refreshed, deletedCount };
}

export async function getAttendanceByTournamentAndMatchLabel(
  supabase: SupabaseClient,
  tournamentId: string,
  matchLabel: string,
): Promise<AttendanceWithMatch | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`${ATTENDANCE_COLUMNS}, match:matches(round, group, team1_name, team2_name)`)
    .eq('tournament_id', tournamentId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to load attendance records: ${error.message}`);
  }

  for (const row of data ?? []) {
    const record = mapAttendanceWithMatch(row as Record<string, unknown>);
    if (!record.match) continue;
    const label = `${record.match.round} · ${record.match.team1_name} vs ${record.match.team2_name}`;
    if (label === matchLabel) return record;
  }

  return null;
}

export { ATTENDANCE_REMARK_DW };
