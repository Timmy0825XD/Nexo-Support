import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ChannelType,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildRow } from '../types/guild.js';

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
