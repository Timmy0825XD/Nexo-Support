import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
} from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';
import { CUSTOM_EMOJIS } from '../constants/emojis.js';
import {
  EMBED_SESSION_TTL_MS,
  UtilityEmbedError,
  assertBotCanSendEmbeds,
  assertHttpUrl,
  buildAuthorModal,
  buildColorModal,
  buildContentModal,
  buildEditEmbedModal,
  buildEmbedBuilderComponents,
  buildEmbedBuilderPreview,
  buildEmbedFromDraft,
  buildFieldsModal,
  buildImagesModal,
  buildLinkButtonModal,
  buildLinkButtonRow,
  createDefaultEmbedDraft,
  draftFromMessage,
  hasPublishableEmbedContent,
  isUtilityEmbedCustomId,
  optionalHttpUrl,
  parseEmbedColor,
  parseUtilityEmbedCustomId,
  resolveTextChannel,
  type EmbedBuilderSession,
  type EmbedDraft,
} from '../utils/utility-embed.js';

type SessionStore = {
  byId: Map<string, EmbedBuilderSession>;
  byUser: Map<string, string>;
};

function getSessionStore(): SessionStore {
  const globalRef = globalThis as typeof globalThis & {
    __utilityEmbedSessionStore?: SessionStore;
  };

  if (!globalRef.__utilityEmbedSessionStore) {
    globalRef.__utilityEmbedSessionStore = {
      byId: new Map(),
      byUser: new Map(),
    };
  }

  return globalRef.__utilityEmbedSessionStore;
}

function purgeExpiredSessions(store: SessionStore): void {
  const now = Date.now();
  for (const [id, session] of store.byId.entries()) {
    if (session.expiresAt <= now) {
      store.byId.delete(id);
      if (store.byUser.get(session.userId) === id) {
        store.byUser.delete(session.userId);
      }
    }
  }
}

function createSessionId(): string {
  return Math.random().toString(36).slice(2, 14);
}

function getSession(sessionId: string, userId: string): EmbedBuilderSession {
  const store = getSessionStore();
  purgeExpiredSessions(store);

  let session = store.byId.get(sessionId);
  if (!session) {
    const fallbackId = store.byUser.get(userId);
    if (fallbackId) {
      session = store.byId.get(fallbackId);
    }
  }

  if (!session) {
    throw new UtilityEmbedError(
      'This embed builder session has expired. Run `/utility embed` again.',
    );
  }

  if (session.userId !== userId) {
    throw new UtilityEmbedError('This embed builder belongs to another user.');
  }

  session.expiresAt = Date.now() + EMBED_SESSION_TTL_MS;
  return session;
}

function createSession(params: {
  userId: string;
  guildId: string;
  targetChannelId: string;
  targetChannelName: string;
  draft?: EmbedDraft;
  editMessageId?: string;
  editChannelId?: string;
}): EmbedBuilderSession {
  const store = getSessionStore();
  purgeExpiredSessions(store);

  const previousId = store.byUser.get(params.userId);
  if (previousId) {
    store.byId.delete(previousId);
  }

  const session: EmbedBuilderSession = {
    id: createSessionId(),
    userId: params.userId,
    guildId: params.guildId,
    targetChannelId: params.targetChannelId,
    targetChannelName: params.targetChannelName,
    draft: params.draft ?? createDefaultEmbedDraft(),
    expiresAt: Date.now() + EMBED_SESSION_TTL_MS,
    editMessageId: params.editMessageId,
    editChannelId: params.editChannelId,
  };

  store.byId.set(session.id, session);
  store.byUser.set(params.userId, session.id);
  return session;
}

function deleteSession(session: EmbedBuilderSession): void {
  const store = getSessionStore();
  store.byId.delete(session.id);
  if (store.byUser.get(session.userId) === session.id) {
    store.byUser.delete(session.userId);
  }
}

function disabledPreview(session: EmbedBuilderSession, content: string) {
  return {
    content,
    embeds: [buildEmbedFromDraft(session.draft)],
    components: buildEmbedBuilderComponents(session, true),
  };
}

