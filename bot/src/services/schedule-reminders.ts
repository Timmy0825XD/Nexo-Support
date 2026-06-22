import {
  ChannelType,
  type Client,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveAssignments, hasActiveRoleAssignment } from '../guards/schedule-permissions.js';
import type { GuildRow } from '../types/guild.js';
import type { MatchScheduleRow } from '../types/match.js';
import {
  SCHEDULE_COLUMNS,
  type ScheduleRow,
  type ScheduleStaffRole,
  type ScheduleWithDetails,
} from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import {
  buildScheduleAssignmentComponents,
  buildScheduleReminderComponents,
  buildScheduleReminderContent,
  buildScheduleReminderEmbed,
  buildScheduleUrgentContent,
  buildScheduleUrgentEmbed,
  SCHEDULE_URGENT_GRACE_MS,
  SCHEDULE_REMINDER_LEAD_MS,
  type ScheduleUrgentFailure,
} from '../utils/schedule-display.js';
import { parseScheduleUtcInstant } from '../utils/schedule-datetime.js';
import { getGuildConfig } from './guilds.js';
import {
  disableExpiredScheduleAssignmentButtons,
  getScheduleEmbedParams,
  getScheduleWithDetails,
  removeStaffForFailedConfirmation,
  ScheduleError,
  ScheduleNotFoundError,
  syncScheduleChannelPost,
} from './schedules.js';

function mapSchedule(row: Record<string, unknown>): ScheduleRow {
  return row as unknown as ScheduleRow;
}

async function loadTournament(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<TournamentRow | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load tournament: ${error.message}`);
  }

  return data ? (data as TournamentRow) : null;
}

async function loadMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<MatchScheduleRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, team1_name, team2_name, challonge_match_id, round, ticket_channel_id')
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load match: ${error.message}`);
  }

  return data ? (data as MatchScheduleRow) : null;
}

async function resolveCaptainIds(
  tournament: TournamentRow,
  match: Pick<MatchScheduleRow, 'team1_name' | 'team2_name'>,
): Promise<string[]> {
  const { resolveCaptainsForMatchTeams } = await import('./sheets.js');
  const captains = await resolveCaptainsForMatchTeams(
    tournament.sheet_link,
    match.team1_name,
    match.team2_name,
  );
  return [captains.team1CaptainId, captains.team2CaptainId].filter((id): id is string =>
    Boolean(id),
  );
}

async function fetchSchedulesDueForReminder(supabase: SupabaseClient): Promise<ScheduleRow[]> {
  const now = Date.now();
  const windowEnd = new Date(now + SCHEDULE_REMINDER_LEAD_MS).toISOString();

  const { data, error } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .is('reminder_sent_at', null)
    .gt('scheduled_at', new Date(now).toISOString())
    .lte('scheduled_at', windowEnd)
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load schedules for reminders: ${error.message}`);
  }

  return (data ?? []).map(mapSchedule);
}

async function fetchSchedulesDueForUrgent(supabase: SupabaseClient): Promise<ScheduleRow[]> {
  const { data, error } = await supabase
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .is('urgent_sent_at', null)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load schedules for urgent alerts: ${error.message}`);
  }

  return (data ?? []).map(mapSchedule);
}

async function claimScheduleReminder(
  supabase: SupabaseClient,
  scheduleId: string,
  reminderMessageId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('schedules')
    .update({
      reminder_sent_at: now,
      reminder_message_id: reminderMessageId,
      updated_at: now,
    })
    .eq('id', scheduleId)
    .is('reminder_sent_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark reminder sent: ${error.message}`);
  }

  return Boolean(data);
}

async function claimScheduleUrgent(
  supabase: SupabaseClient,
  scheduleId: string,
  urgentMessageId: string | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('schedules')
    .update({
      urgent_sent_at: now,
      urgent_message_id: urgentMessageId,
      updated_at: now,
    })
    .eq('id', scheduleId)
    .is('urgent_sent_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark urgent alert sent: ${error.message}`);
  }

  return Boolean(data);
}

function resolveMissingRoles(assignments: ScheduleWithDetails['staff_assignments']): ScheduleStaffRole[] {
  const missing: ScheduleStaffRole[] = [];
  if (!hasActiveRoleAssignment(assignments, 'judge')) missing.push('judge');
  if (!hasActiveRoleAssignment(assignments, 'recorder')) missing.push('recorder');
  return missing;
}

async function claimScheduleReminderSkipped(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('schedules')
    .update({
      reminder_sent_at: now,
      reminder_message_id: null,
      updated_at: now,
    })
    .eq('id', scheduleId)
    .is('reminder_sent_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark reminder skipped: ${error.message}`);
  }

  return Boolean(data);
}

