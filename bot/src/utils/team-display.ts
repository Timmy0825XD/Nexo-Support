import { EmbedBuilder } from 'discord.js';
import { EMBED_COLORS } from '../constants/emojis.js';
import type { ParsedParticipant, TeamPlayer } from '../types/participant.js';
import type { TournamentRow } from '../types/tournament.js';
import { embedField } from './embeds.js';
import { formatUser } from './guild-display.js';
import { formatEmphasizedName } from './match-formatting.js';

function formatOptionalMonospace(value: string | null | undefined): string {
  if (!value?.trim()) return '`None`';
  return `\`${value.trim()}\``;
}

function formatPlayerBlock(player: TeamPlayer): string {
  return [
    `Discord: ${player.discordId ? formatUser(player.discordId) : '`Not provided`'}`,
    `In-game: ${player.inGameName ? formatEmphasizedName(player.inGameName) : '`Not provided`'} · ${formatOptionalMonospace(player.inGameId)}`,
    `Title: ${formatOptionalMonospace(player.currentTitle)}`,
  ].join('\n');
}

function buildPlayerFields(participant: ParsedParticipant): Array<ReturnType<typeof embedField>> {
  return participant.players.map((player) => {
    const prefix = player.label === 'Captain' ? '👑 ' : '🎮 ';
    return embedField(`${prefix}${player.label}`, formatPlayerBlock(player), false);
  });
}

export function buildTeamInfoEmbed(params: {
  tournament: TournamentRow;
  participant: ParsedParticipant;
}): EmbedBuilder {
  const titleName = params.participant.teamName ?? params.participant.bracketName;

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(`Team Info — ${titleName}`)
    .setDescription(`**${params.tournament.name}**`)
    .addFields(...buildPlayerFields(params.participant))
    .setTimestamp();
}

export function buildParticipantListEmbed(participant: ParsedParticipant): EmbedBuilder {
  const titleName = participant.teamName ?? participant.bracketName;

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(titleName)
    .addFields(...buildPlayerFields(participant))
    .setTimestamp();
}

export function formatParticipantMentions(participant: ParsedParticipant): string | undefined {
  const mentions: string[] = [];
  const seen = new Set<string>();

  for (const player of participant.players) {
    if (!player.discordId || seen.has(player.discordId)) continue;
    seen.add(player.discordId);
    mentions.push(`<@${player.discordId}>`);
  }

  return mentions.length > 0 ? mentions.join(' ') : undefined;
}
