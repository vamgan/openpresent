import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { installSkill, resolveSkill } from '@openpresent/skills';

function isEmpty(path: string) { return !existsSync(path) || readdirSync(path).length === 0; }

function safePackageName(directory: string) {
  return basename(resolve(directory)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'openpresent-deck';
}

function copyTemplate(source: string, target: string, replacements: Record<string, string>) {
  mkdirSync(dirname(target), { recursive: true });
  if (statSync(source).isDirectory()) {
    for (const name of readdirSync(source)) copyTemplate(join(source, name), join(target, name), replacements);
    return;
  }
  let contents = readFileSync(source, 'utf8');
  for (const [key, value] of Object.entries(replacements)) contents = contents.replaceAll(key, value);
  writeFileSync(target, contents);
}

function packageRoot(name: string) {
  const entry = createRequire(import.meta.url).resolve(name);
  const dist = dirname(entry);
  return basename(dist) === 'dist' ? dirname(dist) : dist;
}

function vendor(target: string, name: '@openpresent/core' | '@openpresent/components' | '@openpresent/validator') {
  const sourceDist = join(packageRoot(name), 'dist');
  if (!existsSync(sourceDist)) throw new Error(`${name} must be built before creating a Studio project.`);
  const packageTarget = join(target, 'vendor', '@openpresent', name.split('/')[1]);
  mkdirSync(packageTarget, { recursive: true });
  cpSync(sourceDist, join(packageTarget, 'dist'), { recursive: true });
  const components = name.endsWith('/components');
  const validator = name.endsWith('/validator');
  const manifest: Record<string, unknown> = {
    name, version: '0.1.0', type: 'module', main: './dist/index.js', module: './dist/index.js', types: './dist/index.d.ts',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' } },
  };
  if (!validator) {
    manifest.sideEffects = ['**/*.css'];
    manifest.exports = {
      '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
      './styles.css': './dist/styles.css',
    };
    manifest.peerDependencies = { react: '>=18.2', 'react-dom': '>=18.2' };
  }
  manifest.dependencies = validator
    ? { typescript: '^5.9.2' }
    : components ? { '@openpresent/core': 'file:../core', motion: '^12.23.12' } : { motion: '^12.23.12' };
  writeFileSync(join(packageTarget, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const DOCUMENT_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>__PROJECT_NAME__</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const DOCUMENT_MAIN_TSX = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Presentation } from '@openpresent/core';
import '@openpresent/core/styles.css';
import '@openpresent/components/styles.css';
import { deck } from './deck';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

function render(current: typeof deck) {
  root.render(<StrictMode><Presentation deck={current} /></StrictMode>);
}

render(deck);

// Repaint in place on edit instead of reloading, so the current slide survives.
if (import.meta.hot) {
  (globalThis as { __openpresentDeckUpdate?: (module: { deck?: typeof deck }) => void })
    .__openpresentDeckUpdate = (module) => { if (module?.deck) render(module.deck); };
  import.meta.hot.accept('./deck', (next) => {
    const updated = (next as { deck?: typeof deck } | undefined)?.deck;
    if (updated) render(updated);
    else import.meta.hot?.invalidate();
  });
}
`;

const DOCUMENT_DECK_TSX = `import { defineDeck } from '@openpresent/core';
import { Slide } from '@openpresent/components';

export const deck = defineDeck({
  metadata: { id: '__PROJECT_NAME__', title: 'Untitled presentation' },
  // No theme set: the runtime default applies until one is chosen for this subject.
  slides: [
    <Slide id="opening" title="Untitled slide" transition="fade">
      <div><h2>Untitled slide</h2><p>Add a specific claim and the evidence that supports it.</p></div>
    </Slide>,
  ],
});
`;

const DOCUMENT_STYLES_CSS = `/* Styles for this presentation. The runtime ships its own base styles. */
`;

/**
 * Creates a presentation that holds only the author's content. Studio supplies
 * React, the build config, and the OpenPresent packages, so the folder carries
 * no package.json, lockfile, or node_modules. That keeps a presentation a
 * document rather than a project, and it stops an agent from spending its first
 * turn installing dependencies and running builds that Studio already handles.
 */
export function scaffoldStudioDocument(directory: string, options: ScaffoldStudioOptions = {}) {
  const target = resolve(directory);
  if (!isEmpty(target)) throw new Error(`Refusing to create a presentation in non-empty directory: ${target}. Choose an empty target.`);
  if (options.skill) resolveSkill(options.skill);
  const name = safePackageName(target);
  const write = (relativePath: string, contents: string) => {
    const path = join(target, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents.replaceAll('__PROJECT_NAME__', name));
  };
  mkdirSync(target, { recursive: true });
  write('index.html', DOCUMENT_INDEX_HTML);
  write('src/main.tsx', DOCUMENT_MAIN_TSX);
  write('src/deck.tsx', DOCUMENT_DECK_TSX);
  write('src/styles.css', DOCUMENT_STYLES_CSS);
  if (options.skill) installSkill(options.skill, join(target, '.agents', 'skills'));
  return target;
}

export interface ScaffoldStudioOptions { skill?: string }

export function scaffoldStudioProject(directory: string, options: ScaffoldStudioOptions = {}) {
  const target = resolve(directory);
  if (!isEmpty(target)) throw new Error(`Refusing to create a deck in non-empty directory: ${target}. Choose an empty target.`);
  if (options.skill) resolveSkill(options.skill);
  const built = fileURLToPath(new URL('./templates/starter', import.meta.url));
  const source = fileURLToPath(new URL('../../cli/templates/starter', import.meta.url));
  const template = existsSync(built) ? built : source;
  if (!existsSync(template)) throw new Error('The OpenPresent starter assets are missing. Reinstall @openpresent/studio.');
  mkdirSync(target, { recursive: true });
  copyTemplate(template, target, { '__PROJECT_NAME__': safePackageName(target) });
  vendor(target, '@openpresent/core');
  vendor(target, '@openpresent/components');
  vendor(target, '@openpresent/validator');
  if (options.skill) installSkill(options.skill, join(target, '.agents', 'skills'));
  return target;
}
