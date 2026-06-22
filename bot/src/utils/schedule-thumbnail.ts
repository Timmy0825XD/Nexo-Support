import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { MatchRow } from '../types/match.js';
import { SCHEDULE_THUMBNAIL_BACKGROUNDS } from '../constants/schedule-thumbnail-backgrounds.js';
import { parseScheduleUtcInstant } from './schedule-datetime.js';

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

const LOCAL_BACKGROUNDS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../assets/schedule-backgrounds',
);

const THUMBNAIL_STATE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/schedule-thumbnail-state.json',
);

const COLORS = {
  gold: '#f5d547',
  goldBright: '#ffe566',
  white: '#ffffff',
  vsTop: '#ff6b6b',
  vsBottom: '#e63946',
  badgeFill: 'rgba(24, 72, 140, 0.92)',
  badgeStroke: 'rgba(120, 190, 255, 0.75)',
  boxStroke: '#f5d547',
  boxFill: 'rgba(0, 0, 0, 0.72)',
  teamNeon: 'rgba(120, 220, 255, 0.9)',
  teamNeonOuter: 'rgba(0, 180, 255, 0.75)',
};

/** Segoe UI on Windows; fallbacks elsewhere. VS keeps Georgia unchanged. */
const FONTS = {
  tournament: (size: number) => `bold ${size}px "Segoe UI", "Arial Black", Arial, sans-serif`,
  badge: 'bold 28px "Segoe UI", Arial, sans-serif',
  team: 'bold 64px "Segoe UI", Arial, sans-serif',
  info: 'bold 30px "Segoe UI", Arial, sans-serif',
  vs: 'bold 112px Georgia',
} as const;

const TOURNAMENT_FONT_MAX = 78;
const TOURNAMENT_FONT_MIN = 48;

type CanvasContext = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

interface ThumbnailRotationState {
  lastBackground: string | null;
}

function readRotationState(): ThumbnailRotationState {
  try {
    if (existsSync(THUMBNAIL_STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(THUMBNAIL_STATE_FILE, 'utf8')) as ThumbnailRotationState;
      return { lastBackground: parsed.lastBackground ?? null };
    }
  } catch {
    // Ignore corrupt state file.
  }
  return { lastBackground: null };
}

function writeRotationState(state: ThumbnailRotationState): void {
  mkdirSync(dirname(THUMBNAIL_STATE_FILE), { recursive: true });
  writeFileSync(THUMBNAIL_STATE_FILE, JSON.stringify(state, null, 2));
}

function listLocalBackgroundPaths(): string[] {
  if (!existsSync(LOCAL_BACKGROUNDS_DIR)) return [];
  return readdirSync(LOCAL_BACKGROUNDS_DIR)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort()
    .map((name) => join(LOCAL_BACKGROUNDS_DIR, name));
}

export function listScheduleBackgroundSources(): string[] {
  const local = listLocalBackgroundPaths();
  if (local.length > 0) return local;
  return [...SCHEDULE_THUMBNAIL_BACKGROUNDS];
}

export function pickNextScheduleBackground(distinctFromPrevious = true): string {
  const sources = listScheduleBackgroundSources();
  if (sources.length === 0) return 'gradient';

  const { lastBackground } = readRotationState();
  let pool = sources;

  if (distinctFromPrevious && lastBackground && sources.length > 1) {
    const filtered = sources.filter((source) => source !== lastBackground);
    if (filtered.length > 0) pool = filtered;
  }

  const picked = pool[Math.floor(Math.random() * pool.length)] ?? sources[0]!;
  if (distinctFromPrevious) {
    writeRotationState({ lastBackground: picked });
  }
  return picked;
}

function normalizeRoundNumber(round: string): string {
  const trimmed = round?.trim();
  return trimmed || 'TBD';
}

/** True when `group` repeats the round label (single-stage brackets store "Round N" in both fields). */
function isRedundantGroupLabel(round: string, group: string): boolean {
  const g = group.trim();
  const r = normalizeRoundNumber(round);
  if (!g) return true;

  if (g.toLowerCase() === `round ${r}`.toLowerCase()) return true;

  const roundOnly = g.match(/^Round\s+(\d+)$/i);
  if (roundOnly && roundOnly[1] === r) return true;

  const stage2Only = g.match(/^Stage 2\s·\sRound\s+(\d+)$/i);
  if (stage2Only && stage2Only[1] === r) return true;

  return false;
}

