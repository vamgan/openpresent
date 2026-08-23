#!/usr/bin/env node
// Installs an OpenPresent skill where a given agent already looks for skills, so
// adding one is a single command rather than a copy-paste into a prompt.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = fileURLToPath(new URL('../skills/', import.meta.url));

const TARGETS = {
  claude: {
    label: 'Claude Code',
    resolve: (project) => join(project ?? process.cwd(), '.claude', 'skills'),
    note: 'Restart Claude Code, then ask it to use the deck-direction skill.',
  },
  'claude-user': {
    label: 'Claude Code (all projects)',
    resolve: () => join(homedir(), '.claude', 'skills'),
    note: 'Available in every project on this machine.',
  },
  agents: {
    label: 'AGENTS.md-style agents',
    resolve: (project) => join(project ?? process.cwd(), '.agents', 'skills'),
    note: 'Codex and other agents that read .agents/skills.',
  },
  gpt: {
    label: 'A GPT or assistant you paste files into',
    resolve: (project) => join(project ?? process.cwd(), 'openpresent-skill'),
    note: 'Upload SKILL.md and references/ as knowledge files, or paste SKILL.md into the instructions.',
  },
};

const [target = 'claude', name = 'deck-direction', project] = process.argv.slice(2);
const chosen = TARGETS[target];

if (!chosen || process.argv.includes('--help')) {
  process.stdout.write(`Usage: openpresent-skill <target> [skill] [projectDir]

Targets:
${Object.entries(TARGETS).map(([key, value]) => `  ${key.padEnd(13)} ${value.label}`).join('\n')}

Example:
  npx -y @openpresent/skills claude deck-direction
`);
  process.exit(chosen ? 0 : 1);
}

const source = join(SKILLS, name);
if (!existsSync(source)) {
  process.stderr.write(`Unknown skill "${name}". Available: deck-direction\n`);
  process.exit(1);
}

const destination = resolve(chosen.resolve(project), name);
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });

process.stdout.write(`Installed ${name} for ${chosen.label}:\n  ${destination}\n${chosen.note}\n`);
