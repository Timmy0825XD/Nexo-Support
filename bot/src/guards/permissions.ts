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
