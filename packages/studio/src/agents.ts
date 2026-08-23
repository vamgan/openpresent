import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, isAbsolute, join } from 'node:path';
import type { AgentProfile, DiscoveredAgentProfile } from './types';

/**
 * Suggested models per agent, deliberately short and biased toward names that do
 * not rot. Providers rename and retire versioned identifiers, so a bundled list
 * of pinned names is stale the moment it ships; the picker therefore treats
 * these as suggestions and accepts any value the CLI understands, and profiles
 * in `.openpresent/agents.json` can replace the list entirely.
 */
export const BUILTIN_AGENT_PROFILES: readonly AgentProfile[] = [
  {
    id: 'codex', label: 'Codex', command: 'npx',
    args: ['-y', '--package', '@openai/codex', '--package', '@agentclientprotocol/codex-acp', 'codex-acp'],
    source: 'built-in', adapter: true, modelFlag: '--model',
    models: [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini' },
      { id: 'o4-mini', label: 'o4-mini' },
      { id: 'o3', label: 'o3' },
    ],
  },
  {
    id: 'claude', label: 'Claude', command: 'npx',
    args: ['-y', '@agentclientprotocol/claude-agent-acp'],
    source: 'built-in', adapter: true, modelFlag: '--model',
    // Family aliases rather than pinned names. An alias keeps resolving to the
    // current model in its family, so it cannot go stale the way a bundled
    // `claude-...-20251001` would once that version is retired. Anything pinned
    // can still be typed into the picker.
    models: [
      { id: 'fable', label: 'Fable' },
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
      { id: 'haiku', label: 'Haiku' },
    ],
  },
  {
    id: 'gemini', label: 'Gemini CLI', command: 'gemini', args: ['--acp'],
    source: 'built-in', modelFlag: '--model',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    ],
  },
  { id: 'kiro', label: 'Kiro CLI', command: 'kiro-cli', args: ['acp'], source: 'built-in' },
];

type AgentConfigProfile = Partial<AgentProfile> & Pick<AgentProfile, 'id' | 'command'>;
interface AgentConfig { profiles?: AgentConfigProfile[] }

function validProfile(profile: AgentConfigProfile, source: AgentProfile['source']): AgentProfile {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(profile.id)) throw new Error(`Invalid agent profile ID "${profile.id}".`);
  if (!profile.command.trim()) throw new Error(`Agent profile "${profile.id}" requires a command.`);
  if (profile.args && !Array.isArray(profile.args)) throw new Error(`Agent profile "${profile.id}" args must be an array.`);
  const models = Array.isArray(profile.models)
    ? profile.models.flatMap((model) => (model && typeof model.id === 'string' && model.id.trim()
      ? [{ id: model.id.trim(), label: String(model.label ?? model.id).trim() || model.id.trim() }]
      : []))
    : undefined;
  return {
    id: profile.id,
    label: profile.label?.trim() || profile.id,
    command: profile.command,
    args: profile.args?.map(String) ?? [],
    source,
    adapter: Boolean(profile.adapter),
    ...(models && models.length > 0 ? { models } : {}),
    ...(typeof profile.modelFlag === 'string' && profile.modelFlag.trim() ? { modelFlag: profile.modelFlag.trim() } : {}),
  };
}

export function loadAgentProfiles(projectRoot: string): AgentProfile[] {
  const byId = new Map(BUILTIN_AGENT_PROFILES.map((profile) => [profile.id, { ...profile, args: [...profile.args], ...(profile.models ? { models: profile.models.map((model) => ({ ...model })) } : {}) }]));
  const path = join(projectRoot, '.openpresent', 'agents.json');
  if (!existsSync(path)) return [...byId.values()];
  let parsed: AgentConfig;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')) as AgentConfig; }
  catch (error) { throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!Array.isArray(parsed.profiles)) throw new Error(`${path} must contain a profiles array.`);
  for (const profile of parsed.profiles) byId.set(profile.id, validProfile(profile, 'custom'));
  return [...byId.values()];
}

export function commandAvailable(command: string, env = process.env): boolean {
  return Boolean(resolveCommandPath(command, env));
}

export function resolveCommandPath(command: string, env = process.env): string | undefined {
  if (isAbsolute(command)) return existsSync(command) ? command : undefined;
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const helpCache = new Map<string, string>();
export function commandHelp(command: string): string {
  const cached = helpCache.get(command);
  if (cached !== undefined) return cached;
  const resolved = resolveCommandPath(command);
  if (!resolved) return '';
  const result = spawnSync(resolved, ['--help'], {
    encoding: 'utf8', timeout: 3_000, windowsHide: true,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  helpCache.set(command, output);
  return output;
}

export function discoverAgentProfiles(
  profiles: AgentProfile[],
  available: (command: string) => boolean = commandAvailable,
  inspectHelp: (command: string) => string = commandHelp,
): DiscoveredAgentProfile[] {
  return profiles.map((profile) => {
    const found = available(profile.command);
    let resolved = { ...profile, args: [...profile.args] };
    let capabilityError = '';
    if (found && profile.source === 'built-in' && profile.id === 'gemini') {
      const help = inspectHelp(profile.command);
      const stable = /(^|\s)--acp(?:[\s,]|$)/m.test(help);
      const experimental = /(^|\s)--experimental-acp(?:[\s,]|$)/m.test(help);
      if (!stable && experimental) resolved = { ...resolved, args: ['--experimental-acp'] };
      else if (!stable && !experimental) capabilityError = 'Installed Gemini CLI does not advertise an ACP launch flag. Update Gemini CLI or override this profile.';
    }
    const availability = found && !capabilityError ? (profile.adapter ? 'adapter-available' : 'ready') : 'missing';
    const detail = capabilityError || (found
      ? profile.adapter
        ? profile.id === 'codex'
          ? 'Official ACP adapter is available on demand with a paired Codex package. First launch can take up to a minute; an explicit CODEX_PATH override is honored.'
          : 'Official ACP adapter is available on demand. First launch can take up to a minute; provider authentication is confirmed only after connection.'
        : profile.id === 'gemini'
          ? `Installed Gemini CLI advertises ${resolved.args[0]}; authentication is confirmed when the ACP session starts.`
          : 'Command is installed locally; provider authentication is confirmed when the ACP session starts.'
      : `Missing command: ${profile.command}. Install it or override this profile in .openpresent/agents.json.`);
    return { ...resolved, availability, detail };
  });
}
