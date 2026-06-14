import { settingsCommand } from './slash/settings.js';
import { staffCommand } from './slash/staff.js';
import { pingCommand } from './slash/ping.js';
import type { PrefixCommand, SlashCommand } from './types.js';

export function loadSlashCommands(): SlashCommand[] {
  return [pingCommand, settingsCommand, staffCommand];
}

export function loadPrefixCommands(): PrefixCommand[] {
  return [];
}
