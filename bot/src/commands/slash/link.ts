import { SlashCommandBuilder } from 'discord.js';
import { ZodError } from 'zod';
import type { SlashCommand } from '../types.js';
import {
  autocompleteAttendedMatches,
  autocompleteAttendanceTournaments,
} from '../../autocomplete/attendance.js';
import {
  assertLinkAddPermission,
  assertLinkDeletePermission,
  assertAttendanceStaffPermission,
} from '../../guards/attendance-permissions.js';
import { PermissionError } from '../../guards/permissions.js';
import {
  AttendanceError,
  AttendanceNotFoundError,
  addRecordingLinks,
  deleteAllRecordingLinks,
  fetchMissingLinksForRecorder,
  fetchMissingLinksForTournament,
  getAttendanceByTournamentAndMatchLabel,
} from '../../services/attendance.js';
import { getGuildConfig } from '../../services/guilds.js';
import { logRecordingLinkAdded, logRecordingLinkDeleted } from '../../services/guild-logs.js';
import { getFullTournamentByName, getTournamentByName } from '../../services/tournaments.js';
import { linkAddSchema } from '../../schemas/attendance.js';
import { runLinkMissingPagination } from '../../utils/attendance-display.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
export const linkCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Manage recording links for attendance records')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a recording link to an attendance record')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('match')
            .setDescription('Attended match')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('link')
            .setDescription('YouTube recording links separated by spaces')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete all recording links from an attendance record')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('match')
            .setDescription('Attended match')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('missing')
        .setDescription('View attendance records missing recording links')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Optional tournament filter')
            .setRequired(false)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction, { supabase }) {
    const subcommand = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'tournament') {
      await autocompleteAttendanceTournaments(interaction, supabase);
      return;
    }

    if ((subcommand === 'add' || subcommand === 'delete') && focused.name === 'match') {
      await autocompleteAttendedMatches(interaction, supabase);
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

    try {
      if (subcommand === 'missing') {
        const tournamentName = interaction.options.getString('tournament');
        let tournamentId: string | undefined;
        let tournamentLabel: string | undefined;

        if (tournamentName) {
          const tournament = await getTournamentByName(
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
          tournamentId = tournament.id;
          tournamentLabel = tournament.name;
        }

        const rows = tournamentId
          ? await fetchMissingLinksForTournament(supabase, tournamentId)
          : await fetchMissingLinksForRecorder(supabase, interaction.user.id);

        await runLinkMissingPagination(interaction, {
          tournamentName: tournamentLabel,
          rows: rows.map((row) => ({
            team1Name: row.team1Name,
            team2Name: row.team2Name,
            recorderId: row.recorderId,
            markedAt: row.markedAt,
          })),
        });
        return;
      }

      const tournamentName = interaction.options.getString('tournament', true);
      const matchLabel = interaction.options.getString('match', true);
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

      const attendance = await getAttendanceByTournamentAndMatchLabel(
        supabase,
        tournament.id,
        matchLabel,
      );

      if (!attendance) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Attendance Not Found',
              'No attendance record exists for the selected match.',
            ),
          ],
        });
        return;
      }

      if (subcommand === 'add') {
        assertLinkAddPermission(interaction, attendance.recorder_discord_id);
        const parsed = linkAddSchema.parse({ link: interaction.options.getString('link', true) });

        const updated = await addRecordingLinks({
          supabase,
          client: interaction.client,
          guild: interaction.guild,
          tournament,
          attendanceId: attendance.id,
          links: parsed.link,
        });

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Recording Links Added',
              `${parsed.link.length} link(s) were added and attendance embeds were updated.`,
            ),
          ],
        });

        if (guildConfig) {
          void logRecordingLinkAdded({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournamentName: tournament.name,
            matchLabel,
            linkIndex: updated.recording_links.length,
          });
        }
        return;
      }

      assertLinkDeletePermission(interaction, guildConfig, attendance.recorder_discord_id);

      const updated = await deleteAllRecordingLinks({
        supabase,
        client: interaction.client,
        guild: interaction.guild,
        tournament,
        attendanceId: attendance.id,
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Recording Links Deleted',
            `All ${updated.deletedCount} recording link(s) were removed and attendance embeds were updated.`,
          ),
        ],
      });

      if (guildConfig) {
        void logRecordingLinkDeleted({
          client: interaction.client,
          guild: interaction.guild,
          config: guildConfig,
          triggeredBy: interaction.user,
          tournamentName: tournament.name,
          matchLabel,
          deletedCount: updated.deletedCount,
        });
      }
    } catch (error) {
      if (error instanceof PermissionError || error instanceof AttendanceError) {
        await interaction.editReply({ embeds: [errorEmbed('Link Error', error.message)] });
        return;
      }

      if (error instanceof AttendanceNotFoundError) {
        await interaction.editReply({ embeds: [errorEmbed('Attendance Not Found', error.message)] });
        return;
      }

      if (error instanceof ZodError) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Input', error.issues[0]?.message ?? 'Invalid command input.')],
        });
        return;
      }

      throw error;
    }
  },
};
