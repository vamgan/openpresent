// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installSkill, listSkills, resolveSkill } from './index';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('@openpresent/skills', () => {
  it('lists and resolves the shipped presentation skill', () => {
    expect(listSkills()).toContainEqual(expect.objectContaining({ name: 'deck-direction' }));
    expect(existsSync(join(resolveSkill('deck-direction'), 'agents/openai.yaml'))).toBe(true);
  });

  it('installs locally, refuses occupied destinations, and updates with force', () => {
    const target = mkdtempSync(join(tmpdir(), 'openpresent-skills-test-'));
    temporary.push(target);
    const destination = installSkill('deck-direction', target);
    expect(existsSync(join(destination, 'SKILL.md'))).toBe(true);
    writeFileSync(join(destination, 'local-note.txt'), 'preserve me');
    expect(() => installSkill('deck-direction', target)).toThrow(/Refusing to overwrite/);
    expect(installSkill('deck-direction', target, { force: true })).toBe(destination);
    expect(existsSync(join(destination, 'local-note.txt'))).toBe(true);
  });

  it('rejects unknown names before creating a target', () => {
    expect(() => resolveSkill('missing')).toThrow(/Unknown OpenPresent skill/);
  });
});
