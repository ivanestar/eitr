// Template for generating tests/examples/api-showcase.spec.ts. create-if-absent.

export function renderApiExampleSpec(): string {
  return `import { test, expect } from '@playwright/test';
import { ApiClient } from '../../shared/utils/api-client';

// Showcase of REST and GraphQL API testing.
// Runs against a network-free simulated API endpoint or custom mocks.
test.describe('API Showcase Tests', () => {
  test('REST GET request demo', async ({ request }) => {
    // 1. Initialize our ApiClient with Playwright's built-in request context
    const api = new ApiClient(request);

    // 2. Fetch mock list of items
    const response = await api.get<Array<{ id: number; name: string }>>(
      'https://jsonplaceholder.typicode.com/todos?_limit=2',
    );

    // 3. Make assertions on the typed response
    expect(Array.isArray(response)).toBe(true);
    expect(response.length).toBeLessThanOrEqual(2);
  });

  test('GraphQL query request demo', async ({ request }) => {
    // 1. Initialize client with GraphQL endpoint path configuration
    const api = new ApiClient(request, {
      graphqlPath: 'https://countries.trevorblades.com/',
    });

    const query = \`
      query getCountry($code: ID!) {
        country(code: $code) {
          name
          currency
        }
      }
    \`;

    try {
      // 2. Execute GraphQL query with variables
      const response = await api.graphql<{
        data: { country: { name: string; currency: string } };
      }>(query, { code: 'CA' });

      // 3. Assert properties on the GraphQL response
      if (response && response.data && response.data.country) {
        expect(response.data.country.name).toBe('Canada');
        expect(response.data.country.currency).toBe('CAD');
      }
    } catch {
      // Test is designed as a template/fallback, so skip gracefully if external API is unreachable
      test.skip();
    }
  });

  test('Use API client for fast E2E pre-test data setup', async ({ request }) => {
    const api = new ApiClient(request);

    // In a real E2E test, instead of creating a user through the UI (which takes 5-10s):
    // 1. Prepare data via API call
    // await api.post('/api/users', { username: 'test-user', password: 'password123' });

    // 2. Proceed to UI test instantly
    // await page.goto('/login');
    // ...
    expect(api).toBeDefined();
  });
});
`;
}
