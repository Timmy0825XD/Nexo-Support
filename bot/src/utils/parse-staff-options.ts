import type { ChatInputCommandInteraction } from 'discord.js';
import type { StaffConfigEdit, StaffConfigSet } from '../schemas/staff-config.js';

function getRole(interaction: ChatInputCommandInteraction, name: string): string | undefined {
  return interaction.options.getRole(name, false)?.id;
}

function getChannel(interaction: ChatInputCommandInteraction, name: string): string | undefined {
  return interaction.options.getChannel(name, false)?.id;
}

export function parseStaffConfigSet(interaction: ChatInputCommandInteraction): StaffConfigSet {
  return {
    staff_role_id: interaction.options.getRole('staff_role', true).id,
    judge_role_id: interaction.options.getRole('judge_role', true).id,
    recorder_role_id: interaction.options.getRole('recorder_role', true).id,
    t1_admin_role_id: interaction.options.getRole('t1_admin_role', true).id,
    t2_admin_role_id: interaction.options.getRole('t2_admin_role', true).id,
    best_staff_role_id: interaction.options.getRole('best_staff_role', true).id,
    server_helper_role_id: interaction.options.getRole('server_helper_role', true).id,
    manager_role_id: interaction.options.getRole('manager_role', true).id,
    challonge_mod_role_id: interaction.options.getRole('challonge_mod', true).id,
    schedule_channel_id: interaction.options.getChannel('schedule_channel', true).id,
    staff_chat_channel_id: interaction.options.getChannel('staffchat_channel', true).id,
    staff_announcement_channel_id: interaction.options.getChannel(
      'staff_announcement_channel',
      true,
    ).id,
    staff_instructions_channel_id: interaction.options.getChannel(
      'staff_instructions_channel',
      true,
    ).id,
    staff_details_channel_id: interaction.options.getChannel('staff_details_channel', true).id,
    event_rules_channel_id: interaction.options.getChannel('event_rules_channel', true).id,
  };
}

export function parseStaffConfigEdit(interaction: ChatInputCommandInteraction): StaffConfigEdit {
  return {
    staff_role_id: getRole(interaction, 'staff_role'),
    judge_role_id: getRole(interaction, 'judge_role'),
    recorder_role_id: getRole(interaction, 'recorder_role'),
    t1_admin_role_id: getRole(interaction, 't1_admin_role'),
    t2_admin_role_id: getRole(interaction, 't2_admin_role'),
    best_staff_role_id: getRole(interaction, 'best_staff_role'),
    server_helper_role_id: getRole(interaction, 'server_helper_role'),
    manager_role_id: getRole(interaction, 'manager_role'),
    challonge_mod_role_id: getRole(interaction, 'challonge_mod'),
    schedule_channel_id: getChannel(interaction, 'schedule_channel'),
    staff_chat_channel_id: getChannel(interaction, 'staffchat_channel'),
    staff_announcement_channel_id: getChannel(interaction, 'staff_announcement_channel'),
    staff_instructions_channel_id: getChannel(interaction, 'staff_instructions_channel'),
    staff_details_channel_id: getChannel(interaction, 'staff_details_channel'),
    event_rules_channel_id: getChannel(interaction, 'event_rules_channel'),
  };
}
