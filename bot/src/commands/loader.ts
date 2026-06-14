import { botCommand } from './slash/bot.js';
import { pingCommand } from './slash/ping.js';
import { roleCommand } from './slash/role.js';
import { serverCommand } from './slash/server.js';
import { settingsCommand } from './slash/settings.js';
import { staffCommand } from './slash/staff.js';
import { ticketCommand } from './slash/ticket.js';
import type { PrefixCommand, SlashCommand } from './types.js';

export function loadSlashCommands(): SlashCommand[] {
  return [
    pingCommand,
    botCommand,
    settingsCommand,
    staffCommand,
    roleCommand,
    serverCommand,
    ticketCommand,
  ];
}

export function loadPrefixCommands(): PrefixCommand[] {
  return [];
}
