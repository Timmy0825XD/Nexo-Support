import {
  ChannelType,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from 'discord.js';

import type { SlashCommand } from '../types.js';

import {
  PermissionError,
  assertDiscordAdministrator,
} from '../../guards/permissions.js';

import {
  assertBotCanDeleteCategoryChannels,
  CategoryClearError,
  deleteCategoryChildChannels,
  listCategoryChildChannels,
} from '../../services/category-clear.js';

import {
  ChannelClearError,
  clearChannelByDays,
  clearChannelByNumber,
} from '../../services/channel-clear.js';

import { errorEmbed, successEmbed } from '../../utils/embeds.js';

import {
  buildAvatarEmbed,
  buildClearResultDescription,
  buildEmojiStealEmbed,
  buildEnlargeEmbed,
  buildRandomEmbed,
  buildTossEmbed,
  buildUtcUtilityEmbed,
  emojiToTwemojiUrl,
  parseCustomEmojiInput,
  parseRandomOptions,
  pickRandomOptions,
  resolveGuildEmoji,
  tossCoin,
} from '../../utils/utility-helpers.js';

import {
  handleUtilityEditEmbedCommand,
  handleUtilityEmbedCommand,
} from '../../interactions/utility-embed-builder.js';
import { UtilityEmbedError } from '../../utils/utility-embed.js';
import {
  registerUtilityEditEmbedSubcommand,
  registerUtilityEmbedSubcommand,
} from '../../utils/utility-embed.js';

import {
  buildClearCategoryCancelledEmbed,
  buildClearCategoryConfirmComponents,
  buildClearCategoryConfirmEmbed,
  buildClearCategoryProgressEmbed,
  buildClearCategoryResultEmbed,
  CLEAR_CATEGORY_CANCEL_ID,
  CLEAR_CATEGORY_CONFIRM_ID,
  CLEAR_CATEGORY_TIMEOUT_MS,
  resolveCategoryFromOption,
} from '../../utils/utility-display.js';

function assertManageMessages(interaction: ChatInputCommandInteraction): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;

  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    throw new PermissionError(
      'You need the **Manage Messages** permission to run this command.',
    );
  }
}

function assertManageExpressions(
  interaction: ChatInputCommandInteraction,
): void {
  if (!interaction.inGuild() || !interaction.member) {
    throw new PermissionError('This command can only be used inside a server.');
  }

  const member = interaction.member as GuildMember;

  if (!member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    throw new PermissionError(
      'You need the **Manage Emojis and Stickers** permission to run this command.',
    );
  }
}

function assertTextChannel(
  interaction: ChatInputCommandInteraction,
): GuildTextBasedChannel {
  const channel = interaction.channel;

  if (
    !channel ||
    !channel.isTextBased() ||
    channel.isDMBased() ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread)
  ) {
    throw new ChannelClearError(
      'This command can only be used in a server text channel.',
    );
  }

  return channel as GuildTextBasedChannel;
}

async function handleEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    assertManageMessages(interaction);
  } catch (error) {
    const message =
      error instanceof PermissionError
        ? error.message
        : 'You do not have permission to run this command.';
    await interaction.reply({ embeds: [errorEmbed('Permission Denied', message)] });
    return;
  }

  try {
    await handleUtilityEmbedCommand(interaction);
  } catch (error) {
    const message =
      error instanceof UtilityEmbedError ? error.message : 'Failed to open embed builder.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed('Embed Error', message)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Embed Error', message)] });
    }
  }
}

async function handleEditEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    assertManageMessages(interaction);
  } catch (error) {
    const message =
      error instanceof PermissionError
        ? error.message
        : 'You do not have permission to run this command.';
    await interaction.reply({ embeds: [errorEmbed('Permission Denied', message)] });
    return;
  }

  try {
    await handleUtilityEditEmbedCommand(interaction);
  } catch (error) {
    const message =
      error instanceof UtilityEmbedError ? error.message : 'Failed to open embed editor.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed('Embed Error', message)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Embed Error', message)] });
    }
  }
}

