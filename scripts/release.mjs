#!/usr/bin/env node
// Tags a release after verifying the tree is publishable. Publishing itself is
// left to CI on the tag, so a release is always the exact commit that was
// checked rather than whatever happened to be on someone's machine.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  process.stderr.write('Usage: node scripts/release.mjs <version>\n');
  process.exit(1);
}

if (run('git', ['status', '--porcelain'])) {
  process.stderr.write('Working tree is dirty. Commit or stash first.\n');
  process.exit(1);
}

const manifests = ['package.json', ...globSync('packages/*/package.json')];
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.private && path !== 'package.json') continue;
  manifest.version = version;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  process.stderr.write(`Add a CHANGELOG entry for ${version} before releasing.\n`);
  process.exit(1);
}

if (run('git', ['tag', '--list', `v${version}`])) {
  process.stderr.write(`v${version} is already tagged. Choose a new version.\n`);
  process.exit(1);
}

// The manifests may already carry this version, which is normal for a first
// release. A no-op bump is not a failure, so only commit when something changed.
run('git', ['add', '-A']);
if (run('git', ['status', '--porcelain'])) {
  run('git', ['commit', '-m', `chore(release): v${version}`]);
  process.stdout.write(`Committed the version bump for v${version}.\n`);
} else {
  process.stdout.write(`Manifests already at ${version}; tagging the current commit.\n`);
}

run('git', ['tag', '-a', `v${version}`, '-m', `v${version}`]);
process.stdout.write(`Tagged v${version}. Push with: git push --follow-tags\n`);