async function publishSessionEmbed(
  interaction: ButtonInteraction,
  session: EmbedBuilderSession,
): Promise<void> {
  if (!interaction.guild) {
    throw new UtilityEmbedError('This action can only be used inside a server.');
  }

  if (!hasPublishableEmbedContent(session.draft)) {
    throw new UtilityEmbedError(
      'Add at least a title, description, image, thumbnail, author, footer, or field before sending.',
    );
  }

  const embed = buildEmbedFromDraft(session.draft);
  const linkRow = buildLinkButtonRow(session.draft.linkButton);
  const components = linkRow ? [linkRow] : [];
  const payload = {
    content: session.draft.content?.trim() ? session.draft.content : undefined,
    embeds: [embed],
    components,
  };

  if (session.editMessageId && session.editChannelId) {
    const sourceChannel = resolveTextChannel(
      interaction.guild,
      session.editChannelId,
      'Message channel',
    );
    assertBotCanSendEmbeds(sourceChannel, interaction.guild);

    const message = await sourceChannel.messages.fetch(session.editMessageId);
    if (message.author.id !== interaction.client.user.id) {
      throw new UtilityEmbedError('I can only edit embeds on messages sent by this bot.');
    }

    await message.edit(payload);
    deleteSession(session);

    await interaction.update(
      disabledPreview(
        session,
        `${CUSTOM_EMOJIS.done} Embed updated in ${sourceChannel} — [Jump to message](${message.url})`,
      ),
    );
    return;
  }

  const targetChannel = resolveTextChannel(
    interaction.guild,
    session.targetChannelId,
    'Target channel',
  );
  assertBotCanSendEmbeds(targetChannel, interaction.guild);

  const published = await targetChannel.send(payload);
  deleteSession(session);

  await interaction.update(
    disabledPreview(
      session,
      `${CUSTOM_EMOJIS.done} Embed published to ${targetChannel} — [Jump to message](${published.url})`,
    ),
  );
}

async function refreshPreview(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  session: EmbedBuilderSession,
): Promise<void> {
  const payload = buildEmbedBuilderPreview(session);
  await (interaction as ButtonInteraction).update(payload);
}

async function respondEmbedError(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  message: string,
): Promise<void> {
  const embed = errorEmbed('Embed Error', message);

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed] }).catch(() => undefined);
    return;
  }

  await interaction
    .reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
    .catch(() => undefined);
}

export async function startUtilityEmbedBuilder(
  interaction: ChatInputCommandInteraction,
  targetChannel: GuildTextBasedChannel,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const session = createSession({
    userId: interaction.user.id,
    guildId: interaction.guild!.id,
    targetChannelId: targetChannel.id,
    targetChannelName: targetChannel.name,
  });

  await interaction.editReply(buildEmbedBuilderPreview(session));
}

export async function startUtilityEditEmbedBuilder(
  interaction: ChatInputCommandInteraction,
  sourceChannel: GuildTextBasedChannel,
  messageId: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const message = await sourceChannel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    throw new UtilityEmbedError('No message with that ID was found in the selected channel.');
  }
  if (message.author.id !== interaction.client.user.id) {
    throw new UtilityEmbedError('I can only edit embeds on messages sent by this bot.');
  }
  if (!message.embeds.length) {
    throw new UtilityEmbedError('That message does not contain an embed.');
  }

  const session = createSession({
    userId: interaction.user.id,
    guildId: interaction.guild!.id,
    targetChannelId: sourceChannel.id,
    targetChannelName: sourceChannel.name,
    draft: draftFromMessage(message),
    editMessageId: message.id,
    editChannelId: sourceChannel.id,
  });

  await interaction.editReply(buildEmbedBuilderPreview(session));
}

async function handleEmbedButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseUtilityEmbedCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const session = getSession(parsed.sessionId, interaction.user.id);

  switch (parsed.kind) {
    case 'be':
      await interaction.showModal(buildEditEmbedModal(session));
      return;
    case 'bi':
      await interaction.showModal(buildImagesModal(session));
      return;
    case 'bc':
      await interaction.showModal(buildColorModal(session));
      return;
    case 'bl':
      await interaction.showModal(buildLinkButtonModal(session));
      return;
    case 'ba':
      await interaction.showModal(buildAuthorModal(session));
      return;
    case 'bf':
      await interaction.showModal(buildFieldsModal(session));
      return;
    case 'bx':
      await interaction.showModal(buildContentModal(session));
      return;
    case 'bt':
      session.draft.timestamp = !session.draft.timestamp;
      await refreshPreview(interaction, session);
      return;
    case 'bs':
      await publishSessionEmbed(interaction, session);
      return;
    case 'bk':
      deleteSession(session);
      await interaction.update({
        content: `${CUSTOM_EMOJIS.error} Embed builder cancelled.`,
        embeds: [],
        components: [],
      });
      return;
    default:
      return;
  }
}