async function handleClearCategory(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    assertDiscordAdministrator(interaction);
  } catch (error) {
    const message =
      error instanceof PermissionError
        ? error.message
        : 'You need the server Administrator permission to run this command.';

    await interaction.reply({
      embeds: [errorEmbed('Permission Denied', message)],
    });

    return;
  }

  await interaction.deferReply();

  const categoryId = interaction.options.getChannel('category', true).id;

  const category = resolveCategoryFromOption(interaction.guild!, categoryId);

  if (!category) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Invalid Category',
          'The selected category could not be found.',
        ),
      ],
    });

    return;
  }

  const channels = listCategoryChildChannels(interaction.guild!, category.id);

  if (channels.length === 0) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Category Already Empty',

          `**${category.name}** has no channels to delete.`,
        ),
      ],
    });

    return;
  }

  try {
    assertBotCanDeleteCategoryChannels(interaction.guild!, channels);
  } catch (error) {
    const message =
      error instanceof CategoryClearError
        ? error.message
        : 'The bot cannot delete one or more channels in this category.';

    await interaction.editReply({
      embeds: [errorEmbed('Missing Permission', message)],
    });

    return;
  }

  const confirmEmbed = buildClearCategoryConfirmEmbed({ category, channels });

  const components = [buildClearCategoryConfirmComponents(false)];

  const message = await interaction.editReply({
    embeds: [confirmEmbed],
    components,
  });

  const collector = message.createMessageComponentCollector({
    time: CLEAR_CATEGORY_TIMEOUT_MS,

    filter: (componentInteraction) =>
      componentInteraction.user.id === interaction.user.id &&
      (componentInteraction.customId === CLEAR_CATEGORY_CONFIRM_ID ||
        componentInteraction.customId === CLEAR_CATEGORY_CANCEL_ID),
  });

  collector.on('collect', async (componentInteraction) => {
    const member = componentInteraction.member;

    if (
      !member ||
      typeof member === 'string' ||
      !(member instanceof GuildMember) ||
      !member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await componentInteraction.reply({
        embeds: [
          errorEmbed(
            'Permission Denied',

            'You no longer have permission to confirm this action.',
          ),
        ],

        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (componentInteraction.customId === CLEAR_CATEGORY_CANCEL_ID) {
      collector.stop('cancelled');

      await componentInteraction.update({
        embeds: [buildClearCategoryCancelledEmbed(category)],

        components: [buildClearCategoryConfirmComponents(true)],
      });

      return;
    }

    collector.stop('confirmed');

    await componentInteraction.update({
      embeds: [buildClearCategoryProgressEmbed(category)],

      components: [buildClearCategoryConfirmComponents(true)],
    });

    const results = await deleteCategoryChildChannels(
      interaction.guild!,
      channels,
    );

    await interaction.editReply({
      embeds: [buildClearCategoryResultEmbed({ category, results })],

      components: [buildClearCategoryConfirmComponents(true)],
    });
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      try {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Confirmation Expired',

              `Category clear for **${category.name}** was cancelled because confirmation timed out.`,
            ),
          ],

          components: [buildClearCategoryConfirmComponents(true)],
        });
      } catch {
        // Message may have been deleted.
      }
    }
  });
}

async function handleClear(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    assertManageMessages(interaction);
  } catch (error) {
    const message =
      error instanceof PermissionError
        ? error.message
        : 'You do not have permission to run this command.';

    await interaction.reply({
      embeds: [errorEmbed('Permission Denied', message)],
    });

    return;
  }

  const number = interaction.options.getInteger('number');

  const days = interaction.options.getInteger('days');

  if (
    (number === null && days === null) ||
    (number !== null && days !== null)
  ) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Invalid Options',

          'Provide exactly one filter: `number` (last N messages) **or** `days` (messages from the last N days).',
        ),
      ],
    });

    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let channel: GuildTextBasedChannel;

  try {
    channel = assertTextChannel(interaction);
  } catch (error) {
    const message =
      error instanceof ChannelClearError
        ? error.message
        : 'This channel does not support clearing.';

    await interaction.editReply({
      embeds: [errorEmbed('Invalid Channel', message)],
    });

    return;
  }

  const me = interaction.guild!.members.me;

  if (!me?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Missing Permission',

          'I need the **Manage Messages** permission in this channel.',
        ),
      ],
    });

    return;
  }

  try {
    const result =
      number !== null
        ? await clearChannelByNumber(channel, number)
        : await clearChannelByDays(channel, days!);

    await interaction.editReply({
      embeds: [
        successEmbed('Channel Cleared', buildClearResultDescription(result)),
      ],
    });
  } catch (error) {
    const message =
      error instanceof ChannelClearError
        ? error.message
        : 'Failed to clear channel messages.';

    await interaction.editReply({
      embeds: [errorEmbed('Clear Failed', message)],
    });
  }
}

