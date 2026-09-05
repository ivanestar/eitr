import type { StackProfile } from '../../types/stack-profile.js';

// playwright.config.ts: the project's real, runnable config — generated once (create-if-absent)
// and never touched again by the engine; freely customizable.
export function renderPlaywrightConfig(
  baseUrl: string,
  profile: StackProfile,
  ciCd?: string,
): string {
  const framework = profile.framework.value;
  let serverCmd = 'npm run start';
  let serverPort = 3000;
  if (framework === 'react' || framework === 'vue' || framework === 'svelte') {
    serverCmd = 'npm run dev';
    serverPort = 5173;
  } else if (framework === 'angular') {
    serverCmd = 'npm run start';
    serverPort = 4200;
  }

  const reporters = ["['list']", "['html', { open: 'never' }]"];
  if (ciCd && ciCd !== 'none') {
    reporters.push("['junit', { outputFile: 'playwright-report/junit-results.xml' }]");
  }

  return `import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

// Edit anything here — this file is yours; the generator never overwrites it.
export default defineConfig({
  testDir: './tests',
  testIgnore: [/\\.probe\\./],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    testIdAttribute: '${profile.testIdAttribute.value.replace(/'/g, "\\'")}',
    baseURL: process.env.E2E_BASE_URL ?? '${baseUrl.replace(/'/g, "\\'")}',
    // 1. Uncomment this line to load global authentication state for all browser contexts:
    // storageState: '.auth/user.json',
  },
  reporter: [${reporters.join(', ')}],
  projects: [
    {
      name: 'chromium',
      testIgnore: [/\\.probe\\./],
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to run the suite cross-browser too:
    // {
    //   name: 'firefox',
    //   testIgnore: [/\\.probe\\./],
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   testIgnore: [/\\.probe\\./],
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  /*
  // 2. Uncomment the projects list below to configure a pre-authentication step instead of the
  // plain single-project list above:
  projects: [
    // Step 2A: Setup project (runs once before all other tests)
    {
      name: 'setup',
      testDir: './fixtures',
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
  // webServer: {
  //   command: '${serverCmd}',
  //   url: 'http://localhost:${serverPort}',
  //   reuseExistingServer: !process.env.CI,
  // },
});
`;
}
