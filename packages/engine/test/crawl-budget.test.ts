import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCrawlBudget } from '../src/plan/templates/crawl-budget.js';
import { renderDebugLog } from '../src/plan/templates/debug-log.js';

const BASE = 'https://app.example.com';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-crawl-budget-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'crawl-budget.mjs'), renderCrawlBudget(), 'utf8');
  writeFileSync(join(dir, 'scripts', 'debug-log.mjs'), renderDebugLog(), 'utf8');
  return dir;
}

function run(dir: string, args: string[], env: NodeJS.ProcessEnv = {}): any {
  const result = spawnSync('node', [join('scripts', 'crawl-budget.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { ...JSON.parse(result.stdout), exitCode: result.status };
}

function start(dir: string, extra: string[] = []) {
  return run(dir, ['start', `--base-url=${BASE}`, ...extra]);
}

// Visibility is required on every check, so the default here is the ordinary case - a link actually
// rendered on a page the crawler loaded. Tests about invisible links pass it explicitly.
function check(dir: string, url: string, depth = 1, visible = true) {
  return run(dir, ['check', `--url=${url}`, `--depth=${depth}`, `--visible=${visible}`]);
}

describe('scripts/crawl-budget.mjs (real execution)', () => {
  it('refuses to act before a pass has been started', () => {
    const dir = setupProject();
    try {
      const output = run(dir, ['check', `--url=${BASE}/a`, '--depth=1']);
      expect(output.exitCode).toBe(1);
      expect(output.error).toContain('no active crawl budget');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('start applies documented defaults with no options passed (zero-config)', () => {
    const dir = setupProject();
    try {
      const output = start(dir);
      expect(output.origin).toBe(BASE);
      expect(output.role).toBeNull();
      expect(output.limits).toEqual({
        maxPages: 500,
        maxDepth: 6,
        maxPerTemplate: 20,
        maxPerContentHash: 3,
        duplicateTemplateWarnAt: 3,
        maxPerParent: 12,
        maxScrolls: 2,
        allowInvisible: false,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('admits an ordinary same-origin page and hands back its canonical path', () => {
    const dir = setupProject();
    try {
      start(dir);
      const output = check(dir, `${BASE}/settings/profile`);
      expect(output.decision).toBe('visit');
      expect(output.canonicalPath).toBe('/settings/profile');
      expect(output.firstOfTemplate).toBe(true);
      expect(output.budget.pagesClaimed).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collapses numeric, UUID, long-hex and ISO-date path segments into one template', () => {
    const dir = setupProject();
    try {
      start(dir);
      expect(check(dir, `${BASE}/users/42`).canonicalPath).toBe('/users/{id}');
      expect(check(dir, `${BASE}/users/43`).canonicalPath).toBe('/users/{id}');
      expect(check(dir, `${BASE}/users/3f9a2b7e-4c1d-4e8a-9f2b-1a7c6d5e4f3a`).canonicalPath).toBe(
        '/users/{id}',
      );
      expect(check(dir, `${BASE}/users/507f1f77bcf86cd799439011`).canonicalPath).toBe(
        '/users/{id}',
      );
      expect(check(dir, `${BASE}/reports/2026-09-08`).canonicalPath).toBe('/reports/{date}');
      // Five URLs, two templates. Asserted on the claimed count rather than canonicalRoutes, which
      // only counts templates a visit confirmed to be a real page - nothing was visited here.
      expect(run(dir, ['report']).budget.templatesClaimed).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not collapse a segment that merely ends in a number', () => {
    const dir = setupProject();
    try {
      start(dir);
      expect(check(dir, `${BASE}/page-2`).canonicalPath).toBe('/page-2');
      expect(check(dir, `${BASE}/page-3`).canonicalPath).toBe('/page-3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('strips volatile pagination and cursor parameters so a feed collapses to one URL', () => {
    const dir = setupProject();
    try {
      start(dir);
      const first = check(dir, `${BASE}/feed?page=1&cursor=abc`);
      expect(first.decision).toBe('visit');
      expect(first.normalizedUrl).toBe(`${BASE}/feed`);
      expect(check(dir, `${BASE}/feed?page=2`).reason).toBe('already-claimed');
      expect(check(dir, `${BASE}/feed?offset=500&limit=20`).reason).toBe('already-claimed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a meaningful query parameter and orders parameters stably', () => {
    const dir = setupProject();
    try {
      start(dir);
      const first = check(dir, `${BASE}/search?q=invoice&sort=asc`);
      expect(first.decision).toBe('visit');
      expect(check(dir, `${BASE}/search?sort=asc&q=invoice`).reason).toBe('already-claimed');
      expect(check(dir, `${BASE}/search?q=refund`).decision).toBe('visit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores the fragment when deciding whether a URL is already claimed', () => {
    const dir = setupProject();
    try {
      start(dir);
      expect(check(dir, `${BASE}/docs`).decision).toBe('visit');
      expect(check(dir, `${BASE}/docs#section-2`).reason).toBe('already-claimed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects links to files rather than pages', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const asset of [
        '/download/sample.docx',
        '/download/menu.pdf',
        '/download/menu.csv',
        '/download/menu.xls',
        '/assets/logo.png',
        '/archive/backup.zip',
        '/static/app.js',
      ]) {
        expect(check(dir, `${BASE}${asset}`).reason).toBe('non-html-asset');
      }
      expect(run(dir, ['report']).budget.pagesClaimed).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-http schemes and cross-origin links', () => {
    const dir = setupProject();
    try {
      start(dir);
      expect(check(dir, 'mailto:support@example.com').reason).toBe('unsupported-scheme');
      expect(check(dir, 'tel:+15551234').reason).toBe('unsupported-scheme');
      expect(check(dir, 'javascript:void(0)').reason).toBe('unsupported-scheme');
      expect(check(dir, 'https://twitter.com/example').reason).toBe('cross-origin');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps concrete URLs per canonical template, which is what stops a pagination chain', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-per-template=3']);
      expect(check(dir, `${BASE}/infinite_scroll/1`).decision).toBe('visit');
      expect(check(dir, `${BASE}/infinite_scroll/2`).decision).toBe('visit');
      expect(check(dir, `${BASE}/infinite_scroll/3`).decision).toBe('visit');
      const stopped = check(dir, `${BASE}/infinite_scroll/4`);
      expect(stopped.decision).toBe('skip');
      expect(stopped.reason).toBe('max-per-template');
      expect(check(dir, `${BASE}/infinite_scroll/5441`).reason).toBe('max-per-template');
      expect(run(dir, ['report']).coverage).toEqual({
        boundedBy: 'maxPerTemplate',
        pagesVisited: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces the page ceiling and records which bound stopped the pass', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-pages=2']);
      expect(check(dir, `${BASE}/a`).decision).toBe('visit');
      expect(check(dir, `${BASE}/b`).decision).toBe('visit');
      const stopped = check(dir, `${BASE}/c`);
      expect(stopped.decision).toBe('skip');
      expect(stopped.reason).toBe('max-pages');
      expect(run(dir, ['report']).coverage.boundedBy).toBe('maxPages');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces the depth ceiling', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-depth=2']);
      expect(check(dir, `${BASE}/a`, 2).decision).toBe('visit');
      const stopped = check(dir, `${BASE}/b`, 3);
      expect(stopped.decision).toBe('skip');
      expect(stopped.reason).toBe('max-depth');
      expect(run(dir, ['report']).coverage.boundedBy).toBe('maxDepth');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports coverage as null when no bound was hit, so an exhaustive crawl omits the field', () => {
    const dir = setupProject();
    try {
      start(dir);
      check(dir, `${BASE}/a`);
      run(dir, ['visited', `--url=${BASE}/a`, '--status=200', '--content-type=text/html']);
      const report = run(dir, ['report']);
      expect(report.coverage).toBeNull();
      expect(report.budget.pagesVisited).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a route whose response turned out not to be a page', () => {
    const dir = setupProject();
    try {
      start(dir);
      check(dir, `${BASE}/export`);
      const output = run(dir, [
        'visited',
        `--url=${BASE}/export`,
        '--status=200',
        '--content-type=application/octet-stream',
      ]);
      expect(output.keep).toBe(false);
      expect(output.reason).toBe('non-html-response');
      expect(run(dir, ['report']).budget.pagesVisited).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live-observed: /about, /contact-us, /gallery and /portfolio entered a crawl of a site that
  // returns 404 for all four. Their links are rendered, so visibility does not catch them - only
  // the status does, and it was already being passed in.
  it('drops a route the server says does not exist', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const missing of ['/about', '/contact-us', '/gallery', '/portfolio']) {
        check(dir, `${BASE}${missing}`);
        const visited = run(dir, [
          'visited',
          `--url=${BASE}${missing}`,
          '--status=404',
          '--content-type=text/html',
        ]);
        expect(visited.keep, `${missing} was kept`).toBe(false);
        expect(visited.reason).toBe('not-found');
      }
      expect(run(dir, ['report']).budget.pagesVisited).toBe(0);
      expect(run(dir, ['report']).skipped['not-found']).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a 410 the same way, and nothing else in the 4xx range', () => {
    const dir = setupProject();
    try {
      start(dir);
      const visitWith = (path: string, status: number) => {
        check(dir, `${BASE}${path}`);
        return run(dir, [
          'visited',
          `--url=${BASE}${path}`,
          `--status=${status}`,
          '--content-type=text/html',
        ]);
      };
      expect(visitWith('/gone', 410).keep).toBe(false);
      // A protected route is the opposite of an absent one - something real is behind it, and
      // dropping it would delete the only evidence of an auth boundary a crawl can produce.
      expect(visitWith('/basic_auth', 401).keep).toBe(true);
      expect(visitWith('/download_secure', 403).keep).toBe(true);
      // And it stays a route whatever body the challenge answers with. Live-observed: /digest_auth
      // vanished from a crawl that kept /basic_auth, because the content type was tested first.
      check(dir, `${BASE}/digest_auth`);
      const digest = run(dir, [
        'visited',
        `--url=${BASE}/digest_auth`,
        '--status=401',
        '--content-type=text/plain',
      ]);
      expect(digest.keep).toBe(true);
      expect(run(dir, ['report']).canonicalRoutes).toContain('/digest_auth');
      // A route that exists and is erroring is a finding, not a non-route.
      expect(visitWith('/broken', 500).keep).toBe(true);
      expect(visitWith('/teapot', 418).keep).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The count a human reads must be the count of real pages. perTemplate is filled at check time,
  // before anything is known about what the server returns, so reporting from it announced 59
  // canonical routes for a crawl where four were missing pages and one was a Python script.
  it('counts only templates that turned out to be pages', () => {
    const dir = setupProject();
    try {
      start(dir);
      const visit = (path: string, status: number, contentType = 'text/html') => {
        check(dir, `${BASE}${path}`);
        return run(dir, [
          'visited',
          `--url=${BASE}${path}`,
          `--status=${status}`,
          `--content-type=${contentType}`,
        ]);
      };
      visit('/real', 200);
      visit('/also-real', 200);
      visit('/about', 404);
      visit('/export', 200, 'application/octet-stream');

      const report = run(dir, ['report']);
      expect(report.canonicalRoutes).toEqual(['/also-real', '/real']);
      expect(report.budget.canonicalRoutes).toBe(2);
      // The claimed count stays visible, because budget accounting genuinely did spend four slots.
      expect(report.budget.templatesClaimed).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects source files a site offers for download', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const asset of ['/download/get_ssh.py', '/scripts/deploy.sh', '/lib/app.jar']) {
        expect(check(dir, `${BASE}${asset}`).reason).toBe('non-html-asset');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a route whose content type carries a charset suffix', () => {
    const dir = setupProject();
    try {
      start(dir);
      check(dir, `${BASE}/a`);
      const output = run(dir, [
        'visited',
        `--url=${BASE}/a`,
        '--status=200',
        '--content-type=text/html; charset=utf-8',
      ]);
      expect(output.keep).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits a progress line only once the announce threshold is crossed', () => {
    const dir = setupProject();
    try {
      start(dir);
      let announced: string | null = null;
      for (let i = 1; i <= 25; i += 1) {
        check(dir, `${BASE}/p${i}`);
        const visited = run(dir, [
          'visited',
          `--url=${BASE}/p${i}`,
          '--status=200',
          '--content-type=text/html',
        ]);
        if (i < 25) expect(visited.announce).toBeNull();
        if (visited.announce) announced = visited.announce;
      }
      expect(announced).toContain('25/500 pages visited');
      expect(announced).toContain('25 canonical routes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('progress is readable on demand and counts every skip reason', () => {
    const dir = setupProject();
    try {
      start(dir, ['--role=admin']);
      check(dir, `${BASE}/a.pdf`);
      check(dir, 'mailto:a@b.c');
      const output = run(dir, ['progress']);
      expect(output.line).toContain('[admin]');
      expect(output.line).toContain('2 links skipped');
      expect(output.skipped).toEqual({ 'non-html-asset': 1, 'unsupported-scheme': 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('start resets the budget so each role pass gets its own bounds', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-pages=1', '--role=admin']);
      expect(check(dir, `${BASE}/a`).decision).toBe('visit');
      expect(check(dir, `${BASE}/b`).reason).toBe('max-pages');
      start(dir, ['--max-pages=1', '--role=viewer']);
      expect(check(dir, `${BASE}/a`).decision).toBe('visit');
      expect(run(dir, ['report']).role).toBe('viewer');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a start without a usable base URL', () => {
    const dir = setupProject();
    try {
      expect(run(dir, ['start']).exitCode).toBe(1);
      expect(run(dir, ['start', '--base-url=not-a-url']).exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The live incident: 5441 pages of one "next page" chain, every one rendering the same structure.
  it('stops a template on the third identically-structured page, not at the page ceiling', () => {
    const dir = setupProject();
    try {
      start(dir);
      const walk = (n: number) => {
        const decision = check(dir, `${BASE}/infinite_scroll/${n}`);
        if (decision.decision !== 'visit') return decision;
        return run(dir, [
          'visited',
          `--url=${BASE}/infinite_scroll/${n}`,
          '--status=200',
          '--content-hash=same-lorem-ipsum-shell',
        ]);
      };

      expect(walk(1).trapDetected).toBe(false);
      expect(walk(2).trapDetected).toBe(false);
      const tripped = walk(3);
      expect(tripped.trapDetected).toBe(true);
      expect(tripped.warning).toContain('/infinite_scroll/{id}');
      expect(tripped.warning).toContain('identical structure');

      // Every later URL under that template is now refused before any navigation happens.
      const refused = check(dir, `${BASE}/infinite_scroll/4`);
      expect(refused.decision).toBe('skip');
      expect(refused.reason).toBe('duplicate-content-template');
      expect(check(dir, `${BASE}/infinite_scroll/5441`).reason).toBe('duplicate-content-template');

      const report = run(dir, ['report']);
      expect(report.coverage.boundedBy).toBe('duplicateContent');
      expect(report.stoppedTemplates).toEqual(['/infinite_scroll/{id}']);
      expect(report.budget.pagesVisited).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves a template alone when its pages genuinely differ', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const n of [1, 2, 3, 4, 5]) {
        check(dir, `${BASE}/users/${n}`);
        const visited = run(dir, [
          'visited',
          `--url=${BASE}/users/${n}`,
          '--status=200',
          `--content-hash=profile-${n}`,
        ]);
        expect(visited.trapDetected).toBe(false);
      }
      expect(check(dir, `${BASE}/users/6`).decision).toBe('visit');
      expect(run(dir, ['report']).stoppedTemplates).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // /blog/page-2 and /blog/page-3 are separate templates on purpose - collapsing every segment
  // ending in a digit would merge real routes - so only the content signature catches this shape.
  it('warns when several different templates render the same structure, without stopping the crawl', () => {
    const dir = setupProject();
    try {
      start(dir);
      let warning: string | null = null;
      for (const slug of ['page-2', 'page-3', 'page-4']) {
        check(dir, `${BASE}/blog/${slug}`);
        const visited = run(dir, [
          'visited',
          `--url=${BASE}/blog/${slug}`,
          '--status=200',
          '--content-hash=one-generic-shell',
        ]);
        if (visited.warning) warning = visited.warning;
        expect(visited.trapDetected).toBe(false);
      }
      expect(warning).toContain('3 different route templates');
      // A weaker signal than same-template repetition, so it reports rather than cutting the crawl off.
      expect(check(dir, `${BASE}/blog/page-5`).decision).toBe('visit');
      expect(run(dir, ['report']).coverage).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns while a template is still filling up, before its hard cap lands', () => {
    const dir = setupProject();
    try {
      start(dir);
      expect(check(dir, `${BASE}/items/1`).warning).toBeNull();
      expect(check(dir, `${BASE}/items/2`).warning).toBeNull();
      expect(check(dir, `${BASE}/items/3`).warning).toBeNull();
      const warned = check(dir, `${BASE}/items/4`);
      expect(warned.decision).toBe('visit');
      expect(warned.warning).toContain('4 separate URLs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps viewport scrolls per page, which is the only guard a same-URL infinite feed can hit', () => {
    const dir = setupProject();
    try {
      start(dir);
      expect(run(dir, ['scroll', `--url=${BASE}/infinite_scroll`]).allowed).toBe(true);
      expect(run(dir, ['scroll', `--url=${BASE}/infinite_scroll`]).allowed).toBe(true);
      const stopped = run(dir, ['scroll', `--url=${BASE}/infinite_scroll`]);
      expect(stopped.allowed).toBe(false);
      expect(stopped.reason).toBe('max-scrolls');
      expect(stopped.warning).toContain('infinite feed');
      // The ceiling is per page, so another page starts fresh.
      expect(run(dir, ['scroll', `--url=${BASE}/other-feed`]).allowed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('repeats a warning once, however many pages would have produced it', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const n of [1, 2, 3, 4, 5]) {
        run(dir, ['scroll', `--url=${BASE}/feed`]);
      }
      expect(run(dir, ['report']).warnings).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A link present only in markup is not a page a user can reach. Live-observed adding /about,
  // /contact-us, /portfolio and /gallery to a crawl of a site that has none of them.
  it('refuses a link that is not actually rendered', () => {
    const dir = setupProject();
    try {
      start(dir);
      const hidden = check(dir, `${BASE}/about`, 1, false);
      expect(hidden.decision).toBe('skip');
      expect(hidden.reason).toBe('not-visible');
      expect(run(dir, ['report']).budget.pagesClaimed).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to decide at all when visibility was not reported', () => {
    const dir = setupProject();
    try {
      start(dir);
      const unreported = run(dir, ['check', `--url=${BASE}/a`, '--depth=1']);
      expect(unreported.decision).toBe('skip');
      expect(unreported.reason).toBe('visibility-not-reported');
      expect(unreported.hint).toContain('--visible');
      // Not silently treated as visible, which is how the old behaviour would creep back.
      expect(run(dir, ['report']).budget.pagesClaimed).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--allow-invisible opts a canvas-style app back in, deliberately', () => {
    const dir = setupProject();
    try {
      start(dir, ['--allow-invisible=true']);
      expect(check(dir, `${BASE}/about`, 1, false).decision).toBe('visit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The gap every per-template cap leaves: siblings that do not collapse into one template.
  // /download/report.txt and /download/tmp8sk2.txt are separate templates by every id rule.
  it('caps distinct child routes under one parent, which is how a file listing eats a crawl', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-per-parent=3']);
      expect(check(dir, `${BASE}/download/a.html`).decision).toBe('visit');
      expect(check(dir, `${BASE}/download/b.html`).decision).toBe('visit');
      expect(check(dir, `${BASE}/download/c.html`).decision).toBe('visit');
      const stopped = check(dir, `${BASE}/download/d.html`);
      expect(stopped.decision).toBe('skip');
      expect(stopped.reason).toBe('max-per-parent');
      expect(stopped.parentPath).toBe('/download');
      expect(stopped.warning).toContain('/download');
      expect(run(dir, ['report']).coverage.boundedBy).toBe('maxPerParent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Every top-level page shares "/" as its parent, so capping the root would cap the site's own
  // navigation. The sandbox this was built against has 45 routes, almost all top-level.
  it('never caps the root, however many top-level pages a site has', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-per-parent=3']);
      for (const slug of ['about', 'pricing', 'docs', 'blog', 'careers', 'legal', 'status']) {
        expect(check(dir, `${BASE}/${slug}`).decision, `/${slug} was refused`).toBe('visit');
      }
      expect(run(dir, ['report']).coverage).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not count one templated child repeatedly against its parent', () => {
    const dir = setupProject();
    try {
      start(dir, ['--max-per-parent=2']);
      // Every one of these collapses to /users/{id}, so the parent has one child, not five.
      for (const n of [1, 2, 3, 4, 5]) {
        expect(check(dir, `${BASE}/users/${n}`).decision).toBe('visit');
      }
      expect(check(dir, `${BASE}/users/profile`).decision).toBe('visit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects plain-text and markup files, not only binaries', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const asset of [
        '/download/sample.txt',
        '/download/tmpx8s.txt',
        '/notes/readme.md',
        '/feed.xml',
        '/server.log',
      ]) {
        expect(check(dir, `${BASE}${asset}`).reason).toBe('non-html-asset');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The message names how many templates share the hash, so deduplicating by message text emitted
  // the same finding once per page, each line one number different - 40+ of them in a live run.
  it('reports one duplicate-structure finding however many templates join it', () => {
    const dir = setupProject();
    try {
      start(dir);
      for (const slug of ['a', 'b', 'c', 'd', 'e', 'f']) {
        check(dir, `${BASE}/${slug}`);
        run(dir, [
          'visited',
          `--url=${BASE}/${slug}`,
          '--status=200',
          '--content-hash=one-generic-shell',
        ]);
      }
      const warnings = run(dir, ['report']).warnings;
      expect(
        warnings.filter((w: string) => w.includes('rendering identical structure')),
      ).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records every frontier decision under E2E_DEBUG, and nothing without it', () => {
    const dir = setupProject();
    const logPath = join(dir, 'artifacts', '.debug', 'crawl-budget.ndjson');
    try {
      start(dir);
      check(dir, `${BASE}/a`);
      expect(existsSync(logPath)).toBe(false);

      run(dir, ['check', `--url=${BASE}/b.pdf`, '--depth=1', '--visible=true'], { E2E_DEBUG: '1' });
      const entries = readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBe('crawl-budget');
      expect(entries[0].event).toBe('check');
      expect(entries[0].payload.result.reason).toBe('non-html-asset');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown action rather than guessing what was meant', () => {
    const dir = setupProject();
    try {
      const output = run(dir, ['crawl']);
      expect(output.exitCode).toBe(1);
      expect(output.error).toContain('unknown action');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
