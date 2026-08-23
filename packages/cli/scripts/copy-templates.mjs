import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const target = fileURLToPath(new URL('../dist/templates', import.meta.url));
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(`${packageRoot}/templates`, target, { recursive: true });
