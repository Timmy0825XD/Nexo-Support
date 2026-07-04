/** Custom animated emojis — keep in sync with docs/EMOJIS.md */
import { parseEmoji, type APIMessageComponentEmoji } from 'discord.js';

export const CUSTOM_EMOJIS = {
  done: '<:done:1519106979543519302>',
  error: '<:error:1519105779574116543>',
  latency: '<:latency:1519109319700910181>',
  webSocket: '<:web_socket:1519106415581597707>',
  botPing: '<:bot_ping:1519106657341280286>',
  database: '<:database:1514106679753707672>',
  servers: '<:servers:1519106120923222158>',
  vs :'<:vs:1519107115778834562>',
  trophy : '<:trophy:1519107794031083645>',
  camera: '<:camera:1519108345145983086>',
  link : '<:link:1519109075411931136>',
  ac : '<:AC:1519110546790551582>',
  gold : '<:gold:1519109971764314194>',
  captain : '<:captain:1519111148966776943>',
  team_member : '<:team_member:1519111455419531294>',
  settings : '<:settings:1519112034375958729>',
  medal : '<:medal:1519112565664383167>',
  rules : '<:rules:1519112932879761580>',
  logs : '<:logs:1519397548878594151>',
  thumbnail : '<:thumbnail:1519397073756229692>',
  announcement : '<:announcement:1519114078239592458>',
  schedule : '<:schedule:1519114524274462892>',
  details : '<:details:1519114775362277396>',
  alert : '<:alert:1519116331419435209>',
  challonge : '<:challonge:1519117366888235078>',
  random : '<:random:1519123054343753728>',
  node : '<:node:1519132965987156008>',
  platform : '<:Platform:1519133339901104148>',
  memory : '<:memory:1519134008804511744>',
  uptime : '<:uptime:1519134295380332685>',
  version : '<:version:1519134681621073981>',
  back : '<a:back:1519388291655270550>',
  next : '<a:next:1519388292938858659>',
  sheets : '<:sheets:1519390412492771519>',
  ticket : '<:ticket:1519390659356790894>',
  role : '<:role:1519395302174625913>',
  utility : '<:utility:1519391970865184818>',
  bot_icone : '<:bot_icone:1519392283554877641>',
  warn_perm : '<:warn_perm:1519393035119759470>',
  transcript : '<:transcript:1519397328937816154>',
  warning : '<a:warning:1519400854820622477>',
  stop : '<:stop:1519401209419661342>',
  skip : '<:skip:1519401514169270322>',
  new : '<:new:1519474310727860274>',
  old : '<:old:1519474660700323973>',
  love : '<a:love:1519475413854851133>',
  update : '<:update:1519487773793452182>'

} as const;

export type CustomEmojiKey = keyof typeof CUSTOM_EMOJIS;

export function resolveCustomEmoji(key: CustomEmojiKey): APIMessageComponentEmoji {
  const parsed = parseEmoji(CUSTOM_EMOJIS[key]);
  if (!parsed?.id) {
    throw new Error(`Invalid custom emoji key: ${key}`);
  }
  return parsed;
}

export const EMBED_COLORS = {
  success: 0x00ff14,
  error: 0xff0000,
  warning: 0xff8c00,
  info: 0xf200ff,
} as const;
