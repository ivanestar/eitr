// fixtures/index.ts template for the generated project. create-if-absent.
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
  apiClient: async ({ context }, use) => {
    // context.request shares cookies with this test's own browser context, so an ApiClient built
    // from it reuses a cookie-based session already captured by /auth-setup (.auth/user.json)
    // instead of an unauthenticated request context. Token-based sessions still work the same way
    // via apiClient.setAuthToken(...) after an API login step - see ApiClient's own doc comment.
    const client = new ApiClient(context.request);
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