function extractDisplayGroup(group: string): string | null {
  const g = group.trim();
  if (!g) return null;

  if (/Grand Final/i.test(g)) return 'GRAND FINALS';

  const namedGroup = g.match(/Group [A-Z0-9]+/i);
  if (namedGroup) return namedGroup[0]!.toUpperCase();

  if (/^Winners\b/i.test(g)) return 'WINNERS';
  if (/^Losers\b/i.test(g)) return 'LOSERS';
  if (/^Stage 1\b/i.test(g)) {
    const stageGroup = g.match(/Group [A-Z0-9]+/i);
    if (stageGroup) return stageGroup[0]!.toUpperCase();
  }

  return null;
}

export function formatThumbnailRoundGroup(round: string, group: string): string {
  const roundLabel = normalizeRoundNumber(round);
  const displayGroup = extractDisplayGroup(group);

  if (!displayGroup || isRedundantGroupLabel(round, group)) {
    return `ROUND ${roundLabel.toUpperCase()}`;
  }

  return `ROUND ${roundLabel.toUpperCase()} - ${displayGroup}`;
}

function formatThumbnailDateLine(date: Date): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const dayName = days[date.getUTCDay()] ?? 'UNKNOWN';
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dayName}, ${dd}-${mm}-${yy}`;
}

function formatUtcTimeLine(date: Date): string {
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hour}:${minute} UTC`;
}

async function tryLoadImage(source: string): Promise<Awaited<ReturnType<typeof loadImage>> | null> {
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}

async function resolveBackgroundImage(source: string): Promise<{
  image: Awaited<ReturnType<typeof loadImage>> | null;
  source: string;
}> {
  if (source !== 'gradient') {
    const image = await tryLoadImage(source);
    if (image) return { image, source };
  }
  return { image: null, source: 'gradient' };
}

function drawFallbackBackground(ctx: CanvasContext, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0a1628');
  gradient.addColorStop(0.45, '#1b2d52');
  gradient.addColorStop(1, '#0d1f3c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawDarkOverlay(ctx: CanvasContext, width: number, height: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.2,
    width / 2,
    height / 2,
    height * 0.85,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const topFade = ctx.createLinearGradient(0, 0, 0, height * 0.35);
  topFade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  topFade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, width, height * 0.35);

  const bottomFade = ctx.createLinearGradient(0, height * 0.55, 0, height);
  bottomFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  bottomFade.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);
}

