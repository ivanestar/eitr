import { describe, it, expect, afterAll } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderSiteMapHtml } from '../src/plan/templates/site-map-html.js';

// Real-browser tests (via Chromium), not content-string assertions: the bug this file guards
// against - fetch('./site-map.json') silently failing under the file:// protocol with no
// actionable feedback - can only be observed by actually loading the rendered page in a browser.
// A `.toContain(...)` check on the JS source text would not have caught the original bug (a
// missing capability, not wrong text) and would not catch a future regression that breaks the
// runtime behavior while leaving the surrounding strings intact.

let browser: Browser | undefined;

afterAll(async () => {
  await browser?.close();
});

const SITE_MAP = {
  schemaVersion: 2,
  generatedAt: '2026-09-02T10:00:00.000Z',
  baseUrl: 'https://example.com',
  routes: {
    '/checkout': {
      routeId: 'route-checkout',
      sampleUrls: ['https://example.com/checkout'],
      title: 'Checkout',
      regions: ['header', 'main'],
      components: ['CheckoutForm'],
      discoveredAt: '2026-09-02T10:00:00.000Z',
      lastCheckedAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'abc123',
      status: 'active',
    },
  },
  sharedWidgets: ['NavWidget'],
};

describe('docs/site-map/site-map.html (real Chromium execution)', () => {
  it('opened directly via file:// (fetch() blocked): shows an actionable message and a working manual file-picker fallback', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-site-map-html-'));
    try {
      const htmlPath = join(dir, 'site-map.html');
      writeFileSync(htmlPath, renderSiteMapHtml('https://example.com/'), 'utf8');
      // Deliberately no site-map.json written alongside it - reproduces the exact real-world
      // scenario (opening the file before running /map-site, or opening it via file:// at all).

      browser ??= await chromium.launch();
      const page = await browser.newPage();
      try {
        await page.goto(pathToFileURL(htmlPath).href);
        await page.waitForFunction(() =>
          document.getElementById('status')?.classList.contains('error'),
        );

        const status = await page.textContent('#status');
        expect(status).toContain('Browsers block a local file from fetching');
        expect(status).toContain('Choose site-map.json manually');
        const statusClass = await page.getAttribute('#status', 'class');
        expect(statusClass).toContain('error');
        const btnHiddenBefore = await page.getAttribute('#chooseFileBtn', 'hidden');
        expect(btnHiddenBefore).toBeNull();

        // The manual fallback must actually work end to end, not just be visible.
        const jsonPath = join(dir, 'picked-site-map.json');
        writeFileSync(jsonPath, JSON.stringify(SITE_MAP, null, 2), 'utf8');
        const fileInput = await page.$('#fileInput');
        await fileInput!.setInputFiles(jsonPath);
        await page.waitForFunction(
          () => !document.getElementById('status')?.classList.contains('error'),
        );

        const statusAfterPick = await page.textContent('#status');
        expect(statusAfterPick).toContain('1 route(s)');
        const btnHiddenAfter = await page.getAttribute('#chooseFileBtn', 'hidden');
        expect(btnHiddenAfter).not.toBeNull();
        const tableHidden = await page.getAttribute('#routesTable', 'hidden');
        expect(tableHidden).toBeNull();
        const rowCount = await page.$$eval('#routesBody tr', (rows) => rows.length);
        expect(rowCount).toBe(1);
        const firstCellText = await page.$eval('#routesBody tr td', (td) => td.textContent ?? '');
        expect(firstCellText).toContain('/checkout');
      } finally {
        await page.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('served over HTTP (fetch() succeeds): loads and renders site-map.json without any manual fallback', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-site-map-html-http-'));
    try {
      writeFileSync(join(dir, 'site-map.html'), renderSiteMapHtml('https://example.com/'), 'utf8');
      writeFileSync(join(dir, 'site-map.json'), JSON.stringify(SITE_MAP, null, 2), 'utf8');

      browser ??= await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        // Playwright's own request-interception routing stands in for a local static-file server
        // (serving files straight out of `dir`), rather than hand-rolling http.createServer.
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          const relPath = url.pathname === '/' ? 'site-map.html' : url.pathname.slice(1);
          try {
            const fs = await import('node:fs/promises');
            const body = await fs.readFile(join(dir, relPath));
            const contentType = relPath.endsWith('.json') ? 'application/json' : 'text/html';
            await route.fulfill({ status: 200, contentType, body });
          } catch {
            await route.fulfill({ status: 404, body: 'not found' });
          }
        });
        await page.goto('http://local.test/');
        await page.waitForFunction(() =>
          (document.getElementById('status')?.textContent ?? '').includes('route(s)'),
        );

        const status = await page.textContent('#status');
        expect(status).toContain('1 route(s)');
        const statusClass = await page.getAttribute('#status', 'class');
        expect(statusClass ?? '').not.toContain('error');
        const btnHidden = await page.getAttribute('#chooseFileBtn', 'hidden');
        expect(btnHidden).not.toBeNull();
        const rowCount = await page.$$eval('#routesBody tr', (rows) => rows.length);
        expect(rowCount).toBe(1);
      } finally {
        await context.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