async function sendScheduleReminder(params: {
  client: Client;
  supabase: SupabaseClient;
  guild: Guild;
  guildConfig: GuildRow | null;
  schedule: ScheduleWithDetails;
  tournament: TournamentRow;
  match: MatchScheduleRow;
}): Promise<void> {
  const active = getActiveAssignments(params.schedule.staff_assignments);
  if (active.length === 0) {
    await claimScheduleReminderSkipped(params.supabase, params.schedule.id);
    return;
  }

  const ticketChannel = await params.guild.channels.fetch(params.schedule.ticket_channel_id);
  if (!ticketChannel?.isTextBased() || ticketChannel.type !== ChannelType.GuildText) {
    console.warn(`[schedule-reminder] Ticket channel unavailable for schedule ${params.schedule.id}`);
    return;
  }

  const embedParams = await getScheduleEmbedParams({
    guild: params.guild,
    schedule: params.schedule,
    tournament: params.tournament,
    match: params.match,
    assignments: params.schedule.staff_assignments,
    thumbnailUrl: params.schedule.thumbnail_url,
  });

  const captainIds = await resolveCaptainIds(params.tournament, params.match);
  const staffUserIds = active.map((row) => row.discord_user_id);
  const notification = buildScheduleReminderContent({
    guild: params.guild,
    captainIds,
    staffUserIds,
    rulesChannelId: params.tournament.rules_channel_id,
  });

  const message = await (ticketChannel as TextChannel).send({
    content: notification.content,
    embeds: [buildScheduleReminderEmbed(embedParams)],
    components: buildScheduleReminderComponents(
      params.schedule.id,
      params.schedule.staff_assignments,
    ),
    allowedMentions: notification.mentionUserIds.length
      ? { users: notification.mentionUserIds }
      : undefined,
  });

  const claimed = await claimScheduleReminder(params.supabase, params.schedule.id, message.id);
  if (!claimed) {
    await message.delete().catch(() => undefined);
  }
}

