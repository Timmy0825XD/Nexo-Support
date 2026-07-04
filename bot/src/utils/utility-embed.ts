import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type MessageActionRowComponentBuilder,
  type APIMessageComponentEmoji,
} from 'discord.js';
import { resolveCustomEmoji } from '../constants/emojis.js';

export const UTILITY_EMBED_PREFIX = 'utl:emb';
export const EMBED_SESSION_TTL_MS = 30 * 60 * 1000;

const NAMED_COLORS: Record<string, number> = {
  red: 0xff0000,
  orange: 0xff8c00,
  yellow: 0xffff00,
  green: 0x00ff00,
  blue: 0x0000ff,
  purple: 0x800080,
  pink: 0xff69b4,
  white: 0xffffff,
  black: 0x000000,
  blurple: 0x5865f2,
  grey: 0x808080,
  gray: 0x808080,
};

export class UtilityEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UtilityEmbedError';
  }
}

export interface EmbedDraftField {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedDraftLinkButton {
  label: string;
  url: string | null;
}

export interface EmbedDraft {
  title: string | null;
  titleUrl: string | null;
  description: string | null;
  color: number;
  thumbnail: string | null;
  image: string | null;
  authorName: string | null;
  authorIcon: string | null;
  authorUrl: string | null;
  footerText: string | null;
  footerIcon: string | null;
  timestamp: boolean;
  fields: EmbedDraftField[];
  linkButton: EmbedDraftLinkButton | null;
  content: string | null;
}

export interface EmbedBuilderSession {
  id: string;
  userId: string;
  guildId: string;
  targetChannelId: string;
  targetChannelName: string;
  draft: EmbedDraft;
  expiresAt: number;
  editMessageId?: string;
  editChannelId?: string;
}

export function createDefaultEmbedDraft(): EmbedDraft {
  return {
    title: null,
    titleUrl: null,
    description: 'Your description here. This is a placeholder.',
    color: 0x00ff00,
    thumbnail: null,
    image: null,
    authorName: null,
    authorIcon: null,
    authorUrl: null,
    footerText: null,
    footerIcon: null,
    timestamp: false,
    fields: [],
    linkButton: null,
    content: null,
  };
}

export function draftFromMessage(message: Pick<Message, 'content' | 'embeds' | 'components'>): EmbedDraft {
  const embed = message.embeds[0];
  const draft = createDefaultEmbedDraft();

  if (!embed) {
    return draft;
  }

  draft.title = embed.title ?? null;
  draft.titleUrl = embed.url ?? null;
  draft.description = embed.description ?? draft.description;
  draft.color = embed.color ?? draft.color;
  draft.thumbnail = embed.thumbnail?.url ?? null;
  draft.image = embed.image?.url ?? null;
  draft.authorName = embed.author?.name ?? null;
  draft.authorIcon = embed.author?.iconURL ?? null;
  draft.authorUrl = embed.author?.url ?? null;
  draft.footerText = embed.footer?.text ?? null;
  draft.footerIcon = embed.footer?.iconURL ?? null;
  draft.timestamp = Boolean(embed.timestamp);
  draft.fields = (embed.fields ?? []).map((field) => ({
    name: field.name,
    value: field.value,
    inline: field.inline ?? false,
  }));
  draft.content = message.content.trim() ? message.content : null;

  for (const row of message.components) {
    if (row.type !== ComponentType.ActionRow) continue;
    for (const component of row.components) {
      if (
        component.type === ComponentType.Button &&
        component.label &&
        (component.style === ButtonStyle.Link || component.disabled)
      ) {
        draft.linkButton = {
          label: component.label,
          url: component.style === ButtonStyle.Link ? component.url : null,
        };
        return draft;
      }
    }
  }

  return draft;
}

export function parseEmbedColor(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new UtilityEmbedError('Color cannot be empty.');
  }

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return Number.parseInt(hex, 16);
    }
  }

  if (/^0x[0-9a-fA-F]{6}$/i.test(trimmed)) {
    return Number.parseInt(trimmed, 16);
  }

  if (/^[0-9a-fA-F]{6}$/i.test(trimmed)) {
    return Number.parseInt(trimmed, 16);
  }

  const named = NAMED_COLORS[trimmed.toLowerCase()];
  if (named !== undefined) {
    return named;
  }

  throw new UtilityEmbedError(
    'Invalid color. Use hex (#FF0000), 0xFF0000, or a color name (red, blurple, etc.).',
  );
}

export function assertHttpUrl(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new UtilityEmbedError(`${label} cannot be empty.`);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new UtilityEmbedError(`${label} must be a valid http(s) URL.`);
  }
  return trimmed;
}

export function optionalHttpUrl(value: string | null | undefined, label: string): string | null {
  if (!value?.trim()) return null;
  return assertHttpUrl(value, label);
}

