import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import type { SlashCommand } from '../types.js';
import type { GuildRow } from '../../types/guild.js';
import { autocompleteSchedules, autocompleteScheduledMatches } from '../../autocomplete/schedules.js';
import { autocompleteTournaments } from '../../autocomplete/tournaments.js';
import { PermissionError } from '../../guards/permissions.js';
import {
  assertScheduleCreatePermission,
  assertScheduleDeletePermission,
  assertScheduleResignPermission,
  assertScheduleResultDeclarePermission,
  assertScheduleResultDeletePermission,
  assertScheduleStaffPermission,
} from '../../guards/schedule-permissions.js';
import {
  TicketChannelError,
  assertMatchTicketChannel,
} from '../../guards/ticket-channel.js';
import {
  ScheduleAlreadyExistsError,
  ScheduleConfigError,
  ScheduleError,
  ScheduleNotFoundError,
  createSchedule,
  deleteSchedule,
  getScheduleAssignments,
  getScheduleByMatchId,
  getScheduleForTicket,
  getScheduleShowEmbed,
  getScheduleWithDetails,
  listSchedulesForGuild,
  refreshSchedulePosts,
  updateSchedule,
  resignFromSchedule,
  resolveResignRoles,
} from '../../services/schedules.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  logScheduleCreated,
  logScheduleDeleted,
  logScheduleRefreshed,
  logScheduleResign,
  logScheduleResultDeclared,
  logScheduleResultDeleted,
  logScheduleUpdated,
} from '../../services/guild-logs.js';
import { getMatchById, getMatchForScheduleByChallonge } from '../../services/matches.js';
import {
  ScheduleResultAlreadyExistsError,
  ScheduleResultError,
  ScheduleResultNotFoundError,
  declareScheduleResult,
  deleteScheduleResult,
  getScheduleResultAssignments,
  getScheduleResultCaptainIds,
} from '../../services/schedule-results.js';
import { getTournamentById } from '../../services/tournaments.js';
import { parseChallongeMatchIdFromTopic } from '../../services/tickets.js';
import {
  scheduleCreateSchema,
  scheduleCreateToDate,
  scheduleDeleteSchema,
  scheduleUpdateSchema,
  applyScheduleUpdateDateTime,
  scheduleResignSchema,
  scheduleResultsDeleteSchema,
  scheduleResultsSchema,
  SCHEDULE_RESULT_IMAGE_OPTION_NAMES,
  unassignedFilterSchema,
} from '../../schemas/schedule.js';
import { errorEmbed } from '../../utils/embeds.js';
import {
  buildScheduleDeleteConfirmation,
  buildScheduleRefreshSuccessEmbed,
  filterUnassignedSchedules,
  runUnassignedPagination,
} from '../../utils/schedule-display.js';
import {
  buildScheduleResultDeleteConfirmation,
  buildScheduleResultSuccessMessage,
} from '../../utils/schedule-result-display.js';

function addScheduleResultImageOptions(subcommand: SlashCommandSubcommandBuilder): void {
  for (let index = 0; index < SCHEDULE_RESULT_IMAGE_OPTION_NAMES.length; index += 1) {
    const optionName = SCHEDULE_RESULT_IMAGE_OPTION_NAMES[index]!;
    subcommand.addAttachmentOption((option) =>
      option
        .setName(optionName)
        .setDescription(`Screenshot of match result ${index + 1}`)
        .setRequired(false),
    );
  }
}

