import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { ZodError } from 'zod';
import type { SlashCommand } from '../types.js';
import { PermissionError } from '../../guards/permissions.js';
import {
  assertAttendanceDeletePermission,
  assertAttendanceMarkPermission,
} from '../../guards/attendance-permissions.js';
import { TicketChannelError, assertMatchTicketChannel } from '../../guards/ticket-channel.js';
import {
  ATTENDANCE_REMARK_DW,
  AttendanceAlreadyExistsError,
  AttendanceError,
  AttendanceNotFoundError,
  deleteAttendance,
  getActiveAttendanceForTicket,
  markAttendance,
} from '../../services/attendance.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  logAttendanceDeleted,
  logAttendanceMarked,
} from '../../services/guild-logs.js';
import { getMatchForSchedule } from '../../services/matches.js';
import {
  getScheduleForTicket,
  ScheduleError,
  validateScheduleStaffUser,
} from '../../services/schedules.js';
import { getTournamentById } from '../../services/tournaments.js';
import {
  attendanceDeleteSchema,
  attendanceMarkSchema,
  normalizeRemarkInput,
} from '../../schemas/attendance.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
export const attendanceCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('attendance')
    .setDescription('Mark and manage match attendance records')
    .setDefaultMemberPermissions(null)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mark')
        .setDescription('Mark attendance for the match in this channel')
        .addUserOption((option) =>
          option.setName('judge').setDescription('Judge for this match').setRequired(true),
        )
        .addUserOption((option) =>
          option.setName('recorder').setDescription('Recorder for this match').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('team1_score').setDescription('Score for team 1').setRequired(true).setMinValue(0),
        )
        .addIntegerOption((option) =>
          option.setName('team2_score').setDescription('Score for team 2').setRequired(true).setMinValue(0),
        )
        .addStringOption((option) =>
          option
            .setName('remark')
            .setDescription('Choose if this was a default win')
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('link')
            .setDescription('Optional YouTube recording links separated by spaces')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete attendance record for the current match ticket')
        .addBooleanOption((option) =>
          option.setName('confirm').setDescription('Confirm attendance deletion').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Optional deletion reason').setRequired(false),
        ),
    ),

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);
    if (subcommand === 'mark' && focused.name === 'remark') {
      const query = focused.value.trim().toUpperCase();
      const choices = [{ name: 'DW — Default Win (disqualification)', value: ATTENDANCE_REMARK_DW }];
      const filtered = query
        ? choices.filter((choice) => choice.value.includes(query) || choice.name.toUpperCase().includes(query))
        : choices;
      await interaction.respond(filtered.slice(0, 25));
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
      if (subcommand === 'mark') {
        await interaction.deferReply();
        assertAttendanceMarkPermission(interaction, guildConfig);

        const { channel, ticket } = await assertMatchTicketChannel(
          interaction,
          supabase,
          guildConfig,
        );

        const schedule = await getScheduleForTicket(supabase, channel.id);
        if (!schedule) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Schedule Required',
                'A schedule must exist for this match before attendance can be marked.',
              ),
            ],
          });
          return;
        }

        const tournament = await getTournamentById(
          supabase,
          interaction.guild.id,
          ticket.tournamentId,
        );
        if (!tournament) {
          await interaction.editReply({
            embeds: [errorEmbed('Tournament Not Found', 'The tournament for this ticket was not found.')],
          });
          return;
        }

        const match = await getMatchForSchedule(supabase, ticket.tournamentId, ticket.matchId);
        if (!match) {
          await interaction.editReply({
            embeds: [errorEmbed('Match Not Found', 'The match for this ticket was not found.')],
          });
          return;
        }

        const parsed = attendanceMarkSchema.parse({
          judge_discord_id: interaction.options.getUser('judge', true).id,
          recorder_discord_id: interaction.options.getUser('recorder', true).id,
          team1_score: interaction.options.getInteger('team1_score', true),
          team2_score: interaction.options.getInteger('team2_score', true),
          remark: normalizeRemarkInput(interaction.options.getString('remark')),
          link: interaction.options.getString('link') ?? undefined,
        });

        await validateScheduleStaffUser(
          interaction.guild,
          guildConfig,
          parsed.judge_discord_id,
          'judge',
        );
        await validateScheduleStaffUser(
          interaction.guild,
          guildConfig,
          parsed.recorder_discord_id,
          'recorder',
        );

        const attendance = await markAttendance({
          supabase,
          client: interaction.client,
          guild: interaction.guild,
          ticketChannel: channel,
          tournament,
          match,
          schedule,
          createdByUserId: interaction.user.id,
          judgeDiscordId: parsed.judge_discord_id,
          recorderDiscordId: parsed.recorder_discord_id,
          team1Score: parsed.team1_score,
          team2Score: parsed.team2_score,
          remark: parsed.remark,
          initialLinks: parsed.link,
        });

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Attendance Marked Successfully',
              'The attendance record was created and posted to this ticket and the tournament attendance channel.',
            ),
          ],
        });

        if (guildConfig) {
          void logAttendanceMarked({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournamentName: tournament.name,
            matchLabel: `${match.team1_name} vs ${match.team2_name}`,
            ticketChannelId: channel.id,
            attendanceId: attendance.id,
          });
        }
        return;
      }

      if (subcommand === 'delete') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const { channel } = await assertMatchTicketChannel(interaction, supabase, guildConfig);
        const parsed = attendanceDeleteSchema.parse({
          confirm: interaction.options.getBoolean('confirm', true),
          reason: interaction.options.getString('reason') ?? undefined,
        });

        const attendance = await getActiveAttendanceForTicket(supabase, channel.id);
        if (!attendance) {
          await interaction.editReply({
            embeds: [errorEmbed('Attendance Not Found', 'No active attendance record exists for this ticket.')],
          });
          return;
        }

        const tournament = await getTournamentById(
          supabase,
          interaction.guild.id,
          attendance.tournament_id,
        );
        if (!tournament) {
          await interaction.editReply({
            embeds: [errorEmbed('Tournament Not Found', 'The tournament for this attendance was not found.')],
          });
          return;
        }

        assertAttendanceDeletePermission(
          interaction,
          guildConfig,
          tournament,
          attendance.created_by_discord_user_id,
        );

        const match = await getMatchForSchedule(supabase, attendance.tournament_id, attendance.match_id);
        if (!match) {
          await interaction.editReply({
            embeds: [errorEmbed('Match Not Found', 'The match for this attendance was not found.')],
          });
          return;
        }

        await deleteAttendance({
          supabase,
          client: interaction.client,
          guild: interaction.guild,
          tournament,
          match,
          attendance,
          deletedByUserId: interaction.user.id,
          reason: parsed.reason,
        });

        await interaction.editReply({
          embeds: [successEmbed('Attendance Deleted', 'The attendance record was removed successfully.')],
        });

        if (guildConfig) {
          void logAttendanceDeleted({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournamentName: tournament.name,
            matchLabel: `${match.team1_name} vs ${match.team2_name}`,
            ticketChannelId: channel.id,
            reason: parsed.reason,
          });
        }
      }
    } catch (error) {
      if (error instanceof PermissionError) {
        await interaction.editReply({ embeds: [errorEmbed('Permission Denied', error.message)] });
        return;
      }

      if (error instanceof TicketChannelError || error instanceof AttendanceError || error instanceof ScheduleError) {
        await interaction.editReply({ embeds: [errorEmbed('Attendance Error', error.message)] });
        return;
      }

      if (error instanceof AttendanceAlreadyExistsError) {
        await interaction.editReply({
          embeds: [errorEmbed('Attendance Already Exists', error.message)],
        });
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
