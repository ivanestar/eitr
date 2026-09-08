import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCoverageStatus } from '../src/plan/templates/coverage-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-coverage-status-'));
  writeFileSync(join(dir, 'coverage-status.mjs'), renderCoverageStatus(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'test-cases'), { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, data: unknown) {
  writeFileSync(join(dir, relPath), JSON.stringify(data, null, 2), 'utf8');
}

function run(dir: string) {
  const result = spawnSync('node', ['coverage-status.mjs'], { cwd: dir, encoding: 'utf8' });
  return { result, output: JSON.parse(result.stdout) };
}

function criterion(output: { criteria: { id: string }[] }, id: string) {
  return output.criteria.find((c) => c.id === id) as {
    id: string;
    checked: boolean;
    met: boolean;
    gapCount: number;
    gaps: string[];
  };
}

function siteMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-08T10:00:00.000Z',
    routes: {
      '/checkout': { routeId: 'r-checkout', status: 'active' },
      '/help': { routeId: 'r-help', status: 'active' },
    },
  };
}

function businessIntent(tiers: Record<string, string>) {
  const routes: Record<string, unknown> = {};
  for (const [routeId, tier] of Object.entries(tiers)) {
    routes[routeId] = { routeId, criticalityTier: { value: tier } };
  }
  return { schemaVersion: 1, generatedAt: '2026-09-08T10:00:00.000Z', routes };
}

