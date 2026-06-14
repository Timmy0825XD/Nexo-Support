import { REST, Routes, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

export async function registerSlashCommands(options: {
  token: string;
  clientId: string;
  guildId?: string;
  commands: RESTPostAPIApplicationCommandsJSONBody[];
}): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(options.token);

  if (options.guildId) {
    // Guild commands update instantly. Global commands from prior runs or other
    // setups persist until explicitly cleared — they stack with guild commands
    // in the Discord client and look like duplicates or stale entries.
    await rest.put(Routes.applicationCommands(options.clientId), { body: [] });
    console.log('Cleared global slash commands (dev guild mode)');

    await rest.put(Routes.applicationGuildCommands(options.clientId, options.guildId), {
      body: options.commands,
    });
    console.log(
      `Registered ${options.commands.length} guild slash command(s) in ${options.guildId}`,
    );
    return;
  }

  await rest.put(Routes.applicationCommands(options.clientId), { body: options.commands });
  console.log(`Registered ${options.commands.length} global slash command(s)`);
}

export async function clearAllSlashCommands(options: {
  token: string;
  clientId: string;
  guildId?: string;
}): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(options.token);

  await rest.put(Routes.applicationCommands(options.clientId), { body: [] });
  console.log('Cleared global slash commands');

  if (options.guildId) {
    await rest.put(Routes.applicationGuildCommands(options.clientId, options.guildId), {
      body: [],
    });
    console.log(`Cleared guild slash commands in ${options.guildId}`);
  }
}
