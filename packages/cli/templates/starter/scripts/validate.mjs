import { validateTarget } from '@openpresent/validator';

const target = new URL('../src/deck.tsx', import.meta.url).pathname;
const result = await validateTarget(target);

if (result.diagnostics.length === 0) {
  console.log('OpenPresent validation passed: src/deck.tsx');
} else {
  for (const diagnostic of result.diagnostics) {
    const slide = diagnostic.slideId ? ` [${diagnostic.slideId}]` : '';
    console.log(`${diagnostic.severity.toUpperCase()} ${diagnostic.ruleId}${slide}\n  ${diagnostic.message}\n  Fix: ${diagnostic.hint}`);
  }
}

if (!result.valid) process.exitCode = 1;
