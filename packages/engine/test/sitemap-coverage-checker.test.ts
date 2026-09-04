import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { renderSitemapCoverageChecker } from '../src/plan/templates/sitemap-coverage-checker.js';

// A tiny local HTTP server standing in for the target site's robots.txt/sitemap.xml, so the real
// script's real fetch() calls have something deterministic to hit - no network dependency, no
// mocking framework, matches this repo's own zero-dependency script style.
let server: Server;
let baseUrl: string;
let routes: Record<string, { status: number; body: string; contentType?: string }> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    const route = routes[req.url ?? ''];
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(route.status, { 'Content-Type': route.contentType ?? 'text/plain' });
    res.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function setupProject(siteMapRoutes: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-sitemap-coverage-'));
  writeFileSync(join(dir, 'check-sitemap-coverage.mjs'), renderSitemapCoverageChecker(), 'utf8');
  mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'site-map', 'site-map.json'),
    JSON.stringify({
      schemaVersion: 2,
      generatedAt: '2026-09-04T10:00:00.000Z',
      baseUrl,
      routes: siteMapRoutes,
    }),
    'utf8',
  );
  return dir;
}

// Async spawn, not spawnSync: the local HTTP server above lives in this same test process, and
// spawnSync blocks this process's entire event loop until the child exits - the server could never
// actually accept the child's connection, so every request would hang until the child's own fetch
// timeout gave up. Confirmed by direct repro before writing it this way.
function run(dir: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['check-sitemap-coverage.mjs'], { cwd: dir });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('scripts/check-sitemap-coverage.mjs (real execution against a local HTTP server)', () => {
  it('reports SKIPPED when docs/site-map/site-map.json does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-sitemap-coverage-'));
    writeFileSync(join(dir, 'check-sitemap-coverage.mjs'), renderSitemapCoverageChecker(), 'utf8');
    try {
      const result = await run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('SKIPPED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports SKIPPED, not an error, when neither robots.txt nor /sitemap.xml is reachable', async () => {
    routes = {};
    const dir = setupProject({ '/': { routeId: 'r1' } });
    try {
      const result = await run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('SKIPPED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('follows a Sitemap: directive in robots.txt and reports no gaps when every URL is already known', async () => {
    routes = {
      '/robots.txt': { status: 200, body: `User-agent: *\nSitemap: ${baseUrl}/my-sitemap.xml\n` },
      '/my-sitemap.xml': {
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0"?><urlset><url><loc>${baseUrl}/</loc></url><url><loc>${baseUrl}/about</loc></url></urlset>`,
      },
    };
    const dir = setupProject({
      '/': { routeId: 'r1' },
      '/about': { routeId: 'r2' },
    });
    try {
      const result = await run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('CHECKED');
      expect(output.totalSitemapUrls).toBe(2);
      expect(output.gaps).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to /sitemap.xml when robots.txt has no Sitemap: directive, and flags a real gap', async () => {
    routes = {
      '/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /admin\n' },
      '/sitemap.xml': {
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0"?><urlset><url><loc>${baseUrl}/</loc></url><url><loc>${baseUrl}/hidden-page</loc></url></urlset>`,
      },
    };
    const dir = setupProject({ '/': { routeId: 'r1' } });
    try {
      const result = await run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('CHECKED');
      expect(output.gaps).toHaveLength(1);
      expect(output.gaps[0].canonicalPath).toBe('/hidden-page');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canonicalizes a numeric-ID sitemap URL to match a {id}-templated route key - no false-positive gap', async () => {
    routes = {
      '/robots.txt': { status: 404, body: '' },
      '/sitemap.xml': {
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0"?><urlset><url><loc>${baseUrl}/products/123</loc></url></urlset>`,
      },
    };
    const dir = setupProject({ '/products/{id}': { routeId: 'r1' } });
    try {
      const result = await run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('CHECKED');
      expect(output.gaps).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('follows one level of a <sitemapindex> and collects the child sitemap URLs', async () => {
    routes = {
      '/robots.txt': { status: 404, body: '' },
      '/sitemap.xml': {
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0"?><sitemapindex><sitemap><loc>${baseUrl}/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
      },
      '/sitemap-pages.xml': {
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0"?><urlset><url><loc>${baseUrl}/from-index</loc></url></urlset>`,
      },
    };
    const dir = setupProject({ '/': { routeId: 'r1' } });
    try {
      const result = await run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('CHECKED');
      expect(output.totalSitemapUrls).toBe(1);
      expect(output.gaps[0].canonicalPath).toBe('/from-index');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
