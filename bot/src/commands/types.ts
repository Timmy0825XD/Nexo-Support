import type {
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CommandContext {
  supabase: SupabaseClient;
}

export interface SlashCommand {
  data:
    | import('discord.js').SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;
  execute: (
    interaction: import('discord.js').ChatInputCommandInteraction,
    context: CommandContext,
  ) => Promise<void>;
  autocomplete?: (
    interaction: import('discord.js').AutocompleteInteraction,
    context: CommandContext,
  ) => Promise<void>;
}

export interface PrefixCommand {
  name: string;
  execute: (
    message: import('discord.js').Message,
    args: string[],
    context: CommandContext,
  ) => Promise<void>;
}
