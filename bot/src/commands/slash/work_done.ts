import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteAttendanceTournaments } from '../../autocomplete/attendance.js';
import { assertWorkDonePermission } from '../../guards/attendance-permissions.js';
import { PermissionError } from '../../guards/permissions.js';
import { fetchAttendanceForUser } from '../../services/attendance.js';
import { getGuildConfig } from '../../services/guilds.js';
import { getFullTournamentByName } from '../../services/tournaments.js';
import {
  attachWorkDoneCurrencyCollector,
  buildWorkDoneComponents,
  buildWorkDoneEmbed,
  buildWorkDoneSessionId,
} from '../../utils/attendance-display.js';
import { calculateUserSalary } from '../../utils/staff-work-pay.js';
import { errorEmbed } from '../../utils/embeds.js';
export const workDoneCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('work_done')
    .setDescription('View your salary calculation for a tournament')
    .setDefaultMemberPermissions(null)
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
          { name: '1v1/2v2/3v3', value: 'per_match' },
          { name: '4v4/5v5', value: 'per_game' },
        ),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Staff member (admins and organizers only; defaults to yourself)')
        .setRequired(false),
    ),

  async autocomplete(interaction, { supabase }) {
    await autocompleteAttendanceTournaments(interaction, supabase);
  },

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    const guildConfig = await getGuildConfig(supabase, interaction.guild.id);

    const tournamentName = interaction.options.getString('tournament', true);
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const tournamentType = interaction.options.getString('tournament_type', true) as
      | 'per_match'
      | 'per_game';

    try {
      assertWorkDonePermission(interaction, guildConfig, targetUser.id);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.reply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    await interaction.deferReply();

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

    const records = await fetchAttendanceForUser(supabase, tournament.id, targetUser.id);
    const salary = calculateUserSalary(records, targetUser.id, tournamentType);
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const username = member?.user.username ?? targetUser.username;
    const tournamentTypeLabel = tournamentType === 'per_game' ? '4v4/5v5' : '1v1/2v2/3v3';
    const sessionId = buildWorkDoneSessionId(tournament.id, targetUser.id, tournamentType);
    const initialCurrency = 'ac' as const;

    const buildPayload = (currency: typeof initialCurrency | 'gold') => ({
      embed: buildWorkDoneEmbed({
        guild: interaction.guild!,
        tournamentName: tournament.name,
        username,
        tournamentTypeLabel,
        salary,
        currency,
        botAvatarUrl: interaction.client.user?.displayAvatarURL(),
      }),
    });

    await interaction.editReply({
      embeds: [buildPayload(initialCurrency).embed],
      components: [buildWorkDoneComponents(sessionId, initialCurrency, false)],
    });

    const message = await interaction.fetchReply();
    if (!message || !('createMessageComponentCollector' in message)) return;

    attachWorkDoneCurrencyCollector({
      message,
      sessionId,
      initialCurrency,
      buildPayload,
    });
  },
};
