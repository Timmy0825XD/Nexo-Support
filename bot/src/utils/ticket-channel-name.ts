import type { MatchListRow } from '../types/match.js';
import { isGroupStageMatch } from './auto-room-stage.js';

const MAX_CHANNEL_NAME_LENGTH = 100;

function sanitizeChannelSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'player';
}

function buildRoundSegment(round: string): string {
  const roundNumber = Number.parseInt(round, 10);
  if (!Number.isNaN(roundNumber) && roundNumber > 0) {
    return `r${roundNumber}`;
  }

  const fromLabel = round.match(/(?:round|r)\s*(\d+)/i)?.[1];
  if (fromLabel) {
    return `r${fromLabel}`;
  }

  return sanitizeChannelSegment(round).slice(0, 8) || 'match';
}

/**
 * Group slug for ticket channel names (e.g. "a" from "Group A · Round 1").
 * Returns null when the bracket/match is not part of a group stage.
 */
export function extractGroupSlug(group: string): string | null {
  const trimmed = group.trim();
  if (!trimmed) return null;

  if (/^[A-Z]$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (!isGroupStageMatch(group)) {
    return null;
  }

  const letterMatch = trimmed.match(/\bGroup\s+([A-Z0-9])\b/i);
  if (letterMatch) {
    return letterMatch[1]!.toLowerCase();
  }

  const numberMatch = trimmed.match(/\bGroup\s+(\d+)\b/i);
  if (numberMatch) {
    const groupNumber = Number.parseInt(numberMatch[1]!, 10);
    if (groupNumber >= 1 && groupNumber <= 26) {
      return String.fromCharCode(96 + groupNumber);
    }
    return numberMatch[1]!;
  }

  return null;
}

/**
 * Ticket channel name pattern:
 * - Group brackets: `{group}-r{round}-{team1}-vs-{team2}` → `a-r1-alpha-vs-beta`
 * - Single bracket: `r{round}-{team1}-vs-{team2}` → `r1-alpha-vs-beta`
 */
export function buildTicketChannelName(match: MatchListRow): string {
  const roundSegment = buildRoundSegment(match.round);
  const team1 = sanitizeChannelSegment(match.team1_name);
  const team2 = sanitizeChannelSegment(match.team2_name);
  const groupSlug = extractGroupSlug(match.group);

  const segments = groupSlug
    ? [groupSlug, roundSegment, `${team1}-vs-${team2}`]
    : [roundSegment, `${team1}-vs-${team2}`];

  return segments.join('-').slice(0, MAX_CHANNEL_NAME_LENGTH);
}
