import type { Guild, GuildMember, TextChannel } from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { StaffFirePosition, StaffRecruitPosition } from '../schemas/staff-positions.js';
import {
  roleManagementErrorMessage,
  validateRoleManagement,
} from '../utils/role-hierarchy.js';
import { formatRole, formatRoleList, DELETED_CHANNEL } from '../utils/guild-display.js';

export class StaffPositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffPositionError';
  }
}

const T1_POSITIONS = new Set<string>(['T1 Admin', 'T1 Admin + Helper + Best Staff']);
const T2_POSITIONS = new Set<string>(['T2 Admin', 'T2 Admin + Helper + Best Staff']);

export function assertStaffPositionConfigured(
  position: StaffRecruitPosition | StaffFirePosition,
  config: GuildRow,
): void {
  if (T1_POSITIONS.has(position) && !config.t1_admin_role_id) {
    throw new StaffPositionError(
      'T1 Admin role is not configured. Set it with `/staff config edit t1_admin_role:` before using this position.',
    );
  }
  if (T2_POSITIONS.has(position) && !config.t2_admin_role_id) {
    throw new StaffPositionError(
      'T2 Admin role is not configured. Set it with `/staff config edit t2_admin_role:` before using this position.',
    );
  }
}

function uniqueRoleIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function formatStaffWelcomeChannel(
  guild: Guild,
  channelId: string | null | undefined
): string {
  if (!channelId) return 'Not configured';
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return DELETED_CHANNEL;
  return `・ <#${channel.id}>`;
}

export function resolveRolesForRecruit(
  position: StaffRecruitPosition,
  config: GuildRow,
): string[] {
  switch (position) {
    case 'Judge':
      return uniqueRoleIds([config.judge_role_id, config.staff_role_id]);
    case 'Recorder':
      return uniqueRoleIds([config.recorder_role_id, config.staff_role_id]);
    case 'Judge + Recorder':
      return uniqueRoleIds([
        config.judge_role_id,
        config.recorder_role_id,
        config.staff_role_id,
      ]);
    case 'T1 Admin':
      return uniqueRoleIds([
        config.t1_admin_role_id,
        config.server_helper_role_id,
        config.staff_role_id,
      ]);
    case 'T2 Admin':
      return uniqueRoleIds([
        config.t2_admin_role_id,
        config.server_helper_role_id,
        config.staff_role_id,
      ]);
    case 'Best Staff':
      return uniqueRoleIds([config.best_staff_role_id]);
    case 'Server Helper':
      return uniqueRoleIds([config.server_helper_role_id, config.staff_role_id]);
    case 'T1 Admin + Helper + Best Staff':
      return uniqueRoleIds([
        config.t1_admin_role_id,
        config.server_helper_role_id,
        config.best_staff_role_id,
        config.staff_role_id,
      ]);
    case 'T2 Admin + Helper + Best Staff':
      return uniqueRoleIds([
        config.t2_admin_role_id,
        config.server_helper_role_id,
        config.best_staff_role_id,
        config.staff_role_id,
      ]);
  }
}

export function resolveRolesForFire(position: StaffFirePosition, config: GuildRow): string[] {
  switch (position) {
    case 'Judge':
      return uniqueRoleIds([config.judge_role_id]);
    case 'Recorder':
      return uniqueRoleIds([config.recorder_role_id]);
    case 'T1 Admin':
      return uniqueRoleIds([config.t1_admin_role_id]);
    case 'T2 Admin':
      return uniqueRoleIds([config.t2_admin_role_id]);
    case 'Best Staff':
      return uniqueRoleIds([config.best_staff_role_id]);
    case 'Server Helper':
      return uniqueRoleIds([config.server_helper_role_id]);
    case 'T1 Admin + Helper + Best Staff':
      return uniqueRoleIds([
        config.t1_admin_role_id,
        config.server_helper_role_id,
        config.best_staff_role_id,
      ]);
    case 'T2 Admin + Helper + Best Staff':
      return uniqueRoleIds([
        config.t2_admin_role_id,
        config.server_helper_role_id,
        config.best_staff_role_id,
      ]);
    case 'Complete':
      return uniqueRoleIds([
        config.staff_role_id,
        config.judge_role_id,
        config.recorder_role_id,
        config.t1_admin_role_id,
        config.t2_admin_role_id,
        config.best_staff_role_id,
        config.server_helper_role_id,
        config.manager_role_id,
      ]);
  }
}

export interface StaffRoleChangeResult {
  added: string[];
  removed: string[];
  skipped: string[];
  notes: string[];
}

export async function applyStaffRoles(
  guild: Guild,
  executor: GuildMember,
  target: GuildMember,
  roleIds: string[],
  mode: 'add' | 'remove',
): Promise<StaffRoleChangeResult> {
  const result: StaffRoleChangeResult = { added: [], removed: [], skipped: [], notes: [] };

  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;

    const validation = validateRoleManagement(guild, executor, role);
    if (!validation.ok && validation.reason) {
      throw new Error(roleManagementErrorMessage(validation.reason));
    }

    const hasRole = target.roles.cache.has(roleId);

    if (mode === 'add') {
      if (hasRole) {
        result.skipped.push(role.id);
        result.notes.push(`Already had ${formatRole(guild, role.id)}`);
        continue;
      }
      await target.roles.add(role, `Staff recruit by ${executor.user.tag}`);
      result.added.push(role.id);
    } else {
      if (!hasRole) {
        result.skipped.push(role.id);
        continue;
      }
      await target.roles.remove(role, `Staff fire by ${executor.user.tag}`);
      result.removed.push(role.id);
    }
  }

  return result;
}

export async function sendStaffWelcomeMessage(
  guild: Guild,
  config: GuildRow,
  target: GuildMember,
  position: StaffRecruitPosition,
): Promise<void> {
  const channelId = config.staff_chat_channel_id;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  const textChannel = channel as TextChannel;

  const content = [
    `**Welcome ${target}!** 🎉`,
    `You've been assigned as: **${position}**`,
    '',
    '**Important Channels:**',
    `• Announcements: ${formatStaffWelcomeChannel(guild, config.staff_announcement_channel_id)}`,
    `• Instructions: ${formatStaffWelcomeChannel(guild, config.staff_instructions_channel_id)}`,
    `• Details Submission: ${formatStaffWelcomeChannel(guild, config.staff_details_channel_id)}`,
    `• Schedule Channel: ${formatStaffWelcomeChannel(guild, config.schedule_channel_id)}`,
    '',
    "**We're excited to have you on board!** ",
  ].join('\n');

  await textChannel.send({ content, allowedMentions: { users: [target.id] } });
}

export function buildStaffRecruitEmbed(
  guild: Guild,
  target: GuildMember,
  position: StaffRecruitPosition,
  result: StaffRoleChangeResult,
) {
  const lines = [
    `${target} recruitment roles processed.`,
    'Assigned Position:',
    position,
    '',
    'Roles Added:',
    formatRoleList(guild, result.added),
  ];

  if (result.notes.length > 0) {
    lines.push('', 'Notes:', result.notes.join('\n'));
  }

  return lines.join('\n');
}

export function buildStaffFireEmbed(
  guild: Guild,
  target: GuildMember,
  position: StaffFirePosition,
  result: StaffRoleChangeResult,
) {
  return [
    `${target} staff role removal processed.`,
    '',
    'Removed Position:',
    position,
    '',
    'Roles Removed:',
    formatRoleList(guild, result.removed),
  ].join('\n');
}
