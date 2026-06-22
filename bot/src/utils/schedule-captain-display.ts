import type { Guild } from 'discord.js';
import {
  detectTournamentFormatFromHeaders,
  fetchPublicSheetHeaderRow,
  type TournamentFormat,
} from '../services/sheets.js';
import { formatUser } from './guild-display.js';
import { escapeDiscordMarkdown } from './match-formatting.js';

export function isSoloTournamentFormat(format: TournamentFormat): boolean {
  return format === '1vs1';
}

export async function resolveTournamentFormat(sheetLink: string): Promise<TournamentFormat> {
  try {
    const headerRow = await fetchPublicSheetHeaderRow(sheetLink);
    return detectTournamentFormatFromHeaders(headerRow);
  } catch {
    return '2vs2';
  }
}

export function formatScheduleCaptainLine(
  guild: Guild,
  userId: string | null,
  teamName: string,
  format: TournamentFormat,
): string {
  if (!userId) return '*Not found*';

  const member = guild.members.cache.get(userId);
  const user = member?.user ?? guild.client.users.cache.get(userId);
  const username = user?.username ?? 'Unknown';

  if (isSoloTournamentFormat(format)) {
    return `@${escapeDiscordMarkdown(username)}`;
  }

  return `${formatUser(userId)} (${escapeDiscordMarkdown(teamName.trim())})`;
}
