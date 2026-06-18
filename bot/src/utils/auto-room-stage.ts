import type { ChallongeTournamentSummary } from '../services/challonge.js';

/** Group-stage matches (stage 1) — labels like "Group A · Round 1". */
export function isGroupStageMatch(group: string): boolean {
  return /Group [A-Z0-9]/i.test(group) || group.includes('Stage 1 · Group');
}

/** Main bracket matches after groups (stage 2+). */
export function isEliminationStageMatch(group: string): boolean {
  if (group.startsWith('Stage 2')) return true;
  if (group.startsWith('Winners') || group.startsWith('Losers')) return true;
  if (group === 'Grand Finals') return true;
  if (/^Round \d+$/i.test(group.trim())) return true;
  return false;
}

export function isTwoStageTournament(summary: ChallongeTournamentSummary): boolean {
  return summary.groupStageEnabled || summary.state === 'group_stages_underway';
}

export function isGroupStageStillActive(summary: ChallongeTournamentSummary): boolean {
  return summary.state === 'group_stages_underway';
}

/**
 * Whether a ready match should receive an auto-created room for the current Challonge state.
 * Two-stage tournaments: group-stage matches while groups are open; elimination only after
 * the main bracket starts. Final-bracket placeholders are already excluded by isMatchReadyForRoom.
 */
export function isMatchEligibleForAutoRoom(
  group: string,
  summary: ChallongeTournamentSummary,
): boolean {
  if (isTwoStageTournament(summary)) {
    if (isGroupStageStillActive(summary)) {
      return isGroupStageMatch(group);
    }

    if (summary.state === 'underway' || summary.state === 'awaiting_review') {
      if (isGroupStageMatch(group)) {
        return false;
      }
      return isEliminationStageMatch(group);
    }

    return false;
  }

  return summary.state === 'underway' || summary.state === 'awaiting_review';
}
