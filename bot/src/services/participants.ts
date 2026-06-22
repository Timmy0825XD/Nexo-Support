import type {
  ParsedParticipant,
  TeamPlayer,
  TournamentParticipants,
} from '../types/participant.js';
import {
  SheetsError,
  fetchPublicSheetRows,
  type TournamentFormat,
} from './sheets.js';

export class ParticipantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantError';
  }
}

function teamSizeFromFormat(format: TournamentFormat): number {
  if (format === '1vs1') return 1;
  return Number.parseInt(format[0] ?? '0', 10);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findHeaderIndex(headerRow: string[], headerName: string): number {
  const normalized = normalizeHeader(headerName);
  return headerRow.findIndex((header) => normalizeHeader(header) === normalized);
}

function getCellValue(row: string[], headerRow: string[], headerName: string): string | null {
  const index = findHeaderIndex(headerRow, headerName);
  if (index < 0) return null;
  const value = (row[index] ?? '').trim();
  return value.length > 0 ? value : null;
}

function extractDiscordId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;
  const mentionMatch = trimmed.match(/^<@!?(\d{17,20})>$/);
  return mentionMatch?.[1] ?? null;
}

function buildCaptainPlayer(row: string[], headerRow: string[]): TeamPlayer {
  return {
    label: 'Captain',
    discordTag: getCellValue(row, headerRow, 'Captain Discord Tag'),
    discordId: extractDiscordId(getCellValue(row, headerRow, 'Captain Discord ID')),
    inGameName: getCellValue(row, headerRow, 'Captain In-game name'),
    inGameId: getCellValue(row, headerRow, 'Captain In-game ID'),
    currentTitle: getCellValue(row, headerRow, 'Captain Current Title'),
  };
}

function buildTeamPlayer(
  row: string[],
  headerRow: string[],
  playerIndex: number,
): TeamPlayer {
  return {
    label: `Player ${playerIndex}`,
    discordTag: getCellValue(row, headerRow, `Player ${playerIndex} Discord Username`),
    discordId: extractDiscordId(
      getCellValue(row, headerRow, `Player ${playerIndex} Discord ID`),
    ),
    inGameName: getCellValue(row, headerRow, `Player ${playerIndex} In-game name`),
    inGameId: getCellValue(row, headerRow, `Player ${playerIndex} In-game ID`),
    currentTitle: getCellValue(row, headerRow, `Player ${playerIndex} Current Title`),
  };
}

function parseParticipantRow(
  row: string[],
  headerRow: string[],
  format: TournamentFormat,
  sheetRowIndex: number,
): ParsedParticipant | null {
  const bracketName = (row[0] ?? '').trim();
  if (!bracketName) return null;

  const captain = buildCaptainPlayer(row, headerRow);
  const players: TeamPlayer[] = [captain];

  if (format !== '1vs1') {
    const teamSize = teamSizeFromFormat(format);
    for (let playerIndex = 1; playerIndex < teamSize; playerIndex += 1) {
      players.push(buildTeamPlayer(row, headerRow, playerIndex));
    }
  }

  return {
    sheetRowIndex,
    bracketName,
    teamName: format === '1vs1' ? null : getCellValue(row, headerRow, 'Team Name'),
    captain,
    players,
  };
}

export async function loadTournamentParticipants(
  sheetLink: string,
): Promise<TournamentParticipants> {
  const { format, headerRow, rows } = await fetchPublicSheetRows(sheetLink);
  const participants = rows
    .map((row, index) => parseParticipantRow(row, headerRow, format, index + 2))
    .filter((participant): participant is ParsedParticipant => participant != null);

  return { format, participants };
}

export function findParticipantByDiscordId(
  participants: ParsedParticipant[],
  discordId: string,
): ParsedParticipant | null {
  for (const participant of participants) {
    for (const player of participant.players) {
      if (player.discordId === discordId) {
        return participant;
      }
    }
  }
  return null;
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

export function findParticipantByGameLookup(
  participants: ParsedParticipant[],
  query: string,
): { participant: ParsedParticipant; lookupSource: 'in_game_id' | 'in_game_name' } | null {
  const normalizedQuery = normalizeLookupValue(query);

  for (const participant of participants) {
    for (const player of participant.players) {
      const inGameId = player.inGameId ? normalizeLookupValue(player.inGameId) : null;
      const inGameName = player.inGameName ? normalizeLookupValue(player.inGameName) : null;

      if (inGameId === normalizedQuery) {
        return { participant, lookupSource: 'in_game_id' };
      }
    }
  }

  for (const participant of participants) {
    for (const player of participant.players) {
      const inGameName = player.inGameName ? normalizeLookupValue(player.inGameName) : null;
      if (inGameName === normalizedQuery) {
        return { participant, lookupSource: 'in_game_name' };
      }
    }
  }

  return null;
}

export function isSheetsParticipantError(error: unknown): error is SheetsError {
  return error instanceof SheetsError;
}

export function isParticipantError(error: unknown): error is ParticipantError {
  return error instanceof ParticipantError;
}
