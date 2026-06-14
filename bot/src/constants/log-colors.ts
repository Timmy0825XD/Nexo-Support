/** Embed colors for guild log channels — audit / moderation style */
export const LOG_COLORS = {
  bot: 0x5865f2,
  challonge: 0xfaa61a,
  config: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  info: 0xeb459e,
} as const;

export type LogColorKey = keyof typeof LOG_COLORS;
