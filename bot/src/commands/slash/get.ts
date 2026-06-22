import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteAttendanceTournaments } from '../../autocomplete/attendance.js';
import {
  assertAttendanceStaffPermission,
  assertGetSheetPermission,
} from '../../guards/attendance-permissions.js';
import { PermissionError } from '../../guards/permissions.js';
import { fetchAttendanceForTournament, fetchAttendanceForUser } from '../../services/attendance.js';
import {
  buildAttendanceWorkbook,
  perEventTournamentTypeLabel,
} from '../../services/attendance-export.js';
import { getGuildConfig } from '../../services/guilds.js';
import { resolveTournamentFormat } from '../../utils/schedule-captain-display.js';
import { getFullTournamentByName, getTournamentByName } from '../../services/tournaments.js';
import { buildGetAttendanceEmbed } from '../../utils/attendance-display.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
const GET_ATTENDANCE_PAGE_SIZE = 5;
const GET_ATTENDANCE_PREV = 'get_attendance:prev';
const GET_ATTENDANCE_NEXT = 'get_attendance:next';

export const getCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('get')
    .setDescription('Retrieve attendance data and reports')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('attendance')
        .setDescription('View attendance records for a user in a tournament')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('Staff member').setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('sheet')
        .setDescription('Generate an Excel report for tournament attendance and work')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('tournament_type')
            .setDescription('Salary calculation mode')
            .setRequired(true)
            .addChoices(
              { name: '1v1/2v2/3v3 (Per Match)', value: 'per_match' },
              { name: '4v4/5v5 (Per Game)', value: 'per_game' },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName('include_default_win_salary')
            .setDescription('Include default win attendance in salary estimates')
            .setRequired(true),
        ),
    ),

  async autocomplete(interaction, { supabase }) {
    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand === 'attendance' || subcommand === 'sheet') {
      await autocompleteAttendanceTournaments(interaction, supabase);
      return;
    }
    await interaction.respond([]);
  },

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const guildConfig = await getGuildConfig(supabase, interaction.guild.id);

    if (subcommand === 'sheet') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        assertGetSheetPermission(interaction, guildConfig);
      } catch (error) {
        const message =
          error instanceof PermissionError
            ? error.message
            : 'You do not have permission to run this command.';
        await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
        return;
      }

      const tournamentName = interaction.options.getString('tournament', true);
      const includeDefaultWinSalary = interaction.options.getBoolean(
        'include_default_win_salary',
        true,
      );
      const tournament = await getFullTournamentByName(
        supabase,
        interaction.guild.id,
        tournamentName,
      );

      if (!tournament) {
        await interaction.editReply({
          embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
        });
        return;
      }

      const format = await resolveTournamentFormat(tournament.sheet_link);
      const records = await fetchAttendanceForTournament(supabase, tournament.id, true);
      const workbook = await buildAttendanceWorkbook({
        tournament,
        tournamentTypeLabel: perEventTournamentTypeLabel(format),
        format,
        includeDefaultWinSalary,
        records,
      });

      const attachment = new AttachmentBuilder(workbook, {
        name: `${tournament.name.replace(/[^\w.-]+/g, '_')}-attendance.xlsx`,
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Attendance Sheet Generated',
            `The Excel report for **${tournament.name}** is attached.`,
          ),
        ],
        files: [attachment],
      });
      return;
    }

    try {
      assertAttendanceStaffPermission(interaction, guildConfig);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.reply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    await interaction.deferReply();

    const tournamentName = interaction.options.getString('tournament', true);
    const user = interaction.options.getUser('user', true);
    const tournament = await getTournamentByName(supabase, interaction.guild.id, tournamentName);

    if (!tournament) {
      await interaction.editReply({
        embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
      });
      return;
    }

    const records = await fetchAttendanceForUser(supabase, tournament.id, user.id);
    const embed = buildGetAttendanceEmbed({
      guild: interaction.guild,
      tournamentName: tournament.name,
      userId: user.id,
      records,
      pageIndex: 0,
      pageSize: GET_ATTENDANCE_PAGE_SIZE,
    });

    const totalPages = Math.max(1, Math.ceil(records.length / GET_ATTENDANCE_PAGE_SIZE));
    const components =
      totalPages > 1
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`${GET_ATTENDANCE_PREV}:0:${tournament.id}:${user.id}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`${GET_ATTENDANCE_NEXT}:0:${tournament.id}:${user.id}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(totalPages <= 1),
            ),
          ]
        : [];

    await interaction.editReply({ embeds: [embed], components });
  },
};
