import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { MatchListRow } from '../types/match.js';
import { formatMatchupTitle } from './match-formatting.js';

export const ROOM_AVAILABLE_PAGE_SIZE = 5;
export const ROOM_AVAILABLE_TIMEOUT_MS = 2 * 60 * 1000;

const ROOM_PREV_ID = 'room:prev';
const ROOM_NEXT_ID = 'room:next';

export interface RoomAvailableEmptyState {
  existingRooms: MatchListRow[];
  pendingMatches: MatchListRow[];
}

function formatMatchBlock(match: MatchListRow, index: number): string {
  return [
    `${CUSTOM_EMOJIS.done} **Partido ${index + 1}**`,
    `*${match.group}*`,
    formatMatchupTitle(match.team1_name, match.team2_name),
  ].join('\n');
}

export function buildAvailableMatchesEmbed(
  tournamentName: string,
  matches: MatchListRow[],
  pageIndex: number,
  groupFilter?: string,
  emptyState?: RoomAvailableEmptyState,
): EmbedBuilder {
  if (matches.length === 0) {
    const filterNote = groupFilter ? ` for **${groupFilter}**` : '';
    const details: string[] = [];

    if (emptyState?.existingRooms.length) {
      const roomLines = emptyState.existingRooms
        .slice(0, 5)
        .map((match) => {
          const channel = match.ticket_channel_id ? ` - <#${match.ticket_channel_id}>` : '';
          return `• ${formatMatchupTitle(match.team1_name, match.team2_name)}${channel}`;
        })
        .join('\n');
      details.push(`All ready matches already have rooms:\n${roomLines}`);
    }

    if (emptyState?.pendingMatches.length) {
      details.push(
        `Waiting on **${emptyState.pendingMatches.length}** bracket match(es) where one or both teams are still TBD.`,
      );
    }

    const fallback =
      'Make sure the Challonge bracket is started and both teams are assigned for each match.';

    return new EmbedBuilder()
      .setColor(EMBED_COLORS.warning)
      .setTitle(`${CUSTOM_EMOJIS.error} No Available Matches`)
      .setDescription(
        `No open matches without rooms were found for **${tournamentName}**${filterNote}.\n\n${details.join('\n\n') || fallback}`,
      )
      .setTimestamp();
  }

  const totalPages = Math.max(1, Math.ceil(matches.length / ROOM_AVAILABLE_PAGE_SIZE));
  const start = pageIndex * ROOM_AVAILABLE_PAGE_SIZE;
  const pageMatches = matches.slice(start, start + ROOM_AVAILABLE_PAGE_SIZE);
  const end = start + pageMatches.length;

  const body = pageMatches
    .map((match, index) => formatMatchBlock(match, start + index))
    .join('\n\n');

  const filterLine = groupFilter
    ? `Filter: **${groupFilter}**`
    : 'Showing all open matches across every stage and bracket.';

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setTitle(`${CUSTOM_EMOJIS.done} Available Rooms for ${tournamentName}`)
    .setDescription(
      `${filterLine}\nShowing **${start + 1} - ${end}** of **${matches.length}** available match(es).\n\n${body}`,
    )
    .setFooter({ text: `Page ${pageIndex + 1}/${totalPages}` })
    .setTimestamp();
}

export function buildAvailableMatchesComponents(
  pageIndex: number,
  totalMatches: number,
  locked: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const totalPages = Math.max(1, Math.ceil(totalMatches / ROOM_AVAILABLE_PAGE_SIZE));

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ROOM_PREV_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Previous')
      .setDisabled(locked || pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(ROOM_NEXT_ID)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Next')
      .setDisabled(locked || pageIndex >= totalPages - 1),
  );
}

export async function runAvailableRoomsPagination(
  interaction: ChatInputCommandInteraction,
  tournamentName: string,
  matches: MatchListRow[],
  groupFilter?: string,
  emptyState?: RoomAvailableEmptyState,
): Promise<void> {
  let currentPage = 0;

  const render = (locked: boolean) => ({
    embeds: [buildAvailableMatchesEmbed(tournamentName, matches, currentPage, groupFilter, emptyState)],
    components:
      matches.length > ROOM_AVAILABLE_PAGE_SIZE
        ? [buildAvailableMatchesComponents(currentPage, matches.length, locked)]
        : [],
  });

  const message = await interaction.editReply(render(false));
  if (matches.length <= ROOM_AVAILABLE_PAGE_SIZE) return;

  const totalPages = Math.ceil(matches.length / ROOM_AVAILABLE_PAGE_SIZE);
  const collector = message.createMessageComponentCollector({
    time: ROOM_AVAILABLE_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: 'Only the person who ran `/room available` can browse these pages.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (buttonInteraction.customId === ROOM_PREV_ID && currentPage > 0) {
      currentPage -= 1;
    } else if (buttonInteraction.customId === ROOM_NEXT_ID && currentPage < totalPages - 1) {
      currentPage += 1;
    }

    await buttonInteraction.update(render(false));
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply(render(true));
    } catch {
      // Message may have been deleted.
    }
  });
}
