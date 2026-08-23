import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const source = resolve(repositoryRoot, 'skills', 'deck-direction');
const destinationRoot = resolve(packageRoot, 'skills');

if (!existsSync(source)) throw new Error(`Missing canonical skill at ${source}`);
rmSync(destinationRoot, { recursive: true, force: true });
mkdirSync(destinationRoot, { recursive: true });
cpSync(source, resolve(destinationRoot, 'deck-direction'), { recursive: true });
