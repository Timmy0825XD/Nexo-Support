import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { SheetValidationRoleRunResult } from '../services/sheet-validation-role.js';
import { formatUser } from './guild-display.js';

export function buildValidationRoleWelcomeContent(params: {
  teamLabel: string;
  captainUserId: string;
  roleMention: string;
  organizerMention: string;
  issues: Array<{
    discordId: string | null;
    tag: string;
    issue: 'missing_role' | 'not_in_server';
  }>;
}): string {
  const issueLines = params.issues.map((item) => {
    const mention = item.discordId ? formatUser(item.discordId) : 'Unknown player';
    const reason =
      item.issue === 'missing_role'
        ? `Missing ${params.roleMention} role`
        : 'Not in server';
    return `* ${mention} __${item.tag}__ — ${reason}`;
  });

  return [
    `Greetings, Captain ${formatUser(params.captainUserId)} - **${params.teamLabel}**.`,
    '',
    `According to our tournament rules, **all registered players must be verified in the server.** This ticket has been opened because ***one or more members*** of your team do not have the ${params.roleMention} role or are not currently in the server.`,
    `> Please contact your teammates to resolve the issue. **Once everything has been fixed, ping ${params.organizerMention} so we can verify it.**`,
    '',
    '__**Issues:**__',
    issueLines.length > 0 ? issueLines.join('\n') : '*No player details available.*',
  ].join('\n');
}

export function buildValidationRoleSummaryEmbed(
  result: SheetValidationRoleRunResult,
  roleName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(result.problemCount > 0 ? EMBED_COLORS.warning : EMBED_COLORS.success)
    .setTitle(
      result.problemCount > 0
        ? `${CUSTOM_EMOJIS.error} Role Validation Completed`
        : `${CUSTOM_EMOJIS.done} Role Validation Completed`,
    )
    .setDescription(
      [
        `Checked teams for role **${roleName}**.`,
        '',
        `**Teams read:** ${result.totalTeams}`,
        `**Teams compliant:** ${result.approvedCount}`,
        `**Teams with issues:** ${result.problemCount}`,
        `**Support tickets created:** ${result.channelsCreated}`,
        `**Tickets failed:** ${result.channelsFailed}`,
      ].join('\n'),
    )
    .setTimestamp();

  if (result.failedTeams.length > 0) {
    const lines = result.failedTeams
      .slice(0, 10)
      .map((team) => `• **${team.teamLabel}** — ${team.reason}`)
      .join('\n');
    embed.addFields({
      name: 'Teams without a ticket',
      value: lines + (result.failedTeams.length > 10 ? `\n*...and ${result.failedTeams.length - 10} more.*` : ''),
      inline: false,
    });
  }

  return embed;
}

export function buildValidationRoleReportAttachment(
  result: SheetValidationRoleRunResult,
  roleName: string,
): AttachmentBuilder {
  const lines = [
    `Role Validation Report — ${roleName}`,
    `Generated: ${new Date().toISOString()}`,
    `Teams read: ${result.totalTeams}`,
    `Compliant: ${result.approvedCount}`,
    `With issues: ${result.problemCount}`,
    `Tickets created: ${result.channelsCreated}`,
    `Tickets failed: ${result.channelsFailed}`,
    '',
  ];

  if (result.approvedTeams.length > 0) {
    lines.push('=== COMPLIANT TEAMS ===');
    for (const team of result.approvedTeams) {
      lines.push(`- ${team.teamLabel} (${team.verifiedCount}/${team.totalMembers})`);
    }
    lines.push('');
  }

  if (result.problemTeams.length > 0) {
    lines.push('=== TEAMS WITH ISSUES ===');
    for (const team of result.problemTeams) {
      lines.push(`- ${team.teamLabel} [${team.verifiedCount}/${team.totalMembers}]`);
      for (const player of team.players) {
        if (!player.issue) continue;
        const issueLabel =
          player.issue === 'missing_role' ? `Missing ${roleName} role` : 'Not in server';
        lines.push(`  · ${player.displayName} (${player.discordTag}): ${issueLabel}`);
      }
      if (team.channelId) {
        lines.push(`  Ticket: channel ${team.channelId}`);
      }
    }
    lines.push('');
  }

  if (result.failedTeams.length > 0) {
    lines.push('=== TICKET CREATION FAILURES ===');
    for (const team of result.failedTeams) {
      lines.push(`- ${team.teamLabel}: ${team.reason}`);
    }
  }

  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf-8'), {
    name: 'role-validation-report.txt',
  });
}
