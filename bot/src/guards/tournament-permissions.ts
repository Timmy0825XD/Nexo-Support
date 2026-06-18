import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { TournamentRow } from '../types/tournament.js';
import { PermissionError, isGuildAdmin, isOrganiser } from './permissions.js';

export function hasTournamentAdminRole(
  member: GuildMember,
  tournament: TournamentRow,
): boolean {
  return member.roles.cache.has(tournament.admin_role_id);
}

export function hasTournamentHelperRole(
  member: GuildMember,
  tournament: TournamentRow,
): boolean {
  return member.roles.cache.has(tournament.helper_role_id);
}

export function canUploadScore(
  member: GuildMember,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
): boolean {
  if (isGuildAdmin(member, guildConfig)) return true;
  if (isOrganiser(member, guildConfig)) return true;
  return hasTournamentAdminRole(member, tournament);
}

export function canCorrectBracket(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return isOrganiser(member, guildConfig);
}

export function canViewRoomAvailability(
  member: GuildMember,
  guildConfig: GuildRow | null,
): boolean {
  if (isOrganiser(member, guildConfig)) return true;
  if (guildConfig?.staff_role_id && member.roles.cache.has(guildConfig.staff_role_id)) {
    return true;
  }
  return false;
}

export function assertUploadScorePermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
  tournament: TournamentRow,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canUploadScore(member, guildConfig, tournament)) {
    throw new PermissionError(
      'You need server admin, organiser, or tournament admin permissions to upload scores.',
    );
  }
}

export function assertCorrectBracketPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canCorrectBracket(member, guildConfig)) {
    throw new PermissionError(
      'You need organiser or server administrator permissions to correct bracket scores.',
    );
  }
}

export function assertRoomAvailabilityPermission(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!canViewRoomAvailability(member, guildConfig)) {
    throw new PermissionError(
      'You need organiser or staff permissions to view available match rooms.',
    );
  }
}
