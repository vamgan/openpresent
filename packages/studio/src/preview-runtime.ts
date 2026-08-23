import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { studioDataRoot } from './library';

/**
 * Decides how a presentation is served. Studio owns the build for documents that
 * carry only content, which is what lets a presentation stay a document rather
 * than a project the author has to install and maintain.
 */

function livePreviewPlugin(entryPath: string): Plugin {
  const invalidateCall = /if\s*\(invalidateMessage\)\s*import\.meta\.hot\.invalidate\(invalidateMessage\);/;
  return {
    name: 'openpresent:live-preview',
    enforce: 'post',
    apply: 'serve',
    transform(code, id) {
      if (resolve(id.split('?')[0]) !== entryPath || !invalidateCall.test(code)) return;
      return code.replace(invalidateCall, [
        'if (invalidateMessage) {',
        '  if (globalThis.__openpresentDeckUpdate) globalThis.__openpresentDeckUpdate(nextExports);',
        '  else import.meta.hot.invalidate(invalidateMessage);',
        '}',
      ].join(' '));
    },
  };
}

const studioRequire = createRequire(import.meta.url);

function resolveRuntimeModule(specifier: string): string | undefined {
  try { return studioRequire.resolve(specifier); } catch { return undefined; }
}

/**
 * Lets a presentation be nothing but its own content. A document Studio created
 * has no `node_modules` and no build config of its own, so Studio supplies the
 * React plugin and resolves the runtime against its own installed copies. That
 * keeps the author's folder free of install steps and build scaffolding, and it
 * is why creating a presentation from the UI works immediately.
 *
 * A folder that carries its own `node_modules` is a project the author manages,
 * so its config is respected untouched.
 */
function managedRuntime(documentRoot: string) {
  const alias: Array<{ find: string | RegExp; replacement: string }> = [];
  const add = (find: string | RegExp, specifier: string) => {
    const replacement = resolveRuntimeModule(specifier);
    if (replacement) alias.push({ find, replacement });
  };
  // Most specific first: Vite applies the first alias that matches.
  add('react-dom/client', 'react-dom/client');
  add('react/jsx-dev-runtime', 'react/jsx-dev-runtime');
  add('react/jsx-runtime', 'react/jsx-runtime');
  add(/^react-dom$/, 'react-dom');
  add(/^react$/, 'react');
  add('motion/react', 'motion/react');
  add('@openpresent/core/styles.css', '@openpresent/core/styles.css');
  add('@openpresent/components/styles.css', '@openpresent/components/styles.css');
  add(/^@openpresent\/core$/, '@openpresent/core');
  add(/^@openpresent\/components$/, '@openpresent/components');
  return { alias, allow: [documentRoot, ...new Set(alias.map((entry) => dirname(entry.replacement)))] };
}

/** Runtime packages a document's own build config needs before it can be trusted. */
const SELF_MANAGED_REQUIREMENTS = ['react', 'react-dom', 'vite', '@vitejs/plugin-react'];

function documentResolves(documentRoot: string, specifier: string) {
  try {
    createRequire(join(documentRoot, 'package.json')).resolve(specifier);
    return true;
  } catch { return false; }
}

/**
 * Decides who owns the build. A folder only manages its own when it can actually
 * resolve everything its config imports: an empty or half-installed
 * `node_modules` is a common leftover, and treating its mere presence as proof
 * makes Studio honour a config that cannot load, so the presentation refuses to
 * open. Resolving for real also lets Studio adopt documents whose install was
 * never completed.
 */
export function usesManagedRuntime(documentRoot: string) {
  return !SELF_MANAGED_REQUIREMENTS.every((specifier) => documentResolves(documentRoot, specifier));
}

export function viteOptionsFor(documentRoot: string, entryPath: string) {
  if (!usesManagedRuntime(documentRoot)) return { plugins: [livePreviewPlugin(entryPath)] };
  const runtime = managedRuntime(documentRoot);
  return {
    configFile: false as const,
    plugins: [react(), livePreviewPlugin(entryPath)],
    resolve: { alias: runtime.alias },
    // Keep the dependency cache in Studio's own directory. Vite defaults to
    // node_modules/.vite inside the root, which would write build state into a
    // presentation that is meant to hold nothing but the author's content.
    cacheDir: join(studioDataRoot(), 'preview-cache', createHash('sha256').update(documentRoot).digest('hex').slice(0, 16)),
    fsAllow: runtime.allow,
  };
}
