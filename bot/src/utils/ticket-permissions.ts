import {
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { TournamentRow } from '../types/tournament.js';

export const TICKET_MEMBER_ALLOW =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.EmbedLinks;

export const TICKET_STAFF_ROLE_ALLOW =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.EmbedLinks;

type PermissionOverwriteInput = {
  id: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
};

function uniqueRoleIds(roleIds: Array<string | null | undefined>): string[] {
  return [...new Set(roleIds.filter((roleId): roleId is string => Boolean(roleId)))];
}

/** Guild-wide staff roles that may inherit category access — denied at ticket channel level. */
export function collectBroadStaffRoleIds(guildConfig: GuildRow | null): string[] {
  if (!guildConfig) return [];
  return uniqueRoleIds([
    guildConfig.staff_role_id,
    guildConfig.judge_role_id,
    guildConfig.recorder_role_id,
    guildConfig.best_staff_role_id,
    guildConfig.server_helper_role_id,
    guildConfig.challonge_mod_role_id,
    guildConfig.t1_admin_role_id,
    guildConfig.t2_admin_role_id,
  ]);
}

function collectAllowedStaffRoleIds(
  tournament: Pick<TournamentRow, 'admin_role_id' | 'helper_role_id'>,
  guildConfig: GuildRow | null,
): string[] {
  return uniqueRoleIds([
    tournament.admin_role_id,
    tournament.helper_role_id,
    guildConfig?.manager_role_id,
    guildConfig?.admin_role_id,
  ]);
}

export function buildTicketPermissionOverwrites(params: {
  guild: Guild;
  tournament: Pick<TournamentRow, 'admin_role_id' | 'helper_role_id'>;
  guildConfig: GuildRow | null;
  mode: 'open' | 'closed';
  participantMemberIds?: string[];
}): PermissionOverwriteInput[] {
  const overwrites: PermissionOverwriteInput[] = [
    {
      id: params.guild.id,
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel,
      allow: 0n,
    },
  ];

  const allowedStaffRoles = collectAllowedStaffRoleIds(params.tournament, params.guildConfig);
  const broadStaffRoles = collectBroadStaffRoleIds(params.guildConfig).filter(
    (roleId) => !allowedStaffRoles.includes(roleId),
  );

  for (const roleId of broadStaffRoles) {
    overwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel,
      allow: 0n,
    });
  }

  for (const roleId of allowedStaffRoles) {
    overwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      allow: TICKET_STAFF_ROLE_ALLOW,
      deny: 0n,
    });
  }

  if (params.mode === 'open') {
    for (const memberId of [...new Set(params.participantMemberIds ?? [])]) {
      overwrites.push({
        id: memberId,
        type: OverwriteType.Member,
        allow: TICKET_MEMBER_ALLOW,
        deny: 0n,
      });
    }
  }

  return overwrites;
}

export async function applyTicketPermissionOverwrites(
  channel: TextChannel,
  overwrites: PermissionOverwriteInput[],
): Promise<void> {
  await channel.permissionOverwrites.set(overwrites);
}

export async function applyOpenTicketPermissions(params: {
  channel: TextChannel;
  guild: Guild;
  tournament: Pick<TournamentRow, 'admin_role_id' | 'helper_role_id'>;
  guildConfig: GuildRow | null;
  participantMemberIds: string[];
}): Promise<void> {
  const overwrites = buildTicketPermissionOverwrites({
    guild: params.guild,
    tournament: params.tournament,
    guildConfig: params.guildConfig,
    mode: 'open',
    participantMemberIds: params.participantMemberIds,
  });
  await applyTicketPermissionOverwrites(params.channel, overwrites);
}

export async function applyClosedTicketPermissions(params: {
  channel: TextChannel;
  guild: Guild;
  tournament: Pick<TournamentRow, 'admin_role_id' | 'helper_role_id'>;
  guildConfig: GuildRow | null;
}): Promise<void> {
  for (const [id, overwrite] of params.channel.permissionOverwrites.cache) {
    if (overwrite.type === OverwriteType.Member) {
      await params.channel.permissionOverwrites.delete(id).catch(() => undefined);
    }
  }

  const overwrites = buildTicketPermissionOverwrites({
    guild: params.guild,
    tournament: params.tournament,
    guildConfig: params.guildConfig,
    mode: 'closed',
  });
  await applyTicketPermissionOverwrites(params.channel, overwrites);
}