export const scheduleCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Tournament match schedule management')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create and publish an official match schedule')
        .addIntegerOption((option) =>
          option.setName('hour').setDescription('Match hour (UTC)').setRequired(true).setMinValue(0).setMaxValue(23),
        )
        .addIntegerOption((option) =>
          option.setName('minute').setDescription('Match minute (UTC)').setRequired(true).setMinValue(0).setMaxValue(59),
        )
        .addIntegerOption((option) =>
          option.setName('day').setDescription('Match day').setRequired(true).setMinValue(1).setMaxValue(31),
        )
        .addIntegerOption((option) =>
          option.setName('month').setDescription('Match month').setRequired(true).setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((option) =>
          option.setName('year').setDescription('Match year').setRequired(true).setMinValue(2020).setMaxValue(2100),
        )
        .addUserOption((option) =>
          option
            .setName('judge')
            .setDescription('Optional: pre-assign a staff member as Judge')
            .setRequired(false),
        )
        .addUserOption((option) =>
          option
            .setName('recorder')
            .setDescription('Optional: pre-assign a staff member as Recorder')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('remark')
            .setDescription('Optional schedule note (max 130 characters)')
            .setRequired(false)
            .setMaxLength(130),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('update')
        .setDescription('Update an existing match schedule')
        .addIntegerOption((option) =>
          option.setName('hour').setDescription('New hour (0-23 UTC)').setRequired(false).setMinValue(0).setMaxValue(23),
        )
        .addIntegerOption((option) =>
          option.setName('minute').setDescription('New minute (0-59)').setRequired(false).setMinValue(0).setMaxValue(59),
        )
        .addIntegerOption((option) =>
          option.setName('day').setDescription('New day').setRequired(false).setMinValue(1).setMaxValue(31),
        )
        .addIntegerOption((option) =>
          option.setName('month').setDescription('New month (1-12)').setRequired(false).setMinValue(1).setMaxValue(12),
        )
        .addIntegerOption((option) =>
          option.setName('year').setDescription('New year (2025-2030)').setRequired(false).setMinValue(2025).setMaxValue(2030),
        )
        .addUserOption((option) =>
          option.setName('judge').setDescription('Update judge').setRequired(false),
        )
        .addUserOption((option) =>
          option.setName('recorder').setDescription('Update recorder').setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('note')
            .setDescription('Update notes')
            .setRequired(false)
            .setMaxLength(130),
        )
        .addBooleanOption((option) =>
          option.setName('remove_judge').setDescription('Remove current judge').setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('remove_recorder')
            .setDescription('Remove current recorder')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for update').setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('regenerate_image')
            .setDescription('Generate new thumbnail')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete an existing scheduled match')
        .addBooleanOption((option) =>
          option
            .setName('confirm')
            .setDescription('Must be True to confirm deletion')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for deleting the schedule').setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unassigned')
        .setDescription('View scheduled matches missing assigned staff')
        .addStringOption((option) =>
          option
            .setName('filter')
            .setDescription('Filter by missing staff type')
            .setRequired(true)
            .addChoices(
              { name: 'All unassigned', value: 'all' },
              { name: 'Missing Judge', value: 'missing_judge' },
              { name: 'Missing Recorder', value: 'missing_recorder' },
              { name: 'Missing either', value: 'any' },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('show')
        .setDescription('View schedule embeds and status for a match')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('match')
            .setDescription('Scheduled match')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Re-enable assignment buttons on the schedule channel post')
        .addStringOption((option) =>
          option
            .setName('schedule')
            .setDescription('Scheduled match to refresh')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('resign')
        .setDescription('Resign from an assigned staff role for this scheduled match')
        .addStringOption((option) =>
          option
            .setName('role')
            .setDescription('Role to resign from')
            .setRequired(false)
            .addChoices(
              { name: 'Judge', value: 'judge' },
              { name: 'Recorder', value: 'recorder' },
              { name: 'Both', value: 'both' },
            ),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for resignation').setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('regenerate_image')
            .setDescription('Generate a new thumbnail after resignation')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) => {
      subcommand
        .setName('results')
        .setDescription('Record match results for this scheduled ticket')
        .addIntegerOption((option) =>
          option
            .setName('team_1_score')
            .setDescription('Team 1 score')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
        )
        .addIntegerOption((option) =>
          option
            .setName('team_2_score')
            .setDescription('Team 2 score')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
        )
        .addStringOption((option) =>
          option
            .setName('notes')
            .setDescription('Additional notes about the match')
            .setRequired(false)
            .setMaxLength(500),
        );
      addScheduleResultImageOptions(subcommand);
      return subcommand;
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('results_delete')
        .setDescription('Delete the declared result for this scheduled match')
        .addBooleanOption((option) =>
          option
            .setName('confirm')
            .setDescription('Must be True to confirm deletion')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Reason for deleting the result').setRequired(false),
        ),
    ),

  async autocomplete(interaction, { supabase }) {
    const subcommand = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);

    if (subcommand === 'show') {
      if (focused.name === 'match') {
        await autocompleteScheduledMatches(interaction, supabase);
        return;
      }
      await autocompleteTournaments(interaction, supabase);
      return;
    }

    if (subcommand === 'refresh' && focused.name === 'schedule') {
      await autocompleteSchedules(interaction, supabase);
      return;
    }

    await interaction.respond([]);
  },

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'delete' || subcommand === 'update' || subcommand === 'results' || subcommand === 'results_delete') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else {
      await interaction.deferReply();
    }

    const guildConfig = await getGuildConfig(supabase, interaction.guild.id);

    try {
      if (subcommand === 'create') {
        await handleCreate(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'update') {
        await handleUpdate(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'show') {
        await handleShow(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'delete') {
        await handleDelete(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'unassigned') {
        await handleUnassigned(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'refresh') {
        await handleRefresh(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'resign') {
        await handleResign(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'results') {
        await handleResults(interaction, supabase, guildConfig);
        return;
      }
      if (subcommand === 'results_delete') {
        await handleResultsDelete(interaction, supabase, guildConfig);
        return;
      }
    } catch (error) {
      if (error instanceof PermissionError || error instanceof TicketChannelError) {
        await interaction.editReply({ embeds: [errorEmbed('Permission Denied', error.message)] });
        return;
      }
      if (error instanceof ZodError) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Input', error.errors[0]?.message ?? 'Invalid schedule input.')],
        });
        return;
      }
      if (
        error instanceof ScheduleError ||
        error instanceof ScheduleAlreadyExistsError ||
        error instanceof ScheduleNotFoundError ||
        error instanceof ScheduleConfigError ||
        error instanceof ScheduleResultError ||
        error instanceof ScheduleResultAlreadyExistsError ||
        error instanceof ScheduleResultNotFoundError
      ) {
        await interaction.editReply({ embeds: [errorEmbed('Schedule Error', error.message)] });
        return;
      }
      throw error;
    }
  },
};

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  const { channel, ticket } = await assertMatchTicketChannel(interaction, supabase, guildConfig);

  const challongeFromTopic = parseChallongeMatchIdFromTopic(channel.topic);

  if (!challongeFromTopic) {
    throw new TicketChannelError(
      'This channel topic must include a Match ID (e.g. "Match ID: 123456789").',
    );
  }

  const resolved = await getMatchForScheduleByChallonge(
    supabase,
    interaction.guildId!,
    challongeFromTopic,
  );
  if (!resolved) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Match Not Found',
          `No match found for Match ID \`${challongeFromTopic}\` from this channel topic.`,
        ),
      ],
    });
    return;
  }

  const match = { ...resolved.match, challonge_match_id: challongeFromTopic };

  const tournament = await getTournamentById(supabase, interaction.guildId!, resolved.tournamentId);
  if (!tournament) {
    await interaction.editReply({
      embeds: [errorEmbed('Tournament Not Found', 'Could not resolve the tournament for this ticket.')],
    });
    return;
  }

  assertScheduleCreatePermission(interaction, guildConfig, tournament);

  const input = scheduleCreateSchema.parse({
    hour: interaction.options.getInteger('hour', true),
    minute: interaction.options.getInteger('minute', true),
    day: interaction.options.getInteger('day', true),
    month: interaction.options.getInteger('month', true),
    year: interaction.options.getInteger('year', true),
    judge_user_id: interaction.options.getUser('judge')?.id,
    recorder_user_id: interaction.options.getUser('recorder')?.id,
    remark: interaction.options.getString('remark') ?? undefined,
  });

  const { schedule } = await createSchedule({
    supabase,
    client: interaction.client,
    guild: interaction.guild!,
    ticketChannel: channel,
    tournament,
    match,
    guildConfig,
    scheduledAt: scheduleCreateToDate(input),
    remark: input.remark,
    judgeUserId: input.judge_user_id,
    recorderUserId: input.recorder_user_id,
    createdByUserId: interaction.user.id,
  });

  if (guildConfig) {
    void logScheduleCreated({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      schedule,
      tournamentName: tournament.name,
      matchLabel: `${match.team1_name} vs ${match.team2_name}`,
      ticketChannelId: channel.id,
    });
  }

  await interaction.deleteReply().catch(() => undefined);
}

