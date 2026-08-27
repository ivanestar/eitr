// tests/fixtures.ts template for the generated project. create-if-absent.
export function renderFixtures(): string {
  return `import { test as base } from '@playwright/test';
import { ApiClient } from '../shared/utils/api-client.js';

// Define custom fixtures type
export interface MyFixtures {
  apiClient: ApiClient;
  // Add your Page Objects here:
  // dashboardPage: DashboardPage;
}

// Extend base test with custom fixtures
export const test = base.extend<MyFixtures>({
  apiClient: async ({ request }, use) => {
    const client = new ApiClient(request);
    await use(client);
    await client.cleanup();
  },
  // dashboardPage: async ({ page }, use) => {
  //   const pageObject = new DashboardPage(page);
  //   await use(pageObject);
  // },
});

export { expect } from '@playwright/test';
`;
}