async function handleEmojiSteal(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    assertManageExpressions(interaction);
  } catch (error) {
    const message =
      error instanceof PermissionError
        ? error.message
        : 'You do not have permission to run this command.';

    await interaction.reply({
      embeds: [errorEmbed('Permission Denied', message)],
    });

    return;
  }

  await interaction.deferReply();

  const rawId = interaction.options.getString('emoji_id', true);

  const parsed = parseCustomEmojiInput(rawId);

  const emojiId = parsed?.id ?? rawId.trim();

  const emoji = await resolveGuildEmoji(interaction.guild!, emojiId);

  if (!emoji) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Emoji Not Found',

          'No custom emoji with that ID exists in this server.',
        ),
      ],
    });

    return;
  }

  const preview = buildEmojiStealEmbed(emoji);

  await emoji.delete(
    `Removed by ${interaction.user.tag} via /utility emoji_steal`,
  );

  await interaction.editReply({ embeds: [preview] });
}

async function handleRandom(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rawOptions = interaction.options.getString('options', true);

  const count = interaction.options.getInteger('number') ?? 1;

  const options = parseRandomOptions(rawOptions);

  if (options.length === 0) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Invalid Options',
          'Provide at least one option (comma or newline separated).',
        ),
      ],
    });

    return;
  }

  if (count < 1) {
    await interaction.reply({
      embeds: [errorEmbed('Invalid Number', 'Number must be at least 1.')],
    });

    return;
  }

  if (count > options.length) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Invalid Number',

          `Number cannot exceed the amount of unique options (${options.length}).`,
        ),
      ],
    });

    return;
  }

  const choices = pickRandomOptions(options, count);

  await interaction.reply({ embeds: [buildRandomEmbed(choices)] });
}

async function handleUtc(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const hour = interaction.options.getInteger('hour', true);

  const minute = interaction.options.getInteger('minute', true);

  const day = interaction.options.getInteger('day', true);

  const month = interaction.options.getInteger('month', true);

  const year = interaction.options.getInteger('year', true);

  try {
    const embed = buildUtcUtilityEmbed({ hour, minute, day, month, year });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid UTC date/time.';

    await interaction.reply({ embeds: [errorEmbed('Invalid Date', message)] });
  }
}

async function handleAvatar(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.options.getUser('user') ?? interaction.user;

  await interaction.reply({ embeds: [buildAvatarEmbed(user)] });
}

async function handleToss(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({ embeds: [buildTossEmbed(tossCoin())] });
}

async function handleEnlarge(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const raw = interaction.options.getString('emoji', true);

  const custom = parseCustomEmojiInput(raw);

  if (custom) {
    await interaction.reply({
      embeds: [
        buildEnlargeEmbed({
          label: `:${custom.name}:`,

          imageUrl: custom.url,

          animated: custom.animated,
        }),
      ],
    });

    return;
  }

  const twemojiUrl = emojiToTwemojiUrl(raw);

  if (!twemojiUrl) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Invalid Emoji',

          'Provide a custom emoji (`<:name:id>`) or a standard Unicode emoji.',
        ),
      ],
    });

    return;
  }

  await interaction.reply({
    embeds: [
      buildEnlargeEmbed({
        label: raw.trim(),

        imageUrl: twemojiUrl,
      }),
    ],
  });
}

