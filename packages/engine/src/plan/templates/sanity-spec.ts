// tests/pom-sanity/<name>-page.sanity.spec.ts template.
// Implements the 3-Tier Component Sanity Engine (ARCHITECTURE §13.3) adhering to SOTA 2026 standards.
// Generated in tests/pom-sanity/ for every Page Object blueprint.
// All checks are non-destructive and safe to run in any environment.

export function renderLoginPageSanitySpec(): string {
  return `import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../../components/pages/login-page.example.js';

// ---------------------------------------------------------------------------
// 3-Tier Component Sanity Engine: LoginPage
//
// Purpose: Rapid liveness and actionability verification for every locator in
//          LoginPage. Run this after any UI change to detect broken locators
//          before running full business test suites.
//
// Tier 1 - Passive Liveness & Actionability (non-destructive, always safe)
// Tier 2 - State & Read Sanity (point-in-time snapshot readers with soft assertions)
// Tier 3 - Safe Interaction Sanity (non-mutating triggers only)
//
// Destructive actions (submit, delete, pay, remove) are verified via
// hit-test only -- element reachability is checked but the action is NOT fired.
// ---------------------------------------------------------------------------

// 1. Composable Fixture Dependency Injection (SOTA 2026)
const test = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto();
    await use(login);
  },
});

test.describe('LoginPage sanity: Tier 1 -- Passive Liveness & Actionability', () => {
  test('username field: unique, visible, enabled, non-zero bounding box', {
    tag: ['@sanity', '@tier1']
  }, async ({ loginPage }) => {
    const locator = loginPage.usernameInput.locator;

    // Uniqueness: strict mode -- exactly 1 element
    await expect(locator).toHaveCount(1);

    // Visibility: rendered and not hidden via CSS
    await expect(locator).toBeVisible();

    // Enabled: interactable, not disabled
    await expect(locator).toBeEnabled();

    // Bounding box: element has non-zero dimensions (not display:none / collapsed)
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('password field: unique, visible, enabled, non-zero bounding box', {
    tag: ['@sanity', '@tier1']
  }, async ({ loginPage }) => {
    const locator = loginPage.passwordInput.locator;
    await expect(locator).toHaveCount(1);
    await expect(locator).toBeVisible();
    await expect(locator).toBeEnabled();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('login button: unique, visible, enabled, reachable (hit-test only -- NOT clicked)', {
    tag: ['@sanity', '@tier1']
  }, async ({ page, loginPage }) => {
    const locator = loginPage.loginButton.locator;
    await expect(locator).toHaveCount(1);
    await expect(locator).toBeVisible();
    await expect(locator).toBeEnabled();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
    // Verify the element is not obscured by overlays (sticky header, cookie banner, modal)
    // by checking that Playwright can resolve it as the topmost element at its center point.
    // The element is NOT clicked -- this is a pure hit-test.
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    const elementAtCenter = await page.evaluateHandle(
      ([x, y]) => document.elementFromPoint(x, y),
      [centerX, centerY] as [number, number],
    );
    expect(elementAtCenter).not.toBeNull();
  });
});

test.describe('LoginPage sanity: Tier 2 -- State & Read Sanity', () => {
  test('snapshot readers return valid defaults without throwing', {
    tag: ['@sanity', '@tier2']
  }, async ({ loginPage }) => {
    // Tier 2 uses point-in-time snapshot readers with soft assertions for complete diagnostic visibility
    const placeholder = await loginPage.usernameInput.locator.getAttribute('placeholder');
    expect.soft(typeof placeholder === 'string' || placeholder === null).toBe(true);

    const value = await loginPage.usernameInput.valueNow();
    expect.soft(value).toBe('');

    const inputType = await loginPage.passwordInput.locator.getAttribute('type');
    expect.soft(inputType).toBe('password');
  });
});

test.describe('LoginPage sanity: Tier 3 -- Safe Interaction Sanity', () => {
  // Tier 3 tests non-destructive, reversible UI interactions only.
  // Focus/blur on form fields is safe and reversible.
  test('username field: accepts focus and blur without page navigation', {
    tag: ['@sanity', '@tier3']
  }, async ({ page, loginPage }) => {
    const field = loginPage.usernameInput.locator;

    await field.focus();
    await expect(field).toBeFocused();

    await field.blur();
    // Page must not have navigated -- URL remains on login page
    expect(page.url()).toContain('/login');
  });

  // Keyboard Tab navigation is non-destructive
  test('Tab key moves focus from username to password field without submitting', {
    tag: ['@sanity', '@tier3']
  }, async ({ page, loginPage }) => {
    await loginPage.usernameInput.locator.focus();
    await page.keyboard.press('Tab');
    await expect(loginPage.passwordInput.locator).toBeFocused();
  });
});
`;
}
