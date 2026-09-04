import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPipelineStatus } from '../src/plan/templates/pipeline-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-pipeline-status-'));
  writeFileSync(join(dir, 'pipeline-status.mjs'), renderPipelineStatus(), 'utf8');
  mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'analysis'), { recursive: true });
  return dir;
}

function writeSiteMap(dir: string) {
  writeFileSync(
    join(dir, 'docs', 'site-map', 'site-map.json'),
    JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-03T10:00:00.000Z', routes: {} }),
    'utf8',
  );
}

function writeBusinessIntent(dir: string, reviewed: boolean) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'business-intent.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-03T10:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          businessFeature: {
            value: 'Checkout',
            confidence: 'high',
            source: 'heading-text',
            evidence: [],
          },
          criticalityTier: {
            value: 'high',
            confidence: 'high',
            source: 'heading-text',
            evidence: [],
          },
          sourceContentHash: 'abc123',
          analyzedAt: '2026-09-03T10:00:00.000Z',
          reviewed,
          ...(reviewed ? { reviewedBy: 'human' } : {}),
        },
      },
    }),
    'utf8',
  );
}

function writeTestConditions(dir: string, reviewed: boolean) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'test-conditions.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          parameters: [],
          constraints: [],
          conditions: [
            {
              conditionId: 'a1b2c3d4e5f6a1b2',
              parameters: {},
              technique: 'combinatorial',
              verification: {},
              isSpeculative: !reviewed,
              reviewed,
              ...(reviewed ? { reviewedBy: 'human' } : {}),
            },
          ],
          unsatisfiedPairs: [],
          sourceContentHash: 'abc123',
          sourceParamsHash: '',
          analyzedAt: '2026-09-03T11:00:00.000Z',
        },
      },
    }),
    'utf8',
  );
}

function writeJourneys(dir: string, opts: { withTestCase: boolean; reviewed: boolean }) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'journeys.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-04T09:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          journeys: [
            {
              journeyId: 'abc123def456abcd',
              routeId: 'route-checkout',
              conditionAssignments: [
                {
                  conditionId: 'a1b2c3d4e5f6a1b2',
                  testLevel: 'e2e',
                  reason: 'baseline-valid-vector',
                },
              ],
              ...(opts.withTestCase
                ? {
                    testCase: {
                      title: 'Checkout happy path',
                      preconditions: [],
                      steps: [
                        { description: 'Submit checkout', expectedResult: 'Order confirmed' },
                      ],
                    },
                  }
                : {}),
              reviewed: opts.reviewed,
              ...(opts.reviewed ? { reviewedBy: 'human' } : {}),
              sourceConditionsHash: 'hash123',
              analyzedAt: '2026-09-04T09:00:00.000Z',
            },
          ],
        },
      },
    }),
    'utf8',
  );
}

function writeTestConditionsTwoRoutes(dir: string) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'test-conditions.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          parameters: [],
          constraints: [],
          conditions: [
            {
              conditionId: 'a1b2c3d4e5f6a1b2',
              parameters: {},
              technique: 'combinatorial',
              verification: {},
              isSpeculative: false,
              reviewed: true,
              reviewedBy: 'human',
            },
          ],
          unsatisfiedPairs: [],
          sourceContentHash: 'abc123',
          sourceParamsHash: '',
          analyzedAt: '2026-09-03T11:00:00.000Z',
        },
        'route-cart': {
          routeId: 'route-cart',
          parameters: [],
          constraints: [],
          conditions: [
            {
              conditionId: 'f6e5d4c3b2a1f6e5',
              parameters: {},
              technique: 'combinatorial',
              verification: {},
              isSpeculative: false,
              reviewed: true,
              reviewedBy: 'human',
            },
          ],
          unsatisfiedPairs: [],
          sourceContentHash: 'def456',
          sourceParamsHash: '',
          analyzedAt: '2026-09-03T11:00:00.000Z',
        },
      },
    }),
    'utf8',
  );
}

