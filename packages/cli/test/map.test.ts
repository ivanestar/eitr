import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runMap,
  crawlSiteMap,
  canonicalizeUrl,
  detectSharedWidgets,
  formatAppGraphMarkdown,
  type SiteMapRoute,
  type SiteMapReport,
} from '../src/commands/map.js';

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  },
}));

describe('eitr map command and site map crawler', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['E2E_BASE_URL'];
    delete process.env['BASE_URL'];
  });

  describe('canonicalizeUrl', () => {
    const base = 'https://app.example.com';

    it('normalizes internal relative paths and drops hashes', () => {
      const res = canonicalizeUrl('/users#details', base);
      expect(res.isValidInternal).toBe(true);
      expect(res.path).toBe('/users');
      expect(res.url).toBe('https://app.example.com/users');
    });

    it('collapses redundant duplicate slashes and strips trailing slashes', () => {
      const res = canonicalizeUrl('/users///profile/', base);
      expect(res.isValidInternal).toBe(true);
      expect(res.path).toBe('/users/profile');
      expect(res.url).toBe('https://app.example.com/users/profile');
    });

    it('sorts query parameters alphabetically and deduplicates keys', () => {
      const res = canonicalizeUrl('/search?b=2&a=1&tag=second&tag=first', base);
      expect(res.isValidInternal).toBe(true);
      expect(res.path).toBe('/search?a=1&b=2&tag=first&tag=second');
      expect(res.url).toBe('https://app.example.com/search?a=1&b=2&tag=first&tag=second');
    });

    it('rejects external domain links', () => {
      const res = canonicalizeUrl('https://evil.com/phishing', base);
      expect(res.isValidInternal).toBe(false);
      expect(res.url).toBe('');
      expect(res.path).toBe('');
    });

    it('strips standalone pagination and cursor parameters to prevent infinite loops', () => {
      const p1 = canonicalizeUrl('/feed?page=2', base);
      expect(p1.isValidInternal).toBe(true);
      expect(p1.path).toBe('/feed');
      expect(p1.url).toBe('https://app.example.com/feed');

      const p2 = canonicalizeUrl('/items?offset=40&limit=20', base);
      expect(p2.isValidInternal).toBe(true);
      expect(p2.path).toBe('/items');

      const p3 = canonicalizeUrl('/users?cursor=eyJpZCI6MTB9&per_page=50', base);
      expect(p3.isValidInternal).toBe(true);
      expect(p3.path).toBe('/users');
    });

    it('preserves non-pagination query filters while removing pagination', () => {
      const res = canonicalizeUrl('/catalog?category=books&sort=price_asc&page=3', base);
      expect(res.isValidInternal).toBe(true);
      expect(res.path).toBe('/catalog?category=books&sort=price_asc');
      expect(res.url).toBe('https://app.example.com/catalog?category=books&sort=price_asc');
    });

    it('preserves distinct categorical filters as distinct canonical routes', () => {
      const res1 = canonicalizeUrl('/shop?category=electronics&page=1', base);
      const res2 = canonicalizeUrl('/shop?category=clothing&page=2', base);
      expect(res1.path).toBe('/shop?category=electronics');
      expect(res2.path).toBe('/shop?category=clothing');
      expect(res1.path).not.toBe(res2.path);
    });

    it('handles malformed invalid URLs gracefully', () => {
      const res = canonicalizeUrl('http://[invalid-host', base);
      expect(res.isValidInternal).toBe(false);
      expect(res.url).toBe('');
    });
  });

  it('returns 0 and prints usage for --help', async () => {
    const code = await runMap(['--help']);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: eitr map');
    expect(output).toContain('--url');
    expect(output).toContain('--depth');
    expect(output).toContain('--max-pages');
    expect(output).toContain('--concurrency');
  });

  it('returns 0 and prints usage for -h', async () => {
    const code = await runMap(['-h']);
    expect(code).toBe(0);
  });

  it('returns 1 when URL cannot be resolved', async () => {
    const code = await runMap([]);
    expect(code).toBe(1);
    const err = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(err).toContain('could not resolve target URL');
  });

  it('runs successfully when explicit --url is passed', async () => {
    const { promises: fs } = await import('node:fs');
    const writeFileSpy = vi.mocked(fs.writeFile);

    const code = await runMap(['--url', 'https://app.example.com', '--output', 'test-docs']);
    expect(code).toBe(0);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('[OK] Site map generated successfully.');
    expect(output).toContain('Base URL:        https://app.example.com');
    expect(output).toContain('Routes scanned:');
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
  });

  it('runs successfully when E2E_BASE_URL env var is set', async () => {
    process.env['E2E_BASE_URL'] = 'https://env.example.com';
    const code = await runMap([]);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('[OK] Site map generated successfully.');
  });

  describe('crawlSiteMap concurrency and determinism', () => {
    it('crawls routes concurrently and returns deterministically sorted routes', async () => {
      const report = await crawlSiteMap({
        url: 'https://app.example.com',
        depth: 2,
        maxPages: 10,
        concurrency: 4,
      });

      expect(report.baseUrl).toBe('https://app.example.com');
      expect(report.totalRoutes).toBeGreaterThan(0);
      expect(report.routes.length).toBeLessThanOrEqual(10);

      // Verify deterministic alphabetical order
      const paths = report.routes.map((r) => r.path);
      const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
      expect(paths).toEqual(sortedPaths);

      // Verify internal component sorting
      for (const route of report.routes) {
        const sortedComps = [...route.components].sort();
        expect(route.components).toEqual(sortedComps);
      }
    });

    it('respects maxPages limit strictly even with high concurrency', async () => {
      const report = await crawlSiteMap({
        url: 'https://app.example.com',
        depth: 3,
        maxPages: 3,
        concurrency: 6,
      });

      expect(report.routes.length).toBe(3);
    });
  });

  describe('detectSharedWidgets', () => {
    it('extracts components with frequency >= 2 across routes', () => {
      const routes: SiteMapRoute[] = [
        {
          path: '/',
          url: 'https://example.com/',
          title: 'Home',
          depth: 0,
          status: 200,
          components: ['header.navbar', 'aside.sidebar', 'div.hero'],
        },
        {
          path: '/dashboard',
          url: 'https://example.com/dashboard',
          title: 'Dashboard',
          depth: 1,
          status: 200,
          components: ['header.navbar', 'aside.sidebar', 'div.metrics'],
        },
        {
          path: '/settings',
          url: 'https://example.com/settings',
          title: 'Settings',
          depth: 1,
          status: 200,
          components: ['header.navbar', 'form.settings-form'],
        },
      ];

      const shared = detectSharedWidgets(routes);
      expect(shared.length).toBe(2);

      const navbar = shared.find((s) => s.selector === 'header.navbar');
      expect(navbar).toBeDefined();
      expect(navbar?.frequency).toBe(3);
      expect(navbar?.routes).toEqual(['/', '/dashboard', '/settings']);
      expect(navbar?.name).toContain('NavbarWidget');

      const sidebar = shared.find((s) => s.selector === 'aside.sidebar');
      expect(sidebar).toBeDefined();
      expect(sidebar?.frequency).toBe(2);
      expect(sidebar?.routes).toEqual(['/', '/dashboard']);
    });

    it('returns empty array when all components are unique to 1 route', () => {
      const routes: SiteMapRoute[] = [
        {
          path: '/a',
          url: 'https://example.com/a',
          title: 'A',
          depth: 1,
          status: 200,
          components: ['div.a-only'],
        },
        {
          path: '/b',
          url: 'https://example.com/b',
          title: 'B',
          depth: 1,
          status: 200,
          components: ['div.b-only'],
        },
      ];
      const shared = detectSharedWidgets(routes);
      expect(shared).toEqual([]);
    });
  });

  describe('formatAppGraphMarkdown', () => {
    it('renders clean Markdown with summary table, Mermaid graph, and widget table', () => {
      const report: SiteMapReport = {
        baseUrl: 'https://example.com',
        generatedAt: '2026-08-25T00:00:00.000Z',
        totalRoutes: 2,
        routes: [
          {
            path: '/',
            url: 'https://example.com/',
            title: 'Home',
            depth: 0,
            status: 200,
            components: ['header.navbar'],
          },
          {
            path: '/dashboard',
            url: 'https://example.com/dashboard',
            title: 'Dashboard',
            depth: 1,
            status: 200,
            components: ['header.navbar'],
          },
        ],
        sharedWidgets: [
          {
            name: 'NavbarWidget',
            selector: 'header.navbar',
            frequency: 2,
            routes: ['/', '/dashboard'],
            suggestedFile: 'components/widgets/header-navbar.widget.ts',
          },
        ],
      };

      const md = formatAppGraphMarkdown(report);
      expect(md).toContain('# Application Topology & Component Graph');
      expect(md).toContain('```mermaid');
      expect(md).toContain('flowchart TD');
      expect(md).toContain('| `NavbarWidget` | `header.navbar` | 2 |');
      expect(md).toContain('this.child(NavbarWidget');
    });
  });
});
