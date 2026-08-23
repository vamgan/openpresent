import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OpenPresentSkillManifest {
  name: 'deck-direction';
  displayName: string;
  description: string;
  version: string;
}

export interface InstallSkillOptions {
  force?: boolean;
}

const manifests: readonly OpenPresentSkillManifest[] = [{
  name: 'deck-direction',
  displayName: 'Deck Direction',
  description: 'Direct a brief and evidence into a coherent, validated OpenPresent design system and deck.',
  version: '0.1.0',
}];

export function listSkills(): readonly OpenPresentSkillManifest[] {
  return manifests.map((manifest) => ({ ...manifest }));
}

export function resolveSkill(name: string): string {
  if (!manifests.some((manifest) => manifest.name === name)) {
    throw new Error(`Unknown OpenPresent skill "${name}". Available: ${manifests.map((manifest) => manifest.name).join(', ')}.`);
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const candidates = [
    resolve(packageRoot, 'skills', name),
    resolve(packageRoot, '..', '..', 'skills', name),
  ];
  const path = candidates.find((candidate) => existsSync(resolve(candidate, 'SKILL.md')));
  if (!path) throw new Error(`The ${name} skill resources are missing from @openpresent/skills.`);
  return path;
}

export function installSkill(name: string, targetDirectory: string, options: InstallSkillOptions = {}): string {
  const source = resolveSkill(name);
  const targetRoot = resolve(targetDirectory);
  const destination = resolve(targetRoot, name);
  if (existsSync(destination)) {
    const occupied = !statSync(destination).isDirectory() || readdirSync(destination).length > 0;
    if (occupied && !options.force) {
      throw new Error(`Refusing to overwrite existing skill at ${destination}. Re-run with --force to update known files.`);
    }
  }
  mkdirSync(targetRoot, { recursive: true });
  cpSync(source, destination, { recursive: true, force: Boolean(options.force), errorOnExist: !options.force });
  return destination;
}
