#!/usr/bin/env node
// Prints one version's section from CHANGELOG.md, so release notes stay written
// by hand in one place instead of being duplicated into the release body.
import { readFileSync } from 'node:fs';

const requested = (process.argv[2] ?? '').replace(/^v/, '');
if (!requested) {
  process.stderr.write('Usage: changelog-section.mjs <version>\n');
  process.exit(1);
}

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex((line) => line.startsWith(`## [${requested}]`));
if (start < 0) {
  process.stderr.write(`No CHANGELOG entry for ${requested}.\n`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## '));
process.stdout.write(`${(end < 0 ? rest : rest.slice(0, end)).join('\n').trim()}\n`);