async function handleUpdate(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  const { channel, ticket } = await assertMatchTicketChannel(interaction, supabase, guildConfig);

  const schedule = await getScheduleForTicket(supabase, channel.id);
  if (!schedule) {
    throw new ScheduleNotFoundError();
  }

  const tournament = await getTournamentById(supabase, interaction.guildId!, ticket.tournamentId);
  if (!tournament) {
    await interaction.editReply({
      embeds: [errorEmbed('Tournament Not Found', 'Could not resolve the tournament for this ticket.')],
    });
    return;
  }

  assertScheduleCreatePermission(interaction, guildConfig, tournament);

  const match = await getMatchById(supabase, ticket.tournamentId, ticket.matchId);
  if (!match) {
    throw new ScheduleError('Match for this schedule was not found.');
  }

  const input = scheduleUpdateSchema.parse({
    hour: interaction.options.getInteger('hour') ?? undefined,
    minute: interaction.options.getInteger('minute') ?? undefined,
    day: interaction.options.getInteger('day') ?? undefined,
    month: interaction.options.getInteger('month') ?? undefined,
    year: interaction.options.getInteger('year') ?? undefined,
    judge_user_id: interaction.options.getUser('judge')?.id,
    recorder_user_id: interaction.options.getUser('recorder')?.id,
    note: interaction.options.getString('note') ?? undefined,
    remove_judge: interaction.options.getBoolean('remove_judge') ?? undefined,
    remove_recorder: interaction.options.getBoolean('remove_recorder') ?? undefined,
    reason: interaction.options.getString('reason') ?? undefined,
    regenerate_image: interaction.options.getBoolean('regenerate_image') ?? undefined,
  });

  let scheduledAt: Date | undefined;
  try {
    scheduledAt = applyScheduleUpdateDateTime(input, schedule.scheduled_at);
  } catch {
    throw new ScheduleError('The provided date and time is not a valid UTC datetime.');
  }

  const { schedule: updated } = await updateSchedule({
    supabase,
    client: interaction.client,
    guild: interaction.guild!,
    ticketChannel: channel,
    schedule,
    tournament,
    match,
    guildConfig,
    scheduledAt,
    note: input.note,
    judgeUserId: input.judge_user_id,
    recorderUserId: input.recorder_user_id,
    removeJudge: input.remove_judge === true,
    removeRecorder: input.remove_recorder === true,
    reason: input.reason,
    regenerateImage: input.regenerate_image === true,
  });

  if (guildConfig) {
    void logScheduleUpdated({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      schedule: updated,
      tournamentName: tournament.name,
      matchLabel: `${match.team1_name} vs ${match.team2_name}`,
      ticketChannelId: channel.id,
      reason: input.reason,
    });
  }

  await interaction.deleteReply().catch(() => undefined);
}

