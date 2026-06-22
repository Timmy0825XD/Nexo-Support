import { AttachmentBuilder } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type {
  SheetValidationIssue,
  SheetValidationIssueCode,
  SheetValidationResult,
} from '../services/sheet-validation.js';
import type { TournamentFormat } from '../services/sheets.js';

export const ISSUE_SECTIONS: Array<{
  code: SheetValidationIssueCode;
  title: string;
  buttonLabel: string;
}> = [
  { code: 'banned_game_id', title: 'Banned In-game IDs', buttonLabel: '🚫 Banned IDs' },
  { code: 'duplicate_discord_id', title: 'Duplicate Discord IDs', buttonLabel: '👥 Dup Discord' },
  { code: 'duplicate_game_id', title: 'Duplicate In-game IDs', buttonLabel: '🎮 Dup Game ID' },
  { code: 'discord_account_too_new', title: 'Discord Account Age', buttonLabel: '📅 Account Age' },
  { code: 'invalid_discord_id', title: 'Invalid Discord IDs', buttonLabel: '❌ Bad Discord' },
  { code: 'discord_id_from_tag', title: 'Discord ID Resolved from Tag', buttonLabel: '🔍 ID from Tag' },
  { code: 'invalid_game_id', title: 'Invalid In-game IDs', buttonLabel: '❌ Bad Game ID' },
  { code: 'missing_discord_id', title: 'Missing Discord IDs', buttonLabel: '⚠️ No Discord' },
  { code: 'missing_game_id', title: 'Missing In-game IDs', buttonLabel: '⚠️ No Game ID' },
  { code: 'missing_discord_tag', title: 'Missing Discord Tags', buttonLabel: '⚠️ No Tag' },
  { code: 'not_in_server', title: 'Not in Server', buttonLabel: '🚪 Not in Server' },
  { code: 'staff_role', title: 'Staff / Judge / Recorder Roles', buttonLabel: '👔 Staff Role' },
  { code: 'tag_mismatch', title: 'Tag Mismatches', buttonLabel: '🏷️ Tag Mismatch' },
];

const MAX_PAGE_BODY = 3800;

export interface SheetValidationPage {
  title: string;
  buttonLabel: string;
  description: string;
  color: number;
}

function formatIssueLine(issue: SheetValidationIssue): string {
  return `Row ${issue.sheetRow} · **${issue.teamLabel}** · ${issue.playerLabel}\n${issue.message}`;
}

function splitIssuesIntoBodies(issues: SheetValidationIssue[]): string[] {
  const lines = issues.map(formatIssueLine);
  const bodies: string[] = [];
  let chunk: string[] = [];
  let chunkLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 2;
    if (chunkLength + lineLength > MAX_PAGE_BODY && chunk.length > 0) {
      bodies.push(chunk.join('\n\n'));
      chunk = [line];
      chunkLength = lineLength;
    } else {
      chunk.push(line);
      chunkLength += lineLength;
    }
  }

  if (chunk.length > 0) {
    bodies.push(chunk.join('\n\n'));
  }

  return bodies;
}

function buildSummaryDescription(result: SheetValidationResult): string {
  if (result.passed) {
    return `All **${result.playerCount}** player(s) across **${result.teamCount}** team(s) passed validation (**${result.format}**).`;
  }

  const sectionCounts = ISSUE_SECTIONS.map((section) => {
    const count = result.issues.filter((issue) => issue.code === section.code).length;
    return count > 0 ? `• **${section.title}:** ${count}` : null;
  }).filter(Boolean);

  return [
    `${CUSTOM_EMOJIS.error} Found **${result.issues.length}** issue(s) across **${result.teamCount}** team(s) (**${result.format}**).`,
    '',
    '**Issues by category:**',
    sectionCounts.join('\n'),
    '',
    'Use **◀ ▶** to browse each section. The full report is attached as `.txt`.',
  ].join('\n');
}

export function buildSheetValidationPages(result: SheetValidationResult): SheetValidationPage[] {
  const pages: SheetValidationPage[] = [
    {
      title: result.passed ? 'Sheet Validation Passed' : 'Sheet Validation Failed',
      buttonLabel: '📋 Summary',
      description: buildSummaryDescription(result),
      color: result.passed ? EMBED_COLORS.success : EMBED_COLORS.error,
    },
  ];

  if (result.passed) {
    return pages;
  }

  for (const section of ISSUE_SECTIONS) {
    const sectionIssues = result.issues.filter((issue) => issue.code === section.code);
    if (sectionIssues.length === 0) continue;

    const bodies = splitIssuesIntoBodies(sectionIssues);
    bodies.forEach((body, index) => {
      const title =
        bodies.length > 1
          ? `${section.title} (${index + 1}/${bodies.length})`
          : section.title;

      pages.push({
        title,
        buttonLabel: section.buttonLabel,
        description: `**${sectionIssues.length}** issue(s)\n\n${body}`,
        color: EMBED_COLORS.warning,
      });
    });
  }

  return pages;
}

export function buildSheetValidationReportText(
  result: SheetValidationResult,
  format: TournamentFormat,
): string {
  const lines = [
    `Sheet Validation Report (${format})`,
    `Generated: ${new Date().toISOString()}`,
    `Teams: ${result.teamCount}`,
    `Players: ${result.playerCount}`,
    `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `Issues: ${result.issues.length}`,
    '',
  ];

  if (result.issues.length === 0) {
    lines.push('No issues found.');
    return lines.join('\n');
  }

  for (const section of ISSUE_SECTIONS) {
    const sectionIssues = result.issues.filter((issue) => issue.code === section.code);
    if (sectionIssues.length === 0) continue;

    lines.push(`=== ${section.title} (${sectionIssues.length}) ===`);
    for (const issue of sectionIssues) {
      lines.push(
        `Row ${issue.sheetRow} | ${issue.teamLabel} | ${issue.playerLabel} | ${issue.message}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function buildSheetValidationReportAttachment(
  result: SheetValidationResult,
): AttachmentBuilder | null {
  if (result.passed) return null;

  const report = buildSheetValidationReportText(result, result.format);
  return new AttachmentBuilder(Buffer.from(report, 'utf-8'), {
    name: 'sheet-validation-report.txt',
  });
}
