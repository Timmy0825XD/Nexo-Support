/** Custom animated emojis — keep in sync with docs/EMOJIS.md */
export const CUSTOM_EMOJIS = {
  done: '<a:done:1514103465851359243>',
  error: '<:error:1514105588949454949>',
  latency: '<:latency:1514106143448891535>',
  webSocket: '<:web_socket:1514106335493619742>',
  botPing: '<a:bot_ping:1513762217147895919>',
  database: '<:database:1514106679753707672>',
  servers: '<:servers:1514107674554531850>',
} as const;

export type CustomEmojiKey = keyof typeof CUSTOM_EMOJIS;

export const EMBED_COLORS = {
  success: 0x00ff14,
  error: 0xff0000,
  warning: 0xff8c00,
  info: 0xf200ff,
} as const;
