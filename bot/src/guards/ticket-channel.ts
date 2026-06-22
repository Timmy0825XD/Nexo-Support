import { ChannelType, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GuildRow } from '../types/guild.js';
import { PermissionError } from './permissions.js';
import { resolveTicketFromChannel, type ResolvedTicketContext } from '../services/tickets.js';

export class TicketChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketChannelError';
  }
}

export function assertTextChannel(
  interaction: ChatInputCommandInteraction,
): TextChannel {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new TicketChannelError('This command can only be used in a text channel.');
  }
  return channel as TextChannel;
}

export async function assertMatchTicketChannel(
  interaction: ChatInputCommandInteraction,
  supabase: SupabaseClient,
  guildConfig: GuildRow | null,
): Promise<{ channel: TextChannel; ticket: ResolvedTicketContext }> {
  if (!interaction.inGuild() || !interaction.guildId) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const channel = assertTextChannel(interaction);
  const ticket = await resolveTicketFromChannel(
    supabase,
    interaction.guildId,
    channel,
    guildConfig,
  );

  if (!ticket) {
    throw new TicketChannelError(
      'This command can only be used inside a match ticket channel.',
    );
  }

  return { channel, ticket };
}
