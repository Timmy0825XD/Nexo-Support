import { REST, Routes, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

export async function registerSlashCommands(options: {
  token: string;
  clientId: string;
  guildId?: string;
  commands: RESTPostAPIApplicationCommandsJSONBody[];
}): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(options.token);

  if (options.guildId) {
    await rest.put(Routes.applicationGuildCommands(options.clientId, options.guildId), {
      body: options.commands,
    });
    console.log(`Registered ${options.commands.length} guild slash commands`);
    return;
  }

  await rest.put(Routes.applicationCommands(options.clientId), { body: options.commands });
  console.log(`Registered ${options.commands.length} global slash commands`);
}