async function handleEmbedModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parsed = parseUtilityEmbedCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const session = getSession(parsed.sessionId, interaction.user.id);

  switch (parsed.kind) {
    case 'me': {
      session.draft.title = interaction.fields.getTextInputValue('title').trim() || null;
      session.draft.description =
        interaction.fields.getTextInputValue('description').trim() || null;
      session.draft.footerText = interaction.fields.getTextInputValue('footer').trim() || null;
      session.draft.footerIcon = optionalHttpUrl(
        interaction.fields.getTextInputValue('footer_icon'),
        'Footer icon',
      );
      session.draft.titleUrl = optionalHttpUrl(
        interaction.fields.getTextInputValue('title_url'),
        'Title URL',
      );
      break;
    }
    case 'mi': {
      session.draft.thumbnail = optionalHttpUrl(
        interaction.fields.getTextInputValue('thumbnail'),
        'Thumbnail',
      );
      session.draft.image = optionalHttpUrl(
        interaction.fields.getTextInputValue('image'),
        'Image',
      );
      break;
    }
    case 'mc': {
      session.draft.color = parseEmbedColor(interaction.fields.getTextInputValue('color'));
      break;
    }
    case 'ml': {
      const label = interaction.fields.getTextInputValue('label').trim();
      const url = interaction.fields.getTextInputValue('url').trim();
      if (!label) {
        session.draft.linkButton = null;
      } else {
        session.draft.linkButton = {
          label: label.slice(0, 80),
          url: url ? assertHttpUrl(url, 'Button URL') : null,
        };
      }
      break;
    }
    case 'ma': {
      session.draft.authorName =
        interaction.fields.getTextInputValue('author_name').trim() || null;
      session.draft.authorIcon = optionalHttpUrl(
        interaction.fields.getTextInputValue('author_icon'),
        'Author icon',
      );
      session.draft.authorUrl = optionalHttpUrl(
        interaction.fields.getTextInputValue('author_url'),
        'Author URL',
      );
      break;
    }
    case 'mf': {
      const indexRaw = interaction.fields.getTextInputValue('field_index').trim();
      const index = Number.parseInt(indexRaw, 10);
      if (!Number.isInteger(index) || index < 1 || index > 25) {
        throw new UtilityEmbedError('Field number must be between 1 and 25.');
      }

      const name = interaction.fields.getTextInputValue('field_name').trim();
      const value = interaction.fields.getTextInputValue('field_value').trim();
      const inlineRaw = interaction.fields.getTextInputValue('field_inline').trim().toLowerCase();
      const inline = inlineRaw === 'yes' || inlineRaw === 'true' || inlineRaw === '1';

      if (!name && !value) {
        session.draft.fields.splice(index - 1, 1);
      } else {
        if (!name || !value) {
          throw new UtilityEmbedError(
            'Both field name and value are required to add or update a field.',
          );
        }
        const field = { name, value, inline };
        if (index - 1 < session.draft.fields.length) {
          session.draft.fields[index - 1] = field;
        } else if (index - 1 === session.draft.fields.length) {
          session.draft.fields.push(field);
        } else {
          throw new UtilityEmbedError(
            `Add fields in order. Next available field number is ${session.draft.fields.length + 1}.`,
          );
        }
      }
      break;
    }
    case 'mx': {
      session.draft.content = interaction.fields.getTextInputValue('content').trim() || null;
      break;
    }
    default:
      return;
  }

  await refreshPreview(interaction, session);
}

export async function handleUtilityEmbedInteraction(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  if (!isUtilityEmbedCustomId(interaction.customId)) {
    return false;
  }

  try {
    if (interaction.isButton()) {
      await handleEmbedButton(interaction);
    } else {
      await handleEmbedModal(interaction);
    }
  } catch (error) {
    console.error('Utility embed builder interaction failed:', {
      customId: interaction.customId,
      userId: interaction.user.id,
      error,
    });
    const message =
      error instanceof UtilityEmbedError ? error.message : 'Embed builder action failed.';
    await respondEmbedError(interaction, message);
  }

  return true;
}

export async function handleUtilityEmbedCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetChannelOption = interaction.options.getChannel('channel', true);
  const targetChannel = resolveTextChannel(
    interaction.guild!,
    targetChannelOption.id,
    'Target channel',
  );
  assertBotCanSendEmbeds(targetChannel, interaction.guild!);
  await startUtilityEmbedBuilder(interaction, targetChannel);
}

export async function handleUtilityEditEmbedCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true).trim();
  const sourceChannelOption = interaction.options.getChannel('message_channel', false);
  const sourceChannelId = sourceChannelOption?.id ?? interaction.channelId;
  const sourceChannel = resolveTextChannel(
    interaction.guild!,
    sourceChannelId,
    'Message channel',
  );

  await startUtilityEditEmbedBuilder(interaction, sourceChannel, messageId);
}
