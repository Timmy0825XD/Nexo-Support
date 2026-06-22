import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { ScheduleRow, StaffAssignmentRow } from '../types/schedule.js';
import type { TournamentRow } from '../types/tournament.js';
import { PermissionError, isGuildAdmin, isOrganiser } from './permissions.js';
import { hasTournamentAdminRole, hasTournamentHelperRole } from './tournament-permissions.js';

export function canCreateSchedule(
  member: GuildMember,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
): boolean {
  if (isGuildAdmin(member, guildConfig)) return true;
  if (isOrganiser(member, guildConfig)) return true;
  return hasTournamentHelperRole(member, tournament);
}

export function canDeleteSchedule(
  member: GuildMember,
  tournament: TournamentRow,
): boolean {
  return hasTournamentHelperRole(member, tournament);
}

export function canViewScheduleStaffTools(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  if (isOrganiser(member, guildConfig)) return true;
  if (guildConfig?.staff_role_id && member.roles.cache.has(guildConfig.staff_role_id)) {
    return true;
  }
  return false;
}

export function getActiveAssignments(
  assignments: StaffAssignmentRow[],
): StaffAssignmentRow[] {
  return assignments.filter((row) => !row.resigned_at);
}

export function hasActiveRoleAssignment(
  assignments: StaffAssignmentRow[],
  role: 'judge' | 'recorder',
): boolean {
  return getActiveAssignments(assignments).some((row) => row.role === role);
}

export function isUserAssignedToSchedule(
  assignments: StaffAssignmentRow[],
  userId: string,
): boolean {
  return getActiveAssignments(assignments).some((row) => row.discord_user_id === userId);
}

export function assertScheduleCreatePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canCreateSchedule(member, guildConfig, tournament)) {
    throw new PermissionError(
      'You need server admin, organiser, or tournament helper permissions to create schedules.',
    );
  }
}

export function assertScheduleDeletePermission(
  interaction: ChatInputCommandInteraction,
  tournament: TournamentRow,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canDeleteSchedule(member, tournament)) {
    throw new PermissionError(
      'You need tournament helper permissions to delete schedules.',
    );
  }
}

export function assertScheduleStaffPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canViewScheduleStaffTools(member, guildConfig)) {
    throw new PermissionError(
      'You need organiser or staff permissions to use this schedule command.',
    );
  }
}

export function assertScheduleResignPermission(
  interaction: ChatInputCommandInteraction,
  schedule: ScheduleRow,
  assignments: StaffAssignmentRow[],
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!isUserAssignedToSchedule(assignments, member.id)) {
    throw new PermissionError(
      'You must be assigned to this schedule before you can resign.',
    );
  }

  if (schedule.ticket_channel_id !== interaction.channelId) {
    throw new PermissionError('Resignation must be submitted from the match ticket channel.');
  }
}

export function canDeclareScheduleResult(
  member: GuildMember,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
  assignments: StaffAssignmentRow[],
  captainIds: string[],
): boolean {
  if (isGuildAdmin(member, guildConfig)) return true;
  if (isOrganiser(member, guildConfig)) return true;
  if (hasTournamentAdminRole(member, tournament)) return true;
  if (hasTournamentHelperRole(member, tournament)) return true;
  if (isUserAssignedToSchedule(assignments, member.id)) return true;
  return captainIds.includes(member.id);
}

export function canDeleteScheduleResult(
  member: GuildMember,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
): boolean {
  if (isGuildAdmin(member, guildConfig)) return true;
  if (isOrganiser(member, guildConfig)) return true;
  if (hasTournamentAdminRole(member, tournament)) return true;
  return hasTournamentHelperRole(member, tournament);
}

export function assertScheduleResultDeclarePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
  assignments: StaffAssignmentRow[],
  captainIds: string[],
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canDeclareScheduleResult(member, guildConfig, tournament, assignments, captainIds)) {
    throw new PermissionError(
      'You need to be assigned staff, a team captain, or tournament staff to declare results.',
    );
  }
}

export function assertScheduleResultDeletePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canDeleteScheduleResult(member, guildConfig, tournament)) {
    throw new PermissionError(
      'You need tournament organizer or helper permissions to delete schedule results.',
    );
  }
}
