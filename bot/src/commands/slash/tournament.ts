import { ZodError } from 'zod';
import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../types.js';
import { autocompleteTournaments } from '../../autocomplete/tournaments.js';
import { ResourceValidationError } from '../../guards/discord-resources.js';
import { validateTournamentResources } from '../../guards/tournament-resources.js';
import { PermissionError, assertAdmin } from '../../guards/permissions.js';
import {
  tournamentAddSchema,
  tournamentEditSchema,
  type TournamentEditPatch,
} from '../../schemas/tournament.js';
import { ChallongeError, verifyChallongeCredentials, fetchChallongeTournamentSummary } from '../../services/challonge.js';
import { EncryptionError, decryptChallongeKey, encryptChallongeKey } from '../../services/encryption.js';
import { getGuildConfig } from '../../services/guilds.js';
import {
  logTournamentCreated,
  logTournamentDeleted,
  logTournamentUpdated,
} from '../../services/guild-logs.js';
import { SheetsError, validateParticipantSheet } from '../../services/sheets.js';
import {
  TournamentActiveError,
  TournamentConflictError,
  TournamentLimitError,
  assertTournamentUnique,
  createTournament,
  deleteTournament,
  getTournamentById,
  listTournaments,
  patchTournament,
} from '../../services/tournaments.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import {
  parseTournamentAdd,
  parseTournamentEdit,
} from '../../utils/parse-tournament-options.js';
import {
  buildTournamentAddEmbed,
  buildTournamentEditEmbed,
  buildTournamentInfoEmbed,
  buildTournamentListEmbed,
} from '../../utils/tournament-display.js';
import type { Guild } from 'discord.js';
import type { TournamentRow } from '../../types/tournament.js';

async function fetchChallongeSummaryForTournament(tournament: TournamentRow) {
  try {
    const apiKey = decryptChallongeKey(tournament.challonge_key_encrypted);
    return await fetchChallongeTournamentSummary(tournament.challonge_id, apiKey);
  } catch {
    return null;
  }
}

async function buildTournamentInfoEmbedWithChallonge(guild: Guild, tournament: TournamentRow) {
  const summary = await fetchChallongeSummaryForTournament(tournament);
  return buildTournamentInfoEmbed(guild, tournament, summary);
}

