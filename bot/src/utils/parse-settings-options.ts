import type { ChatInputCommandInteraction } from 'discord.js';
import type { GuildSettingsEdit, GuildSettingsSetup } from '../schemas/guild-settings.js';

function getRole(interaction: ChatInputCommandInteraction, name: string): string | undefined {
  const role = interaction.options.getRole(name, false);
  return role?.id;
}

function getChannel(interaction: ChatInputCommandInteraction, name: string): string | undefined {
  const channel = interaction.options.getChannel(name, false);
  return channel?.id;
}

export function parseSettingsSetup(interaction: ChatInputCommandInteraction): GuildSettingsSetup {
  return {
    admin_role_id: interaction.options.getRole('admin_role', true).id,
    challonge_logs_channel_id: interaction.options.getChannel('challonge_logs', true).id,
    transcript_logs_channel_id: interaction.options.getChannel('transcript_logs', true).id,
    bot_logs_channel_id: interaction.options.getChannel('bot_logs', true).id,
    thumbnail_channel_id: interaction.options.getChannel('thumbnail_channel', true).id,
  };
}

export function parseSettingsEdit(interaction: ChatInputCommandInteraction): GuildSettingsEdit {
  return {
    admin_role_id: getRole(interaction, 'admin_role'),
    challonge_logs_channel_id: getChannel(interaction, 'challonge_logs'),
    transcript_logs_channel_id: getChannel(interaction, 'transcript_logs'),
    bot_logs_channel_id: getChannel(interaction, 'bot_logs'),
    thumbnail_channel_id: getChannel(interaction, 'thumbnail_channel'),
  };
}
