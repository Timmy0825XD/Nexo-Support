import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import type { MatchListRow } from '../types/match.js';
import type { TournamentRow } from '../types/tournament.js';
import {
  findParticipantsByBracketNames,
  normalizeParticipantName,
} from './sheets.js';
import { buildTicketTopic } from './tickets.js';
import { sendMatchTicketWelcome } from '../utils/match-ticket-welcome.js';
import { buildTicketChannelName } from '../utils/ticket-channel-name.js';

export class MatchRoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchRoomError';
  }
}

export interface CreatedRoomResult {
  matchId: string;
  channelId: string;
  channelName: string;
}

export interface CreateRoomsResult {
  created: CreatedRoomResult[];
  skipped: string[];
  warnings: string[];
  errors: string[];
}

const MAX_CATEGORY_CHANNELS = 50;

function collectOpenCategoryIds(tournament: TournamentRow): string[] {
  return [
    tournament.ticket_open_category_1_id,
    tournament.ticket_open_category_2_id,
    tournament.ticket_open_category_3_id,
    tournament.ticket_open_category_4_id,
  ].filter((categoryId): categoryId is string => Boolean(categoryId));
}

export async function findAvailableCategory(
  guild: Guild,
  categoryIds: string[],
): Promise<CategoryChannel | null> {
  for (const categoryId of categoryIds) {
    const channel = await guild.channels.fetch(categoryId);
    if (!channel || channel.type !== ChannelType.GuildCategory) continue;

    const category = channel as CategoryChannel;
    const childCount = guild.channels.cache.filter(
      (child) => child.parentId === category.id,
    ).size;

    if (childCount < MAX_CATEGORY_CHANNELS) {
      return category;
    }
  }

  return null;
}

export async function resolveAutoCategory(
  guild: Guild,
  tournament: TournamentRow,
): Promise<CategoryChannel> {
  const category = await findAvailableCategory(guild, collectOpenCategoryIds(tournament));
  if (!category) {
    throw new MatchRoomError(
      'All configured open ticket categories are full. Add another category or close unused tickets.',
    );
  }
  return category;
}

function assertBotCanManageCategory(guild: Guild, category: CategoryChannel): void {
  const me = guild.members.me;
  if (!me) {
    throw new MatchRoomError('Bot member is unavailable in this guild.');
  }

  const permissions = category.permissionsFor(me);
  if (
    !permissions?.has(PermissionFlagsBits.ManageChannels) ||
    !permissions.has(PermissionFlagsBits.ViewChannel)
  ) {
    throw new MatchRoomError(
      `Bot lacks Manage Channels permission in category ${category.name}.`,
    );
  }
}

async function buildPermissionOverwrites(
  guild: Guild,
  tournament: TournamentRow,
  guildConfig: GuildRow | null,
  memberIds: string[],
) {
  const overwrites: Array<{
    id: string;
    type: OverwriteType;
    allow: bigint;
    deny: bigint;
  }> = [
    {
      id: guild.id,
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel,
      allow: 0n,
    },
  ];

  const roleIds = new Set<string>([
    tournament.admin_role_id,
    tournament.helper_role_id,
    ...(guildConfig?.manager_role_id ? [guildConfig.manager_role_id] : []),
  ]);

  for (const roleId of roleIds) {
    overwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      allow:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.AttachFiles |
        PermissionFlagsBits.EmbedLinks,
      deny: 0n,
    });
  }

  for (const memberId of memberIds) {
    overwrites.push({
      id: memberId,
      type: OverwriteType.Member,
      allow:
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.AttachFiles |
        PermissionFlagsBits.EmbedLinks,
      deny: 0n,
    });
  }

  return overwrites;
}

