export class SheetsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetsError';
  }
}

export type TournamentFormat = '1vs1' | '2vs2' | '3vs3' | '4vs4' | '5vs5';

export const TOURNAMENT_FORMATS: TournamentFormat[] = ['1vs1', '2vs2', '3vs3', '4vs4', '5vs5'];

const SOLO_HEADERS = [
  'Captain Discord Tag',
  'Captain Discord ID',
  'Captain In-game name',
  'Captain In-game ID',
] as const;

/** First column used as Challonge bracket participant name. */
export const BRACKET_NAME_HEADER: Record<TournamentFormat, string> = {
  '1vs1': 'Captain Discord Tag',
  '2vs2': 'Team Name',
  '3vs3': 'Team Name',
  '4vs4': 'Team Name',
  '5vs5': 'Team Name',
};

function teamSizeFromFormat(format: TournamentFormat): number {
  if (format === '1vs1') return 1;
  return Number.parseInt(format[0] ?? '0', 10);
}

export function buildRequiredParticipantHeaders(format: TournamentFormat): string[] {
  if (format === '1vs1') {
    return [...SOLO_HEADERS];
  }

  const teamSize = teamSizeFromFormat(format);
  const headers = [
    'Team Name',
    'Captain Discord Tag',
    'Captain Discord ID',
    'Captain In-game name',
    'Captain In-game ID',
    'Captain Current Title',
  ];

  for (let playerIndex = 1; playerIndex < teamSize; playerIndex += 1) {
    headers.push(
      `Player ${playerIndex} Discord Username`,
      `Player ${playerIndex} Discord ID`,
      `Player ${playerIndex} In-game name`,
      `Player ${playerIndex} In-game ID`,
      `Player ${playerIndex} Current Title`,
    );
  }

  return headers;
}

export function extractSpreadsheetId(sheetLink: string): string {
  const match = sheetLink.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) {
    throw new SheetsError('Invalid Google Sheet link. Use a standard spreadsheets URL.');
  }
  return match[1];
}

