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
    title: '🏆 Tournament Commands',
    subtitle: 'Tournament configuration and registration',
    buttonLabel: '🏆 Tournament',
    commandNames: ['tournament'],
    entries: [
      {
        name: '/tournament add',
        description: 'Add and configure a tournament in the bot.',
        permission: 'Administrator only',
      },
      {
        name: '/tournament edit',
        description: 'Edit an existing tournament configuration.',
        permission: 'Administrator only',
      },
      {
        name: '/tournament delete',
        description: 'Delete a tournament configuration from the bot.',
        permission: 'Administrator only',
      },
      {
        name: '/tournament info',
        description: 'View the complete configuration of a tournament.',
        permission: 'Administrator only',
      },
      {
        name: '/tournament list',
        description: 'List all tournaments registered in this server.',
        permission: 'Administrator only',
      },
    ],
  },
  {
    title: '👥 Team Commands',
    subtitle: 'Tournament participant lookup and registration viewer',
    buttonLabel: '👥 Team',
    commandNames: ['team'],
    entries: [
      {
        name: '/team info',
        description: 'Look up a participant by Discord user or in-game ID/name.',
        permission: 'Public',
      },
      {
        name: '/team list',
        description: 'Post all registered participants from the tournament sheet.',
        permission: 'Admin or Organiser',
      },
    ],
  },
  {
    title: '📄 Sheet Commands',
    subtitle: 'Google Sheet templates for tournament registration',
    buttonLabel: '📄 Sheet',
    commandNames: ['sheet'],
    entries: [
      {
        name: '/sheet headers',
        description: 'Show the required header row for a tournament registration sheet.',
        permission: 'Public',
      },
      {
        name: '/sheet validate',
        description: 'Validate participant sheet data before creating a tournament.',
        permission: 'Admin',
      },
      {
        name: '/sheet validation_role',
        description:
          'Open support tickets for teams missing a required role (e.g. Verified).',
        permission: 'Admin',
      },
    ],
  },
  {
    title: '🚪 Room Commands',
    subtitle: 'Manual match room creation and queue inspection',
    buttonLabel: '🚪 Room',
    commandNames: ['room'],
    entries: [
      {
        name: '/room create',
        description: 'Create ticket rooms for open bracket matches.',
        permission: 'Organiser only',
      },
      {
        name: '/room available',
        description: 'Show open matches available for room creation.',
        permission: 'Organiser or Staff',
      },
    ],
  },
  {
    title: '⚡ Auto Room Commands',
    subtitle: 'Automatic tournament room creation controls',
    buttonLabel: '⚡ Auto Room',
    commandNames: ['auto_room'],
    entries: [
      {
        name: '/auto_room run',
        description: 'Manually trigger automatic room creation.',
        permission: 'Organiser only',
      },
      {
        name: '/auto_room stop',
        description: 'Disable automatic room creation for a tournament.',
        permission: 'Organiser only',
      },
      {
        name: '/auto_room toggle',
        description: 'Toggle automatic room creation for a tournament.',
        permission: 'Organiser only',
      },
    ],
  },
  {
    title: '📊 Score Commands',
    subtitle: 'Upload and correct tournament match results',
    buttonLabel: '📊 Scores',
    commandNames: ['upload_score', 'correct_bracket'],
    entries: [
      {
        name: '/upload_score',
        description: 'Upload scores from the current match ticket to Challonge and finalize it.',
        permission: 'Admin or Organiser (ticket channel only)',
      },
      {
        name: '/correct_bracket',
        description: 'Correct incorrect scores on the Challonge bracket.',
        permission: 'Organiser only',
      },
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
    title: '📅 Schedule Commands',
    subtitle: 'Match scheduling and staff assignment',
    buttonLabel: '📅 Schedule',
    commandNames: ['schedule'],
    entries: [
      {
        name: '/schedule create',
        description: 'Create and publish a match schedule in the ticket and result channel.',
        permission: 'Admin, Organiser, or Helper (ticket channel only)',
      },
      {
        name: '/schedule show',
        description: 'View the schedule channel embed for a tournament match.',
        permission: 'Organiser or Staff',
      },
      {
        name: '/schedule update',
        description: 'Update an existing match schedule (time, staff, notes, or thumbnail).',
        permission: 'Admin, Organiser, or Helper (ticket channel only)',
      },
      {
        name: '/schedule delete',
        description: 'Delete an existing schedule and remove schedule embeds.',
        permission: 'Helper only (ticket channel only)',
      },
      {
        name: '/schedule unassigned',
        description: 'View scheduled matches missing Judge or Recorder assignments.',
        permission: 'Staff only',
      },
      {
        name: '/schedule refresh',
        description: 'Re-enable assignment buttons on the schedule channel post (filled roles stay disabled).',
        permission: 'Staff only',
      },
      {
        name: '/schedule resign',
        description: 'Resign from an assigned Judge or Recorder role.',
        permission: 'Assigned staff (ticket channel only)',
      },
      {
        name: '/schedule results',
        description: 'Declare match results with scores, notes, and proof images after the scheduled time.',
        permission: 'Assigned staff, captains, or tournament staff (ticket channel only)',
      },
      {
        name: '/schedule results_delete',
        description: 'Delete the declared result embed from the tournament results channel.',
        permission: 'Tournament organizer or helper (ticket channel only)',
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
      {
        name: '/ticket transcript',
        description: 'Archive and delete a role validation support ticket.',
        permission: 'Organiser only',
      },
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
