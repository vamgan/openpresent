// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram, findProjectRoot } from './index';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function program() {
  return createProgram().exitOverride();
}

describe('skills CLI', () => {
  it('lists vendable skills', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await program().parseAsync(['node', 'openpresent', 'skills', 'list']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('deck-direction'));
  });

  it('installs into the explicit target and refuses replacement without force', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const target = mkdtempSync(join(tmpdir(), 'openpresent-cli-skill-'));
    temporary.push(target);
    await program().parseAsync(['node', 'openpresent', 'skills', 'install', 'deck-direction', '--target', target]);
    expect(existsSync(join(target, 'deck-direction/SKILL.md'))).toBe(true);
    await expect(program().parseAsync(['node', 'openpresent', 'skills', 'install', 'deck-direction', '--target', target]))
      .rejects.toThrow(/Refusing to overwrite/);
    await expect(program().parseAsync(['node', 'openpresent', 'skills', 'install', 'deck-direction', '--target', target, '--force']))
      .resolves.toBeDefined();
  });
});

describe('finding the presentation to open', () => {
  function documentAt(...files: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'openpresent-cli-root-'));
    temporary.push(root);
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '');
    }
    return root;
  }

  it('opens a Studio document, which deliberately has no package.json', () => {
    const root = documentAt('index.html', 'src/deck.tsx');
    expect(findProjectRoot(root)).toBe(realpathSync(root));
    // From inside the document too, not just at its root.
    expect(findProjectRoot(join(root, 'src'))).toBe(realpathSync(root));
  });

  it('opens a self-managed project that brings its own build', () => {
    const root = documentAt('index.html', 'package.json');
    expect(findProjectRoot(root)).toBe(realpathSync(root));
  });

  it('returns nothing when run from outside any presentation, so Studio opens the library', () => {
    const empty = mkdtempSync(join(tmpdir(), 'openpresent-cli-empty-'));
    temporary.push(empty);
    const previous = process.cwd();
    process.chdir(realpathSync(empty));
    try {
      expect(findProjectRoot(undefined)).toBeUndefined();
    } finally {
      process.chdir(previous);
    }
  });

  it('names the mistake when an explicit target is not a presentation', () => {
    const empty = mkdtempSync(join(tmpdir(), 'openpresent-cli-empty-'));
    temporary.push(empty);
    expect(() => findProjectRoot(empty)).toThrow(/Not an OpenPresent presentation/);
  });
});
