import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { loadPrefixCommands, loadSlashCommands } from './commands/loader.js';
import type { PrefixCommand, SlashCommand } from './commands/types.js';
import { initSupabase } from './services/supabase.js';
import { registerSlashCommands } from './services/register-commands.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in environment`);
    process.exit(1);
  }
  return value;
}

const token = requireEnv('DISCORD_TOKEN');
const clientId = requireEnv('DISCORD_CLIENT_ID');
const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = initSupabase(supabaseUrl, supabaseServiceRoleKey);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const slashCommands = new Collection<string, SlashCommand>();
const prefixCommands = new Collection<string, PrefixCommand>();

for (const command of loadSlashCommands()) {
  slashCommands.set(command.data.name, command);
}

for (const command of loadPrefixCommands()) {
  prefixCommands.set(command.name, command);
}

const commandContext = { supabase };

async function syncSlashCommands(): Promise<void> {
  const commandData = loadSlashCommands().map((cmd) => cmd.data.toJSON());
  const devGuildId = process.env.DISCORD_GUILD_ID;

  await registerSlashCommands({
    token,
    clientId,
    guildId: devGuildId,
    commands: commandData,
  });
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = slashCommands.get(interaction.commandName);

    if (!command?.autocomplete) {
      await interaction.respond([]);
      return;
    }

    try {
      await command.autocomplete(interaction, commandContext);
    } catch (error) {
      console.error(`Autocomplete failed for /${interaction.commandName}:`, error);
      await interaction.respond([]);
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = slashCommands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, commandContext);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);

    const message = 'Something went wrong while executing this command.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message });
    } else {
      await interaction.reply({ content: message });
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guildId) return;

  const prefix = '[]';
  if (!message.content.startsWith(prefix)) return;

  const input = message.content.slice(prefix.length).trim();
  if (!input) return;

  const [commandName, ...args] = input.split(/\s+/);
  const command = prefixCommands.get(commandName.toLowerCase());
  if (!command) return;

  try {
    await command.execute(message, args, commandContext);
  } catch (error) {
    console.error(`Error executing ${prefix}${commandName}:`, error);
    await message.reply('Something went wrong while executing this command.');
  }
});

try {
  await syncSlashCommands();
  await client.login(token);
} catch (error) {
  console.error('Failed to start bot:', error);
  process.exit(1);
}
