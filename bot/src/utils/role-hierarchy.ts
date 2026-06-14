import type { Guild, GuildMember, Role } from 'discord.js';

export type RoleManagementFailure =
  | 'bot_unavailable'
  | 'bot_hierarchy'
  | 'executor_hierarchy'
  | 'not_editable';

export interface RoleManagementResult {
  ok: boolean;
  reason?: RoleManagementFailure;
}

export function validateRoleManagement(
  guild: Guild,
  executor: GuildMember,
  targetRole: Role,
): RoleManagementResult {
  const botMember = guild.members.me;
  if (!botMember) {
    return { ok: false, reason: 'bot_unavailable' };
  }

  if (!targetRole.editable) {
    return { ok: false, reason: 'not_editable' };
  }

  if (targetRole.position >= botMember.roles.highest.position) {
    return { ok: false, reason: 'bot_hierarchy' };
  }

  if (targetRole.position >= executor.roles.highest.position) {
    return { ok: false, reason: 'executor_hierarchy' };
  }

  return { ok: true };
}

export function roleManagementErrorMessage(reason: RoleManagementFailure): string {
  switch (reason) {
    case 'bot_hierarchy':
      return 'I cannot manage this role because it is higher than or equal to my highest role.';
    case 'executor_hierarchy':
      return 'You cannot manage roles higher than or equal to your highest role.';
    case 'not_editable':
      return 'I cannot manage this role because it is managed by an integration.';
    case 'bot_unavailable':
      return 'Bot member is unavailable in this server.';
  }
}

export function roleAssignmentErrorMessage(reason: RoleManagementFailure): string {
  switch (reason) {
    case 'bot_hierarchy':
      return 'I cannot assign this role because it is higher than or equal to my highest role.';
    case 'executor_hierarchy':
      return 'You cannot manage roles higher than or equal to your highest role.';
    case 'not_editable':
      return 'I cannot assign this role because it is managed by an integration.';
    case 'bot_unavailable':
      return 'Bot member is unavailable in this server.';
  }
}

export function roleRemovalErrorMessage(reason: RoleManagementFailure): string {
  switch (reason) {
    case 'bot_hierarchy':
      return 'I cannot remove this role because it is higher than or equal to my highest role.';
    case 'executor_hierarchy':
      return 'You cannot manage roles higher than or equal to your highest role.';
    case 'not_editable':
      return 'I cannot remove this role because it is managed by an integration.';
    case 'bot_unavailable':
      return 'Bot member is unavailable in this server.';
  }
}