async function createSingleRoom(params: {
  guild: Guild;
  supabase: SupabaseClient;
  tournament: TournamentRow;
  guildConfig: GuildRow | null;
  match: MatchListRow;
  category: CategoryChannel;
  participantMemberIds: string[];
}): Promise<CreatedRoomResult> {
  const channelName = buildTicketChannelName(params.match);
  const overwrites = await buildPermissionOverwrites(
    params.guild,
    params.tournament,
    params.guildConfig,
    params.participantMemberIds,
  );

  const channel = (await params.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: params.category.id,
    topic: buildTicketTopic(params.match.challonge_match_id),
    permissionOverwrites: overwrites,
    reason: `Match ticket for ${params.match.team1_name} vs ${params.match.team2_name}`,
  })) as TextChannel;

  const now = new Date().toISOString();
  const roomId = crypto.randomUUID();

  const { error: roomError } = await params.supabase.from('match_rooms').insert({
    id: roomId,
    tournament_id: params.tournament.id,
    match_id: params.match.id,
    channel_id: channel.id,
    category_id: params.category.id,
    created_at: now,
  });

  if (roomError) {
    await channel.delete('Failed to persist match room record').catch(() => undefined);
    throw new Error(`Failed to save match room: ${roomError.message}`);
  }

  const { error: matchError } = await params.supabase
    .from('matches')
    .update({
      ticket_channel_id: channel.id,
      status: 'open',
      updated_at: now,
    })
    .eq('id', params.match.id);

  if (matchError) {
    await params.supabase.from('match_rooms').delete().eq('id', roomId);
    await channel.delete('Failed to link match ticket channel').catch(() => undefined);
    throw new Error(`Failed to update match ticket channel: ${matchError.message}`);
  }

  return {
    matchId: params.match.id,
    channelId: channel.id,
    channelName: channel.name,
  };
}

export async function createRoomsForMatches(params: {
  guild: Guild;
  supabase: SupabaseClient;
  tournament: TournamentRow;
  guildConfig: GuildRow | null;
  matches: MatchListRow[];
  categoryId: string;
}): Promise<CreateRoomsResult> {
  const categoryChannel = await params.guild.channels.fetch(params.categoryId);
  if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
    throw new MatchRoomError('Selected category is invalid or unavailable.');
  }

  const category = categoryChannel as CategoryChannel;
  assertBotCanManageCategory(params.guild, category);

  const participantLookup = await findParticipantsByBracketNames(
    params.tournament.sheet_link,
    params.matches.flatMap((match) => [match.team1_name, match.team2_name]),
  );

  const result: CreateRoomsResult = {
    created: [],
    skipped: [],
    warnings: [],
    errors: [],
  };

  for (const match of params.matches) {
    if (match.ticket_channel_id) {
      result.skipped.push(match.id);
      continue;
    }

    const team1 = participantLookup.get(normalizeParticipantName(match.team1_name));
    const team2 = participantLookup.get(normalizeParticipantName(match.team2_name));

    if (!team1) {
      result.warnings.push(`No sheet match found for "${match.team1_name}" (${match.id}).`);
    }
    if (!team2) {
      result.warnings.push(`No sheet match found for "${match.team2_name}" (${match.id}).`);
    }

    const memberIds = [...new Set(
      [team1?.captainDiscordId, team2?.captainDiscordId].filter(
        (memberId): memberId is string => Boolean(memberId),
      ),
    )];

    try {
      const created = await createSingleRoom({
        guild: params.guild,
        supabase: params.supabase,
        tournament: params.tournament,
        guildConfig: params.guildConfig,
        match,
        category,
        participantMemberIds: memberIds,
      });
      result.created.push(created);

      const ticketChannel = await params.guild.channels.fetch(created.channelId);
      if (
        ticketChannel?.isTextBased() &&
        !ticketChannel.isDMBased() &&
        ticketChannel.type === ChannelType.GuildText
      ) {
        await sendMatchTicketWelcome({
          channel: ticketChannel,
          guild: params.guild,
          tournament: params.tournament,
          match,
          team1,
          team2,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown room creation error.';
      result.errors.push(`${match.team1_name} vs ${match.team2_name}: ${message}`);
    }
  }

  return result;
}

export async function runAutoRoomCreation(params: {
  guild: Guild;
  supabase: SupabaseClient;
  tournament: TournamentRow;
  guildConfig: GuildRow | null;
  matches: MatchListRow[];
  maxRooms?: number;
}): Promise<CreateRoomsResult> {
  const category = await resolveAutoCategory(params.guild, params.tournament);
  const limitedMatches = params.matches.slice(0, params.maxRooms ?? params.matches.length);

  return createRoomsForMatches({
    guild: params.guild,
    supabase: params.supabase,
    tournament: params.tournament,
    guildConfig: params.guildConfig,
    matches: limitedMatches,
    categoryId: category.id,
  });
}
