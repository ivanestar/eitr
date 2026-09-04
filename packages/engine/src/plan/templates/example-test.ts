// tests/example.spec.ts: a create-if-absent starting point the user owns. The network-free first
// test is always green once browsers are installed; the real-app smoke is a test.fixme placeholder
// (shows as pending, never red) until you add real Page Objects.
export function renderExampleTest(_framework?: string): string {
  return `import { test, expect } from './fixtures';

// Base smoke test. Verify browser harness readiness and baseURL reachability.
// Edit or expand freely — generator never overwrites this file.
test('harness boots', async ({ page }) => {
  await page.setContent('<h1>ok</h1>');
  await expect(page.getByRole('heading')).toHaveText('ok');
});

// Enable once you set baseURL in playwright.config.ts and add real Page Objects.
test.fixme('smoke: app is reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});

// Fixture injection example (custom fixtures from tests/fixtures.ts):
// test('example with api client', async ({ page, apiClient }) => {
//   const id = apiClient.createUniqueId('item');
//   await page.goto('/');
// });
`;
}
