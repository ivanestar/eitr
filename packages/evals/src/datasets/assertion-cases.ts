/**
 * Golden Dataset of Anti-Fake-Green Assertion Flaws
 */

export interface GoldenAssertionCase {
  id: string;
  name: string;
  flawedCode: string;
  expectedViolations: string[];
  correctedCodeSnippet: string;
}

export const GOLDEN_ASSERTION_CASES: GoldenAssertionCase[] = [
  {
    id: 'ASSERT-01-UNAWAITED-PROMISE',
    name: 'Unawaited Promise in Assertion',
    flawedCode: `
import { test } from '@fixtures';

test('verify success message', async ({ loginPage }) => {
  await loginPage.open();
  await loginPage.login('user@example.com', 'pass');
  expect(loginPage.successBanner.isVisible()).toBeTruthy();
});
`,
    expectedViolations: [
      'Unawaited Promise Guard: isVisible() inside expect() returns Promise<boolean> which is always truthy',
    ],
    correctedCodeSnippet: 'await expect(loginPage.successBanner.locator).toBeVisible();',
  },
  {
    id: 'ASSERT-02-SNAPSHOT-IN-ASSERT',
    name: 'Snapshot Now() Getter in Assert instead of Web-First',
    flawedCode: `
import { test } from '@fixtures';

test('verify status badge', async ({ userPage }) => {
  await userPage.open();
  expect(await userPage.badge.isActiveNow()).toBe(true);
});
`,
    expectedViolations: [
      'Point-in-time snapshot getter isActiveNow() used in test without auto-retry; use web-first assertion instead',
    ],
    correctedCodeSnippet: 'await expect(userPage.badge.locator).toHaveClass(/active/);',
  },
];