export const utilityCommand: SlashCommand = {
  data: new SlashCommandBuilder()

    .setName('utility')

    .setDescription('Server utility commands')

    .setDefaultMemberPermissions(null)

    .addSubcommand((sub) =>
      sub

        .setName('clear_category')

        .setDescription(
          'Delete all channels under a category, leaving it empty',
        )

        .addChannelOption((option) =>
          option

            .setName('category')

            .setDescription(
              'Category whose channels will be permanently deleted',
            )

            .addChannelTypes(ChannelType.GuildCategory)

            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub

        .setName('clear')

        .setDescription('Delete messages in the current channel')

        .addIntegerOption((option) =>
          option

            .setName('number')

            .setDescription(
              'Delete the last N messages (cannot combine with days)',
            )

            .setMinValue(1)

            .setMaxValue(1000)

            .setRequired(false),
        )

        .addIntegerOption((option) =>
          option

            .setName('days')

            .setDescription(
              'Delete messages from the last N days (cannot combine with number)',
            )

            .setMinValue(1)

            .setMaxValue(14)

            .setRequired(false),
        ),
    )

    .addSubcommand((sub) =>
      sub

        .setName('emoji_steal')

        .setDescription('Remove a custom server emoji by ID and show its image')

        .addStringOption((option) =>
          option

            .setName('emoji_id')

            .setDescription('Custom emoji ID or full emoji markup (<:name:id>)')

            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub

        .setName('random')

        .setDescription('Pick random option(s) from a list')

        .addStringOption((option) =>
          option

            .setName('options')

            .setDescription('Comma or newline separated list of choices')

            .setRequired(true),
        )

        .addIntegerOption((option) =>
          option

            .setName('number')

            .setDescription('How many random picks to return (default: 1)')

            .setMinValue(1)

            .setRequired(false),
        ),
    )

    .addSubcommand((sub) =>
      sub

        .setName('utc')

        .setDescription(
          'Convert a UTC date/time and show local Discord timestamps',
        )

        .addIntegerOption((option) =>
          option
            .setName('hour')
            .setDescription('Hour in UTC (0-23)')
            .setMinValue(0)
            .setMaxValue(23)
            .setRequired(true),
        )

        .addIntegerOption((option) =>
          option

            .setName('minute')

            .setDescription('Minute in UTC (0-59)')

            .setMinValue(0)

            .setMaxValue(59)

            .setRequired(true),
        )

        .addIntegerOption((option) =>
          option
            .setName('day')
            .setDescription('Day of month in UTC (1-31)')
            .setMinValue(1)
            .setMaxValue(31)
            .setRequired(true),
        )

        .addIntegerOption((option) =>
          option
            .setName('month')
            .setDescription('Month in UTC (1-12)')
            .setMinValue(1)
            .setMaxValue(12)
            .setRequired(true),
        )

        .addIntegerOption((option) =>
          option

            .setName('year')

            .setDescription('Year in UTC')

            .setMinValue(1970)

            .setMaxValue(2100)

            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub

        .setName('avatar')

        .setDescription('Get the avatar of a user')

        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User whose avatar to show (defaults to you)')
            .setRequired(false),
        ),
    )

    .addSubcommand((sub) =>
      sub.setName('toss').setDescription('Toss a coin and get heads or tails'),
    )

    .addSubcommand((sub) =>
      sub

        .setName('enlarge')

        .setDescription('Enlarge a provided emoji')

        .addStringOption((option) =>
          option

            .setName('emoji')

            .setDescription('Unicode emoji or custom emoji markup (<:name:id>)')

            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      registerUtilityEmbedSubcommand(sub),
    )

    .addSubcommand((sub) =>
      registerUtilityEditEmbedSubcommand(sub),
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Server Only',
            'This command can only be used inside a server.',
          ),
        ],
      });

      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'clear_category':
        await handleClearCategory(interaction);

        return;

      case 'clear':
        await handleClear(interaction);

        return;

      case 'emoji_steal':
        await handleEmojiSteal(interaction);

        return;

      case 'random':
        await handleRandom(interaction);

        return;

      case 'utc':
        await handleUtc(interaction);

        return;

      case 'avatar':
        await handleAvatar(interaction);

        return;

      case 'toss':
        await handleToss(interaction);

        return;

      case 'enlarge':
        await handleEnlarge(interaction);

        return;

      case 'embed':
        await handleEmbed(interaction);

        return;

      case 'edit_embed':
        await handleEditEmbed(interaction);

        return;

      default:
        await interaction.reply({
          embeds: [
            errorEmbed(
              'Unknown Command',
              'That utility subcommand is not supported.',
            ),
          ],
        });
    }
  },
};
