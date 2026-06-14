import type { Guild, GuildMember, Role } from 'discord.js';
import {
  roleAssignmentErrorMessage,
  roleManagementErrorMessage,
  validateRoleManagement,
} from '../utils/role-hierarchy.js';

export interface BulkRoleResult {
  processed: number;
  skipped: number;
  failed: number;
}

export async function toggleUserRole(
  guild: Guild,
  executor: GuildMember,
  target: GuildMember,
  role: Role,
): Promise<{ action: 'added' | 'removed' }> {
  const validation = validateRoleManagement(guild, executor, role);
  if (!validation.ok && validation.reason) {
    throw new Error(roleManagementErrorMessage(validation.reason));
  }

  if (target.roles.cache.has(role.id)) {
    await target.roles.remove(role, `Role toggle by ${executor.user.tag}`);
    return { action: 'removed' };
  }

  await target.roles.add(role, `Role toggle by ${executor.user.tag}`);
  return { action: 'added' };
}

export async function addRoleToAllMembers(
  guild: Guild,
  executor: GuildMember,
  role: Role,
): Promise<BulkRoleResult> {
  const validation = validateRoleManagement(guild, executor, role);
  if (!validation.ok && validation.reason) {
    throw new Error(roleAssignmentErrorMessage(validation.reason));
  }

  const members = await guild.members.fetch();
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.roles.cache.has(role.id)) {
      skipped += 1;
      continue;
    }

    try {
      await member.roles.add(role, `Bulk role add by ${executor.user.tag}`);
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed, skipped, failed };
}

export async function removeRoleFromAllMembers(
  guild: Guild,
  executor: GuildMember,
  role: Role,
): Promise<BulkRoleResult> {
  const validation = validateRoleManagement(guild, executor, role);
  if (!validation.ok && validation.reason) {
    throw new Error(
      validation.reason === 'bot_hierarchy'
        ? 'I cannot remove this role because it is higher than or equal to my highest role.'
        : roleAssignmentErrorMessage(validation.reason),
    );
  }

  const members = await guild.members.fetch();
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (!member.roles.cache.has(role.id)) {
      skipped += 1;
      continue;
    }

    try {
      await member.roles.remove(role, `Bulk role remove by ${executor.user.tag}`);
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed, skipped, failed };
}

export const ROLE_LIST_INLINE_THRESHOLD = 40;

export interface RoleMemberRow {
  username: string;
  displayName: string;
  userId: string;
  isBot: boolean;
}

export function collectRoleMembers(role: Role): RoleMemberRow[] {
  return [...role.members.values()].map((member) => ({
    username: member.user.username,
    displayName: member.displayName,
    userId: member.user.id,
    isBot: member.user.bot,
  }));
}

export function summarizeRoleMembers(members: RoleMemberRow[]): {
  total: number;
  humans: number;
  bots: number;
} {
  const bots = members.filter((m) => m.isBot).length;
  return { total: members.length, humans: members.length - bots, bots };
}