export function extractSpreadsheetGid(sheetLink: string): string | null {
  const gidMatch = sheetLink.match(/(?:[#?&]gid=)(\d+)/);
  return gidMatch?.[1] ?? null;
}

/** CSV export URL. Omits gid when not in the link so Google uses the default worksheet. */
export function buildPublicCsvExportUrl(spreadsheetId: string, gid?: string | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  if (!gid) return base;
  return `${base}&gid=${encodeURIComponent(gid)}`;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function isLikelyHtmlResponse(body: string, contentType: string | null): boolean {
  if (contentType?.includes('text/html')) return true;
  const trimmed = body.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

function countTeamPlayerSlots(headerRow: string[]): number {
  let maxPlayerIndex = 0;

  for (const header of headerRow) {
    const match = header.trim().match(/^Player (\d+) Discord Username$/i);
    if (match?.[1]) {
      maxPlayerIndex = Math.max(maxPlayerIndex, Number.parseInt(match[1], 10));
    }
  }

  return maxPlayerIndex + 1;
}

export function detectTournamentFormatFromHeaders(headerRow: string[]): TournamentFormat {
  const firstHeader = normalizeHeader(headerRow[0] ?? '');

  if (firstHeader === normalizeHeader('Captain Discord Tag')) {
    return '1vs1';
  }

  if (firstHeader === normalizeHeader('Team Name')) {
    const teamSize = countTeamPlayerSlots(headerRow);
    if (teamSize >= 2 && teamSize <= 5) {
      return `${teamSize}vs${teamSize}` as TournamentFormat;
    }
    throw new SheetsError(
      'Team sheet must include Player 1 through Player N headers (supports 2vs2 through 5vs5).',
    );
  }

  throw new SheetsError(
    'Unrecognized sheet layout. Row 1 must start with "Captain Discord Tag" (1vs1) or "Team Name" (2vs2–5vs5).',
  );
}

export async function fetchPublicSheetHeaderRow(sheetLink: string): Promise<string[]> {
  const spreadsheetId = extractSpreadsheetId(sheetLink);
  const gid = extractSpreadsheetGid(sheetLink);
  const exportUrl = buildPublicCsvExportUrl(spreadsheetId, gid);

  let response: Response;
  try {
    response = await fetch(exportUrl, {
      method: 'GET',
      redirect: 'follow',
    });
  } catch {
    throw new SheetsError('Unable to reach Google Sheets. Check network connectivity and try again.');
  }

  const body = await response.text();
  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    if (response.status === 404) {
      throw new SheetsError('Google Sheet not found. Verify the link is correct.');
    }
    throw new SheetsError(`Failed to read Google Sheet (HTTP ${response.status}).`);
  }

  if (isLikelyHtmlResponse(body, contentType)) {
    throw new SheetsError(
      'Google Sheet is not publicly readable. Set sharing to "Anyone with the link" as Viewer and try again.',
    );
  }

  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) {
    throw new SheetsError('Google Sheet is empty or missing a header row.');
  }

  return parseCsvLine(firstLine);
}

export async function validateParticipantSheet(sheetLink: string): Promise<TournamentFormat> {
  const headerRow = await fetchPublicSheetHeaderRow(sheetLink);
  const format = detectTournamentFormatFromHeaders(headerRow);
  const requiredHeaders = buildRequiredParticipantHeaders(format);
  const normalizedHeaders = new Set(headerRow.map(normalizeHeader));
  const missing = requiredHeaders.filter(
    (header) => !normalizedHeaders.has(normalizeHeader(header)),
  );

  if (missing.length > 0) {
    throw new SheetsError(
      `Google Sheet (${format}) is missing required headers: ${missing.join(', ')}`,
    );
  }

  return format;
}

/** Column index (0-based) of the Challonge bracket display name — always column A. */
export function getBracketNameColumnIndex(): number {
  return 0;
}

export function getBracketNameHeader(format: TournamentFormat): string {
  return BRACKET_NAME_HEADER[format];
}

export interface SheetParticipantLookup {
  bracketName: string;
  captainDiscordId: string | null;
  memberDiscordIds: string[];
}

function normalizeBracketName(value: string): string {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
}

function extractDiscordId(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;
  const mentionMatch = trimmed.match(/^<@!?(\d{17,20})>$/);
  return mentionMatch?.[1] ?? null;
}

function findHeaderIndex(headerRow: string[], headerName: string): number {
  const normalized = normalizeHeader(headerName);
  return headerRow.findIndex((header) => normalizeHeader(header) === normalized);
}

function extractCaptainDiscordId(row: string[], headerRow: string[]): string | null {
  const captainIndex = findHeaderIndex(headerRow, 'Captain Discord ID');
  if (captainIndex < 0) return null;
  return extractDiscordId(row[captainIndex] ?? '');
}

function collectMemberDiscordIds(row: string[], headerRow: string[], format: TournamentFormat): string[] {
  const ids = new Set<string>();
  const captainIndex = findHeaderIndex(headerRow, 'Captain Discord ID');
  if (captainIndex >= 0) {
    const captainId = extractDiscordId(row[captainIndex] ?? '');
    if (captainId) ids.add(captainId);
  }

  if (format !== '1vs1') {
    const teamSize = teamSizeFromFormat(format);
    for (let playerIndex = 1; playerIndex < teamSize; playerIndex += 1) {
      const playerIndexInRow = findHeaderIndex(
        headerRow,
        `Player ${playerIndex} Discord ID`,
      );
      if (playerIndexInRow >= 0) {
        const playerId = extractDiscordId(row[playerIndexInRow] ?? '');
        if (playerId) ids.add(playerId);
      }
    }
  }

  return [...ids];
}

export async function fetchPublicSheetCsv(sheetLink: string): Promise<string> {
  const spreadsheetId = extractSpreadsheetId(sheetLink);
  const gid = extractSpreadsheetGid(sheetLink);
  const exportUrl = buildPublicCsvExportUrl(spreadsheetId, gid);

  let response: Response;
  try {
    response = await fetch(exportUrl, {
      method: 'GET',
      redirect: 'follow',
    });
  } catch {
    throw new SheetsError('Unable to reach Google Sheets. Check network connectivity and try again.');
  }

  const body = await response.text();
  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    if (response.status === 404) {
      throw new SheetsError('Google Sheet not found. Verify the link is correct.');
    }
    throw new SheetsError(`Failed to read Google Sheet (HTTP ${response.status}).`);
  }

  if (isLikelyHtmlResponse(body, contentType)) {
    throw new SheetsError(
      'Google Sheet is not publicly readable. Set sharing to "Anyone with the link" as Viewer and try again.',
    );
  }

  return body;
}

export async function fetchPublicSheetTable(sheetLink: string): Promise<{
  headerRow: string[];
  rows: string[][];
}> {
  const body = await fetchPublicSheetCsv(sheetLink);
  const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new SheetsError('Google Sheet is empty or missing a header row.');
  }

  const headerRow = parseCsvLine(lines[0] ?? '');
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headerRow, rows };
}