function truncateText(ctx: CanvasContext, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function fitTournamentFontSize(ctx: CanvasContext, text: string, maxWidth: number): number {
  for (let size = TOURNAMENT_FONT_MAX; size >= TOURNAMENT_FONT_MIN; size -= 2) {
    ctx.font = FONTS.tournament(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return TOURNAMENT_FONT_MIN;
}

function drawRoundedRect(
  ctx: CanvasContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawGlowText(
  ctx: CanvasContext,
  text: string,
  x: number,
  y: number,
  options: {
    font: string;
    color: string;
    glowColor?: string;
    glowBlur?: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  },
): void {
  ctx.save();
  ctx.font = options.font;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = options.baseline ?? 'alphabetic';
  ctx.shadowColor = options.glowColor ?? options.color;
  ctx.shadowBlur = options.glowBlur ?? 18;
  ctx.fillStyle = options.color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = options.color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawNeonTeamName(
  ctx: CanvasContext,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
): void {
  ctx.save();
  ctx.font = FONTS.team;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  ctx.shadowColor = COLORS.teamNeonOuter;
  ctx.shadowBlur = 32;
  ctx.fillStyle = COLORS.white;
  ctx.fillText(text, x, y);

  ctx.shadowColor = COLORS.teamNeon;
  ctx.shadowBlur = 16;
  ctx.fillText(text, x, y);

  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.white;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTournamentTitle(ctx: CanvasContext, text: string, centerX: number, y: number): void {
  const maxWidth = OUTPUT_WIDTH - 220;
  const fontSize = fitTournamentFontSize(ctx, text, maxWidth);
  ctx.font = FONTS.tournament(fontSize);
  const displayText = truncateText(ctx, text, maxWidth);

  drawGlowText(ctx, displayText, centerX, y, {
    font: FONTS.tournament(fontSize),
    color: COLORS.goldBright,
    glowColor: 'rgba(255, 229, 102, 0.65)',
    glowBlur: 28,
    align: 'center',
    baseline: 'middle',
  });
}

async function drawGuildIcon(
  ctx: CanvasContext,
  iconUrl: string | null | undefined,
  centerX: number,
  topY: number,
  size: number,
): Promise<void> {
  if (!iconUrl) return;

  const icon = await tryLoadImage(iconUrl);
  if (!icon) return;

  const x = centerX - size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, topY + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(icon, x, topY, size, size);
  ctx.restore();

  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centerX, topY + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRoundBadge(ctx: CanvasContext, label: string, centerX: number, centerY: number): void {
  ctx.font = FONTS.badge;
  const textWidth = ctx.measureText(label).width;
  const padX = 32;
  const padY = 14;
  const w = textWidth + padX * 2;
  const h = 48;
  const x = centerX - w / 2;
  const y = centerY - h / 2;

  drawRoundedRect(ctx, x, y, w, h, 24);
  ctx.fillStyle = COLORS.badgeFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.badgeStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.white;
  ctx.fillText(label, centerX, centerY);
}

function drawVsMark(ctx: CanvasContext, centerX: number, centerY: number): void {
  const gradient = ctx.createLinearGradient(centerX, centerY - 50, centerX, centerY + 50);
  gradient.addColorStop(0, COLORS.vsTop);
  gradient.addColorStop(1, COLORS.vsBottom);

  ctx.save();
  ctx.font = FONTS.vs;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(230, 57, 70, 0.85)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = gradient;
  ctx.fillText('VS', centerX, centerY);
  ctx.shadowBlur = 12;
  ctx.fillText('VS', centerX, centerY);
  ctx.restore();
}

function drawInfoBox(
  ctx: CanvasContext,
  lines: string[],
  centerX: number,
  bottomY: number,
): void {
  const boxW = 880;
  const lineHeight = 38;
  const boxH = lines.length * lineHeight + 48;
  const boxX = centerX - boxW / 2;
  const boxY = bottomY - boxH;

  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 18);
  ctx.fillStyle = COLORS.boxFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.boxStroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = FONTS.info;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  lines.forEach((line, index) => {
    const y = boxY + 36 + index * lineHeight;
    drawGlowText(ctx, line, centerX, y, {
      font: FONTS.info,
      color: COLORS.gold,
      glowColor: 'rgba(245, 213, 71, 0.45)',
      glowBlur: 10,
      align: 'center',
      baseline: 'middle',
    });
  });
}

export async function generateScheduleThumbnailBuffer(params: {
  tournamentName: string;
  guildName: string;
  guildIconUrl?: string | null;
  match: Pick<MatchRow, 'team1_name' | 'team2_name' | 'round' | 'group'>;
  scheduledAt: string | Date;
  distinctBackground?: boolean;
}): Promise<Buffer> {
  const backgroundSource = pickNextScheduleBackground(params.distinctBackground !== false);
  const background = await resolveBackgroundImage(backgroundSource);

  const canvas = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (background.image) {
    ctx.drawImage(background.image, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  } else {
    drawFallbackBackground(ctx, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  }

  drawDarkOverlay(ctx, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const iconSize = 88;
  await drawGuildIcon(ctx, params.guildIconUrl, OUTPUT_WIDTH / 2, 36, iconSize);

  const scheduledDate = parseScheduleUtcInstant(params.scheduledAt);
  const roundBadge = formatThumbnailRoundGroup(params.match.round, params.match.group);
  const teamMaxWidth = 640;

  drawTournamentTitle(ctx, params.tournamentName.toUpperCase(), OUTPUT_WIDTH / 2, 178);

  drawRoundBadge(ctx, roundBadge, OUTPUT_WIDTH / 2, 248);

  const team1 = params.match.team1_name.toUpperCase();
  const team2 = params.match.team2_name.toUpperCase();
  const matchupY = 520;

  ctx.font = FONTS.team;
  drawNeonTeamName(ctx, truncateText(ctx, team1, teamMaxWidth), 100, matchupY, 'left');
  drawNeonTeamName(ctx, truncateText(ctx, team2, teamMaxWidth), OUTPUT_WIDTH - 100, matchupY, 'right');

  drawVsMark(ctx, OUTPUT_WIDTH / 2, matchupY);

  drawInfoBox(
    ctx,
    [
      `DATE: ${formatThumbnailDateLine(scheduledDate)}`,
      `TIME: ${formatUtcTimeLine(scheduledDate)}`,
      params.guildName.toUpperCase(),
    ],
    OUTPUT_WIDTH / 2,
    OUTPUT_HEIGHT - 56,
  );

  return canvas.toBuffer('image/png');
}

export function isThumbnailGenerationAvailable(): boolean {
  try {
    createCanvas(1, 1);
    return true;
  } catch {
    return false;
  }
}
