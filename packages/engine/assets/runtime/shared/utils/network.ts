import type { Page, Route } from '@playwright/test';

export interface MockApiOptions {
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Intercepts an API endpoint on the page and responds with mock JSON data.
 */
export async function mockApiRoute(
  page: Page,
  urlPattern: string | RegExp,
  responseJson: unknown,
  options: MockApiOptions = {},
): Promise<void> {
  const status = options.status ?? 200;
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };

  await page.route(urlPattern, async (route: Route) => {
    await route.fulfill({
      status,
      headers,
      body: JSON.stringify(responseJson),
    });
  });
}
