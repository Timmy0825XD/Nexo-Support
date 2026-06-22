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

/** Uppercase embed title for matchups (schedule, attendance, results). */
export function formatMatchEmbedTitle(team1Name: string, team2Name: string): string {
  return `${team1Name.trim().toUpperCase()} VS ${team2Name.trim().toUpperCase()}`;
}

/** Single-line matchup label without scores. */
export function formatMatchupTitle(team1Name: string, team2Name: string): string {
  return `${formatEmphasizedName(team1Name)} VS ${formatEmphasizedName(team2Name)}`;
}

/**
 * Standard score line: **TEAM** `3` - `2` **TEAM**
 * Optional winnerSide adds 🏆 before the winning team name.
 */
export function formatInlineScoreLine(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  winnerSide?: 1 | 2;
}): string {
  const team1 =
    params.winnerSide === 1
      ? `🏆 ${formatEmphasizedName(params.team1Name)}`
      : formatEmphasizedName(params.team1Name);
  const team2 =
    params.winnerSide === 2
      ? `🏆 ${formatEmphasizedName(params.team2Name)}`
      : formatEmphasizedName(params.team2Name);

  return `${team1} ${formatScoreValue(params.score1)} - ${formatScoreValue(params.score2)} ${team2}`;
}

/** @deprecated Prefer formatInlineScoreLine — kept as alias for existing call sites. */
export function formatMatchScoreBlock(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  winnerSide?: 1 | 2;
}): string {
  return formatInlineScoreLine(params);
}

/** Compact score line — same layout as formatInlineScoreLine. */
export function formatCompactScoreLine(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  winnerSide?: 1 | 2;
}): string {
  return formatInlineScoreLine(params);
}
