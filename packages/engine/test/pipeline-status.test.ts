import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPipelineStatus } from '../src/plan/templates/pipeline-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-pipeline-status-'));
  writeFileSync(join(dir, 'pipeline-status.mjs'), renderPipelineStatus(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'test-cases'), { recursive: true });
  return dir;
}

function writeSiteMap(dir: string) {
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-03T10:00:00.000Z', routes: {} }),
    'utf8',
  );
}

function writeFeatureMap(
  dir: string,
  opts: { featureReviewed: boolean; entityReviewed?: boolean; routeReviewed?: boolean } = {
    featureReviewed: true,
  },
) {
  const entityReviewed = opts.entityReviewed ?? opts.featureReviewed;
  const routeReviewed = opts.routeReviewed ?? opts.featureReviewed;
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'feature-map.json'),
    JSON.stringify({
      schemaVersion: 2,
      generatedAt: '2026-09-03T10:30:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          featureId: 'feature0001aaaa',
          criticality: {
            value: 'high',
            confidence: 'high',
            source: 'heading-text',
            reasoning: 'Takes payment.',
            evidence: [{ signal: 'heading-text', excerpt: 'Checkout' }],
          },
          sourceContentHash: 'abc123',
          analyzedAt: '2026-09-03T10:30:00.000Z',
          reviewed: routeReviewed,
          ...(routeReviewed ? { reviewedBy: 'human' } : {}),
        },
      },
      features: {
        feature0001aaaa: {
          featureId: 'feature0001aaaa',
          name: 'Checkout',
          memberRouteIds: ['route-checkout'],
          entityIds: ['entity0001aaaa'],
          impact: 'high',
          impactSourceRouteId: 'route-checkout',
          evidence: [{ signal: 'route-convention', excerpt: '/checkout -> "Checkout"' }],
          reviewed: opts.featureReviewed,
          ...(opts.featureReviewed ? { reviewedBy: 'human' } : {}),
        },
      },
      entities: {
        entity0001aaaa: {
          entityId: 'entity0001aaaa',
          name: 'orders',
          operations: [],
          relations: [],
          lifecycle: { states: [], transitions: [] },
          evidence: [{ signal: 'route-convention', excerpt: '/orders' }],
          reviewed: entityReviewed,
          ...(entityReviewed ? { reviewedBy: 'human' } : {}),
        },
      },
      sourceHash: 'featuremaphash',
    }),
    'utf8',
  );
}

function writeTestConditions(dir: string, reviewed: boolean) {
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'test-conditions.json'),
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
    join(dir, 'artifacts', 'test-cases', 'test-cases.json'),
    JSON.stringify({
      schemaVersion: 2,
      generatedAt: '2026-09-04T09:00:00.000Z',
      journeys: {
        abc123def456abcd: {
          journeyId: 'abc123def456abcd',
          routeIds: ['route-checkout'],
          testInterface: 'ui',
          breadth: 'targeted',
          level: 'system',
          conditionAssignments: [
            {
              conditionId: 'a1b2c3d4e5f6a1b2',
              routeId: 'route-checkout',
              reason: 'baseline-valid-vector',
            },
          ],
          ...(opts.withTestCase
            ? {
                testCase: {
                  title: 'Checkout happy path',
                  preconditions: [],
                  steps: [{ description: 'Submit checkout', expectedResult: 'Order confirmed' }],
                },
              }
            : {}),
          reviewed: opts.reviewed,
          ...(opts.reviewed ? { reviewedBy: 'human' } : {}),
          sourceConditionsHash: 'hash123',
          analyzedAt: '2026-09-04T09:00:00.000Z',
        },
      },
    }),
    'utf8',
  );
}

