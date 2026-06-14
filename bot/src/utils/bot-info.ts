import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SlashCommand } from '../commands/types.js';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function getBotVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface HelpEntry {
  name: string;
  description: string;
  permission?: string;
}

export interface HelpCategory {
  title: string;
  subtitle: string;
  buttonLabel: string;
  entries: HelpEntry[];
}

interface HelpCategoryDefinition {
  title: string;
  subtitle: string;
  buttonLabel: string;
  commandNames: string[];
  entries: HelpEntry[];
}

const HELP_CATEGORY_DEFINITIONS: HelpCategoryDefinition[] = [
  {
    title: '🤖 Bot Commands',
    subtitle: 'Bot information and utility commands',
    buttonLabel: '🤖 Bot',
    commandNames: ['ping', 'bot'],
    entries: [
      { name: '/ping', description: 'Check bot latency and database connection status.' },
      { name: '/bot about', description: 'View detailed bot information and statistics.' },
      { name: '/bot help', description: 'Display all available bot commands.' },
    ],
  },
  {
    title: '⚙️ Settings Commands',
    subtitle: 'Guild configuration and logging settings',
    buttonLabel: '⚙️ Settings',
    commandNames: ['settings'],
    entries: [
      {
        name: '/settings setup',
        description: 'Configure bot roles, channels, categories, and logging settings.',
        permission: 'Administrator only',
      },
      {
        name: '/settings edit',
        description: 'Update specific settings while preserving the rest.',
        permission: 'Administrator only',
      },
      { name: '/settings show', description: 'View the current bot configuration.' },
    ],
  },
  {
    title: '👨‍💼 Staff Commands',
    subtitle: 'Staff roles, recruitment, and work statistics',
    buttonLabel: '👨‍💼 Staff',
    commandNames: ['staff'],
    entries: [
      {
        name: '/staff config set',
        description: 'Configure staff roles and channels.',
        permission: 'Administrator only',
      },
      {
        name: '/staff config edit',
        description: 'Update specific staff settings.',
        permission: 'Administrator only',
      },
      { name: '/staff config view', description: 'View current staff configuration.' },
      {
        name: '/staff recruit',
        description: 'Recruit and assign staff members.',
        permission: 'Administrator only',
      },
      {
        name: '/staff fire',
        description: 'Remove staff roles from users.',
        permission: 'Administrator only',
      },
      { name: '/staff work', description: 'View staff work statistics for a tournament.' },
    ],
  },
  {
    title: '👥 Role Commands',
    subtitle: 'Role assignment and member management',
    buttonLabel: '👥 Role',
    commandNames: ['role'],
    entries: [
      { name: '/role user', description: 'Add or remove a role from a user.', permission: 'Organiser only' },
      {
        name: '/role add all',
        description: 'Add a role to all eligible members.',
        permission: 'Organiser only',
      },
      {
        name: '/role remove all',
        description: 'Remove a role from all members who have it.',
        permission: 'Organiser only',
      },
      {
        name: '/role list',
        description: 'View information and members of a role.',
        permission: 'Organiser only',
      },
    ],
  },
  {
    title: '🌐 Server Commands',
    subtitle: 'Server statistics and moderation tools',
    buttonLabel: '🌐 Server',
    commandNames: ['server'],
    entries: [
      { name: '/server info', description: 'View detailed server statistics.' },
      {
        name: '/server banlist',
        description: 'View all banned users or export them to Excel.',
        permission: 'Organiser only',
      },
    ],
  },
  {
    title: '🎫 Ticket Commands',
    subtitle: 'Match ticket lifecycle management',
    buttonLabel: '🎫 Ticket',
    commandNames: ['ticket'],
    entries: [
      { name: '/ticket close', description: 'Close a match ticket.', permission: 'Organiser only' },
      { name: '/ticket reopen', description: 'Reopen a closed match ticket.', permission: 'Organiser only' },
      { name: '/ticket delete', description: 'Delete a match ticket.', permission: 'Organiser only' },
    ],
  },
];

function collectCommandPaths(command: SlashCommand, prefix = ''): string[] {
  const json = command.data.toJSON();
  const name = prefix ? `${prefix} ${json.name}` : json.name!;

  if ('options' in json && json.options) {
    const paths: string[] = [];
    for (const option of json.options) {
      if (option.type === 1) {
        paths.push(`/${name} ${option.name}`);
      } else if (option.type === 2) {
        for (const sub of option.options ?? []) {
          if (sub.type === 1) {
            paths.push(`/${name} ${option.name} ${sub.name}`);
          }
        }
      }
    }
    return paths.length > 0 ? paths : [`/${name}`];
  }

  return [`/${name}`];
}

export function getRegisteredCommandPaths(commands: SlashCommand[]): Set<string> {
  const paths = new Set<string>();
  for (const command of commands) {
    for (const path of collectCommandPaths(command)) {
      paths.add(path);
    }
  }
  return paths;
}

export function buildHelpCategories(commands: SlashCommand[]): HelpCategory[] {
  const registered = new Set(commands.map((cmd) => cmd.data.name));

  return HELP_CATEGORY_DEFINITIONS.filter((definition) =>
    definition.commandNames.some((name) => registered.has(name)),
  ).map(({ title, subtitle, buttonLabel, entries }) => ({
    title,
    subtitle,
    buttonLabel,
    entries: entries.filter((entry) => registered.has(entry.name.split(' ')[0]!.slice(1))),
  })).filter((category) => category.entries.length > 0);
}

export function formatHelpEntry(entry: HelpEntry, commandIds?: Map<string, string>): string {
  const root = entry.name.split(' ')[0]!.slice(1);
  const commandId = commandIds?.get(root);
  const label = commandId ? `</${entry.name.slice(1)}:${commandId}>` : `**${entry.name}**`;
  const permission = entry.permission ? `\n⚠️ ${entry.permission}` : '';
  return `${label}\n${entry.description}${permission}`;
}
