import { ButtonBuilder, parseEmoji } from 'discord.js';
import { CUSTOM_EMOJIS } from '../constants/emojis.js';

/** Invisible label for emoji-only navigation buttons. */
export const PAGINATION_ICON_LABEL = '\u200b';

export function setButtonLabelWithEmoji(button: ButtonBuilder, label: string): ButtonBuilder {
  const customPrefix = label.match(/^(<a?:[^:]+:\d+>)\s+(.+)$/);
  if (customPrefix) {
    const emoji = parseEmoji(customPrefix[1]!);
    if (emoji?.id) {
      return button.setEmoji(emoji).setLabel(customPrefix[2]!);
    }
  }

  const spaceIdx = label.indexOf(' ');
  if (spaceIdx > 0) {
    const maybeEmoji = label.slice(0, spaceIdx);
    const text = label.slice(spaceIdx + 1);
    const parsed = parseEmoji(maybeEmoji);
    if (parsed && text) {
      return button.setEmoji(parsed).setLabel(text);
    }
  }

  return button.setLabel(label);
}

export function applyPaginationBackButton(
  button: ButtonBuilder,
  label = 'Back',
): ButtonBuilder {
  const emoji = parseEmoji(CUSTOM_EMOJIS.back);
  if (emoji?.id) {
    return button.setEmoji(emoji).setLabel(label);
  }
  return button.setLabel(label);
}

export function applyPaginationNextButton(
  button: ButtonBuilder,
  label = 'Next',
): ButtonBuilder {
  const emoji = parseEmoji(CUSTOM_EMOJIS.next);
  if (emoji?.id) {
    return button.setEmoji(emoji).setLabel(label);
  }
  return button.setLabel(label);
}
