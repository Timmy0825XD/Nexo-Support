import type { TournamentFormat } from '../services/sheets.js';

export interface TeamPlayer {
  label: 'Captain' | `Player ${number}`;
  discordTag: string | null;
  discordId: string | null;
  inGameName: string | null;
  inGameId: string | null;
  currentTitle: string | null;
}

export interface ParsedParticipant {
  sheetRowIndex: number;
  bracketName: string;
  teamName: string | null;
  captain: TeamPlayer;
  players: TeamPlayer[];
}

export interface TournamentParticipants {
  format: TournamentFormat;
  participants: ParsedParticipant[];
}