async function handleShow(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  assertScheduleStaffPermission(interaction, guildConfig);

  const tournamentId = interaction.options.getString('tournament', true);
  const matchId = interaction.options.getString('match', true);

  const tournament = await getTournamentById(supabase, interaction.guildId!, tournamentId);
  if (!tournament) {
    await interaction.editReply({
      embeds: [errorEmbed('Tournament Not Found', 'The selected tournament was not found.')],
    });
    return;
  }

  const match = await getMatchById(supabase, tournamentId, matchId);
  if (!match) {
    await interaction.editReply({
      embeds: [errorEmbed('Match Not Found', 'The selected match was not found.')],
    });
    return;
  }

  const schedule = await getScheduleByMatchId(supabase, matchId);
  if (!schedule) {
    throw new ScheduleNotFoundError('No schedule exists for this match.');
  }

  const scheduleDetails = await getScheduleWithDetails(supabase, schedule.id);
  if (!scheduleDetails) {
    throw new ScheduleNotFoundError('Schedule details could not be loaded.');
  }

  const embed = await getScheduleShowEmbed({
    guild: interaction.guild!,
    schedule: scheduleDetails,
    tournament,
    match,
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  const { channel, ticket } = await assertMatchTicketChannel(interaction, supabase, guildConfig);

  const schedule = await getScheduleForTicket(supabase, channel.id);
  if (!schedule) {
    throw new ScheduleNotFoundError();
  }

  const tournament = await getTournamentById(supabase, interaction.guildId!, ticket.tournamentId);
  if (!tournament) {
    await interaction.editReply({
      embeds: [errorEmbed('Tournament Not Found', 'Could not resolve the tournament for this ticket.')],
    });
    return;
  }

  assertScheduleDeletePermission(interaction, tournament);

  const parsed = scheduleDeleteSchema.parse({
    confirm: interaction.options.getBoolean('confirm', true),
    reason: interaction.options.getString('reason') ?? undefined,
  });

  if (!parsed.confirm) {
    await interaction.editReply({
      embeds: [errorEmbed('Deletion Cancelled', 'Schedule deletion was cancelled.')],
    });
    return;
  }

  const match = await getMatchById(supabase, ticket.tournamentId, ticket.matchId);
  const matchLabel = match
    ? `${match.team1_name} vs ${match.team2_name}`
    : schedule.match_id;

  await deleteSchedule({
    supabase,
    client: interaction.client,
    guild: interaction.guild!,
    ticketChannel: channel,
    schedule,
    guildConfig,
    reason: parsed.reason,
  });

  if (guildConfig) {
    void logScheduleDeleted({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      tournamentName: tournament.name,
      matchLabel,
      ticketChannelId: channel.id,
      reason: parsed.reason,
    });
  }

  await interaction.editReply({
    content: buildScheduleDeleteConfirmation(matchLabel, parsed.reason),
  });
}

async function handleUnassigned(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  assertScheduleStaffPermission(interaction, guildConfig);

  const filter = unassignedFilterSchema.parse(interaction.options.getString('filter', true));
  const schedules = await listSchedulesForGuild(supabase, interaction.guildId!);
  const entries = filterUnassignedSchedules(schedules, filter);

  await runUnassignedPagination(
    interaction,
    interaction.guild!,
    entries,
    filter,
    guildConfig?.schedule_channel_id,
  );
}

async function handleRefresh(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  assertScheduleStaffPermission(interaction, guildConfig);

  const scheduleId = interaction.options.getString('schedule', true);
  const schedule = await getScheduleWithDetails(supabase, scheduleId);
  if (!schedule) {
    throw new ScheduleNotFoundError('Selected schedule was not found.');
  }

  const tournament = await getTournamentById(
    supabase,
    interaction.guildId!,
    schedule.tournament_id,
  );
  if (!tournament) {
    throw new ScheduleError('Tournament for this schedule was not found.');
  }

  const match = await getMatchById(supabase, schedule.tournament_id, schedule.match_id);
  if (!match) {
    throw new ScheduleError('Match for this schedule was not found.');
  }

  await refreshSchedulePosts({
    supabase,
    client: interaction.client,
    guild: interaction.guild!,
    guildConfig,
    scheduleId,
    tournament,
    match,
  });

  if (guildConfig) {
    void logScheduleRefreshed({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      scheduleId,
      tournamentName: tournament.name,
    });
  }

  await interaction.editReply({ embeds: [buildScheduleRefreshSuccessEmbed()] });
}

async function handleResign(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  const { channel, ticket } = await assertMatchTicketChannel(interaction, supabase, guildConfig);

  const schedule = await getScheduleForTicket(supabase, channel.id);
  if (!schedule) {
    throw new ScheduleNotFoundError();
  }

  const assignments = await getScheduleAssignments(supabase, schedule.id);
  assertScheduleResignPermission(interaction, schedule, assignments);

  const parsed = scheduleResignSchema.parse({
    role: interaction.options.getString('role') ?? 'both',
    reason: interaction.options.getString('reason') ?? undefined,
    regenerate_image: interaction.options.getBoolean('regenerate_image') ?? false,
  });

  const tournament = await getTournamentById(supabase, interaction.guildId!, ticket.tournamentId);
  if (!tournament) {
    throw new ScheduleError('Tournament for this schedule was not found.');
  }

  const match = await getMatchById(supabase, ticket.tournamentId, ticket.matchId);
  if (!match) {
    throw new ScheduleError('Match for this schedule was not found.');
  }

  const rolesToResign = resolveResignRoles(parsed.role).filter((role) =>
    assignments.some(
      (row) => !row.resigned_at && row.discord_user_id === interaction.user.id && row.role === role,
    ),
  );

  if (rolesToResign.length === 0) {
    throw new ScheduleError('You are not assigned to the selected role(s) on this schedule.');
  }

  await resignFromSchedule({
    supabase,
    client: interaction.client,
    guild: interaction.guild!,
    ticketChannel: channel,
    schedule,
    tournament,
    match,
    guildConfig,
    userId: interaction.user.id,
    roles: rolesToResign,
    reason: parsed.reason,
    regenerateImage: parsed.regenerate_image,
  });

  if (guildConfig) {
    void logScheduleResign({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      scheduleId: schedule.id,
      roles: rolesToResign,
      reason: parsed.reason,
      tournamentName: tournament.name,
    });
  }

  await interaction.deleteReply().catch(() => undefined);
}

function collectScheduleResultAttachments(
  interaction: ChatInputCommandInteraction,
): NonNullable<ReturnType<ChatInputCommandInteraction['options']['getAttachment']>>[] {
  return SCHEDULE_RESULT_IMAGE_OPTION_NAMES.map((name) =>
    interaction.options.getAttachment(name),
  ).filter(
    (attachment): attachment is NonNullable<typeof attachment> => attachment !== null,
  );
}

async function handleResults(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  const { channel, ticket } = await assertMatchTicketChannel(interaction, supabase, guildConfig);

  const schedule = await getScheduleForTicket(supabase, channel.id);
  if (!schedule) {
    throw new ScheduleNotFoundError();
  }

  const tournament = await getTournamentById(supabase, interaction.guildId!, ticket.tournamentId);
  if (!tournament) {
    await interaction.editReply({
      embeds: [errorEmbed('Tournament Not Found', 'Could not resolve the tournament for this ticket.')],
    });
    return;
  }

  const match = await getMatchById(supabase, ticket.tournamentId, ticket.matchId);
  if (!match) {
    throw new ScheduleError('Match for this schedule was not found.');
  }

  const assignments = await getScheduleResultAssignments(supabase, schedule.id);
  const captainIds = await getScheduleResultCaptainIds(tournament, match);
  assertScheduleResultDeclarePermission(
    interaction,
    guildConfig,
    tournament,
    assignments,
    captainIds,
  );

  const input = scheduleResultsSchema.parse({
    team_1_score: interaction.options.getInteger('team_1_score', true),
    team_2_score: interaction.options.getInteger('team_2_score', true),
    notes: interaction.options.getString('notes') ?? undefined,
  });

  const proofAttachments = collectScheduleResultAttachments(interaction);

  const result = await declareScheduleResult({
    supabase,
    client: interaction.client,
    guild: interaction.guild!,
    schedule,
    tournament,
    match,
    assignments,
    team1Score: input.team_1_score,
    team2Score: input.team_2_score,
    notes: input.notes,
    proofAttachments,
    declaredByUserId: interaction.user.id,
  });

  if (guildConfig) {
    void logScheduleResultDeclared({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      tournamentName: tournament.name,
      team1Name: match.team1_name,
      team2Name: match.team2_name,
      team1Score: input.team_1_score,
      team2Score: input.team_2_score,
      winnerSide: result.winner_side,
      resultChannelId: result.result_channel_id,
      scheduleId: schedule.id,
      notes: input.notes,
    });
  }

  await interaction.editReply({
    content: buildScheduleResultSuccessMessage(interaction.guild!, result.result_channel_id),
  });
}

async function handleResultsDelete(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<void> {
  const { channel, ticket } = await assertMatchTicketChannel(interaction, supabase, guildConfig);

  const schedule = await getScheduleForTicket(supabase, channel.id);
  if (!schedule) {
    throw new ScheduleNotFoundError();
  }

  const tournament = await getTournamentById(supabase, interaction.guildId!, ticket.tournamentId);
  if (!tournament) {
    await interaction.editReply({
      embeds: [errorEmbed('Tournament Not Found', 'Could not resolve the tournament for this ticket.')],
    });
    return;
  }

  assertScheduleResultDeletePermission(interaction, guildConfig, tournament);

  const parsed = scheduleResultsDeleteSchema.parse({
    confirm: interaction.options.getBoolean('confirm', true),
    reason: interaction.options.getString('reason') ?? undefined,
  });

  if (!parsed.confirm) {
    await interaction.editReply({
      embeds: [errorEmbed('Deletion Cancelled', 'Schedule result deletion was cancelled.')],
    });
    return;
  }

  const match = await getMatchById(supabase, ticket.tournamentId, ticket.matchId);
  const matchLabel = match
    ? `${match.team1_name} vs ${match.team2_name}`
    : schedule.match_id;

  await deleteScheduleResult({
    supabase,
    client: interaction.client,
    scheduleId: schedule.id,
    ticketChannelId: channel.id,
  });

  if (guildConfig) {
    void logScheduleResultDeleted({
      client: interaction.client,
      guild: interaction.guild!,
      config: guildConfig,
      triggeredBy: interaction.user,
      tournamentName: tournament.name,
      matchLabel,
      scheduleId: schedule.id,
      reason: parsed.reason,
    });
  }

  await interaction.editReply({
    content: buildScheduleResultDeleteConfirmation(matchLabel, parsed.reason),
  });
}
