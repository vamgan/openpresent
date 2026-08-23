import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@openpresent/core': `${root}packages/core/src/index.ts`,
      '@openpresent/components': `${root}packages/components/src/index.ts`,
      '@openpresent/skills': `${root}packages/skills/src/index.ts`,
      '@openpresent/validator': `${root}packages/validator/src/index.ts`,
      '@openpresent/studio': `${root}packages/studio/src/index.ts`,
      '@openpresent/mcp': `${root}packages/mcp/src/index.ts`,
    },
  },
  test: {
    include: ['packages/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    coverage: { reporter: ['text', 'json-summary'] },
  },
});
