import {
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { TeamPlayer } from '../types/participant.js';
import { TICKET_MEMBER_ALLOW, TICKET_STAFF_ROLE_ALLOW } from './ticket-permissions.js';

type PermissionOverwriteInput = {
  id: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
};

export const VALIDATION_TICKET_TOPIC_PREFIX = 'nexo:validation';

export function buildValidationTicketTopic(params: {
  teamLabel: string;
  transcriptChannelId: string;
  sheetRow: number;
}): string {
  const team = params.teamLabel.replace(/[|;]/g, ' ').trim();
  return `${VALIDATION_TICKET_TOPIC_PREFIX};team=${team};row=${params.sheetRow};archive=${params.transcriptChannelId}`;
}

export function parseValidationTicketTopic(topic: string | null | undefined): {
  teamLabel: string;
  transcriptChannelId: string;
  sheetRow: number | null;
} | null {
  if (!topic?.startsWith(VALIDATION_TICKET_TOPIC_PREFIX)) return null;

  const teamMatch = topic.match(/(?:^|;)team=([^;]+)/i);
  const archiveMatch = topic.match(/(?:^|;)archive=(\d{17,20})/i);
  const rowMatch = topic.match(/(?:^|;)row=(\d+)/i);

  if (!teamMatch?.[1] || !archiveMatch?.[1]) return null;

  return {
    teamLabel: teamMatch[1].trim(),
    transcriptChannelId: archiveMatch[1],
    sheetRow: rowMatch?.[1] ? Number.parseInt(rowMatch[1], 10) : null,
  };
}

export function isValidationTicketChannel(topic: string | null | undefined): boolean {
  return parseValidationTicketTopic(topic) != null;
}

export function buildValidationChannelName(teamLabel: string): string {
  const slug = teamLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `validate-${slug || 'team'}`.slice(0, 100);
}

function normalizeDiscordTag(tag: string): string {
  const trimmed = tag.trim().replace(/^@+/, '');
  const hashIndex = trimmed.lastIndexOf('#');
  const namePart = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  return namePart.toLowerCase();
}

export function isValidDiscordSnowflake(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{17,20}$/.test(value.trim());
}

export function findMembersByTag(guild: Guild, tag: string): GuildMember[] {
  const normalized = normalizeDiscordTag(tag);
  return [
    ...guild.members.cache.filter((member) => {
      const candidates = [member.user.username, member.user.globalName]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.toLowerCase());
      return candidates.includes(normalized);
    }).values(),
  ];
}

export async function resolveGuildMemberForPlayer(
  guild: Guild,
  player: TeamPlayer,
): Promise<GuildMember | null> {
  if (isValidDiscordSnowflake(player.discordId)) {
    const member = await guild.members.fetch(player.discordId!).catch(() => null);
    if (member) return member;
  }

  const tag = player.discordTag?.trim();
  if (!tag) return null;

  const matches = findMembersByTag(guild, tag);
  return matches.length === 1 ? matches[0]! : null;
}

export function buildValidationTicketPermissionOverwrites(params: {
  guild: Guild;
  guildConfig: GuildRow | null;
  participantMemberId: string;
}): PermissionOverwriteInput[] {
  const overwrites: PermissionOverwriteInput[] = [
    {
      id: params.guild.id,
      type: OverwriteType.Role as const,
      deny: PermissionFlagsBits.ViewChannel,
      allow: 0n,
    },
  ];

  const roleIds = new Set<string>();
  if (params.guildConfig?.manager_role_id) roleIds.add(params.guildConfig.manager_role_id);
  if (params.guildConfig?.admin_role_id) roleIds.add(params.guildConfig.admin_role_id);

  for (const roleId of roleIds) {
    overwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      allow: TICKET_STAFF_ROLE_ALLOW,
      deny: 0n,
    });
  }

  overwrites.push({
    id: params.participantMemberId,
    type: OverwriteType.Member,
    allow: TICKET_MEMBER_ALLOW,
    deny: 0n,
  });

  return overwrites;
}
