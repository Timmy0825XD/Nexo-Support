import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { checkSupabaseConnection } from '../../services/supabase.js';
import { CUSTOM_EMOJIS, EMBED_COLORS } from '../../constants/emojis.js';
import { embedField, infoEmbed } from '../../utils/embeds.js';

export const pingCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and database connection status')
    .setDefaultMemberPermissions(null),

  async execute(interaction, { supabase }) {
    const sent = Date.now();
    await interaction.deferReply();

    const wsPing = interaction.client.ws.ping;
    const botLatency = Date.now() - sent;

    const dbStart = Date.now();
    const dbOk = await checkSupabaseConnection(supabase);
    const dbLatency = Date.now() - dbStart;

    const allHealthy = dbOk;

    const statusLine = allHealthy
      ? '**All systems operational.** Response times look good.'
      : '**Attention required.** Database is not responding correctly.';

    const embed = infoEmbed('Pong!', statusLine)
      .setColor(allHealthy ? EMBED_COLORS.success : EMBED_COLORS.warning)
      .addFields(
        embedField(`${CUSTOM_EMOJIS.botPing} Bot Latency`, `\`${botLatency}ms\``, false),
        embedField(`${CUSTOM_EMOJIS.webSocket} WebSocket`, `\`${wsPing}ms\``, false),
        embedField(`${CUSTOM_EMOJIS.latency} Database Latency`, `\`${dbLatency}ms\``, false),
        embedField(
          `${dbOk ? CUSTOM_EMOJIS.database : CUSTOM_EMOJIS.error} Database`,
          dbOk ? '`Connected`' : '`Unreachable`',
          false,
        ),
        embedField(
          `${CUSTOM_EMOJIS.servers} Servers`,
          `\`${interaction.client.guilds.cache.size}\``,
          false,
        ),
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
