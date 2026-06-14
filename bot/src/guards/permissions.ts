import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

function memberHasAdminRole(member: GuildMember, adminRoleId: string | null | undefined): boolean {
  if (!adminRoleId) return false;
  return member.roles.cache.has(adminRoleId);
}

export function isGuildAdmin(member: GuildMember, guildConfig: GuildRow | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  return memberHasAdminRole(member, guildConfig?.admin_role_id);
}

export function assertAdmin(
  interaction: ChatInputCommandInteraction,
  guildConfig: GuildRow | null,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!isGuildAdmin(member, guildConfig)) {
    throw new PermissionError(
      'You need the server Administrator permission or the configured admin role to run this command.',
    );
  }
}

function memberHasOrganiserRole(
  member: GuildMember,
  managerRoleId: string | null | undefined,
): boolean {
  if (!managerRoleId) return false;
  return member.roles.cache.has(managerRoleId);
}

export function isOrganiser(member: GuildMember, guildConfig: GuildRow | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  return memberHasOrganiserRole(member, guildConfig?.manager_role_id);
}

export function assertOrganiser(
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

export function isDiscordAdministrator(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function assertDiscordAdministrator(
  interaction: ChatInputCommandInteraction,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;
  if (!isDiscordAdministrator(member)) {
    throw new PermissionError(
      'You need the server Administrator permission to run this command.',
    );
  }
}
