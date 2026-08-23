import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Keep the suite out of the real user data and documents directories: opening a
// presentation records it in the library, and tests must never write there.
process.env.OPENPRESENT_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'openpresent-test-data-'));
process.env.OPENPRESENT_DOCUMENTS_DIR ??= mkdtempSync(join(tmpdir(), 'openpresent-test-docs-'));

afterEach(cleanup);

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  })) as typeof window.matchMedia;
}