export async function fetchPublicSheetRows(sheetLink: string): Promise<{
  format: TournamentFormat;
  headerRow: string[];
  rows: string[][];
}> {
  const { headerRow, rows } = await fetchPublicSheetTable(sheetLink);
  const format = detectTournamentFormatFromHeaders(headerRow);

  return { format, headerRow, rows };
}

function stripBracketNameDecorations(value: string): string {
  return value
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bracketNamesMatch(sheetName: string, targetName: string): boolean {
  const left = normalizeBracketName(sheetName);
  const right = normalizeBracketName(targetName);
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftStripped = normalizeBracketName(stripBracketNameDecorations(sheetName));
  const rightStripped = normalizeBracketName(stripBracketNameDecorations(targetName));
  return leftStripped === rightStripped || leftStripped.includes(rightStripped) || rightStripped.includes(leftStripped);
}

function buildParticipantLookupFromRow(
  row: string[],
  headerRow: string[],
  format: TournamentFormat,
  bracketName: string,
): SheetParticipantLookup {
  const captainDiscordId = extractCaptainDiscordId(row, headerRow);
  const memberDiscordIds = collectMemberDiscordIds(row, headerRow, format);

  return {
    bracketName,
    captainDiscordId: captainDiscordId ?? memberDiscordIds[0] ?? null,
    memberDiscordIds,
  };
}

function findRowForBracketName(
  rows: string[][],
  headerRow: string[],
  format: TournamentFormat,
  targetName: string,
): SheetParticipantLookup | null {
  const bracketColumnIndex = getBracketNameColumnIndex();
  let best: { lookup: SheetParticipantLookup; score: number } | null = null;

  for (const row of rows) {
    const bracketName = (row[bracketColumnIndex] ?? '').trim();
    if (!bracketName) continue;

    let score = 0;
    if (normalizeBracketName(bracketName) === normalizeBracketName(targetName)) {
      score = 100;
    } else if (bracketNamesMatch(bracketName, targetName)) {
      score = 80;
    } else {
      continue;
    }

    const lookup = buildParticipantLookupFromRow(row, headerRow, format, bracketName);
    if (!best || score > best.score) {
      best = { lookup, score };
    }
  }

  return best?.lookup ?? null;
}

export async function findParticipantsByBracketNames(
  sheetLink: string,
  names: string[],
): Promise<Map<string, SheetParticipantLookup>> {
  const { format, headerRow, rows } = await fetchPublicSheetRows(sheetLink);
  const bracketColumnIndex = getBracketNameColumnIndex();
  const normalizedTargets = new Set(names.map(normalizeBracketName));
  const results = new Map<string, SheetParticipantLookup>();

  for (const row of rows) {
    const bracketName = (row[bracketColumnIndex] ?? '').trim();
    if (!bracketName) continue;
    if (!normalizedTargets.has(normalizeBracketName(bracketName))) continue;

    results.set(
      normalizeBracketName(bracketName),
      buildParticipantLookupFromRow(row, headerRow, format, bracketName),
    );
  }

  for (const targetName of names) {
    const normalizedTarget = normalizeParticipantName(targetName);
    if (results.has(normalizedTarget)) continue;

    const fuzzy = findRowForBracketName(rows, headerRow, format, targetName);
    if (fuzzy) {
      results.set(normalizedTarget, fuzzy);
    }
  }

  return results;
}

export async function resolveCaptainsForMatchTeams(
  sheetLink: string,
  team1Name: string,
  team2Name: string,
): Promise<{ team1CaptainId: string | null; team2CaptainId: string | null }> {
  try {
    const lookup = await findParticipantsByBracketNames(sheetLink, [team1Name, team2Name]);
    return {
      team1CaptainId:
        lookup.get(normalizeParticipantName(team1Name))?.captainDiscordId ?? null,
      team2CaptainId:
        lookup.get(normalizeParticipantName(team2Name))?.captainDiscordId ?? null,
    };
  } catch {
    return { team1CaptainId: null, team2CaptainId: null };
  }
}

export function normalizeParticipantName(name: string): string {
  return normalizeBracketName(name);
}
