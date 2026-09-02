import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSwarmDispatcher } from '../src/plan/templates/swarm-dispatcher.js';

const SITE_MAP = {
  schemaVersion: 2,
  generatedAt: '2026-09-02T10:00:00.000Z',
  baseUrl: 'https://example.com',
  routes: {
    '/login': {
      routeId: 'route-login',
      sampleUrls: ['https://example.com/login'],
      title: 'Login',
      regions: ['header', 'main'],
      components: ['LoginForm'],
      discoveredAt: '2026-09-02T10:00:00.000Z',
      lastCheckedAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'abc123',
      status: 'active',
    },
    '/users/{id}': {
      routeId: 'route-user-detail',
      sampleUrls: ['https://example.com/users/42', 'https://example.com/users/43'],
      title: 'User Detail',
      regions: ['header', 'main'],
      components: ['UserCard'],
      discoveredAt: '2026-09-02T10:00:00.000Z',
      lastCheckedAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'def456',
      status: 'active',
    },
    '/old-page': {
      routeId: 'route-old',
      sampleUrls: ['https://example.com/old-page'],
      discoveredAt: '2026-09-02T10:00:00.000Z',
      lastCheckedAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'zzz',
      status: 'removed',
    },
  },
  sharedWidgets: ['NavbarWidget', 'SidebarWidget'],
};

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-swarm-'));
  writeFileSync(join(dir, 'orchestrate-swarm.mjs'), renderSwarmDispatcher(), 'utf8');
  mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'site-map', 'site-map.json'),
    JSON.stringify(SITE_MAP, null, 2),
    'utf8',
  );
  return dir;
}

