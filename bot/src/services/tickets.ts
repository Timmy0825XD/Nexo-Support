import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ChannelType,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';
import { getMatchByChallongeMatchIdForGuild } from './matches.js';

export interface MatchRoomRow {
  id: string;
  tournament_id: string;
  match_id: string;
  channel_id: string;
  category_id: string;
}

export interface MatchRow {
  id: string;
  ticket_channel_id: string | null;
}

export interface TicketContext {
  matchRoom: MatchRoomRow;
  match: MatchRow;
  closedCategoryId: string;
  openCategoryId: string;
  isClosed: boolean;
}

export class TicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketError';
  }
}

const TICKET_TOPIC_PREFIX = 'nexo:';

export function buildTicketTopic(challongeMatchId: string): string {
  return `Match ID: ${challongeMatchId}`;
}

export function parseChallongeMatchIdFromTopic(topic: string | null | undefined): string | null {
  if (!topic?.trim()) return null;

  const labeledMatch = topic.match(/Match ID:\s*(\d+)/i);
  if (labeledMatch?.[1]) return labeledMatch[1];

  const prefixedMatch = topic.match(/(?:^|;)match_id=(\d+)/i);
  if (prefixedMatch?.[1]) return prefixedMatch[1];

  if (topic.startsWith(TICKET_TOPIC_PREFIX)) {
    const legacyMatch = topic.match(/match_id=([0-9a-f-]{36})/i);
    if (legacyMatch?.[1] && !/^\d+$/.test(legacyMatch[1])) {
      return null;
    }
  }

  return null;
}

export interface ResolvedTicketContext {
  tournamentId: string;
  matchId: string;
  challongeMatchId: string;
}

export async function resolveTicketFromChannel(
  supabase: SupabaseClient,
  guildId: string,
  channel: TextChannel,
  guildConfig: GuildRow | null,
): Promise<ResolvedTicketContext | null> {
  const ticketContext = await findTicketByChannel(supabase, guildId, channel.id, guildConfig);
  if (ticketContext) {
    const { data, error } = await supabase
      .from('matches')
      .select('id, challonge_match_id, tournament_id')
      .eq('id', ticketContext.match.id)
      .maybeSingle();

    if (error || !data) return null;

    const match = data as { id: string; challonge_match_id: string; tournament_id: string };
    return {
      tournamentId: match.tournament_id,
      matchId: match.id,
      challongeMatchId: match.challonge_match_id,
    };
  }

  const challongeMatchId = parseChallongeMatchIdFromTopic(channel.topic);
  if (!challongeMatchId) return null;

  const resolved = await getMatchByChallongeMatchIdForGuild(supabase, guildId, challongeMatchId);
  if (!resolved) return null;

  return {
    tournamentId: resolved.tournamentId,
    matchId: resolved.match.id,
    challongeMatchId: resolved.match.challonge_match_id,
  };
}

export async function findTicketByChannel(
  supabase: SupabaseClient,
  guildId: string,
  channelId: string,
  guildConfig: GuildRow | null,
): Promise<TicketContext | null> {
  const { data: roomData, error: roomError } = await supabase
    .from('match_rooms')
    .select('id, tournament_id, match_id, channel_id, category_id')
    .eq('channel_id', channelId)
    .maybeSingle();

  if (roomError) {
    throw new Error(`Failed to load match room: ${roomError.message}`);
  }

  if (!roomData) {
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('id, ticket_channel_id, tournament_id')
      .eq('ticket_channel_id', channelId)
      .maybeSingle();

    if (matchError) {
      throw new Error(`Failed to load match: ${matchError.message}`);
    }

    if (!matchData) return null;

    const { data: tournamentData, error: tournamentError } = await supabase
      .from('tournaments')
      .select('closed_ticket_category_id, guild_id')
      .eq('id', matchData.tournament_id)
      .maybeSingle();

    if (tournamentError || !tournamentData) return null;
    if (tournamentData.guild_id !== guildId) return null;

    const closedCategoryId =
      tournamentData.closed_ticket_category_id ?? guildConfig?.closed_category_id;
    if (!closedCategoryId) return null;

    return {
      matchRoom: {
        id: '',
        tournament_id: matchData.tournament_id,
        match_id: matchData.id,
        channel_id: channelId,
        category_id: '',
      },
      match: { id: matchData.id, ticket_channel_id: matchData.ticket_channel_id },
      closedCategoryId,
      openCategoryId: '',
      isClosed: false,
    };
  }

  const room = roomData as MatchRoomRow;

  const { data: matchData, error: matchError } = await supabase
    .from('matches')
    .select('id, ticket_channel_id')
    .eq('id', room.match_id)
    .maybeSingle();

  if (matchError || !matchData) return null;

  const { data: tournamentData, error: tournamentError } = await supabase
    .from('tournaments')
    .select('closed_ticket_category_id, guild_id')
    .eq('id', room.tournament_id)
    .maybeSingle();

  if (tournamentError || !tournamentData) return null;
  if (tournamentData.guild_id !== guildId) return null;

  const closedCategoryId =
    tournamentData.closed_ticket_category_id ?? guildConfig?.closed_category_id;
  if (!closedCategoryId) {
    throw new TicketError(
      'No closed ticket category is configured for this tournament or guild.',
    );
  }

  return {
    matchRoom: room,
    match: matchData as MatchRow,
    closedCategoryId,
    openCategoryId: room.category_id,
    isClosed: false,
  };
}

export function resolveTicketClosedState(
  channel: TextChannel,
  closedCategoryId: string,
): boolean {
  return channel.parentId === closedCategoryId;
}

export async function closeTicketChannel(
  guild: Guild,
  channel: TextChannel,
  closedCategoryId: string,
): Promise<void> {
  await channel.setParent(closedCategoryId, { lockPermissions: false });
  await channel.permissionOverwrites.edit(guild.id, {
    SendMessages: false,
    AddReactions: false,
  });
}

export async function reopenTicketChannel(
  guild: Guild,
  channel: TextChannel,
  openCategoryId: string,
): Promise<void> {
  if (openCategoryId) {
    await channel.setParent(openCategoryId, { lockPermissions: false });
  }

  const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.id);
  if (everyoneOverwrite) {
    await everyoneOverwrite.delete().catch(() => undefined);
  } else {
    await channel.permissionOverwrites.edit(guild.id, {
      SendMessages: null,
      AddReactions: null,
    });
  }
}

export async function clearTicketRecords(
  supabase: SupabaseClient,
  channelId: string,
  context: TicketContext,
): Promise<void> {
  if (context.matchRoom.id) {
    await supabase.from('match_rooms').delete().eq('id', context.matchRoom.id);
  } else {
    await supabase.from('match_rooms').delete().eq('channel_id', channelId);
  }

  await supabase
    .from('matches')
    .update({ ticket_channel_id: null })
    .eq('id', context.match.id);
}

export async function getTicketChannel(
  guild: Guild,
  channelId: string,
): Promise<TextChannel | null> {
  const channel = await guild.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel as TextChannel;
}

function stripStatusPrefix(channelName: string): string {
  return channelName.replace(/^[✅🔴]+/u, '');
}

export async function finalizeMatchTicket(params: {
  guild: Guild;
  channel: TextChannel;
  closedCategoryId: string;
}): Promise<TextChannel> {
  const baseName = stripStatusPrefix(params.channel.name);
  const completedName = `✅${baseName}`.slice(0, 100);

  if (params.channel.name !== completedName) {
    await params.channel.setName(completedName, 'Match completed');
  }

  await closeTicketChannel(params.guild, params.channel, params.closedCategoryId);
  return params.channel;
}
