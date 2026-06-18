import type { ChatInputCommandInteraction } from 'discord.js';
import type { TournamentAdd, TournamentEdit } from '../schemas/tournament.js';

function getRole(interaction: ChatInputCommandInteraction, name: string): string | undefined {
  return interaction.options.getRole(name, false)?.id;
}

function getChannel(interaction: ChatInputCommandInteraction, name: string): string | undefined {
  return interaction.options.getChannel(name, false)?.id;
}

export function parseTournamentAdd(interaction: ChatInputCommandInteraction): Omit<
  TournamentAdd,
  never
> & { challonge_key: string } {
  return {
    name: interaction.options.getString('name', true),
    challonge_id: interaction.options.getString('id', true),
    challonge_key: interaction.options.getString('key', true),
    sheet_link: interaction.options.getString('sheet_link', true),
    admin_role_id: interaction.options.getRole('admin_role', true).id,
    helper_role_id: interaction.options.getRole('helper_role', true).id,
    attendance_channel_id: interaction.options.getChannel('attendance_channel', true).id,
    transcript_channel_id: interaction.options.getChannel('transcript_channel', true).id,
    rules_channel_id: interaction.options.getChannel('rules_channel', true).id,
    deadline_channel_id: interaction.options.getChannel('deadline_channel', true).id,
    result_channel_id: interaction.options.getChannel('result_channel', true).id,
    closed_ticket_category_id: interaction.options.getChannel('closed_ticket_category', true).id,
    ticket_open_category_1_id: interaction.options.getChannel('ticket_open_category_1', true).id,
    ticket_open_category_2_id: interaction.options.getChannel('ticket_open_category_2', true).id,
    auto_room_enabled: interaction.options.getBoolean('auto_room_creation', true),
    close_ticket_category_2_id: getChannel(interaction, 'close_ticket_category_2'),
    ticket_open_category_3_id: getChannel(interaction, 'ticket_open_category_3'),
    ticket_open_category_4_id: getChannel(interaction, 'ticket_open_category_4'),
  };
}

export function parseTournamentEdit(interaction: ChatInputCommandInteraction): TournamentEdit & {
  challonge_key?: string;
} {
  return {
    name: interaction.options.getString('name') ?? undefined,
    challonge_key: interaction.options.getString('key') ?? undefined,
    sheet_link: interaction.options.getString('sheet_link') ?? undefined,
    admin_role_id: getRole(interaction, 'admin_role'),
    helper_role_id: getRole(interaction, 'helper_role'),
    attendance_channel_id: getChannel(interaction, 'attendance_channel'),
    transcript_channel_id: getChannel(interaction, 'transcript_channel'),
    rules_channel_id: getChannel(interaction, 'rules_channel'),
    deadline_channel_id: getChannel(interaction, 'deadline_channel'),
    result_channel_id: getChannel(interaction, 'result_channel'),
    closed_ticket_category_id: getChannel(interaction, 'closed_ticket_category'),
    close_ticket_category_2_id: getChannel(interaction, 'close_ticket_category_2'),
    ticket_open_category_1_id: getChannel(interaction, 'ticket_open_category_1'),
    ticket_open_category_2_id: getChannel(interaction, 'ticket_open_category_2'),
    ticket_open_category_3_id: getChannel(interaction, 'ticket_open_category_3'),
    ticket_open_category_4_id: getChannel(interaction, 'ticket_open_category_4'),
    auto_room_enabled: interaction.options.getBoolean('auto_room_creation') ?? undefined,
  };
}
