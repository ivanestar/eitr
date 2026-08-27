// shared/utils/svelte.ts template for the generated project. create-if-absent.
export function renderSvelteHelpers(): string {
  return `import type { Page } from '@playwright/test';

/**
 * Helper utilities for testing Svelte / SvelteKit applications.
 */

/**
 * Wait for Svelte hydration to complete by waiting for network idle and the document state.
 * This helps avoid "click race conditions" where components are visible but not yet interactive.
 */
export async function waitForSvelteHydration(page: Page): Promise<void> {
  // Wait for the document to be fully loaded
  await page.waitForLoadState('domcontentloaded');
  // Wait for network requests to settle (hydration bundles, chunks)
  await page.waitForLoadState('networkidle');
  // Wait for a small frame request to ensure main thread has had a chance to run hydration
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
`;
}
