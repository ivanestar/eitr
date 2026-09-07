import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderMapSiteStatus } from '../src/plan/templates/map-site-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-map-site-status-'));
  writeFileSync(join(dir, 'map-site-status.mjs'), renderMapSiteStatus(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  return dir;
}

function writeSiteMap(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string, requestedMode: string) {
  const result = spawnSync('node', ['map-site-status.mjs', requestedMode], {
    cwd: dir,
    encoding: 'utf8',
  });
  return JSON.parse(result.stdout);
}

describe('scripts/map-site-status.mjs (real execution)', () => {
  it('create requested, no existing site-map.json: resolves to create with no notice', () => {
    const dir = setupProject();
    try {
      const output = run(dir, 'create');
      expect(output).toEqual({
        requestedMode: 'create',
        resolvedMode: 'create',
        siteMapExists: false,
        routeCount: 0,
        lastTouched: null,
        modeRedirected: false,
        noticeMessage: null,
        staleScreenshotCount: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('update requested, no existing site-map.json: redirected to create with a notice', () => {
    const dir = setupProject();
    try {
      const output = run(dir, 'update');
      expect(output.requestedMode).toBe('update');
      expect(output.resolvedMode).toBe('create');
      expect(output.siteMapExists).toBe(false);
      expect(output.modeRedirected).toBe(true);
      expect(output.noticeMessage).toContain('No existing artifacts/site-map/site-map.json found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('create requested, existing site-map.json: not redirected, but carries a reset-warning notice with the real route count', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, {
        schemaVersion: 2,
        generatedAt: '2026-09-03T10:00:00.000Z',
        lastUpdatedAt: '2026-09-05T12:00:00.000Z',
        routes: { '/a': {}, '/b': {}, '/c': {} },
      });
      const output = run(dir, 'create');
      expect(output.resolvedMode).toBe('create');
      expect(output.siteMapExists).toBe(true);
      expect(output.routeCount).toBe(3);
      expect(output.lastTouched).toBe('2026-09-05T12:00:00.000Z');
      expect(output.modeRedirected).toBe(false);
      expect(output.noticeMessage).toContain('Found an existing site-map.json with 3 routes');
      expect(output.noticeMessage).toContain('routeId identity resets for every route');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('update requested, existing site-map.json: proceeds as update with no notice', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, {
        schemaVersion: 2,
        generatedAt: '2026-09-03T10:00:00.000Z',
        routes: { '/a': {} },
      });
      const output = run(dir, 'update');
      expect(output.resolvedMode).toBe('update');
      expect(output.siteMapExists).toBe(true);
      expect(output.modeRedirected).toBe(false);
      expect(output.noticeMessage).toBeNull();
      // Falls back to generatedAt when lastUpdatedAt is absent (never updated yet).
      expect(output.lastTouched).toBe('2026-09-03T10:00:00.000Z');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prune-screenshots deletes only images no current routeId references, and leaves other files alone', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, {
        schemaVersion: 2,
        generatedAt: '2026-09-03T10:00:00.000Z',
        routes: { '/': { routeId: 'keep-me' } },
      });
      const shots = join(dir, 'artifacts', 'site-map', 'screenshots');
      mkdirSync(shots, { recursive: true });
      writeFileSync(join(shots, 'keep-me.jpg'), 'referenced', 'utf8');
      writeFileSync(join(shots, 'orphan-a.jpg'), 'stale', 'utf8');
      writeFileSync(join(shots, 'orphan-b.webp'), 'stale', 'utf8');
      // Not an image this pipeline produces - never touched, even though no route references it.
      writeFileSync(join(shots, 'notes.txt'), 'unrelated', 'utf8');

      const output = run(dir, 'prune-screenshots');
      expect(output.action).toBe('prune-screenshots');
      expect(output.pruned).toBe(2);
      expect(output.failures).toEqual([]);
      expect(existsSync(join(shots, 'keep-me.jpg'))).toBe(true);
      expect(existsSync(join(shots, 'notes.txt'))).toBe(true);
      expect(existsSync(join(shots, 'orphan-a.jpg'))).toBe(false);
      expect(existsSync(join(shots, 'orphan-b.webp'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('matches the routeId after the last "--" in a slug-prefixed screenshot name, and still recognises the older bare-routeId form', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, {
        schemaVersion: 2,
        generatedAt: '2026-09-03T10:00:00.000Z',
        routes: {
          '/': { routeId: 'keep-root' },
          '/add-remove-elements': { routeId: 'keep-slugged' },
        },
      });
      const shots = join(dir, 'artifacts', 'site-map', 'screenshots');
      mkdirSync(shots, { recursive: true });
      // Current naming: the slug itself contains single hyphens, so the routeId is what follows
      // the LAST "--" - the slug rule can never produce a double hyphen of its own.
      writeFileSync(join(shots, 'add-remove-elements--keep-slugged.jpg'), 'referenced', 'utf8');
      // Older projects wrote a bare "<routeId>.jpg" - upgrading must not wipe their screenshots.
      writeFileSync(join(shots, 'keep-root.jpg'), 'referenced', 'utf8');
      writeFileSync(join(shots, 'gone--stale-id.jpg'), 'stale', 'utf8');

      const output = run(dir, 'prune-screenshots');
      expect(output.pruned).toBe(1);
      expect(existsSync(join(shots, 'add-remove-elements--keep-slugged.jpg'))).toBe(true);
      expect(existsSync(join(shots, 'keep-root.jpg'))).toBe(true);
      expect(existsSync(join(shots, 'gone--stale-id.jpg'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prune-screenshots deletes nothing when the site map is missing - every file would look stale', () => {
    const dir = setupProject();
    try {
      const shots = join(dir, 'artifacts', 'site-map', 'screenshots');
      mkdirSync(shots, { recursive: true });
      writeFileSync(join(shots, 'a.jpg'), 'x', 'utf8');

      const output = run(dir, 'prune-screenshots');
      expect(output.pruned).toBe(0);
      expect(output.skippedReason).toContain('nothing was deleted');
      expect(existsSync(join(shots, 'a.jpg'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports how many screenshots are stale without deleting them during ordinary mode resolution', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, {
        schemaVersion: 2,
        generatedAt: '2026-09-03T10:00:00.000Z',
        routes: { '/': { routeId: 'keep-me' } },
      });
      const shots = join(dir, 'artifacts', 'site-map', 'screenshots');
      mkdirSync(shots, { recursive: true });
      writeFileSync(join(shots, 'keep-me.jpg'), 'referenced', 'utf8');
      writeFileSync(join(shots, 'orphan-a.jpg'), 'stale', 'utf8');

      const output = run(dir, 'create');
      expect(output.staleScreenshotCount).toBe(1);
      expect(existsSync(join(shots, 'orphan-a.jpg'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a malformed (missing schemaVersion) site-map.json as absent, same as the skill's own Step 3a rule", () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, { routes: { '/a': {} } });
      const output = run(dir, 'create');
      expect(output.siteMapExists).toBe(false);
      expect(output.routeCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('defaults to create when no mode argument is given at all', () => {
    const dir = setupProject();
    try {
      const result = spawnSync('node', ['map-site-status.mjs'], { cwd: dir, encoding: 'utf8' });
      const output = JSON.parse(result.stdout);
      expect(output.requestedMode).toBe('create');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
