import { EmbedBuilder, type Guild, type TextChannel } from 'discord.js';
import type { SheetParticipantLookup } from '../services/sheets.js';
import type { MatchListRow } from '../types/match.js';
import type { TournamentRow } from '../types/tournament.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import { embedField } from './embeds.js';
import { formatChannel, formatRole, formatUser } from './guild-display.js';
import { formatEmphasizedName, formatMatchupTitle } from './match-formatting.js';
import { isGroupStageMatch } from './auto-room-stage.js';

function formatCreatedAt(date: Date): string {
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildMatchTicketWelcomeEmbed(params: {
  guild: Guild;
  tournament: TournamentRow;
  match: MatchListRow;
  team1?: SheetParticipantLookup | null;
  team2?: SheetParticipantLookup | null;
}): EmbedBuilder {
  const captain1 = params.team1?.captainDiscordId;
  const captain2 = params.team2?.captainDiscordId;

  const stageLabel = isGroupStageMatch(params.match.group)
    ? `Etapa de grupos · ${params.match.group}`
    : params.match.group;

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setAuthor({ name: params.tournament.name })
    .setDescription(formatMatchupTitle(params.match.team1_name, params.match.team2_name))
    .addFields(
      embedField(`${CUSTOM_EMOJIS.done} Match Room Created`, `ℹ️ ${stageLabel}`, false),
      embedField('👑 Team 1', captain1 ? formatUser(captain1) : '`Captain not found`', true),
      embedField('👑 Team 2', captain2 ? formatUser(captain2) : '`Captain not found`', true),
      embedField('📜 Rules', formatChannel(params.guild, params.tournament.rules_channel_id), true),
      embedField('📅 Deadline', formatChannel(params.guild, params.tournament.deadline_channel_id), true),
    )
    .setFooter({
      text: `Match ID: ${params.match.challonge_match_id} • Created at • ${formatCreatedAt(new Date())}`,
    })
    .setTimestamp();
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
    `${CUSTOM_EMOJIS.done} Sala creada para ${formatMatchupTitle(params.match.team1_name, params.match.team2_name)}.`,
    `🚨 Please decide on a schedule and ping ${helperRole}.`,
    captainMentions ? `${captainMentions} Discuss your schedule.` : null,
    '',
  ]
    .filter(Boolean)
    .join('\n');

  await params.channel.send({
    content,
    embeds: [buildMatchTicketWelcomeEmbed(params)],
  });
}