export function hasPublishableEmbedContent(draft: EmbedDraft): boolean {
  return Boolean(
    draft.title ||
      draft.description ||
      draft.image ||
      draft.thumbnail ||
      draft.authorName ||
      draft.footerText ||
      draft.fields.length > 0,
  );
}

export function buildEmbedFromDraft(draft: EmbedDraft): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(draft.color);

  if (draft.title) {
    embed.setTitle(draft.title.slice(0, 256));
    if (draft.titleUrl) embed.setURL(draft.titleUrl);
  }

  if (draft.description) {
    embed.setDescription(draft.description.slice(0, 4096));
  }

  if (draft.thumbnail) embed.setThumbnail(draft.thumbnail);
  if (draft.image) embed.setImage(draft.image);

  if (draft.authorName || draft.authorIcon) {
    embed.setAuthor({
      name: draft.authorName?.slice(0, 256) ?? '\u200b',
      iconURL: draft.authorIcon ?? undefined,
      url: draft.authorUrl ?? undefined,
    });
  }

  if (draft.footerText || draft.footerIcon) {
    embed.setFooter({
      text: draft.footerText?.slice(0, 2048) ?? '\u200b',
      iconURL: draft.footerIcon ?? undefined,
    });
  }

  if (draft.timestamp) {
    embed.setTimestamp(new Date());
  }

  if (draft.fields.length > 0) {
    embed.addFields(
      draft.fields.slice(0, 25).map((field) => ({
        name: field.name.slice(0, 256),
        value: field.value.slice(0, 1024),
        inline: field.inline,
      })),
    );
  }

  return embed;
}

export function buildLinkButtonRow(
  linkButton: EmbedDraftLinkButton | null,
): ActionRowBuilder<ButtonBuilder> | null {
  if (!linkButton) return null;

  const button = new ButtonBuilder().setLabel(linkButton.label);
  if (!linkButton.url) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      button
        .setCustomId(`utility_embed_disabled_${Date.now()}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button.setStyle(ButtonStyle.Link).setURL(linkButton.url),
  );
}

export function buildEmbedBuilderComponents(
  session: EmbedBuilderSession,
  disabled = false,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const id = session.id;
  const sendLabel = session.editMessageId
    ? 'Update Message'
    : truncateSendLabel(session.targetChannelName);

  const button = (
    customSuffix: string,
    label: string,
    style: ButtonStyle,
    emoji: string | APIMessageComponentEmoji,
  ): ButtonBuilder => {
    const builder = new ButtonBuilder()
      .setCustomId(`${UTILITY_EMBED_PREFIX}:${customSuffix}:${id}`)
      .setLabel(label)
      .setStyle(style)
      .setEmoji(emoji);
    if (disabled) builder.setDisabled(true);
    return builder;
  };

  const rows = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      button('be', 'Edit Embed', ButtonStyle.Primary, '📝'),
      button('bi', 'Edit Images', ButtonStyle.Primary, resolveCustomEmoji('thumbnail')),
      button('bc', 'Edit Color', ButtonStyle.Primary, '🎨'),
      button('bl', 'Link Button', ButtonStyle.Primary, resolveCustomEmoji('link')),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      button('ba', 'Edit Author', ButtonStyle.Primary, '👤'),
      button('bf', 'Edit Fields', ButtonStyle.Primary, '📊'),
      button(
        'bt',
        session.draft.timestamp ? 'Timestamp: On' : 'Timestamp: Off',
        session.draft.timestamp ? ButtonStyle.Success : ButtonStyle.Secondary,
        '🕒',
      ),
      button('bx', 'Add Content', ButtonStyle.Primary, '💬'),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      button('bs', sendLabel, ButtonStyle.Success, resolveCustomEmoji('done')),
      button('bk', 'Cancel', ButtonStyle.Danger, resolveCustomEmoji('error')),
    ),
  ];

  return rows;
}

function truncateSendLabel(channelName: string): string {
  const prefix = 'Send Message to #';
  const maxNameLength = 80 - prefix.length - 1;
  if (channelName.length <= maxNameLength) {
    return `${prefix}${channelName}`;
  }
  return `${prefix}${channelName.slice(0, maxNameLength - 1)}…`;
}

export function buildEmbedBuilderPreview(session: EmbedBuilderSession) {
  return {
    content: '🎨 **Design your embed:**',
    embeds: [buildEmbedFromDraft(session.draft)],
    components: buildEmbedBuilderComponents(session),
  };
}

export function buildEditEmbedModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:me:${session.id}`)
    .setTitle('Edit Embed')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter title (max 256 chars)')
          .setMaxLength(256)
          .setRequired(false)
          .setValue(session.draft.title ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter description (max 4000 chars)')
          .setMaxLength(4000)
          .setRequired(false)
          .setValue(session.draft.description?.slice(0, 4000) ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter footer text (max 2048 chars)')
          .setMaxLength(2048)
          .setRequired(false)
          .setValue(session.draft.footerText ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('footer_icon')
          .setLabel('Footer Icon URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com/icon.png')
          .setRequired(false)
          .setValue(session.draft.footerIcon ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title_url')
          .setLabel('Title URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com (makes title clickable)')
          .setRequired(false)
          .setValue(session.draft.titleUrl ?? ''),
      ),
    );
}

export function buildImagesModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:mi:${session.id}`)
    .setTitle('Edit Images')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnail')
          .setLabel('Thumbnail URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com/thumbnail.png')
          .setRequired(false)
          .setValue(session.draft.thumbnail ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel('Large Image URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com/image.png')
          .setRequired(false)
          .setValue(session.draft.image ?? ''),
      ),
    );
}

export function buildColorModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:mc:${session.id}`)
    .setTitle('Edit Color')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Embed Color')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('#00FF00, 0x00FF00, green, blurple...')
          .setRequired(true)
          .setValue(`#${session.draft.color.toString(16).padStart(6, '0')}`),
      ),
    );
}

