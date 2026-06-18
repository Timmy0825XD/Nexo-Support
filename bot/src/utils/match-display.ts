import type { Guild } from 'discord.js';
import type { CreateRoomsResult } from '../services/match-rooms.js';
import { embedField, successEmbed } from './embeds.js';
import { formatChannel } from './guild-display.js';
import {
  formatCompactScoreLine,
  formatEmphasizedName,
  formatMatchScoreBlock,
  formatMatchupTitle,
} from './match-formatting.js';

export function buildRoomsCreatedEmbed(
  guild: Guild,
  result: CreateRoomsResult,
) {
  const createdLines = result.created
    .map((room) => `• ${formatChannel(guild, room.channelId)} · \`${room.channelName}\``)
    .join('\n');

  const description = [
    result.created.length > 0
      ? `✅ Se crearon **${result.created.length}** sala(s):\n${createdLines}`
      : '*No se crearon salas nuevas.*',
    result.skipped.length > 0
      ? `\n⏭️ Omitidas **${result.skipped.length}** llave(s) que ya tenían sala.`
      : '',
    result.warnings.length > 0
      ? `\n⚠️ *Advertencias:*\n${result.warnings.map((warning) => `• ${warning}`).join('\n')}`
      : '',
    result.errors.length > 0
      ? `\n❌ *Errores:*\n${result.errors.map((error) => `• ${error}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return successEmbed('Rooms Created', description);
}

export function buildScoreUploadedEmbed(params: {
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  winnerSide: 1 | 2;
  note?: string | null;
  tournamentName?: string | null;
  matchGroup?: string | null;
  challongeMatchId?: string | null;
  archiveChannelLine?: string | null;
}) {
  const winnerName = params.winnerSide === 1 ? params.team1Name : params.team2Name;
  const descriptionLines = [
    '✅ *Resultado subido correctamente a Challonge.*',
    params.archiveChannelLine,
  ].filter(Boolean);

  const fields = [
    embedField('Partido', formatMatchupTitle(params.team1Name, params.team2Name), false),
    embedField(
      'Marcador final',
      formatMatchScoreBlock({
        team1Name: params.team1Name,
        team2Name: params.team2Name,
        score1: params.score1,
        score2: params.score2,
        winnerSide: params.winnerSide,
      }),
      false,
    ),
    embedField('Ganador', `🏆 ${formatEmphasizedName(winnerName)}`, true),
  ];

  if (params.matchGroup) {
    fields.push(embedField('Llave', `*${params.matchGroup}*`, true));
  }

  if (params.tournamentName) {
    fields.push(embedField('Torneo', formatEmphasizedName(params.tournamentName), true));
  }

  if (params.challongeMatchId) {
    fields.push(embedField('Match ID', `\`${params.challongeMatchId}\``, true));
  }

  if (params.note?.trim()) {
    fields.push(embedField('Nota', `*${params.note.trim()}*`, false));
  }

  return successEmbed('Score Uploaded', descriptionLines.join('\n')).addFields(fields);
}

export function buildBracketCorrectedEmbed(params: {
  team1Name: string;
  team2Name: string;
  oldScore1: number | null;
  oldScore2: number | null;
  newScore1: number;
  newScore2: number;
}) {
  const oldLine =
    params.oldScore1 != null && params.oldScore2 != null
      ? formatCompactScoreLine({
          team1Name: params.team1Name,
          team2Name: params.team2Name,
          score1: params.oldScore1,
          score2: params.oldScore2,
        })
      : '*Sin marcador previo*';

  const newLine = formatMatchScoreBlock({
    team1Name: params.team1Name,
    team2Name: params.team2Name,
    score1: params.newScore1,
    score2: params.newScore2,
  });

  return successEmbed(
    'Bracket Corrected',
    `✅ *Marcador actualizado en Challonge.*\n${formatMatchupTitle(params.team1Name, params.team2Name)}`,
  ).addFields(
    embedField('Marcador anterior', oldLine, false),
    embedField('Marcador nuevo', newLine, false),
  );
}

export function buildAutoRoomStatusEmbed(enabled: boolean, tournamentName: string) {
  return successEmbed(
    enabled ? 'Auto Room Enabled' : 'Auto Room Disabled',
    enabled
      ? `✅ *Creación automática activada* para ${formatEmphasizedName(tournamentName)}.`
      : `⏹️ *Creación automática desactivada* para ${formatEmphasizedName(tournamentName)}.`,
  );
}
