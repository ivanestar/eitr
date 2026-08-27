/**
 * Intercepts an API endpoint on the page and responds with mock JSON data.
 */
export async function mockApiRoute(page, urlPattern, responseJson, options = {}) {
  const status = options.status ?? 200;
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      headers,
      body: JSON.stringify(responseJson),
    });
  });
}
