import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasActiveRoleAssignment } from '../guards/schedule-permissions.js';
import { getGuildConfig } from '../services/guilds.js';
import { confirmScheduleAttendance } from '../services/schedule-reminders.js';
import {
  ScheduleError,
  ScheduleNotFoundError,
  assignStaffRole,
  getScheduleWithDetails,
  memberHasStaffRoleForAssignment,
} from '../services/schedules.js';
import type { TournamentRow } from '../types/tournament.js';
import type { MatchScheduleRow } from '../types/match.js';
import {
  areScheduleAssignmentButtonsActive,
  buildScheduleAssignmentComponents,
  buildScheduleAssignmentSuccessMessage,
  buildScheduleConfirmSuccessMessage,
  buildScheduleReminderComponents,
  formatStaffRoleLabel,
  parseScheduleAssignCustomId,
  parseScheduleConfirmCustomId,
} from '../utils/schedule-display.js';

async function handleScheduleAssignButton(
  interaction: ButtonInteraction,
  supabase: SupabaseClient,
  parsed: { role: import('../types/schedule.js').ScheduleStaffRole; scheduleId: string },
): Promise<void> {
  if (!interaction.guild) return;

  const memberRoles = interaction.member?.roles;
  const roleSet =
    memberRoles && 'cache' in memberRoles
      ? new Set(memberRoles.cache.keys())
      : new Set<string>();

  const [guildConfig, schedule] = await Promise.all([
    getGuildConfig(supabase, interaction.guild.id),
    getScheduleWithDetails(supabase, parsed.scheduleId),
  ]);

  if (!memberHasStaffRoleForAssignment(roleSet, guildConfig, parsed.role)) {
    throw new ScheduleError(
      `You need the ${formatStaffRoleLabel(parsed.role)} role to take this assignment.`,
    );
  }

  if (!schedule) {
    throw new ScheduleNotFoundError('This schedule no longer exists.');
  }

  if (!areScheduleAssignmentButtonsActive(schedule.assignment_buttons_expires_at)) {
    throw new ScheduleError(
      'Assignment buttons have expired. Use `/schedule refresh` to re-enable them.',
    );
  }

  if (hasActiveRoleAssignment(schedule.staff_assignments, parsed.role)) {
    throw new ScheduleError(`A ${parsed.role} is already assigned to this schedule.`);
  }

  const tournament = {
    id: schedule.tournament_id,
    name: schedule.tournament.name,
  } as TournamentRow;

  const match = {
    id: schedule.match_id,
    team1_name: schedule.match.team1_name,
    team2_name: schedule.match.team2_name,
    challonge_match_id: schedule.match.challonge_match_id,
    round: schedule.match.round,
  } as MatchScheduleRow;

  const assignments = await assignStaffRole({
    supabase,
    client: interaction.client,
    guild: interaction.guild,
    guildConfig,
    scheduleId: parsed.scheduleId,
    role: parsed.role,
    userId: interaction.user.id,
    tournament,
    match,
    schedule,
    triggeredBy: interaction.user,
  });

  await Promise.all([
    interaction.editReply({
      content: buildScheduleAssignmentSuccessMessage(parsed.role),
    }),
    interaction.message?.editable
      ? interaction.message.edit({
          components: buildScheduleAssignmentComponents(parsed.scheduleId, assignments, {
            buttonsLocked: !areScheduleAssignmentButtonsActive(
              schedule.assignment_buttons_expires_at,
            ),
          }),
        })
      : Promise.resolve(),
  ]);
}

async function handleScheduleConfirmButton(
  interaction: ButtonInteraction,
  supabase: SupabaseClient,
  parsed: { role: import('../types/schedule.js').ScheduleStaffRole; scheduleId: string },
): Promise<void> {
  const updated = await confirmScheduleAttendance({
    supabase,
    scheduleId: parsed.scheduleId,
    role: parsed.role,
    userId: interaction.user.id,
  });

  const channel = interaction.channel;
  if (!channel?.isTextBased() || channel.isDMBased()) {
    throw new ScheduleError('This button can only be used in a server text channel.');
  }

  await Promise.all([
    channel.send({
      content: buildScheduleConfirmSuccessMessage(parsed.role, interaction.user.id),
    }),
    interaction.message?.editable
      ? interaction.message.edit({
          components: buildScheduleReminderComponents(parsed.scheduleId, updated.staff_assignments),
        })
      : Promise.resolve(),
  ]);
}

export async function handleScheduleButton(
  interaction: ButtonInteraction,
  supabase: SupabaseClient,
): Promise<boolean> {
  const confirmParsed = parseScheduleConfirmCustomId(interaction.customId);
  const assignParsed = confirmParsed ? null : parseScheduleAssignCustomId(interaction.customId);
  const parsed = confirmParsed ?? assignParsed;
  if (!parsed) return false;

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'This button can only be used inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  try {
    if (confirmParsed) {
      await interaction.deferUpdate();
      try {
        await handleScheduleConfirmButton(interaction, supabase, parsed);
      } catch (error) {
        const message =
          error instanceof ScheduleError || error instanceof ScheduleNotFoundError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something went wrong while processing this button.';
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
      }
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await handleScheduleAssignButton(interaction, supabase, parsed);
      } catch (error) {
        const message =
          error instanceof ScheduleError || error instanceof ScheduleNotFoundError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something went wrong while processing this button.';
        await interaction.editReply({ content: message });
      }
    }
  } catch (error) {
    const message =
      error instanceof ScheduleError || error instanceof ScheduleNotFoundError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Something went wrong while processing this button.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }

  return true;
}
