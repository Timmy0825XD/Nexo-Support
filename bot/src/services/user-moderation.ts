import {
  DiscordAPIError,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type User,
} from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PermissionError } from '../guards/permissions.js';
import { clearScheduledBan, upsertScheduledBan } from './scheduled-bans.js';
import {
  formatBanDurationLabel,
  InvalidBanDurationError,
  parseBanDuration,
} from '../utils/parse-ban-duration.js';
import type { UserBanInput, UserUnbanInput } from '../schemas/user-moderation.js';

export class UserModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserModerationError';
  }
}

function buildDiscordBanReason(params: {
  durationLabel: string;
  reason: string;
  moderatorTag: string;
}): string {
  const prefix = `[${params.durationLabel}]`;
  const suffix = ` — by ${params.moderatorTag}`;
  const trimmedReason = params.reason.trim();

  if (!trimmedReason) {
    const text = `${prefix}${suffix}`;
    return text.length <= 512 ? text : text.slice(0, 512);
  }

  const maxReasonLength = 512 - prefix.length - suffix.length - 1;
  const reasonPart =
    trimmedReason.length > maxReasonLength
      ? `${trimmedReason.slice(0, Math.max(0, maxReasonLength - 3))}...`
      : trimmedReason;
  return `${prefix} ${reasonPart}${suffix}`;
}

async function assertCanModerateTarget(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  targetUserId: string,
): Promise<void> {
  if (targetUserId === interaction.user.id) {
    throw new UserModerationError('You cannot moderate yourself.');
  }

  if (targetUserId === guild.ownerId) {
    throw new UserModerationError('The server owner cannot be banned.');
  }

  const executor = interaction.member as GuildMember;
  if (targetUserId === interaction.client.user.id) {
    throw new UserModerationError('You cannot ban the bot.');
  }

  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
  if (!targetMember) {
    return;
  }

  if (targetMember.user.bot) {
    throw new UserModerationError('Bots cannot be banned with this command.');
  }

  if (
    !executor.permissions.has(PermissionFlagsBits.Administrator) &&
    targetMember.roles.highest.position >= executor.roles.highest.position
  ) {
    throw new UserModerationError(
      'You cannot ban a member with an equal or higher role than yours.',
    );
  }
}

function mapDiscordBanError(error: unknown): never {
  if (error instanceof DiscordAPIError) {
    if (error.code === 10026) {
      throw new UserModerationError('That user is not banned.');
    }
    if (error.code === 50013) {
      throw new UserModerationError('I do not have permission to perform this action.');
    }
    if (error.code === 10007) {
      throw new UserModerationError('Unknown user. Check the Discord ID and try again.');
    }
  }

  throw error;
}

export async function banUser(params: {
  interaction: ChatInputCommandInteraction;
  supabase: SupabaseClient;
  input: UserBanInput;
}): Promise<{
  userId: string;
  targetUser: User | null;
  durationLabel: string;
  expiresAt: Date | null;
  reason: string;
}> {
  const { interaction, supabase, input } = params;
  const guild = interaction.guild!;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
    throw new PermissionError('I need the Ban Members permission to ban users.');
  }

  let expiresAt: Date | null;
  try {
    expiresAt = parseBanDuration(input.time);
  } catch (error) {
    if (error instanceof InvalidBanDurationError) {
      throw new UserModerationError(error.message);
    }
    throw error;
  }

  await assertCanModerateTarget(interaction, guild, input.discord_id);

  const targetUser = await interaction.client.users.fetch(input.discord_id).catch(() => null);

  const durationLabel = formatBanDurationLabel(input.time);
  const reason = input.reason.trim();
  const discordReason = buildDiscordBanReason({
    durationLabel,
    reason,
    moderatorTag: interaction.user.tag,
  });

  try {
    await guild.members.ban(input.discord_id, {
      reason: discordReason,
      deleteMessageSeconds: 0,
    });
  } catch (error) {
    mapDiscordBanError(error);
  }

  if (expiresAt) {
    await upsertScheduledBan(supabase, {
      guildId: guild.id,
      userId: input.discord_id,
      expiresAt,
      reason,
      bannedByDiscordId: interaction.user.id,
    });
  } else {
    await clearScheduledBan(supabase, guild.id, input.discord_id);
  }

  return {
    userId: input.discord_id,
    targetUser,
    durationLabel,
    expiresAt,
    reason,
  };
}

export async function unbanUser(params: {
  interaction: ChatInputCommandInteraction;
  supabase: SupabaseClient;
  input: UserUnbanInput;
}): Promise<{ userId: string }> {
  const { interaction, supabase, input } = params;
  const guild = interaction.guild!;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
    throw new PermissionError('I need the Ban Members permission to unban users.');
  }

  try {
    await guild.members.unban(input.discord_id, `Unbanned by ${interaction.user.tag}`);
  } catch (error) {
    mapDiscordBanError(error);
  }

  await clearScheduledBan(supabase, guild.id, input.discord_id);

  return { userId: input.discord_id };
}