function tournamentAddOptions(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .addStringOption((option) =>
      option.setName('name').setDescription('Tournament display name').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('id').setDescription('Challonge tournament ID or URL slug').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('key').setDescription('Challonge API key for this tournament').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('sheet_link')
        .setDescription('Google Sheet link with participant data')
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('admin_role').setDescription('Tournament admin role').setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('helper_role').setDescription('Tournament helper role').setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('attendance_channel')
        .setDescription('Attendance logging channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('transcript_channel')
        .setDescription('Ticket transcript archive channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('rules_channel')
        .setDescription('Tournament rules channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('deadline_channel')
        .setDescription('Deadline and info channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('result_channel')
        .setDescription('Tournament results channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('closed_ticket_category')
        .setDescription('Category for closed match tickets')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_1')
        .setDescription('Primary open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_2')
        .setDescription('Secondary open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('auto_room_creation')
        .setDescription('Enable automatic room creation for this tournament')
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('close_ticket_category_2')
        .setDescription('Fallback closed ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_3')
        .setDescription('Third open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_4')
        .setDescription('Fourth open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('events_links')
        .setDescription('Channel where match recording links are published')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    );
}

function tournamentEditOptions(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .addStringOption((option) =>
      option
        .setName('id')
        .setDescription('Internal tournament ID to edit')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('name').setDescription('New tournament display name').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('key').setDescription('New Challonge API key').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('sheet_link').setDescription('New Google Sheet link').setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName('admin_role').setDescription('New tournament admin role').setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName('helper_role').setDescription('New tournament helper role').setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('attendance_channel')
        .setDescription('New attendance logging channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('transcript_channel')
        .setDescription('New transcript archive channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('rules_channel')
        .setDescription('New tournament rules channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('deadline_channel')
        .setDescription('New deadline and info channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('result_channel')
        .setDescription('New tournament results channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('closed_ticket_category')
        .setDescription('New closed ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('close_ticket_category_2')
        .setDescription('New fallback closed ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_1')
        .setDescription('New primary open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_2')
        .setDescription('New secondary open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_3')
        .setDescription('New third open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('ticket_open_category_4')
        .setDescription('New fourth open ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('auto_room_creation')
        .setDescription('Enable or disable automatic room creation')
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('events_links')
        .setDescription('Channel where match recording links are published')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    );
}

export const tournamentCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Tournament configuration and management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      tournamentAddOptions(
        subcommand.setName('add').setDescription('Add and configure a tournament in the bot'),
      ),
    )
    .addSubcommand((subcommand) =>
      tournamentEditOptions(
        subcommand.setName('edit').setDescription('Edit an existing tournament configuration'),
      ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a tournament configuration from the bot')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Internal tournament ID to delete')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('View the complete configuration of a tournament')
        .addStringOption((option) =>
          option
            .setName('tournament')
            .setDescription('Tournament to inspect')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List all tournaments registered in this server'),
    ),

  async autocomplete(interaction, { supabase }) {
    await autocompleteTournaments(interaction, supabase);
  },

  async execute(interaction, { supabase }) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')],
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    await interaction.deferReply(
      subcommand === 'list' ? { flags: MessageFlags.Ephemeral } : undefined,
    );

    const guildConfig = await getGuildConfig(supabase, interaction.guild.id);

    try {
      assertAdmin(interaction, guildConfig);
    } catch (error) {
      const message =
        error instanceof PermissionError
          ? error.message
          : 'You do not have permission to run this command.';
      await interaction.editReply({ embeds: [errorEmbed('Permission Denied', message)] });
      return;
    }

    try {
      if (subcommand === 'list') {
        const tournaments = await listTournaments(supabase, interaction.guild.id);
        await interaction.editReply({
          embeds: [buildTournamentListEmbed(interaction.guild, tournaments)],
        });
        return;
      }

      if (subcommand === 'info') {
        const tournamentId = interaction.options.getString('tournament', true);
        const tournament = await getTournamentById(supabase, interaction.guild.id, tournamentId);
        if (!tournament) {
          await interaction.editReply({
            embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
          });
          return;
        }

        await interaction.editReply({
          embeds: [
            await buildTournamentInfoEmbedWithChallonge(interaction.guild, tournament),
          ],
        });
        return;
      }

      if (subcommand === 'add') {
        const parsed = parseTournamentAdd(interaction);
        const input = tournamentAddSchema.parse(parsed);
        validateTournamentResources(interaction.guild, input);
        await verifyChallongeCredentials(input.challonge_id, parsed.challonge_key);
        await validateParticipantSheet(input.sheet_link);
        await assertTournamentUnique(supabase, interaction.guild.id, input);

        const created = await createTournament(supabase, interaction.guild.id, {
          ...input,
          challonge_key_encrypted: encryptChallongeKey(parsed.challonge_key),
        });

        const challongeSummary = await fetchChallongeSummaryForTournament(created);

        await interaction.editReply({
          embeds: [buildTournamentAddEmbed(interaction.guild, created, challongeSummary)],
        });

        if (guildConfig) {
          void logTournamentCreated({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournament: created,
          });
        }
        return;
      }

      if (subcommand === 'edit') {
        const tournamentId = interaction.options.getString('id', true);
        const existing = await getTournamentById(supabase, interaction.guild.id, tournamentId);
        if (!existing) {
          await interaction.editReply({
            embeds: [errorEmbed('Tournament Not Found', 'The selected tournament does not exist.')],
          });
          return;
        }

        const parsed = parseTournamentEdit(interaction);
        const changes = tournamentEditSchema.parse(parsed);
        validateTournamentResources(interaction.guild, changes);

        if (parsed.challonge_key) {
          await verifyChallongeCredentials(existing.challonge_id, parsed.challonge_key);
        }
        if (changes.sheet_link) {
          await validateParticipantSheet(changes.sheet_link);
        }

        await assertTournamentUnique(
          supabase,
          interaction.guild.id,
          {
            name: changes.name ?? existing.name,
            challonge_id: existing.challonge_id,
            sheet_link: changes.sheet_link ?? existing.sheet_link,
          },
          existing.id,
        );

        const patch: TournamentEditPatch = { ...changes };
        if (parsed.challonge_key) {
          patch.challonge_key_encrypted = encryptChallongeKey(parsed.challonge_key);
        }

        const updated = await patchTournament(
          supabase,
          interaction.guild.id,
          tournamentId,
          patch,
        );

        await interaction.editReply({
          embeds: [buildTournamentEditEmbed(interaction.guild, updated, {
            ...changes,
            ...(parsed.challonge_key ? { challonge_key: 'updated' } : {}),
          })],
        });

        if (guildConfig) {
          void logTournamentUpdated({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournament: updated,
            changes: {
              ...changes,
              ...(parsed.challonge_key ? { challonge_key: 'updated' } : {}),
            },
          });
        }
        return;
      }

      if (subcommand === 'delete') {
        const tournamentId = interaction.options.getString('id', true);
        const deleted = await deleteTournament(supabase, interaction.guild.id, tournamentId);

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Tournament Deleted',
              `✅ Tournament **${deleted.name}** was removed from the bot.`,
            ),
          ],
        });

        if (guildConfig) {
          void logTournamentDeleted({
            client: interaction.client,
            guild: interaction.guild,
            config: guildConfig,
            triggeredBy: interaction.user,
            tournament: deleted,
          });
        }
      }
    } catch (error) {
      if (error instanceof ResourceValidationError) {
        await interaction.editReply({ embeds: [errorEmbed('Validation Failed', error.message)] });
        return;
      }

      if (error instanceof TournamentLimitError || error instanceof TournamentActiveError) {
        await interaction.editReply({ embeds: [errorEmbed('Operation Blocked', error.message)] });
        return;
      }

      if (error instanceof TournamentConflictError) {
        await interaction.editReply({ embeds: [errorEmbed('Duplicate Tournament', error.message)] });
        return;
      }

      if (
        error instanceof ChallongeError ||
        error instanceof SheetsError ||
        error instanceof EncryptionError
      ) {
        await interaction.editReply({ embeds: [errorEmbed('Integration Error', error.message)] });
        return;
      }

      if (error instanceof ZodError) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Input', 'At least one valid tournament field must be provided.')],
        });
        return;
      }

      throw error;
    }
  },
};
