import 'dotenv/config';
import { loadSlashCommands } from '../commands/loader.js';
import { clearAllSlashCommands, registerSlashCommands } from '../services/register-commands.js';

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
const guildId = process.env.DISCORD_GUILD_ID;
const shouldClear = process.argv.includes('--clear');

const commandData = loadSlashCommands().map((cmd) => cmd.data.toJSON());

if (shouldClear) {
  await clearAllSlashCommands({ token, clientId, guildId });
  console.log('Done. Restart Discord (Ctrl+R) if the client still shows old commands.');
  process.exit(0);
}

await registerSlashCommands({ token, clientId, guildId, commands: commandData });
console.log('Done. Restart Discord (Ctrl+R) if the client still shows old commands.');
