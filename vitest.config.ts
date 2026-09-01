import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Only run the engine/CLI unit tests — never scan generated projects (e.g. a PlaywrightTests/
// generated into this repo), whose *.spec.ts belong to Playwright, not vitest.
export default defineConfig({
  resolve: {
    alias: {
      '@eitr/engine': path.resolve(import.meta.dirname, './packages/engine/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
