// playwright.config.ts: the project's real, runnable config. create-if-absent — generator
// owns eitr.config.ts (the engine layer) but leaves this file alone after creation.
// Machine defaults come from eitr.config.ts (which IS regenerated); this file spreads them
// and lets you customize.
export function renderPlaywrightConfig(baseUrl: string): string {
  return `import { defineConfig, devices } from '@playwright/test';
import { eitrConfig } from './eitr.config';
import 'dotenv/config';

// Edit baseURL (and anything else) here — this file is yours; generator never overwrites it.
export default defineConfig({
  ...eitrConfig,
  use: {
    ...eitrConfig.use,
    baseURL: process.env.E2E_BASE_URL ?? '${baseUrl.replace(/'/g, "\\'")}',
    // 1. Uncomment this line to load global authentication state for all browser contexts:
    // storageState: '.auth/user.json',
  },
  /*
  // 2. Uncomment the projects list below to configure a pre-authentication step:
  projects: [
    // Step 2A: Setup project (runs once before all other tests)
    {
      name: 'setup',
      testMatch: /auth\\.setup\\.ts/,
    },
    // Step 2B: Main E2E tests (depends on the setup task above)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Tell this project's browsers to use the authenticated state:
        // storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  */
});
`;
}
