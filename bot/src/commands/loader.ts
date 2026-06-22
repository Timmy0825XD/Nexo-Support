import { attendanceCommand } from './slash/attendance.js';
import { getCommand } from './slash/get.js';
import { linkCommand } from './slash/link.js';
import { workDoneCommand } from './slash/work_done.js';
import { botCommand } from './slash/bot.js';
import { autoRoomCommand } from './slash/auto_room.js';
import { correctBracketCommand } from './slash/correct_bracket.js';
import { pingCommand } from './slash/ping.js';
import { roleCommand } from './slash/role.js';
import { roomCommand } from './slash/room.js';
import { scheduleCommand } from './slash/schedule.js';
import { serverCommand } from './slash/server.js';
import { settingsCommand } from './slash/settings.js';
import { sheetCommand } from './slash/sheet.js';
import { staffCommand } from './slash/staff.js';
import { teamCommand } from './slash/team.js';
import { ticketCommand } from './slash/ticket.js';
import { tournamentCommand } from './slash/tournament.js';
import { uploadScoreCommand } from './slash/upload_score.js';
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
    tournamentCommand,
    roomCommand,
    autoRoomCommand,
    uploadScoreCommand,
    correctBracketCommand,
    teamCommand,
    sheetCommand,
    scheduleCommand,
    attendanceCommand,
    getCommand,
    linkCommand,
    workDoneCommand,
  ];
}

export function loadPrefixCommands(): PrefixCommand[] {
  return [];
}