// route-checkout is always fully drafted+automated; route-cart is either entirely absent from
// journeys.json (compose-journeys.mjs never ran since its conditions were reviewed) or present with
// a journey but no testCase yet (the /design-test-cases drafting step was interrupted) - the two
// distinct ways a reviewed route can be invisible to a "does any journey have a testCase" check.
function writeJourneysCheckoutOnly(dir: string, opts: { cartHasJourneyWithoutTestCase: boolean }) {
  const routes: Record<string, unknown> = {
    'route-checkout': {
      routeId: 'route-checkout',
      journeys: [
        {
          journeyId: 'abc123def456abcd',
          routeId: 'route-checkout',
          conditionAssignments: [
            { conditionId: 'a1b2c3d4e5f6a1b2', testLevel: 'e2e', reason: 'baseline-valid-vector' },
          ],
          testCase: {
            title: 'Checkout happy path',
            preconditions: [],
            steps: [{ description: 'Submit checkout', expectedResult: 'Order confirmed' }],
          },
          reviewed: true,
          reviewedBy: 'human',
          sourceConditionsHash: 'hash123',
          analyzedAt: '2026-09-04T09:00:00.000Z',
        },
      ],
    },
  };
  if (opts.cartHasJourneyWithoutTestCase) {
    routes['route-cart'] = {
      routeId: 'route-cart',
      journeys: [
        {
          journeyId: 'cartjourney0001a',
          routeId: 'route-cart',
          conditionAssignments: [
            { conditionId: 'f6e5d4c3b2a1f6e5', testLevel: 'api', reason: 'non-baseline-vector' },
          ],
          reviewed: false,
          sourceConditionsHash: 'hash456',
          analyzedAt: '2026-09-04T09:00:00.000Z',
        },
      ],
    };
  }
  writeFileSync(
    join(dir, 'docs', 'analysis', 'journeys.json'),
    JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-04T09:00:00.000Z', routes }),
    'utf8',
  );
}

function run(dir: string) {
  return spawnSync('node', ['pipeline-status.mjs'], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/pipeline-status.mjs (real execution)', () => {
  it('reports not-started when no site-map.json exists', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('not-started');
      expect(output.nextCommand).toBe('/map-site create');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports business-intent-pending-review when site-map.json exists but business-intent.json does not', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-pending-review');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports business-intent-pending-review when every business-intent entry has reviewed:false', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, false);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-pending-review');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not crash on a malformed business-intent.json - degrades to business-intent-pending-review', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFileSync(join(dir, 'docs', 'analysis', 'business-intent.json'), 'not valid json', 'utf8');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-pending-review');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports business-intent-reviewed (next: /define-test-conditions) once reviewed, before test-conditions.json exists', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-reviewed');
      expect(output.nextCommand).toBe('/define-test-conditions');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-pending-review when test-conditions.json exists but no condition is reviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, false);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-pending-review');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-reviewed (next: /design-test-cases) once test conditions are reviewed, before journeys.json exists', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, true);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-reviewed');
      expect(output.nextCommand).toBe('/design-test-cases');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-reviewed (next: /design-test-cases) when journeys.json exists but no journey has a drafted testCase yet', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, true);
    writeJourneys(dir, { withTestCase: false, reviewed: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-reviewed');
      expect(output.nextCommand).toBe('/design-test-cases');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not crash on a malformed journeys.json - degrades to test-conditions-reviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, true);
    writeFileSync(join(dir, 'docs', 'analysis', 'journeys.json'), 'not valid json', 'utf8');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-reviewed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-cases-drafted (next: /automate-ticket) once a journey has a drafted, unreviewed testCase', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, true);
    writeJourneys(dir, { withTestCase: true, reviewed: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-cases-drafted');
      expect(output.nextCommand).toBe('/automate-ticket');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports complete (nextCommand null) once every drafted testCase is reviewed:true', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, true);
    writeJourneys(dir, { withTestCase: true, reviewed: true });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('complete');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-reviewed, not complete, when one route is fully automated but a second reviewed route has no journey entry at all yet', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditionsTwoRoutes(dir);
    writeJourneysCheckoutOnly(dir, { cartHasJourneyWithoutTestCase: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-reviewed');
      expect(output.nextCommand).toBe('/design-test-cases');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-reviewed, not complete, when one route is fully automated but a second route has a journey entry with no testCase yet', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditionsTwoRoutes(dir);
    writeJourneysCheckoutOnly(dir, { cartHasJourneyWithoutTestCase: true });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-reviewed');
      expect(output.nextCommand).toBe('/design-test-cases');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
