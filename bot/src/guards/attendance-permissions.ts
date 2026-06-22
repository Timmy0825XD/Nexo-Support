import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { TournamentRow } from '../types/tournament.js';
import { memberHasStaffRoleForAssignment } from '../services/schedules.js';
import {
  PermissionError,
  assertAdmin,
  isGuildAdmin,
  isOrganiser,
} from './permissions.js';

export function hasJudgeOrRecorderRole(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  const roleIds = new Set(member.roles.cache.keys());
  return (
    memberHasStaffRoleForAssignment(roleIds, guildConfig, 'judge') ||
    memberHasStaffRoleForAssignment(roleIds, guildConfig, 'recorder')
  );
}

export function assertAttendanceMarkPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (isGuildAdmin(member, guildConfig)) return;
  if (isOrganiser(member, guildConfig)) return;

  if (!hasJudgeOrRecorderRole(member, guildConfig)) {
    throw new PermissionError(
      'You need the configured Judge or Recorder role to mark attendance.',
    );
  }
}

export function assertAttendanceDeletePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
  createdByUserId: string | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (isGuildAdmin(member, guildConfig)) return;
  if (isOrganiser(member, guildConfig)) return;

  if (createdByUserId && createdByUserId === member.id) return;

  throw new PermissionError(
    'Only the attendance creator or an organiser can delete this record.',
  );
}

export function assertStaffWorkPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  assertAdmin(interaction, guildConfig);
}

export function canViewAttendanceTools(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  if (isGuildAdmin(member, guildConfig)) return true;
  if (isOrganiser(member, guildConfig)) return true;
  if (guildConfig?.staff_role_id && member.roles.cache.has(guildConfig.staff_role_id)) {
    return true;
  }
  return hasJudgeOrRecorderRole(member, guildConfig);
}

export function assertAttendanceStaffPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canViewAttendanceTools(member, guildConfig)) {
    throw new PermissionError(
      'You need staff, judge, recorder, or organiser permissions to use this command.',
    );
  }
}

export function canRunWorkDone(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  if (isGuildAdmin(member, guildConfig)) return true;
  if (isOrganiser(member, guildConfig)) return true;
  if (guildConfig?.staff_role_id && member.roles.cache.has(guildConfig.staff_role_id)) {
    return true;
  }
  return hasJudgeOrRecorderRole(member, guildConfig);
}

export function canViewOtherStaffWork(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  return isGuildAdmin(member, guildConfig) || isOrganiser(member, guildConfig);
}

export function assertWorkDonePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  targetUserId: string,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canRunWorkDone(member, guildConfig)) {
    throw new PermissionError(
      'You need the configured Staff, Judge, or Recorder role to use this command.',
    );
  }

  if (targetUserId !== member.id && !canViewOtherStaffWork(member, guildConfig)) {
    throw new PermissionError(
      'Only admins and organizers can view another staff member\'s work.',
    );
  }
}

export function assertGetSheetPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!isOrganiser(member, guildConfig)) {
    throw new PermissionError(
      'You need the configured Organiser role or server Administrator permission to run this command.',
    );
  }
}

export function assertLinkAddPermission(
  interaction: ChatInputCommandInteraction,
  recorderDiscordId: string,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  if (interaction.user.id !== recorderDiscordId) {
    throw new PermissionError(
      'Only the recorder assigned to this attendance can add recording links.',
    );
  }
}

export function assertLinkDeletePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  recorderDiscordId: string,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (isGuildAdmin(member, guildConfig)) return;
  if (isOrganiser(member, guildConfig)) return;

  if (interaction.user.id !== recorderDiscordId) {
    throw new PermissionError(
      'Only the recorder assigned to this attendance can delete recording links.',
    );
  }
}
