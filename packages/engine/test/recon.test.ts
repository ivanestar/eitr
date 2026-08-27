import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recon } from '../src/detect/recon.js';

describe('recon (live URL profiling)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('detects react, mui, and data-testid', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>React App</title>
          <script src="/static/js/react.production.min.js"></script>
        </head>
        <body>
          <div id="root">
            <button class="MuiButton-root MuiButton-contained" data-testid="login-btn">Login</button>
          </div>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const result = await recon('http://example.com');
    expect(result.framework).toBe('react');
    expect(result.uiLibraries).toHaveLength(1);
    expect(result.uiLibraries[0].id).toBe('mui');
    expect(result.testIdAttribute).toBe('data-testid');
  });

  it('detects vue, antd, and data-test-id', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Vue App</title>
        </head>
        <body>
          <div id="app" data-v-123456>
            <button class="ant-btn ant-btn-primary" data-test-id="submit-btn">Submit</button>
          </div>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const result = await recon('http://example.com');
    expect(result.framework).toBe('vue');
    expect(result.uiLibraries).toHaveLength(1);
    expect(result.uiLibraries[0].id).toBe('antd');
    expect(result.testIdAttribute).toBe('data-test-id');
  });

  it('detects svelte, radix, and data-qa', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Svelte App</title>
        </head>
        <body>
          <div class="svelte-1a2b3c">
            <button data-radix-collection data-qa="btn">Click me</button>
          </div>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const result = await recon('http://example.com');
    expect(result.framework).toBe('svelte');
    expect(result.uiLibraries).toHaveLength(1);
    expect(result.uiLibraries[0].id).toBe('radix');
    expect(result.testIdAttribute).toBe('data-qa');
  });

  it('detects angular, tailwind, and data-cy', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Angular App</title>
          <link rel="stylesheet" href="/tailwind.css">
        </head>
        <body ng-version="16.0.0">
          <app-root>
            <button class="flex items-center justify-between p-4" data-cy="click-me">Click</button>
          </app-root>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const result = await recon('http://example.com');
    expect(result.framework).toBe('angular');
    expect(result.uiLibraries).toHaveLength(1);
    expect(result.uiLibraries[0].id).toBe('tailwind');
    expect(result.testIdAttribute).toBe('data-cy');
  });

  it('returns empty result gracefully on network fail or non-ok response', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS Timeout'));

    const result1 = await recon('http://nonexistent.url');
    expect(result1.framework).toBeUndefined();
    expect(result1.uiLibraries).toHaveLength(0);
    expect(result1.testIdAttribute).toBeUndefined();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
    } as Response);

    const result2 = await recon('http://nonexistent.url');
    expect(result2.framework).toBeUndefined();
    expect(result2.uiLibraries).toHaveLength(0);
  });
});
