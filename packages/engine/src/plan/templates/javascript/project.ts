/**
 * JavaScript project-level template render functions:
 * playwright.config.js, eitr.config.js, package.json, examples, fixtures, etc.
 */
import type { StackProfile } from '../../../types/stack-profile.js';

export interface JsProjectOpts {
  baseUrl: string;
  projectName: string;
}

/** eitr.config.js */
export function renderEitrJsConfig(profile: StackProfile, ciCd?: string): string {
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

  return `import { devices } from '\x40playwright/test';

export const eitrConfig = {
  testDir: './tests',
  testIgnore: [/\\.probe\\./],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
    testIdAttribute: '${profile.testIdAttribute.value.replace(/'/g, "\\'")}',
  },
  reporter: [${reporters.join(', ')}],
  projects: [
    {
      name: 'chromium',
      testIgnore: [/\\.probe\\./],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // webServer: {
  //   command: '${serverCmd}',
  //   url: 'http://localhost:${serverPort}',
  //   reuseExistingServer: !process.env.CI,
  // },
};
`;
}

/** playwright.config.js */
export function renderPlaywrightJsConfig(baseUrl: string): string {
  return `import { defineConfig, devices } from '\x40playwright/test';
import { eitrConfig } from './eitr.config.js';
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
      testMatch: /auth\\.setup\\.js/,
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

/** package.json */
export function renderJsPackageJson(projectName: string): string {
  return `{
  "name": "${projectName}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "pretest": "npm run lint:cpom",
    "test": "playwright test --project=chromium",
    "test:all": "playwright test",
    "test:ui": "playwright test --ui",
    "lint:cpom": "node scripts/lint-cpom.js",
    "lint:eslint": "eslint .",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "1.51.1",
    "dotenv": "^16.4.5",
    "eslint": "^9.9.0",
    "eslint-plugin-playwright": "^1.6.2"
  }
}
`;
}

/** tests/examples/example.spec.js */
export function renderJsExampleTest(framework?: string): string {
  let frameworkDemo = '';
  if (framework === 'react') {
    frameworkDemo = `
// React Selectors Demo: Playwright allows locating elements using React component names and props.
// Enable and customize once you have configured your React application's URL.
// test('React selector demo', async ({ page }) => {
//   await page.goto('/');
//   const submitButton = page.locator('_react=SubmitButton');
//   await submitButton.click();
//   const userCard = page.locator('_react=UserCard[name="John Doe"]');
//   await expect(userCard).toBeVisible();
// });
`;
  } else if (framework === 'vue') {
    frameworkDemo = `
// Vue Selectors Demo: Playwright allows locating elements using Vue component names and props.
// Enable and customize once you have configured your Vue application's URL.
// test('Vue selector demo', async ({ page }) => {
//   await page.goto('/');
//   const submitButton = page.locator('_vue=SubmitButton');
//   await submitButton.click();
//   const userCard = page.locator('_vue=UserCard[name="John Doe"]');
//   await expect(userCard).toBeVisible();
// });
`;
  }

  return `import { test, expect } from '\x40playwright/test';

// Base smoke test. Verify browser harness readiness and baseURL reachability.
// Edit or expand freely — generator never overwrites this file.
test('harness boots', async ({ page }) => {
  await page.setContent('<h1>ok</h1>');
  await expect(page.getByRole('heading')).toHaveText('ok');
});

