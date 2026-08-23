// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from './index';

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
