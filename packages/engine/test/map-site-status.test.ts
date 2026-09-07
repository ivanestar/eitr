import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
