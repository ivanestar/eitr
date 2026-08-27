// tests/example.spec.ts: a create-if-absent starting point the user owns. The network-free first
// test is always green once browsers are installed; the real-app smoke is a test.fixme placeholder
// (shows as pending, never red) until you add real Page Objects. The CPOM pattern itself is shown
// in the regenerated tests/cpom-showcase.spec.ts.
export function renderExampleTest(framework?: string): string {
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

  return `import { test, expect } from '@playwright/test';

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
${frameworkDemo}`;
}
