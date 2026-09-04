import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSiteMapValidator } from '../src/plan/templates/site-map-validator.js';

function wellFormedSiteMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T10:00:00.000Z',
    lastUpdatedAt: '2026-09-03T12:00:00.000Z',
    baseUrl: 'https://example.com',
    coverage: { boundedBy: 'maxDepth', pagesVisited: 120 },
    routes: {
      '/checkout': {
        routeId: 'route-checkout',
        sampleUrls: ['https://example.com/checkout'],
        title: 'Checkout',
        regions: ['header', 'main', 'dialog'],
        components: ['CheckoutForm'],
        discoveredAt: '2026-09-03T10:00:00.000Z',
        lastCheckedAt: '2026-09-03T12:00:00.000Z',
        contentHash: 'abc123',
        status: 'active',
      },
      '/account': {
        routeId: 'route-account',
        sampleUrls: ['https://example.com/account'],
        discoveredAt: '2026-09-03T10:00:00.000Z',
        lastCheckedAt: '2026-09-03T12:00:00.000Z',
        contentHash: 'def456',
        status: 'active',
      },
    },
    sharedWidgets: ['Navbar'],
  };
}

function minimalSiteMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T10:00:00.000Z',
    routes: {
      '/': {
        routeId: 'route-home',
        sampleUrls: ['https://example.com/'],
        discoveredAt: '2026-09-03T10:00:00.000Z',
        lastCheckedAt: '2026-09-03T10:00:00.000Z',
        contentHash: 'root-hash',
        status: 'active',
      },
    },
  };
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-site-map-validator-'));
  writeFileSync(join(dir, 'validate-site-map.mjs'), renderSiteMapValidator(), 'utf8');
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

function run(dir: string) {
  return spawnSync('node', ['validate-site-map.mjs'], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/validate-site-map.mjs (real execution)', () => {
  it('passes validation for a well-formed multi-route fixture with every optional field present', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, wellFormedSiteMap());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Zero-Config Default Verification: the minimal shape (only the schema's required fields) must
  // pass on its own, not just the fixture with every optional field populated.
  it('passes validation for the minimal shape with every optional field absent', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, minimalSiteMap());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails cleanly (not a crash) when the file content is the literal JSON value null', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'artifacts', 'site-map', 'site-map.json'), 'null', 'utf8');
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('must contain a JSON object'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails cleanly when the file is missing entirely', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('not found at'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when schemaVersion is missing', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      delete bad.schemaVersion;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when schemaVersion is the older value 1 instead of 2', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.schemaVersion = 1;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when routes is an array instead of an object', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.routes = [];
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('routes must be an object'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on a route entry missing routeId', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      delete (bad.routes['/checkout'] as Record<string, unknown>).routeId;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.routeId must be a non-empty string')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The join key business-intent.json relies on - a duplicate routeId across two different path
  // templates would make that join ambiguous, so this must be a mechanical failure, not a
  // theoretical concern left to prose.
  it('fails on two route entries sharing the same routeId', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      (bad.routes['/account'] as Record<string, unknown>).routeId = 'route-checkout';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('is not unique'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an empty sampleUrls array', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      (bad.routes['/checkout'] as Record<string, unknown>).sampleUrls = [];
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.sampleUrls must be a non-empty array')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an invalid status enum value', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      (bad.routes['/checkout'] as Record<string, unknown>).status = 'deprecated';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.status must be one of active|removed')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an invalid coverage.boundedBy enum value', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.coverage = { boundedBy: 'maxTime', pagesVisited: 10 };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('coverage.boundedBy must be one of')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on a non-integer coverage.pagesVisited', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.coverage = { boundedBy: 'maxPages', pagesVisited: '10' };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('coverage.pagesVisited must be an integer')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on sharedWidgets containing a non-string entry', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.sharedWidgets = ['Navbar', 42];
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('sharedWidgets, when present, must be')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