describe('scripts/coverage-status.mjs (real execution)', () => {
  it('always exits 0 - it reports, it does not gate a build', () => {
    const dir = setupProject();
    try {
      expect(run(dir).result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports nothing to measure on an empty project rather than claiming success', () => {
    const dir = setupProject();
    try {
      const { output } = run(dir);
      expect(output.summary).toContain('Nothing to measure yet');
      expect(output.complete).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the uncovered important routes rather than only counting them', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(
        dir,
        'artifacts/analysis/business-intent.json',
        businessIntent({ 'r-checkout': 'high', 'r-help': 'low' }),
      );

      const check = criterion(run(dir).output, 'important-routes-automated');
      expect(check.checked).toBe(true);
      expect(check.met).toBe(false);
      // The high-impact route is a gap; the low-impact one is deliberately not counted here.
      expect(check.gaps).toEqual(['/checkout (high impact)']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing test-cases.json as "nothing automated", not as unmeasurable', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(
        dir,
        'artifacts/analysis/business-intent.json',
        businessIntent({ 'r-checkout': 'high', 'r-help': 'medium' }),
      );

      const check = criterion(run(dir).output, 'important-routes-automated');
      expect(check.checked).toBe(true);
      expect(check.gapCount).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts a route as covered once one of its journeys is actually automated', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(
        dir,
        'artifacts/analysis/business-intent.json',
        businessIntent({ 'r-checkout': 'high', 'r-help': 'low' }),
      );
      write(dir, 'artifacts/test-cases/test-cases.json', {
        schemaVersion: 2,
        generatedAt: '2026-09-08T10:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['r-checkout'],
            testInterface: 'ui',
            breadth: 'targeted',
            reviewed: true,
            testCase: { title: 'Pay' },
          },
        },
      });

      const check = criterion(run(dir).output, 'important-routes-automated');
      expect(check.met).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a drafted test case that was never automated - the abandoned-batch case', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(dir, 'artifacts/test-cases/test-cases.json', {
        schemaVersion: 2,
        generatedAt: '2026-09-08T10:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['r-checkout'],
            testInterface: 'ui',
            breadth: 'targeted',
            reviewed: true,
            testCase: { title: 'Done' },
          },
          j2: {
            journeyId: 'j2',
            routeIds: ['r-checkout'],
            testInterface: 'api',
            breadth: 'targeted',
            reviewed: false,
            testCase: { title: 'Abandoned' },
          },
        },
      });

      const check = criterion(run(dir).output, 'drafted-test-cases-automated');
      expect(check.met).toBe(false);
      expect(check.gaps[0]).toContain('Abandoned');
      expect(check.gaps.join(' ')).not.toContain('Done');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags an endpoint seen in traffic that no api-level journey covers', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(dir, 'artifacts/site-map/api-contracts.json', {
        schemaVersion: 1,
        contracts: [
          { method: 'POST', pathTemplate: '/api/orders', observedFromRouteIds: ['r-checkout'] },
          { method: 'GET', pathTemplate: '/api/help', observedFromRouteIds: ['r-help'] },
          // Observed from no route at all (the login call) - not attributable, so not a gap.
          { method: 'POST', pathTemplate: '/api/login', observedFromRouteIds: [] },
        ],
      });
      write(dir, 'artifacts/test-cases/test-cases.json', {
        schemaVersion: 2,
        generatedAt: '2026-09-08T10:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['r-checkout'],
            testInterface: 'api',
            breadth: 'targeted',
            reviewed: true,
            testCase: { title: 'Orders API' },
          },
        },
      });

      const check = criterion(run(dir).output, 'observed-endpoints-tested');
      expect(check.gaps).toEqual(['GET /api/help']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a route that reached approved conditions but never got a test case drafted', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(dir, 'artifacts/analysis/test-conditions.json', {
        schemaVersion: 1,
        generatedAt: '2026-09-08T10:00:00.000Z',
        routes: {
          'r-checkout': { routeId: 'r-checkout', conditions: [{ reviewed: true }] },
          'r-help': { routeId: 'r-help', conditions: [{ reviewed: false }] },
        },
      });
      write(dir, 'artifacts/test-cases/test-cases.json', {
        schemaVersion: 1,
        generatedAt: '2026-09-08T10:00:00.000Z',
        routes: {},
      });

      const check = criterion(run(dir).output, 'reviewed-conditions-designed');
      // Only the route whose conditions were actually approved counts as a gap.
      expect(check.gaps).toEqual(['/checkout']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags an active route nobody classified, since it falls out of every other count', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(
        dir,
        'artifacts/analysis/business-intent.json',
        businessIntent({ 'r-checkout': 'high' }),
      );

      const check = criterion(run(dir).output, 'routes-classified');
      expect(check.gaps).toEqual(['/help']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is not complete while any criterion is still unmeasurable', () => {
    const dir = setupProject();
    try {
      write(dir, 'artifacts/site-map/site-map.json', siteMap());
      write(
        dir,
        'artifacts/analysis/business-intent.json',
        businessIntent({ 'r-checkout': 'high', 'r-help': 'low' }),
      );
      write(dir, 'artifacts/test-cases/test-cases.json', {
        schemaVersion: 2,
        generatedAt: '2026-09-08T10:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['r-checkout'],
            testInterface: 'ui',
            breadth: 'targeted',
            reviewed: true,
            testCase: { title: 'Pay' },
          },
        },
      });

      const { output } = run(dir);
      // Every measurable criterion passes here, but test conditions and api contracts were never
      // produced - an unfinished run is unfinished, not complete.
      expect(output.notYetCheckable.length).toBeGreaterThan(0);
      expect(output.complete).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Route-level coverage is blind to this by construction: both routes can be individually green
  // while nothing checks that what one screen creates turns up on the next.
  describe('features walked end to end', () => {
    function featureMap(impact: string) {
      return {
        schemaVersion: 1,
        generatedAt: '2026-09-08T10:00:00.000Z',
        features: {
          f1: {
            featureId: 'f1',
            name: 'Checkout',
            memberRouteIds: ['r-checkout', 'r-help'],
            entityIds: [],
            impact,
            evidence: [{ signal: 'business-intent-label', excerpt: 'x' }],
            reviewed: true,
            reviewedBy: 'human',
          },
        },
        entities: {},
        sourceHash: 'hash',
      };
    }

    function targetedOnly() {
      return {
        schemaVersion: 2,
        generatedAt: '2026-09-08T10:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['r-checkout'],
            testInterface: 'ui',
            breadth: 'targeted',
            reviewed: true,
            testCase: { title: 'Pay' },
          },
        },
      };
    }

    it('flags a multi-route feature with no journey that walks it', () => {
      const dir = setupProject();
      try {
        write(dir, 'artifacts/site-map/site-map.json', siteMap());
        write(dir, 'artifacts/analysis/feature-map.json', featureMap('high'));
        write(dir, 'artifacts/test-cases/test-cases.json', targetedOnly());
        const check = criterion(run(dir).output, 'features-walked-end-to-end');
        expect(check.met).toBe(false);
        expect(check.gaps).toEqual(['Checkout (2 routes)']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not flag a low-impact feature - the widest test shape is what low impact buys out of', () => {
      const dir = setupProject();
      try {
        write(dir, 'artifacts/site-map/site-map.json', siteMap());
        write(dir, 'artifacts/analysis/feature-map.json', featureMap('low'));
        write(dir, 'artifacts/test-cases/test-cases.json', targetedOnly());
        expect(criterion(run(dir).output, 'features-walked-end-to-end').met).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('is satisfied once a journey actually walks the feature', () => {
      const dir = setupProject();
      try {
        write(dir, 'artifacts/site-map/site-map.json', siteMap());
        write(dir, 'artifacts/analysis/feature-map.json', featureMap('high'));
        write(dir, 'artifacts/test-cases/test-cases.json', {
          schemaVersion: 2,
          generatedAt: '2026-09-08T10:00:00.000Z',
          journeys: {
            j1: {
              journeyId: 'j1',
              routeIds: ['r-checkout', 'r-help'],
              featureId: 'f1',
              testInterface: 'ui',
              breadth: 'e2e',
              reviewed: true,
              testCase: { title: 'Buy something and find it later' },
            },
          },
        });
        expect(criterion(run(dir).output, 'features-walked-end-to-end').met).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('counts every route a walk touches as covered, not just the first one', () => {
      const dir = setupProject();
      try {
        write(dir, 'artifacts/site-map/site-map.json', siteMap());
        write(
          dir,
          'artifacts/analysis/business-intent.json',
          businessIntent({ 'r-checkout': 'high', 'r-help': 'medium' }),
        );
        write(dir, 'artifacts/test-cases/test-cases.json', {
          schemaVersion: 2,
          generatedAt: '2026-09-08T10:00:00.000Z',
          journeys: {
            j1: {
              journeyId: 'j1',
              routeIds: ['r-checkout', 'r-help'],
              featureId: 'f1',
              testInterface: 'ui',
              breadth: 'e2e',
              reviewed: true,
              testCase: { title: 'Walk' },
            },
          },
        });
        expect(criterion(run(dir).output, 'important-routes-automated').met).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