function writeTestConditionsTwoRoutes(dir: string) {
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'test-conditions.json'),
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
// test-cases.json (compose-journeys.mjs never ran since its conditions were reviewed) or present with
// a journey but no testCase yet (the /design-test-cases drafting step was interrupted) - the two
// distinct ways a reviewed route can be invisible to a "does any journey have a testCase" check.
function writeJourneysCheckoutOnly(dir: string, opts: { cartHasJourneyWithoutTestCase: boolean }) {
  const journeys: Record<string, unknown> = {
    abc123def456abcd: {
      journeyId: 'abc123def456abcd',
      routeIds: ['route-checkout'],
      testInterface: 'ui',
      breadth: 'targeted',
      level: 'system',
      conditionAssignments: [
        {
          conditionId: 'a1b2c3d4e5f6a1b2',
          routeId: 'route-checkout',
          reason: 'baseline-valid-vector',
        },
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
  };
  if (opts.cartHasJourneyWithoutTestCase) {
    journeys['cartjourney0001a'] = {
      journeyId: 'cartjourney0001a',
      routeIds: ['route-cart'],
      testInterface: 'api',
      breadth: 'targeted',
      level: 'integration',
      conditionAssignments: [
        { conditionId: 'f6e5d4c3b2a1f6e5', routeId: 'route-cart', reason: 'non-baseline-vector' },
      ],
      reviewed: false,
      sourceConditionsHash: 'hash456',
      analyzedAt: '2026-09-04T09:00:00.000Z',
    };
  }
  writeFileSync(
    join(dir, 'artifacts', 'test-cases', 'test-cases.json'),
    JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-04T09:00:00.000Z', journeys }),
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
      // Roadmap: current stage bracketed, every other stage plain, printed in fixed order. Only
      // the real stages appear - the review pause belongs to every stage, so it is stated
      // once in preFlightNotice rather than interleaved as context-free 'Review' entries.
      // The brackets are the whole marker: no trailing "you are here", which restated them.
      expect(output.roadmap).toBe(
        '[S1 Site map] -> S2 Feature map -> S3 Test conditions -> S4 Test cases -> S5 Automated tests -> S6 Test closure',
      );
      expect(output.roadmap).not.toContain('you are here');
      expect(output.preFlightNotice).toContain('6 stages, each one ending with your review:');
      expect(output.preFlightNotice).not.toContain('you are here');
      expect(output.preFlightNotice).not.toContain('-> Review ->');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the pre-flight notice in the agreed block shape, word for word', () => {
    const dir = setupProject();
    try {
      const output = JSON.parse(run(dir).stdout);
      expect(output.preFlightNotice).toBe(
        [
          '6 stages, each one ending with your review:',
          '',
          '  1. [Site map]       crawl the app, and work out what each page is for',
          '  2. Feature map      group those pages into features, and work out what the app is made of',
          '  3. Test conditions  decide what should be tested',
          '  4. Test cases       turn those into concrete, readable test cases',
          '  5. Automated tests  write the real test code and run it',
          '  6. Test closure     check what is covered, and decide whether that is enough',
          '',
          '[WARNING] Time and cost:',
          "This can take anywhere from tens of minutes to multiple hours depending on application size, and consumes a meaningful share of the session's generation budget.",
          '',
          '[NOTE] Your control:',
          "By default there is a pause after every stage, where that stage's own review artifact is presented and you must approve before the next stage runs.",
        ].join('\n'),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a review file a person edited and nobody applied yet', () => {
    const dir = setupProject();
    try {
      const reviewDir = join(dir, 'artifacts', 'review');
      mkdirSync(join(reviewDir, '.base'), { recursive: true });
      const rendered = '<!-- review -->\n# Review: feature-map\n\n- [ ] F1. Checkout\n';
      writeFileSync(join(reviewDir, 'feature-map-review.md'), rendered, 'utf8');
      writeFileSync(
        join(reviewDir, '.base', 'feature-map-review.json'),
        JSON.stringify({ kind: 'feature-map', text: rendered }),
        'utf8',
      );
      expect(JSON.parse(run(dir).stdout).pendingReviewEdits).toEqual([]);

      writeFileSync(
        join(reviewDir, 'feature-map-review.md'),
        rendered.replace('[ ]', '[x]'),
        'utf8',
      );
      expect(JSON.parse(run(dir).stdout).pendingReviewEdits).toEqual([
        {
          kind: 'feature-map',
          filePath: 'artifacts/review/feature-map-review.md',
          apply: 'node scripts/apply-review.mjs --kind=feature-map',
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps every stage description in one column when the bracketed stage is the widest name', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir, { featureReviewed: true });
    try {
      const output = JSON.parse(run(dir).stdout);
      expect(output.stage).toBe('feature-map-reviewed');
      const stageLines = output.preFlightNotice
        .split('\n')
        .filter((line: string) => /^ {2}\d\. /.test(line));
      expect(stageLines).toHaveLength(6);
      expect(stageLines[2]).toContain('[Test conditions]');
      const blurbs = [
        'crawl the app',
        'group those pages',
        'decide what',
        'turn those',
        'write the real',
        'check what',
      ];
      const columns = stageLines.map((line: string, i: number) => line.indexOf(blurbs[i]));
      expect(new Set(columns).size).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sends a project with a site map and nothing else to /map-features', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('site-map-reviewed');
      expect(output.nextCommand).toBe('/map-features');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeRoutes(dir: string, routes: Record<string, unknown>) {
    writeFileSync(
      join(dir, 'artifacts', 'site-map', 'site-map.json'),
      JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-03T10:00:00.000Z', routes }),
      'utf8',
    );
  }

  // Reviewed like every other stage: until each route is approved or left out, the person is at
  // stage 1, and the roadmap brackets stage 1 rather than the one after it.
  it('holds at site-map-pending-review while a route is neither approved nor left out', () => {
    const dir = setupProject();
    writeRoutes(dir, {
      '/a': { routeId: 'r-a', status: 'active', reviewed: true, reviewedBy: 'human' },
      '/b': { routeId: 'r-b', status: 'active' },
      '/gone': { routeId: 'r-gone', status: 'removed', removedBy: 'human' },
    });
    try {
      const output = JSON.parse(run(dir).stdout);
      expect(output.stage).toBe('site-map-pending-review');
      expect(output.nextCommand).toBeNull();
      expect(output.nextCommandDescription).toContain('1 route(s)');
      expect(output.roadmap.startsWith('[S1 Site map] -> S2 Feature map')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('moves on to /map-features once every remaining route is approved', () => {
    const dir = setupProject();
    writeRoutes(dir, {
      '/a': { routeId: 'r-a', status: 'active', reviewed: true, reviewedBy: 'human' },
      '/gone': { routeId: 'r-gone', status: 'removed', removedBy: 'human' },
    });
    try {
      const output = JSON.parse(run(dir).stdout);
      expect(output.stage).toBe('site-map-reviewed');
      expect(output.roadmap).toContain('[S2 Feature map]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists corrections read from a review file and not yet confirmed applied', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    mkdirSync(join(dir, 'artifacts', 'review', '.pending'), { recursive: true });
    writeFileSync(
      join(dir, 'artifacts', 'review', '.pending', 'site-map.json'),
      JSON.stringify({ kind: 'site-map', freeEdits: [{ label: 'R1', added: ['x'], removed: [] }] }),
      'utf8',
    );
    try {
      const output = JSON.parse(run(dir).stdout);
      expect(output.pendingReviewEdits).toEqual([
        expect.objectContaining({
          kind: 'site-map',
          waiting: 'corrections read from the file and not applied yet',
        }),
      ]);
      expect(output.pendingReviewEdits[0].apply).toContain('--done');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('holds at feature-map-pending-review while a page criticality is unreviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir, { featureReviewed: true, routeReviewed: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('feature-map-pending-review');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports feature-map-pending-review while a feature is still unreviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir, { featureReviewed: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('feature-map-pending-review');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Entity relations are what downstream stages turn into preconditions, so a reviewed feature
  // sitting on top of an unreviewed entity is not a reviewed feature map.
  it('stays at feature-map-pending-review when features are approved but an entity is not', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir, { featureReviewed: true, entityReviewed: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('feature-map-pending-review');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports feature-map-reviewed (next: /define-test-conditions) once the whole map is approved', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir, { featureReviewed: true });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('feature-map-reviewed');
      expect(output.nextCommand).toBe('/define-test-conditions');
      expect(output.routeCoverage.features).toBe(1);
      expect(output.routeCoverage.featuresReviewed).toBe(1);
      expect(output.routeCoverage.entities).toBe(1);
      expect(output.routeCoverage.entitiesReviewed).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not crash on a malformed feature-map.json - degrades to feature-map-pending-review', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'not valid json', 'utf8');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      // An unparseable file carries no review state to protect, so the honest answer is the same
      // one an absent file gets: redraft it.
      expect(output.stage).toBe('site-map-reviewed');
      expect(output.nextCommand).toBe('/map-features');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-pending-review when test-conditions.json exists but no condition is reviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
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

  it('reports test-conditions-reviewed (next: /design-test-cases) once test conditions are reviewed, before test-cases.json exists', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
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

  it('reports test-conditions-reviewed (next: /design-test-cases) when test-cases.json exists but no journey has a drafted testCase yet', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
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

  it('does not crash on a malformed test-cases.json - degrades to test-conditions-reviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
    writeTestConditions(dir, true);
    writeFileSync(
      join(dir, 'artifacts', 'test-cases', 'test-cases.json'),
      'not valid json',
      'utf8',
    );
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-reviewed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-cases-drafted (next: /automate-test) once a journey has a drafted, unreviewed testCase', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
    writeTestConditions(dir, true);
    writeJourneys(dir, { withTestCase: true, reviewed: false });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-cases-drafted');
      expect(output.nextCommand).toBe('/automate-test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Automating everything drafted lands the project in Test closure, which is a stage rather than
  // a finish line: whether the suite can actually be closed is coverage-status.mjs's answer, and
  // duplicating that judgment here would give the project two places to disagree about it.
  it('reports test-closure (nextCommand null) once every drafted testCase is reviewed:true', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
    writeTestConditions(dir, true);
    writeJourneys(dir, { withTestCase: true, reviewed: true });
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-closure');
      expect(output.nextCommand).toBeNull();
      expect(output.nextCommandDescription).toContain('coverage-status.mjs');
      expect(output.roadmap).toBe(
        'S1 Site map -> S2 Feature map -> S3 Test conditions -> S4 Test cases -> S5 Automated tests -> [S6 Test closure]',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-reviewed, not complete, when one route is fully automated but a second reviewed route has no journey entry at all yet', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFeatureMap(dir);
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
    writeFeatureMap(dir);
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
