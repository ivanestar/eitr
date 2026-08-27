// shared/utils/angular.ts template for the generated project. create-if-absent.
export function renderAngularHelpers(): string {
  return `import type { Page } from '@playwright/test';

/**
 * Helper utilities for testing Angular applications.
 */

/**
 * Wait for Angular bootstrapping and Zone.js stability to ensure all change detection
 * cycles and microtasks have completed before proceeding.
 */
export async function waitForAngularHydration(page: Page): Promise<void> {
  // Wait for the document to be fully loaded
  await page.waitForLoadState('domcontentloaded');
  // Wait for network requests to settle
  await page.waitForLoadState('networkidle');
  // Wait for Angular Zone.js stability if running in development mode
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const testabilities = (window as any).getAllAngularTestabilities;
      if (typeof testabilities === 'function') {
        const list = testabilities();
        if (list && list.length > 0) {
          let count = list.length;
          const done = () => {
            count--;
            if (count === 0) resolve();
          };
          for (const testability of list) {
            testability.whenStable(done);
          }
          return;
        }
      }
      // Fallback: wait for the next frame
      requestAnimationFrame(() => resolve());
    });
  });
}
`;
}