export function buildLinkButtonModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:ml:${session.id}`)
    .setTitle('Link Button')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Button Label')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Open Link')
          .setMaxLength(80)
          .setRequired(false)
          .setValue(session.draft.linkButton?.label ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('url')
          .setLabel('Button URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com')
          .setRequired(false)
          .setValue(session.draft.linkButton?.url ?? ''),
      ),
    );
}

export function buildAuthorModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:ma:${session.id}`)
    .setTitle('Edit Author')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('author_name')
          .setLabel('Author Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Author name (max 256 chars)')
          .setMaxLength(256)
          .setRequired(false)
          .setValue(session.draft.authorName ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('author_icon')
          .setLabel('Author Icon URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com/icon.png')
          .setRequired(false)
          .setValue(session.draft.authorIcon ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('author_url')
          .setLabel('Author URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://example.com')
          .setRequired(false)
          .setValue(session.draft.authorUrl ?? ''),
      ),
    );
}

export function buildFieldsModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:mf:${session.id}`)
    .setTitle('Edit Fields')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('field_index')
          .setLabel('Field Number (1-25)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setValue('1'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('field_name')
          .setLabel('Field Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Leave empty with empty value to remove')
          .setMaxLength(256)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('field_value')
          .setLabel('Field Value')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Field value (max 1024 chars)')
          .setMaxLength(1024)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('field_inline')
          .setLabel('Inline (yes/no)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('no')
          .setRequired(false)
          .setValue('no'),
      ),
    );
}

export function buildContentModal(session: EmbedBuilderSession): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${UTILITY_EMBED_PREFIX}:mx:${session.id}`)
    .setTitle('Add Content')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message Content')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Text shown above the embed (max 2000 chars)')
          .setMaxLength(2000)
          .setRequired(false)
          .setValue(session.draft.content ?? ''),
      ),
    );
}

export function resolveTextChannel(
  guild: Guild,
  channelId: string,
  label: string,
): GuildTextBasedChannel {
  const channel = guild.channels.cache.get(channelId);
  if (
    !channel ||
    !channel.isTextBased() ||
    channel.isDMBased() ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread)
  ) {
    throw new UtilityEmbedError(`${label} must be a text channel in this server.`);
  }

  return channel as GuildTextBasedChannel;
}

export function assertBotCanSendEmbeds(channel: GuildTextBasedChannel, guild: Guild): void {
  const me = guild.members.me;
  if (!me) {
    throw new UtilityEmbedError('Bot member is unavailable.');
  }

  const permissions = me.permissionsIn(channel);
  if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
    throw new UtilityEmbedError(`I cannot view ${channel}.`);
  }
  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    throw new UtilityEmbedError(`I cannot send messages in ${channel}.`);
  }
  if (!permissions.has(PermissionFlagsBits.EmbedLinks)) {
    throw new UtilityEmbedError(`I need **Embed Links** permission in ${channel}.`);
  }
}

export function registerUtilityEmbedSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName('embed')
    .setDescription('Open the interactive embed builder (ephemeral preview)')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where the final embed will be published')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    );
}

export function registerUtilityEditEmbedSubcommand(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName('edit_embed')
    .setDescription('Open the embed builder to edit a bot message by ID')
    .addStringOption((option) =>
      option
        .setName('message_id')
        .setDescription('Discord message ID of the embed to edit')
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('message_channel')
        .setDescription('Channel containing the message (defaults to this channel)')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
        ),
    );
}

export function isUtilityEmbedCustomId(customId: string): boolean {
  return customId.startsWith(`${UTILITY_EMBED_PREFIX}:`);
}

export function parseUtilityEmbedCustomId(customId: string): { kind: string; sessionId: string } | null {
  const parts = customId.split(':');
  if (parts.length !== 4 || parts[0] !== 'utl' || parts[1] !== 'emb') {
    return null;
  }
  return { kind: parts[2]!, sessionId: parts[3]! };
}
