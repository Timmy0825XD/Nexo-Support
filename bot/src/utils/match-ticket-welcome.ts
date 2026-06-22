import { EmbedBuilder, type Guild, type TextChannel } from 'discord.js';
import type { SheetParticipantLookup } from '../services/sheets.js';
import type { MatchListRow } from '../types/match.js';
import type { TournamentRow } from '../types/tournament.js';
import { EMBED_COLORS } from '../constants/emojis.js';
import { isGroupStageMatch } from './auto-room-stage.js';
import { embedField } from './embeds.js';
import { formatChannel, formatRole, formatUser } from './guild-display.js';
import { formatScheduleFooterDate } from './schedule-display.js';

function formatMatchEmbedTitle(team1Name: string, team2Name: string): string {
  return `${team1Name.trim().toUpperCase()} VS ${team2Name.trim().toUpperCase()}`;
}

function formatGroupLabel(group: string): string {
  return group.replace(/ · /g, ' — ');
}

function formatRoundGroupValue(match: MatchListRow): string {
  const group = match.group?.trim();
  if (group && isGroupStageMatch(group)) {
    return formatGroupLabel(group);
  }

  const round = match.round?.trim();
  if (round) {
    return `Round ${round}`;
  }

  return group ? formatGroupLabel(group) : 'TBD';
}

function formatCaptainLine(captainId: string | null | undefined): string {
  return captainId ? formatUser(captainId) : '*Not found*';
}

function buildChallongeTournamentUrl(challongeId: string): string {
  return `https://challonge.com/${encodeURIComponent(challongeId.trim())}`;
}

export function buildMatchTicketWelcomeEmbed(params: {
  guild: Guild;
  tournament: TournamentRow;
  match: MatchListRow;
  team1?: SheetParticipantLookup | null;
  team2?: SheetParticipantLookup | null;
}): EmbedBuilder {
  const createdAt = new Date();
  const guildIcon = params.guild.iconURL({ extension: 'png', size: 128 });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setAuthor({
      name: params.tournament.name,
      url: buildChallongeTournamentUrl(params.tournament.challonge_id),
      ...(guildIcon ? { iconURL: guildIcon } : {}),
    })
    .addFields(
      embedField('Match', formatMatchEmbedTitle(params.match.team1_name, params.match.team2_name), false),
      embedField('Captain Team 1', formatCaptainLine(params.team1?.captainDiscordId), false),
      embedField('Captain Team 2', formatCaptainLine(params.team2?.captainDiscordId), false),
      embedField('Round — Group', formatRoundGroupValue(params.match), false),
      embedField('Rules', formatChannel(params.guild, params.tournament.rules_channel_id), false),
      embedField('Deadline', formatChannel(params.guild, params.tournament.deadline_channel_id), false),
    )
    .setFooter({
      text: `Match ID: ${params.match.challonge_match_id} • Created at: ${formatScheduleFooterDate(createdAt)}`,
    });

  return embed;
}

export async function sendMatchTicketWelcome(params: {
  channel: TextChannel;
  guild: Guild;
  tournament: TournamentRow;
  match: MatchListRow;
  team1?: SheetParticipantLookup | null;
  team2?: SheetParticipantLookup | null;
}): Promise<void> {
  const captain1 = params.team1?.captainDiscordId;
  const captain2 = params.team2?.captainDiscordId;
  const captainMentions = [captain1, captain2]
    .filter((id): id is string => Boolean(id))
    .map((id) => formatUser(id))
    .join(' ');
  const helperRole = formatRole(params.guild, params.tournament.helper_role_id);

  const content = [
    `**Greetings, Captains.** Your ticket has been created.${captainMentions ? ` ${captainMentions}` : ''}`,
    `> :alarm_clock: Please agree on a **date and time** for your Schedule, and remember to ping ${helperRole} once the schedule has been finalized.`,
  ].join('\n');

  await params.channel.send({
    content,
    embeds: [buildMatchTicketWelcomeEmbed(params)],
  });
}
