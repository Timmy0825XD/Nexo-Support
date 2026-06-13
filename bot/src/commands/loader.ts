import { pingCommand } from './slash/ping.js';
import type { PrefixCommand, SlashCommand } from './types.js';

export function loadSlashCommands(): SlashCommand[] {
  return [pingCommand];
}

export function loadPrefixCommands(): PrefixCommand[] {
  return [];
}
