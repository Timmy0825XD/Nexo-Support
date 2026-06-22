import type { EmbedBuilder } from 'discord.js';
import {
  BRACKET_NAME_HEADER,
  buildRequiredParticipantHeaders,
  type TournamentFormat,
} from '../services/sheets.js';
import { embedField, infoEmbed } from './embeds.js';

export function formatHeadersForSheetPaste(format: TournamentFormat): string {
  return buildRequiredParticipantHeaders(format).join('\t');
}

export function buildSheetHeadersEmbed(format: TournamentFormat): EmbedBuilder {
  const headers = buildRequiredParticipantHeaders(format);
  const pasteLine = formatHeadersForSheetPaste(format);

  return infoEmbed(`Sheet Headers — ${format}`)
    .setDescription(
      [
        'Copy the line below and paste it into **row 1** of your Google Sheet.',
        'Sheets will split the values into separate columns automatically.',
        '',
        '```',
        pasteLine,
        '```',
      ].join('\n'),
    )
    .addFields(
      embedField('Columns', String(headers.length), true),
      embedField('Bracket name column', BRACKET_NAME_HEADER[format], true),
    );
}