async function processScheduleUrgent(params: {
  client: Client;
  supabase: SupabaseClient;
  guild: Guild;
  guildConfig: GuildRow | null;
  schedule: ScheduleWithDetails;
  tournament: TournamentRow;
  match: MatchScheduleRow;
}): Promise<void> {
  const ticketChannel = await params.guild.channels.fetch(params.schedule.ticket_channel_id);
  const ticketText =
    ticketChannel?.isTextBased() && ticketChannel.type === ChannelType.GuildText
      ? (ticketChannel as TextChannel)
      : null;

  if (!ticketText) {
    console.warn(
      `[schedule-reminder] Ticket channel unavailable for urgent alert ${params.schedule.id}; continuing with schedule channel post`,
    );
  }

  const failures: ScheduleUrgentFailure[] = [];
  let assignments = params.schedule.staff_assignments;

  for (const role of ['judge', 'recorder'] as const) {
    const active = getActiveAssignments(assignments).find((row) => row.role === role);
    if (!active) continue;
    if (active.attendance_confirmed_at) continue;

    failures.push({ role, userId: active.discord_user_id });
    await removeStaffForFailedConfirmation({
      supabase: params.supabase,
      guild: params.guild,
      ticketChannel: ticketText,
      scheduleId: params.schedule.id,
      role,
    });
    assignments = (await getScheduleWithDetails(params.supabase, params.schedule.id))?.staff_assignments ?? assignments;
  }

  const missingRoles = resolveMissingRoles(assignments);
  let urgentMessageId: string | null = null;

  if (missingRoles.length > 0) {
    const scheduleChannelId = params.guildConfig?.schedule_channel_id;
    if (!scheduleChannelId) {
      console.warn(
        `[schedule-reminder] No schedule channel configured for guild ${params.guild.id}; skipping urgent post`,
      );
    } else {
      const scheduleChannel = await params.guild.channels.fetch(scheduleChannelId);
      if (scheduleChannel?.isTextBased() && scheduleChannel.type === ChannelType.GuildText) {
        const embedParams = await getScheduleEmbedParams({
          guild: params.guild,
          schedule: params.schedule,
          tournament: params.tournament,
          match: params.match,
          assignments,
          thumbnailUrl: params.schedule.thumbnail_url,
        });

        const notification = buildScheduleUrgentContent(
          params.guild,
          params.guildConfig,
          missingRoles,
        );

        const refreshedSchedule = await getScheduleWithDetails(params.supabase, params.schedule.id);
        const message = await (scheduleChannel as TextChannel).send({
          content: notification?.content ?? '🚨 URGENT STAFF REPLACEMENT NEEDED!',
          embeds: [buildScheduleUrgentEmbed(embedParams, failures, missingRoles)],
          components: buildScheduleAssignmentComponents(
            params.schedule.id,
            refreshedSchedule?.staff_assignments ?? assignments,
          ),
          allowedMentions: notification ? { roles: notification.roleIds } : undefined,
        });
        urgentMessageId = message.id;
      }
    }

    try {
      const { assignmentButtonsExpiresAt } = await syncScheduleChannelPost({
        client: params.client,
        guild: params.guild,
        guildConfig: params.guildConfig,
        schedule: { ...params.schedule, staff_assignments: assignments } as ScheduleWithDetails,
        tournament: params.tournament,
        match: params.match,
        assignments,
        thumbnailUrl: params.schedule.thumbnail_url,
        activateAssignmentButtons: true,
      });

      if (assignmentButtonsExpiresAt) {
        await params.supabase
          .from('schedules')
          .update({
            assignment_buttons_expires_at: assignmentButtonsExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.schedule.id);
      }
    } catch (error) {
      console.warn('[schedule-reminder] Failed to refresh schedule channel post:', error);
    }
  }

  await claimScheduleUrgent(params.supabase, params.schedule.id, urgentMessageId);
}

async function processScheduleReminderRow(
  client: Client,
  supabase: SupabaseClient,
  scheduleRow: ScheduleRow,
): Promise<void> {
  const schedule = await getScheduleWithDetails(supabase, scheduleRow.id);
  if (!schedule || schedule.reminder_sent_at) return;

  const tournament = await loadTournament(supabase, schedule.tournament_id);
  const match = await loadMatch(supabase, schedule.match_id);
  if (!tournament || !match) return;

  const guild = await client.guilds.fetch(tournament.guild_id).catch(() => null);
  if (!guild) return;

  const guildConfig = await getGuildConfig(supabase, guild.id);
  await sendScheduleReminder({
    client,
    supabase,
    guild,
    guildConfig,
    schedule,
    tournament,
    match,
  });
}

async function processScheduleUrgentRow(
  client: Client,
  supabase: SupabaseClient,
  scheduleRow: ScheduleRow,
): Promise<void> {
  const schedule = await getScheduleWithDetails(supabase, scheduleRow.id);
  if (!schedule || schedule.urgent_sent_at) return;

  const matchAgeMs = Date.now() - parseScheduleUtcInstant(schedule.scheduled_at).getTime();
  if (matchAgeMs > SCHEDULE_URGENT_GRACE_MS) {
    await claimScheduleUrgent(supabase, schedule.id, null);
    return;
  }

  const tournament = await loadTournament(supabase, schedule.tournament_id);
  const match = await loadMatch(supabase, schedule.match_id);
  if (!tournament || !match) return;

  const guild = await client.guilds.fetch(tournament.guild_id).catch(() => null);
  if (!guild) return;

  const guildConfig = await getGuildConfig(supabase, guild.id);
  await processScheduleUrgent({
    client,
    supabase,
    guild,
    guildConfig,
    schedule,
    tournament,
    match,
  });
}

export async function runScheduleReminderWorkerTick(
  client: Client,
  supabase: SupabaseClient,
): Promise<void> {
  await disableExpiredScheduleAssignmentButtons(client, supabase);

  const [dueReminders, dueUrgent] = await Promise.all([
    fetchSchedulesDueForReminder(supabase),
    fetchSchedulesDueForUrgent(supabase),
  ]);

  for (const schedule of dueReminders) {
    try {
      await processScheduleReminderRow(client, supabase, schedule);
    } catch (error) {
      console.error(`[schedule-reminder] Reminder failed for schedule ${schedule.id}:`, error);
    }
  }

  for (const schedule of dueUrgent) {
    try {
      await processScheduleUrgentRow(client, supabase, schedule);
    } catch (error) {
      console.error(`[schedule-reminder] Urgent alert failed for schedule ${schedule.id}:`, error);
    }
  }
}

export async function confirmScheduleAttendance(params: {
  supabase: SupabaseClient;
  scheduleId: string;
  role: ScheduleStaffRole;
  userId: string;
}): Promise<ScheduleWithDetails> {
  const schedule = await getScheduleWithDetails(params.supabase, params.scheduleId);
  if (!schedule) {
    throw new ScheduleNotFoundError('This schedule no longer exists.');
  }

  if (parseScheduleUtcInstant(schedule.scheduled_at).getTime() <= Date.now()) {
    throw new ScheduleError('The confirmation window for this match has closed.');
  }

  const active = getActiveAssignments(schedule.staff_assignments).find(
    (row) => row.role === params.role,
  );
  if (!active) {
    throw new ScheduleError(`No ${params.role} is currently assigned to this schedule.`);
  }
  if (active.discord_user_id !== params.userId) {
    throw new ScheduleError(`Only the assigned ${params.role} can confirm attendance for this match.`);
  }
  if (active.attendance_confirmed_at) {
    throw new ScheduleError('Attendance has already been confirmed for this role.');
  }

  const now = new Date().toISOString();
  const { error } = await params.supabase
    .from('staff_assignments')
    .update({ attendance_confirmed_at: now })
    .eq('id', active.id);

  if (error) {
    throw new Error(`Failed to confirm attendance: ${error.message}`);
  }

  const updated = await getScheduleWithDetails(params.supabase, params.scheduleId);
  if (!updated) {
    throw new ScheduleNotFoundError('This schedule no longer exists.');
  }

  return updated;
}