function run(dir: string, args: string[]) {
  return spawnSync('node', ['orchestrate-swarm.mjs', ...args], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/orchestrate-swarm.mjs (real execution)', () => {
  it('--phase=plan emits a 4-tier DAG covering only active routes, sorted, with a concurrency ceiling', () => {
    const dir = setupProject();
    try {
      const result = run(dir, ['--phase=plan']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('READY');
      expect(output.maxConcurrency).toBeGreaterThanOrEqual(1);
      expect(output.maxConcurrency).toBeLessThanOrEqual(4);
      expect(output.dag_waves).toHaveLength(4);
      expect(output.dag_waves[0]).toEqual({ level: 0, name: 'primitives', workers: [] });
      expect(output.dag_waves[1].workers).toEqual(['NavbarWidget', 'SidebarWidget']);
      const pageWorkers = output.dag_waves[2].workers;
      expect(pageWorkers).toHaveLength(2);
      expect(pageWorkers.map((w: { path: string }) => w.path)).toEqual(['/login', '/users/{id}']);
      expect(pageWorkers[1].slug).toBe('users-id');
      expect(pageWorkers[1].sampleUrl).toBe('https://example.com/users/42');
      // The "removed" route must never be dispatched.
      expect(JSON.stringify(pageWorkers)).not.toContain('old-page');
      expect(output.dag_waves[3]).toEqual({ level: 3, name: 'journeys', workers: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan slugifies the bare root route "/" as "root" rather than an empty string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-swarm-root-'));
    try {
      writeFileSync(join(dir, 'orchestrate-swarm.mjs'), renderSwarmDispatcher(), 'utf8');
      mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
      writeFileSync(
        join(dir, 'docs', 'site-map', 'site-map.json'),
        JSON.stringify({
          schemaVersion: 2,
          generatedAt: '2026-09-02T10:00:00.000Z',
          routes: {
            '/': {
              routeId: 'route-root',
              sampleUrls: ['https://example.com/'],
              discoveredAt: '2026-09-02T10:00:00.000Z',
              lastCheckedAt: '2026-09-02T10:00:00.000Z',
              contentHash: 'root1',
              status: 'active',
            },
          },
          sharedWidgets: [],
        }),
        'utf8',
      );

      const result = run(dir, ['--phase=plan']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.dag_waves[2].workers).toEqual([
        {
          workerId: 'worker-root',
          routeId: 'route-root',
          path: '/',
          sampleUrl: 'https://example.com/',
          slug: 'root',
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan --routes=<subset> scopes dispatch to exactly the requested routes', () => {
    const dir = setupProject();
    try {
      const result = run(dir, ['--phase=plan', '--routes=/login']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.dag_waves[2].workers).toHaveLength(1);
      expect(output.dag_waves[2].workers[0].path).toBe('/login');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan reports EMPTY status (not a failure) when no routes match', () => {
    const dir = setupProject();
    try {
      const result = run(dir, ['--phase=plan', '--routes=/does-not-exist']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('EMPTY');
      expect(output.dag_waves[2].workers).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan fails clearly when docs/site-map/site-map.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-swarm-nomap-'));
    try {
      writeFileSync(join(dir, 'orchestrate-swarm.mjs'), renderSwarmDispatcher(), 'utf8');
      const result = run(dir, ['--phase=plan']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not found. Run /map-site first.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan fails clearly on malformed site-map.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-swarm-badjson-'));
    try {
      writeFileSync(join(dir, 'orchestrate-swarm.mjs'), renderSwarmDispatcher(), 'utf8');
      mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'site-map', 'site-map.json'), '{ not valid json', 'utf8');
      const result = run(dir, ['--phase=plan']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('is not valid JSON');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan fails clearly on a malformed (non-object) route entry instead of throwing a raw stack trace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-swarm-badroute-'));
    try {
      writeFileSync(join(dir, 'orchestrate-swarm.mjs'), renderSwarmDispatcher(), 'utf8');
      mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
      writeFileSync(
        join(dir, 'docs', 'site-map', 'site-map.json'),
        JSON.stringify({
          schemaVersion: 2,
          generatedAt: '2026-09-02T10:00:00.000Z',
          routes: { '/broken': null },
          sharedWidgets: [],
        }),
        'utf8',
      );
      const result = run(dir, ['--phase=plan']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('malformed route entry');
      expect(result.stderr).not.toContain('TypeError');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan --routes-file=<missing> fails clearly instead of throwing a raw stack trace', () => {
    const dir = setupProject();
    try {
      const result = run(dir, ['--phase=plan', '--routes-file=does-not-exist.txt']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--routes-file does-not-exist.txt not found.');
      expect(result.stderr).not.toContain('ENOENT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=plan --routes-file=<path> scopes dispatch to the routes listed in the file', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'routes.txt'), '/login\n\n/users/{id}\n', 'utf8');
      const result = run(dir, ['--phase=plan', '--routes-file=routes.txt']);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.dag_waves[2].workers.map((w: { path: string }) => w.path)).toEqual([
        '/login',
        '/users/{id}',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=verify-worker passes for an existing non-empty file and fails for a missing one', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, 'components', 'pages'), { recursive: true });
      writeFileSync(join(dir, 'components', 'pages', 'login.page.ts'), 'export {};', 'utf8');

      const ok = run(dir, ['--phase=verify-worker', '--target=components/pages/login.page.ts']);
      expect(ok.status).toBe(0);
      expect(JSON.parse(ok.stdout).status).toBe('OK');

      const missing = run(dir, ['--phase=verify-worker', '--target=components/pages/nope.page.ts']);
      expect(missing.status).toBe(1);
      expect(JSON.parse(missing.stdout).status).toBe('MISSING');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=verify-worker reports EMPTY (not OK) for a 0-byte file that exists', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, 'components', 'pages'), { recursive: true });
      writeFileSync(join(dir, 'components', 'pages', 'blank.page.ts'), '', 'utf8');

      const result = run(dir, ['--phase=verify-worker', '--target=components/pages/blank.page.ts']);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.exists).toBe(true);
      expect(output.nonEmpty).toBe(false);
      expect(output.status).toBe('EMPTY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=verify fails the whole barrier if any one target is missing', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, 'components', 'pages'), { recursive: true });
      writeFileSync(join(dir, 'components', 'pages', 'login.page.ts'), 'export {};', 'utf8');

      const result = run(dir, [
        '--phase=verify',
        '--targets=components/pages/login.page.ts,components/pages/nope.page.ts',
      ]);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.results).toHaveLength(2);
      expect(output.results[0].status).toBe('OK');
      expect(output.results[1].status).toBe('MISSING');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=reindex regenerates a sorted components/widgets/index.ts barrel deterministically', () => {
    const dir = setupProject();
    try {
      const widgetsDir = join(dir, 'components', 'widgets');
      mkdirSync(widgetsDir, { recursive: true });
      // Written out of order on purpose - the barrel must come out sorted regardless.
      writeFileSync(join(widgetsDir, 'sidebar.widget.ts'), 'export {};', 'utf8');
      writeFileSync(join(widgetsDir, 'navbar.widget.ts'), 'export {};', 'utf8');

      const result = run(dir, ['--phase=reindex']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Reindexed components/widgets/index.ts (2 widgets)');

      const barrel = readFileSync(join(widgetsDir, 'index.ts'), 'utf8');
      const lines = barrel.trim().split(/\r?\n/);
      expect(lines).toEqual([
        "export * from './navbar.widget';",
        "export * from './sidebar.widget';",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--phase=reindex is a no-op with a clear message when there are no widgets yet', () => {
    const dir = setupProject();
    try {
      const result = run(dir, ['--phase=reindex']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('nothing to reindex');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown or missing --phase', () => {
    const dir = setupProject();
    try {
      const result = run(dir, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown or missing --phase');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
