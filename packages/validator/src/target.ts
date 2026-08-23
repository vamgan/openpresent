import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveConfig, resultFromDiagnostics, type ValidatorConfigInput } from './config';
import { collectDomDiagnostics } from './dom';
import { validateModel, validateSource } from './model';
import type { Diagnostic, ValidationResult } from './types';

function uniqueDiagnostics(diagnostics: Diagnostic[]) {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [diagnostic.ruleId, diagnostic.severity, diagnostic.slideId, diagnostic.element, diagnostic.message].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function validateUrl(url: string, input: ValidatorConfigInput = {}): Promise<ValidationResult> {
  const config = resolveConfig(input);
  let playwright: typeof import('playwright');
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error('URL validation requires Playwright. Install it with "pnpm add -D playwright" and install Chromium.');
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: config.viewportWidth, height: config.viewportHeight },
      reducedMotion: 'reduce',
    });
    await page.goto(url, { waitUntil: 'networkidle' });

    const slideIds = await page.evaluate(() => {
      const runtime = document.querySelector<HTMLElement>('[data-openpresent-slide-ids]');
      const serialized = runtime?.dataset.openpresentSlideIds;
      if (serialized) {
        try {
          const parsed: unknown = JSON.parse(serialized);
          if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
        } catch {
          // Fall through to the mounted-slide hook for non-OpenPresent pages.
        }
      }
      return [...document.querySelectorAll<HTMLElement>('[data-openpresent-slide]')]
        .map((slide) => slide.dataset.openpresentSlide || slide.id)
        .filter(Boolean);
    });

    if (slideIds.length === 0) {
      throw new Error(`No OpenPresent slides were discovered at ${url}. Expected data-openpresent-slide-ids on the runtime.`);
    }

    const diagnostics: Diagnostic[] = [];
    for (const slideId of slideIds) {
      await page.evaluate((id) => {
        const hash = `#${encodeURIComponent(id)}`;
        if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else window.location.hash = hash;
      }, slideId);
      await page.waitForFunction(
        (id) => document.querySelector<HTMLElement>('[data-openpresent-slide]')?.dataset.openpresentSlide === id,
        slideId,
      );
      const current = await page.evaluate(collectDomDiagnostics, config);
      diagnostics.push(...current);
    }

    return resultFromDiagnostics(uniqueDiagnostics(diagnostics));
  } finally {
    await browser.close();
  }
}

export async function validateTarget(target: string, input: ValidatorConfigInput = {}): Promise<ValidationResult> {
  if (/^https?:\/\//i.test(target)) return validateUrl(target, input);
  let path = resolve(target);
  if (!existsSync(path)) throw new Error(`Validation target does not exist: ${path}`);
  if (statSync(path).isDirectory()) {
    const candidates = ['src/deck.tsx', 'deck.tsx', 'src/deck.ts', 'deck.ts', 'deck.json'].map((item) => resolve(path, item));
    path = candidates.find(existsSync) ?? '';
    if (!path) throw new Error(`No deck entry found in ${resolve(target)}. Expected src/deck.tsx, deck.tsx, or deck.json.`);
  }
  const source = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    try { return validateModel(JSON.parse(source), input); }
    catch (error) { throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return validateSource(source, input, path);
}