// Enable once you set baseURL in playwright.config.js and add real Page Objects.
test.fixme('smoke: app is reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
${frameworkDemo}`;
}

/** tests/fixtures.js */
export function renderJsFixtures(): string {
  return `import { test as base } from '\x40playwright/test';
import { ApiClient } from '../shared/utils/api-client.js';

// Extend base test with custom Page Object and API fixtures
export const test = base.extend({
  apiClient: async ({ request }, use) => {
    const client = new ApiClient(request);
    await use(client);
    await client.cleanup();
  },
});

export { expect } from '\x40playwright/test';
`;
}

/** tests/auth.setup.js */
export function renderJsAuthSetup(): string {
  return `import { test as setup, expect } from '\x40playwright/test';
import { LoginPage } from '../components/pages/login-page.example.js';

const authFile = '.auth/user.json';

setup('authenticate', async ({ page }) => {
  const loginPage = new LoginPage(page);
  
  // 1. Navigate and perform login
  await loginPage.navigate();
  await loginPage.login('admin', 'password');
  
  // 2. Verify login completed (e.g. redirected or user badge shown)
  await expect(page).not.toHaveURL(/.*login/);
  
  // 3. Save storage state (cookies, local storage) to auth file
  await page.context().storageState({ path: authFile });
});
`;
}

/** shared/utils/api-client.js */
export function renderJsApiClient(): string {
  return `/**
 * Universal HTTP client wrapper around Playwright's APIRequestContext.
 * Handles standard REST actions (GET, POST, etc.) and GraphQL queries.
 */
export class ApiClient {
  constructor(request, options = {}) {
    this.request = request;
    this.options = options;
    this.teardownTasks = [];
  }

  /**
   * Register a teardown/cleanup function to be executed automatically after the test.
   * Tasks are executed in LIFO (Last-In-First-Out) order.
   */
  registerTeardown(cleanupFn) {
    this.teardownTasks.push(cleanupFn);
  }

  /**
   * Execute all registered teardown tasks in reverse order (LIFO).
   * Safe against individual task failures to guarantee complete cleanup.
   */
  async cleanup() {
    while (this.teardownTasks.length > 0) {
      const task = this.teardownTasks.pop();
      if (task) {
        try {
          await task();
        } catch {
          // Ignore individual errors so subsequent teardown tasks always run
        }
      }
    }
  }

  /**
   * Generate a collision-free dynamic test identifier for isolated TDM.
   */
  createUniqueId(prefix = 'id') {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Generate a unique isolated test email address for test user creation.
   */
  createTestEmail(prefix = 'user') {
    return 'test-' + prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '@example.com';
  }

  /**
   * Generate a valid E.164-compliant fake test phone number.
   */
  createTestPhone() {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    return '+1' + randomDigits;
  }

  /**
   * Generate a strong random test password meeting complexity requirements.
   */
  createTestPassword(length = 14) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pwd = 'Aa1!';
    for (let i = 4; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  /**
   * Generate a deterministic RFC 4122 v4-compliant UUID without external dependencies.
   */
  createTestUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generate a localized or general test name for user creation.
   */
  createTestName(prefix = 'User') {
    const names = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Chris'];
    const selected = names[Math.floor(Math.random() * names.length)];
    return prefix + ' ' + selected + ' ' + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  /**
   * Generate a random financial decimal amount formatted as currency.
   */
  createTestAmount(min = 10, max = 1000) {
    const val = Math.random() * (max - min) + min;
    return Number(val.toFixed(2));
  }

  /**
   * Generate an ISO date string offset from now by specified days.
   */
  createTestDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString();
  }

  get defaultHeaders() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Perform a GET request.
   */
  async get(url, headers = {}, params) {
    const response = await this.request.get(url, {
      headers: { ...this.defaultHeaders, ...headers },
      params,
    });
    return this.handleResponse(response);
  }

  /**
   * Perform a POST request.
   */
  async post(url, data, headers = {}) {
    const response = await this.request.post(url, {
      data,
      headers: { ...this.defaultHeaders, ...headers },
    });
    return this.handleResponse(response);
  }

  /**
   * Perform a PUT request.
   */
  async put(url, data, headers = {}) {
    const response = await this.request.put(url, {
      data,
      headers: { ...this.defaultHeaders, ...headers },
    });
    return this.handleResponse(response);
  }

  /**
   * Perform a PATCH request.
   */
  async patch(url, data, headers = {}) {
    const response = await this.request.patch(url, {
      data,
      headers: { ...this.defaultHeaders, ...headers },
    });
    return this.handleResponse(response);
  }

  /**
   * Perform a DELETE request.
   */
  async delete(url, headers = {}, params) {
    const response = await this.request.delete(url, {
      headers: { ...this.defaultHeaders, ...headers },
      params,
    });
    return this.handleResponse(response);
  }

  /**
   * Perform a GraphQL query or mutation.
   */
  async graphql(query, variables, headers = {}) {
    const path = this.options.graphqlPath || '/graphql';
    return this.post(path, { query, variables }, headers);
  }

  async handleResponse(response) {
    if (!response.ok()) {
      const text = await response.text();
      throw new Error('API request failed with status ' + response.status() + ': ' + text);
    }
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
`;
}

/** README.md */
export function renderJsProjectReadme(opts: JsProjectOpts): string {
  const { projectName } = opts;
  return `# ${projectName}

E2E test framework — Playwright (JavaScript).

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run all tests
npm test

# Run with UI mode
npm run test:ui
\`\`\`

Refer to \`AI.md\` for complete instructions.
`;
}

/** shared/utils/react.js */
export function renderJsReactHelpers(): string {
  return `export function wait_for_react_hydration(page) {
  // Wait for React hydration
}
`;
}

/** shared/utils/vue.js */
export function renderJsVueHelpers(): string {
  return `export function wait_for_vue_hydration(page) {
  // Wait for Vue hydration
}
`;
}

/** shared/utils/svelte.js */
export function renderJsSvelteHelpers(): string {
  return `export function wait_for_svelte_hydration(page) {
  // Wait for Svelte hydration
}
`;
}

/** shared/utils/angular.js */
export function renderJsAngularHelpers(): string {
  return `export function wait_for_angular_hydration(page) {
  // Wait for Angular hydration
}
`;
}
