import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SlashCommand } from '../commands/types.js';
import { CUSTOM_EMOJIS } from '../constants/emojis.js';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function getBotVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
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
    title: `${CUSTOM_EMOJIS.bot_icone} Bot Commands`,
    subtitle: 'Bot information and utility commands',
    buttonLabel: `${CUSTOM_EMOJIS.bot_icone} Bot`,
    commandNames: ['ping', 'bot'],
    entries: [
      { name: '/ping', description: 'Check bot latency and database connection status.' },
      { name: '/bot about', description: 'View detailed bot information and statistics.' },
      { name: '/bot help', description: 'Display all available bot commands.' },
    ],
  },
  {
    title: `${CUSTOM_EMOJIS.settings} Settings Commands`,
    subtitle: 'Guild configuration and logging settings',
    buttonLabel: `${CUSTOM_EMOJIS.settings} Settings`,
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
    title: `${CUSTOM_EMOJIS.medal} Staff Commands`,
    subtitle: 'Staff roles, recruitment, and work statistics',
    buttonLabel: `${CUSTOM_EMOJIS.medal} Staff`,
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
    title: `${CUSTOM_EMOJIS.trophy} Tournament Commands`,
    subtitle: 'Tournament configuration and registration',
    buttonLabel: `${CUSTOM_EMOJIS.trophy} Tournament`,
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
    title: `${CUSTOM_EMOJIS.team_member} Team Commands`,
    subtitle: 'Tournament participant lookup and registration viewer',
    buttonLabel: `${CUSTOM_EMOJIS.team_member} Team`,
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
    title: `${CUSTOM_EMOJIS.sheets} Sheet Commands`,
    subtitle: 'Google Sheet templates for tournament registration',
    buttonLabel: `${CUSTOM_EMOJIS.sheets} Sheet`,
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
    title: `${CUSTOM_EMOJIS.ticket} Room Commands`,
    subtitle: 'Manual and automatic match room creation',
    buttonLabel: `${CUSTOM_EMOJIS.ticket} Room`,
    commandNames: ['room', 'auto_room'],
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
    title: `${CUSTOM_EMOJIS.role} Role Commands`,
    subtitle: 'Role assignment and member management',
    buttonLabel: `${CUSTOM_EMOJIS.role} Role`,
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
    title: `${CUSTOM_EMOJIS.utility} Utility Commands`,
    subtitle: 'Administrative server maintenance tools',
    buttonLabel: `${CUSTOM_EMOJIS.utility} Utility`,
    commandNames: ['utility'],
    entries: [
      {
        name: '/utility clear_category',
        description: 'Delete all channels under a category, leaving it empty (confirmation required).',
        permission: 'Administrator only',
      },
      {
        name: '/utility clear',
        description: 'Delete messages in the current channel by count or age.',
        permission: 'Manage Messages',
      },
      {
        name: '/utility emoji_steal',
        description: 'Remove a custom emoji by ID and show its image.',
        permission: 'Manage Emojis and Stickers',
      },
      {
        name: '/utility random',
        description: 'Pick random option(s) from a comma-separated list.',
      },
      {
        name: '/utility utc',
        description: 'Show a UTC date/time with local Discord timestamps.',
      },
      {
        name: '/utility avatar',
        description: 'Display a user avatar at full size.',
      },
      {
        name: '/utility toss',
        description: 'Flip a coin — heads or tails.',
      },
      {
        name: '/utility enlarge',
        description: 'Enlarge a Unicode or custom emoji.',
      },
      {
        name: '/utility embed',
        description:
          'Interactive embed builder with ephemeral preview, modals, and required target channel.',
        permission: 'Manage Messages',
      },
      {
        name: '/utility edit_embed',
        description: 'Edit a bot embed message interactively using its Discord message ID.',
        permission: 'Manage Messages',
      },
    ],
  },
  {
    title: `${CUSTOM_EMOJIS.servers} Server Commands`,
    subtitle: 'Server statistics and moderation tools',
    buttonLabel: `${CUSTOM_EMOJIS.servers} Server`,
    commandNames: ['server', 'user'],
    entries: [
      { name: '/server info', description: 'View detailed server statistics.' },
      {
        name: '/server banlist',
        description: 'View all banned users or export them to Excel.',
        permission: 'Organiser only',
      },
      {
        name: '/user ban',
        description:
          'Ban a user by Discord ID (7 days, 1/2/6 months, or permanent) with reason.',
        permission: 'Organiser only',
      },
      {
        name: '/user unban',
        description: 'Remove a ban by Discord ID.',
        permission: 'Organiser only',
      },
    ],
  },
  {
    title: `${CUSTOM_EMOJIS.schedule} Schedule Commands`,
    subtitle: 'Match scheduling and staff assignment',
    buttonLabel: `${CUSTOM_EMOJIS.schedule} Schedule`,
    commandNames: ['schedule', 'upload_score', 'correct_bracket'],
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
    title: `${CUSTOM_EMOJIS.ticket} Ticket Commands`,
    subtitle: 'Match ticket lifecycle management',
    buttonLabel: `${CUSTOM_EMOJIS.ticket} Ticket`,
    commandNames: ['ticket'],
    entries: [
      { name: '/ticket close', description: 'Close a match ticket.', permission: 'Organiser only' },
      { name: '/ticket reopen', description: 'Reopen a closed match ticket.', permission: 'Organiser only' },
      { name: '/ticket delete', description: 'Delete a match ticket.', permission: 'Organiser only' },
      {
        name: '/ticket add',
        description: 'Add a user to the ticket with captain permissions.',
        permission: 'Organiser or tournament helper (match ticket only)',
      },
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
  const permission = entry.permission ? `\n${CUSTOM_EMOJIS.warn_perm} ${entry.permission}` : '';
  return `${label}\n${entry.description}${permission}`;
}
