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

function check(dir: string, url: string, depth = 1) {
  return run(dir, ['check', `--url=${url}`, `--depth=${depth}`]);
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
      expect(output.limits).toEqual({ maxPages: 500, maxDepth: 6, maxPerTemplate: 20 });
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
      expect(run(dir, ['report']).canonicalRoutes).toEqual(['/reports/{date}', '/users/{id}']);
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

  it('records every frontier decision under E2E_DEBUG, and nothing without it', () => {
    const dir = setupProject();
    const logPath = join(dir, 'artifacts', '.debug', 'crawl-budget.ndjson');
    try {
      start(dir);
      check(dir, `${BASE}/a`);
      expect(existsSync(logPath)).toBe(false);

      run(dir, ['check', `--url=${BASE}/b.pdf`, '--depth=1'], { E2E_DEBUG: '1' });
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
