import { EmbedBuilder, type Guild } from 'discord.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../constants/emojis.js';
import type { ChallongeTournamentSummary } from '../services/challonge.js';
import type { TournamentEdit, TournamentEditFieldKey } from '../schemas/tournament.js';
import type { TournamentListRow, TournamentRow } from '../types/tournament.js';
import { embedField, successEmbed } from './embeds.js';
import {
  formatCategory,
  formatChannel,
  formatRole,
} from './guild-display.js';

const EDIT_FIELD_LABELS: Record<TournamentEditFieldKey, string> = {
  name: 'Name',
  sheet_link: 'Sheet Link',
  admin_role_id: 'Admin Role',
  helper_role_id: 'Helper Role',
  attendance_channel_id: 'Attendance Channel',
  transcript_channel_id: 'Transcript Channel',
  rules_channel_id: 'Rules Channel',
  deadline_channel_id: 'Deadline Channel',
  result_channel_id: 'Result Channel',
  events_links_channel_id: 'Events Links Channel',
  closed_ticket_category_id: 'Closed Ticket Category',
  close_ticket_category_2_id: 'Secondary Closed Category',
  ticket_open_category_1_id: 'Open Category 1',
  ticket_open_category_2_id: 'Open Category 2',
  ticket_open_category_3_id: 'Open Category 3',
  ticket_open_category_4_id: 'Open Category 4',
  auto_room_enabled: 'Auto Room Creation',
};

function formatEditValue(guild: Guild, key: TournamentEditFieldKey, value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Enabled' : 'Disabled';
  }
  if (typeof value !== 'string') {
    return String(value);
  }
  if (key.endsWith('_role_id')) return formatRole(guild, value);
  if (key.includes('category')) return formatCategory(guild, value);
  if (key.endsWith('_channel_id')) return formatChannel(guild, value);
  return value;
}

function formatOpenCategories(guild: Guild, tournament: TournamentRow): string {
  const categories = [
    tournament.ticket_open_category_1_id,
    tournament.ticket_open_category_2_id,
    tournament.ticket_open_category_3_id,
    tournament.ticket_open_category_4_id,
  ].filter((categoryId): categoryId is string => Boolean(categoryId));

  if (categories.length === 0) return 'None configured';
  return categories.map((categoryId) => formatCategory(guild, categoryId)).join('\n');
}

function formatClosedCategories(guild: Guild, tournament: TournamentRow): string {
  const lines = [
    `${formatCategory(guild, tournament.closed_ticket_category_id)} (Primary)`,
  ];
  if (tournament.close_ticket_category_2_id) {
    lines.push(formatCategory(guild, tournament.close_ticket_category_2_id));
  }
  return lines.join('\n');
}

function tournamentSummaryFields(
  guild: Guild,
  tournament: TournamentRow,
  challongeSummary?: ChallongeTournamentSummary | null,
) {
  return [
    embedField('ID', `\`${tournament.challonge_id}\``, true),
    embedField(
      'Tournament State',
      `\`${challongeSummary?.state ?? 'unknown'}\``,
      true,
    ),
    embedField(
      '📋 Attendance Channel',
      formatChannel(guild, tournament.attendance_channel_id),
      true,
    ),
    embedField('📒 Rules Channel', formatChannel(guild, tournament.rules_channel_id), true),
    embedField(
      '📚 Transcript Channel',
      formatChannel(guild, tournament.transcript_channel_id),
      true,
    ),
    embedField('🗂️ Closed Ticket Categories', formatClosedCategories(guild, tournament), false),
    embedField(
      '🏁 Result Channel',
      tournament.result_channel_id
        ? formatChannel(guild, tournament.result_channel_id)
        : 'Using default from settings',
      false,
    ),
    embedField(
      '🔗 Events Links Channel',
      tournament.events_links_channel_id
        ? formatChannel(guild, tournament.events_links_channel_id)
        : 'Not configured',
      false,
    ),
    embedField(
      '📄 Sheet Link',
      `[Click Here](${tournament.sheet_link})`,
      false,
    ),
    embedField('👑 Admin Role', formatRole(guild, tournament.admin_role_id), true),
    embedField('🛠️ Helper Role', formatRole(guild, tournament.helper_role_id), true),
    embedField(
      '⚙️ Auto Room Creation',
      tournament.auto_room_enabled ? 'Enabled' : 'Disabled',
      true,
    ),
    embedField('🎫 Open Ticket Categories', formatOpenCategories(guild, tournament), false),
  ];
}

export function buildTournamentAddEmbed(
  guild: Guild,
  tournament: TournamentRow,
  challongeSummary?: ChallongeTournamentSummary | null,
) {
  return successEmbed(
    `🏆 Tournament Created: ${tournament.name}`,
    'A new tournament has been registered on this server.',
  ).addFields(tournamentSummaryFields(guild, tournament, challongeSummary));
}

export function buildTournamentEditEmbed(
  guild: Guild,
  tournament: TournamentRow,
  changes: TournamentEdit & { challonge_key?: string },
) {
  const changeLines = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (key === 'challonge_key') {
        return '**Challonge Key:** Updated';
      }
      const label = EDIT_FIELD_LABELS[key as TournamentEditFieldKey] ?? key;
      return `**${label}:** ${formatEditValue(guild, key as TournamentEditFieldKey, value)}`;
    });

  return successEmbed(
    `Tournament Updated: ${tournament.name}`,
    '✅ Tournament updated successfully.',
  ).addFields(
    embedField('Tournament ID', tournament.id, false),
    embedField(
      'Changes',
      changeLines.length > 0 ? changeLines.join('\n') : 'No fields listed.',
      false,
    ),
    embedField('Updated At', new Date(tournament.updated_at).toUTCString(), false),
  );
}

export function buildTournamentInfoEmbed(
  guild: Guild,
  tournament: TournamentRow,
  challongeSummary?: ChallongeTournamentSummary | null,
) {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(`🏆 Tournament Configuration: ${tournament.name}`)
    .setDescription('Current tournament setup and integration status.')
    .addFields(tournamentSummaryFields(guild, tournament, challongeSummary))
    .setTimestamp();
}

export function buildTournamentListEmbed(guild: Guild, tournaments: TournamentListRow[]) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle('Registered Tournaments')
    .setDescription('✅ Tournament list retrieved successfully.')
    .setTimestamp();

  if (tournaments.length === 0) {
    embed.addFields(embedField('Tournaments', 'No tournaments registered yet.', false));
    return embed;
  }

  const lines = tournaments.map(
    (tournament) =>
      `**${tournament.name}**\nID: \`${tournament.id}\`\nAuto Room: ${tournament.auto_room_enabled ? 'Enabled' : 'Disabled'}`,
  );

  embed.addFields(embedField('Tournaments', lines.join('\n\n'), false));
  return embed;
}

export { EDIT_FIELD_LABELS as TOURNAMENT_EDIT_FIELD_LABELS };
