/** Escape characters that break Discord markdown emphasis/code spans. */
export function escapeDiscordMarkdown(value: string): string {
  return value.replace(/([*_`~|>\\])/g, '\\$1');
}

/** Bold team or player name in user-facing embeds. */
export function formatEmphasizedName(name: string): string {
  return `**${escapeDiscordMarkdown(name.trim())}**`;
}

/** Numeric score in a monospace span so it never blends with team names. */
export function formatScoreValue(score: number): string {
  return `\`${score}\``;
}

/** Single-line matchup title. */
export function formatMatchupTitle(team1Name: string, team2Name: string): string {
  return `${formatEmphasizedName(team1Name)} __vs__ ${formatEmphasizedName(team2Name)}`;
}

/**
 * Multi-line score block: team name and score on separate visual tokens.
 * Example: **team 2** · `3`  vs  **team 1** · `5` 🏆
 */
export function formatMatchScoreBlock(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  winnerSide?: 1 | 2;
}): string {
  const team1Prefix = params.winnerSide === 1 ? '🏆 ' : '';
  const team2Prefix = params.winnerSide === 2 ? '🏆 ' : '';

  const line1 = `${team1Prefix}${formatEmphasizedName(params.team1Name)} · ${formatScoreValue(params.score1)}`;
  const line2 = `${team2Prefix}${formatEmphasizedName(params.team2Name)} · ${formatScoreValue(params.score2)}`;

  return `${line1}\n__—— VS ——__\n${line2}`;
}

/** Compact score for log fields. */
export function formatCompactScoreLine(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
}): string {
  return `${formatEmphasizedName(params.team1Name)} ${formatScoreValue(params.score1)} __–__ ${formatScoreValue(params.score2)} ${formatEmphasizedName(params.team2Name)}`;
}
