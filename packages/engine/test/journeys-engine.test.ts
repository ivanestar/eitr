import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderJourneysEngine } from '../src/plan/templates/journeys-engine.js';

function param(name: string, opts: { html5Constraint?: boolean; boundaries?: unknown[] } = {}) {
  return {
    name,
    kind: name === 'quantity' ? 'number' : 'email',
    partitions: [
      { id: 'valid', kind: 'valid', sampleValues: ['ok'] },
      { id: 'invalid', kind: 'invalid', sampleValues: ['bad'] },
    ],
    boundaries: opts.boundaries || [],
    evidence: [
      { signal: opts.html5Constraint ? 'html5-constraint' : 'form-label', excerpt: 'label' },
    ],
  };
}

function condition(
  conditionId: string,
  parameters: Record<string, string>,
  technique: string,
  reviewed = true,
) {
  return {
    conditionId,
    parameters,
    technique,
    verification: {},
    isSpeculative: !reviewed,
    reviewed,
    ...(reviewed ? { reviewedBy: 'human' } : {}),
  };
}

function testConditionsFixture(routes: Record<string, unknown>) {
  return { schemaVersion: 1, generatedAt: '2026-09-03T11:00:00.000Z', routes };
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-journeys-engine-'));
  writeFileSync(join(dir, 'compose-journeys.mjs'), renderJourneysEngine(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  // Deliberately NOT pre-creating artifacts/test-cases - the script must create its own output
  // directory, unlike artifacts/analysis, which an earlier pipeline stage already writes into.
  return dir;
}

function writeTestConditions(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'test-conditions.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function writeFeatureMap(
  dir: string,
  features: Array<{ id: string; routeIds: string[]; impact?: string; reviewed?: boolean }>,
) {
  const map: Record<string, unknown> = {};
  for (const feature of features) {
    map[feature.id] = {
      featureId: feature.id,
      name: feature.id,
      memberRouteIds: feature.routeIds,
      entityIds: [],
      impact: feature.impact ?? 'high',
      evidence: [{ signal: 'business-intent-label', excerpt: feature.id }],
      reviewed: feature.reviewed ?? true,
      ...(feature.reviewed === false ? {} : { reviewedBy: 'human' }),
    };
  }
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'feature-map.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: '2026-09-08T10:00:00.000Z',
        features: map,
        entities: {},
        sourceHash: 'hash',
      },
      null,
      2,
    ),
    'utf8',
  );
}

function writeApiContracts(dir: string, routeIds: string[]) {
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'api-contracts.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-08T10:00:00.000Z',
      contracts: [
        {
          contractId: 'c000000000000001',
          method: 'POST',
          pathTemplate: '/api/thing',
          observedFromRouteIds: routeIds,
          responseStatus: 200,
          observedAt: '2026-09-08T10:00:00.000Z',
        },
      ],
    }),
    'utf8',
  );
}

function writeJourneys(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'test-cases', 'test-cases.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

type Journey = {
  journeyId: string;
  routeIds: string[];
  featureId?: string;
  testInterface: string;
  breadth: string;
  level: string;
  conditionAssignments: Array<{ conditionId: string; routeId: string; reason: string }>;
  testCase?: { title: string };
  reviewed: boolean;
  reviewedBy?: string;
};

function readJourneys(dir: string): { schemaVersion: number; journeys: Record<string, Journey> } {
  return JSON.parse(readFileSync(join(dir, 'artifacts', 'test-cases', 'test-cases.json'), 'utf8'));
}

function allJourneys(dir: string): Journey[] {
  return Object.values(readJourneys(dir).journeys);
}

// Which journey ended up carrying a given condition, and therefore how that condition gets driven.
function journeyCarrying(dir: string, conditionId: string): Journey | undefined {
  return allJourneys(dir).find((journey) =>
    journey.conditionAssignments.some((a) => a.conditionId === conditionId),
  );
}

function journeyFor(dir: string, routeId: string, testInterface: string): Journey | undefined {
  return allJourneys(dir).find(
    (journey) =>
      journey.breadth === 'targeted' &&
      journey.routeIds[0] === routeId &&
      journey.testInterface === testInterface,
  );
}

function run(dir: string) {
  return spawnSync('node', ['compose-journeys.mjs'], { cwd: dir, encoding: 'utf8' });
}

// email: no html5-constraint evidence. quantity: html5-constraint evidence (mirrors a max=10
// HTML attribute). Route A has a genuine all-valid vector; route B does not.
function routeAFixture() {
  return {
    'route-checkout': {
      routeId: 'route-checkout',
      parameters: [param('email'), param('quantity', { html5Constraint: true })],
      constraints: [],
      conditions: [
        condition('anchor00000000a', { email: 'valid', quantity: 'valid' }, 'combinatorial'),
        condition('invhtml500000b', { email: 'valid', quantity: 'invalid' }, 'combinatorial'),
        condition('invnohtml5000c', { email: 'invalid', quantity: 'valid' }, 'combinatorial'),
        condition('checklisthtml5d', { email: 'valid', quantity: '-1' }, 'checklist-based'),
        condition(
          'checklistplaine',
          { email: 'plainaddress', quantity: 'valid' },
          'checklist-based',
        ),
      ],
      unsatisfiedPairs: [],
      sourceContentHash: 'hash',
      sourceParamsHash: 'hash',
      analyzedAt: '2026-09-03T11:00:00.000Z',
    },
  };
}

// A second route with its own all-valid vector - the other half of a feature walk.
function routeConfirmFixture() {
  return {
    'route-confirm': {
      routeId: 'route-confirm',
      parameters: [param('email')],
      constraints: [],
      conditions: [condition('confirmanchor01', { email: 'valid' }, 'combinatorial')],
      unsatisfiedPairs: [],
      sourceContentHash: 'hash',
      sourceParamsHash: 'hash',
      analyzedAt: '2026-09-03T11:00:00.000Z',
    },
  };
}

// A third parameter with two 'valid'-kind partitions produces two distinct all-valid vectors for
// the same route - exercises findAnchorConditionId's deterministic lowest-conditionId tie-break.
function routeCFixtureTwoAnchors() {
  const plan = {
    name: 'plan',
    kind: 'select',
    partitions: [
      { id: 'valid-a', kind: 'valid', sampleValues: ['Basic'] },
      { id: 'valid-b', kind: 'valid', sampleValues: ['Premium'] },
    ],
    boundaries: [],
    evidence: [{ signal: 'select-option-text', excerpt: 'Basic' }],
  };
  return {
    'route-two-anchors': {
      routeId: 'route-two-anchors',
      parameters: [param('email'), plan],
      constraints: [],
      conditions: [
        condition('zzzsecondanchor', { email: 'valid', plan: 'valid-b' }, 'combinatorial'),
        condition('aaafirstanchor0', { email: 'valid', plan: 'valid-a' }, 'combinatorial'),
      ],
      unsatisfiedPairs: [],
      sourceContentHash: 'hash',
      sourceParamsHash: 'hash',
      analyzedAt: '2026-09-03T11:00:00.000Z',
    },
  };
}

function routeBFixtureNoAnchor() {
  return {
    'route-no-anchor': {
      routeId: 'route-no-anchor',
      parameters: [param('email'), param('quantity', { html5Constraint: true })],
      constraints: [],
      conditions: [
        condition('noanchor0000001', { email: 'invalid', quantity: 'invalid' }, 'combinatorial'),
      ],
      unsatisfiedPairs: [],
      sourceContentHash: 'hash',
      sourceParamsHash: 'hash',
      analyzedAt: '2026-09-03T11:00:00.000Z',
    },
  };
}

describe('scripts/compose-journeys.mjs (real execution)', () => {
  it('creates artifacts/test-cases itself - unlike artifacts/analysis, no earlier stage writes into it first', () => {
    const dir = setupProject();
    try {
      expect(existsSync(join(dir, 'artifacts', 'test-cases'))).toBe(false);
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      const result = run(dir);
      expect(result.status).toBe(0);
      expect(existsSync(join(dir, 'artifacts', 'test-cases', 'test-cases.json'))).toBe(true);
      expect(readJourneys(dir).schemaVersion).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('interface', () => {
    it("drives a route's happy path through the UI - the only interface that proves a person can complete it", () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        expect(run(dir).status).toBe(0);
        const journey = journeyCarrying(dir, 'anchor00000000a');
        expect(journey?.testInterface).toBe('ui');
        expect(
          journey?.conditionAssignments.find((a) => a.conditionId === 'anchor00000000a')?.reason,
        ).toBe('baseline-valid-vector');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('picks the lowest conditionId as the deterministic tie-break when multiple all-valid vectors exist', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeCFixtureTwoAnchors()));
        run(dir);
        expect(journeyCarrying(dir, 'aaafirstanchor0')?.testInterface).toBe('ui');
        expect(journeyCarrying(dir, 'zzzsecondanchor')?.testInterface).toBe('api');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('drives a checklist probe on an html5-constrained parameter through the UI - the browser blocks it before the network sees it', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        expect(journeyCarrying(dir, 'checklisthtml5d')?.testInterface).toBe('ui');
        expect(journeyCarrying(dir, 'invhtml500000b')?.testInterface).toBe('ui');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('drives everything else through the API', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        expect(journeyCarrying(dir, 'checklistplaine')?.testInterface).toBe('api');
        expect(journeyCarrying(dir, 'invnohtml5000c')?.testInterface).toBe('api');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('splits one route into a UI journey and an API journey rather than one journey absorbing both', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        expect(journeyFor(dir, 'route-checkout', 'ui')).toBeDefined();
        expect(journeyFor(dir, 'route-checkout', 'api')).toBeDefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('breadth and level', () => {
    it('calls a single-route journey targeted however many conditions it covers - breadth is reach, not thoroughness', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        expect(allJourneys(dir).every((j) => j.breadth === 'targeted')).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('builds one end-to-end journey per reviewed feature spanning two routes that each have a happy path', () => {
      const dir = setupProject();
      try {
        writeTestConditions(
          dir,
          testConditionsFixture({ ...routeAFixture(), ...routeConfirmFixture() }),
        );
        writeFeatureMap(dir, [
          { id: 'feature-checkout', routeIds: ['route-checkout', 'route-confirm'] },
        ]);
        run(dir);
        const walk = allJourneys(dir).find((j) => j.breadth === 'e2e');
        expect(walk).toBeDefined();
        expect(walk?.featureId).toBe('feature-checkout');
        expect(walk?.routeIds).toEqual(['route-checkout', 'route-confirm']);
        expect(walk?.level).toBe('system');
        expect(walk?.conditionAssignments.map((a) => a.conditionId)).toEqual([
          'anchor00000000a',
          'confirmanchor01',
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('takes each route happy path into the feature walk instead of leaving it duplicated in a targeted journey', () => {
      const dir = setupProject();
      try {
        writeTestConditions(
          dir,
          testConditionsFixture({ ...routeAFixture(), ...routeConfirmFixture() }),
        );
        writeFeatureMap(dir, [
          { id: 'feature-checkout', routeIds: ['route-checkout', 'route-confirm'] },
        ]);
        run(dir);
        const carriers = allJourneys(dir).filter((j) =>
          j.conditionAssignments.some((a) => a.conditionId === 'anchor00000000a'),
        );
        expect(carriers).toHaveLength(1);
        expect(carriers[0].breadth).toBe('e2e');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not walk a feature that only reaches one route - that is that route own targeted test', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        writeFeatureMap(dir, [{ id: 'feature-checkout', routeIds: ['route-checkout'] }]);
        run(dir);
        expect(allJourneys(dir).some((j) => j.breadth === 'e2e')).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('ignores an unreviewed feature - the shape of a test suite is not built on a draft', () => {
      const dir = setupProject();
      try {
        writeTestConditions(
          dir,
          testConditionsFixture({ ...routeAFixture(), ...routeConfirmFixture() }),
        );
        writeFeatureMap(dir, [
          {
            id: 'feature-checkout',
            routeIds: ['route-checkout', 'route-confirm'],
            reviewed: false,
          },
        ]);
        run(dir);
        expect(allJourneys(dir).some((j) => j.breadth === 'e2e')).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('gives a targeted API journey the integration level, and any UI journey the system level', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        expect(journeyFor(dir, 'route-checkout', 'api')?.level).toBe('integration');
        expect(journeyFor(dir, 'route-checkout', 'ui')?.level).toBe('system');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('low impact', () => {
    it('checks a low-impact route through the cheapest interface that can do it, rather than dropping it', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        writeFeatureMap(dir, [{ id: 'feature-help', routeIds: ['route-checkout'], impact: 'low' }]);
        writeApiContracts(dir, ['route-checkout']);
        run(dir);
        const journey = journeyCarrying(dir, 'anchor00000000a');
        expect(journey?.testInterface).toBe('api');
        expect(
          journey?.conditionAssignments.find((a) => a.conditionId === 'anchor00000000a')?.reason,
        ).toBe('low-impact-cheapest-interface');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('falls back to the UI on a low-impact route with no observed contract to call instead', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        writeFeatureMap(dir, [{ id: 'feature-help', routeIds: ['route-checkout'], impact: 'low' }]);
        run(dir);
        expect(journeyCarrying(dir, 'anchor00000000a')?.testInterface).toBe('ui');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('never walks a low-impact feature end to end - the widest test shape is what low impact buys out of', () => {
      const dir = setupProject();
      try {
        writeTestConditions(
          dir,
          testConditionsFixture({ ...routeAFixture(), ...routeConfirmFixture() }),
        );
        writeFeatureMap(dir, [
          {
            id: 'feature-checkout',
            routeIds: ['route-checkout', 'route-confirm'],
            impact: 'low',
          },
        ]);
        run(dir);
        expect(allJourneys(dir).some((j) => j.breadth === 'e2e')).toBe(false);
        // Still tested, just not walked.
        expect(journeyCarrying(dir, 'confirmanchor01')).toBeDefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('re-running', () => {
    it('preserves an existing testCase/reviewed/reviewedBy when the condition set is unchanged', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        const firstPass = readJourneys(dir);
        const journey = journeyFor(dir, 'route-checkout', 'api')!;
        firstPass.journeys[journey.journeyId].testCase = { title: 'Manually drafted' };
        firstPass.journeys[journey.journeyId].reviewed = true;
        firstPass.journeys[journey.journeyId].reviewedBy = 'human';
        writeJourneys(dir, firstPass);

        run(dir);
        const preserved = journeyFor(dir, 'route-checkout', 'api')!;
        expect(preserved.testCase?.title).toBe('Manually drafted');
        expect(preserved.reviewed).toBe(true);
        expect(preserved.reviewedBy).toBe('human');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('regenerates and drops a prior draft when the condition set actually changes', () => {
      const dir = setupProject();
      try {
        writeTestConditions(dir, testConditionsFixture(routeAFixture()));
        run(dir);
        const firstPass = readJourneys(dir);
        const journey = journeyFor(dir, 'route-checkout', 'api')!;
        firstPass.journeys[journey.journeyId].testCase = { title: 'Stale draft' };
        writeJourneys(dir, firstPass);

        const changed = testConditionsFixture(routeAFixture()) as {
          routes: Record<string, { conditions: unknown[] }>;
        };
        changed.routes['route-checkout'].conditions = changed.routes[
          'route-checkout'
        ].conditions.slice(0, 3);
        writeTestConditions(dir, changed);
        run(dir);
        expect(journeyFor(dir, 'route-checkout', 'api')!.testCase).toBeUndefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('reports no journeys at all for a route whose conditions are all unreviewed', () => {
    const dir = setupProject();
    try {
      const fixture = testConditionsFixture(routeAFixture()) as {
        routes: Record<string, { conditions: Array<{ reviewed: boolean }> }>;
      };
      fixture.routes['route-checkout'].conditions.forEach((c) => (c.reviewed = false));
      writeTestConditions(dir, fixture);
      const result = run(dir);
      expect(result.status).toBe(0);
      expect(allJourneys(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('produces no e2e journey for a route with no all-valid vector, without crashing', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeBFixtureNoAnchor()));
      const result = run(dir);
      expect(result.status).toBe(0);
      expect(allJourneys(dir).every((j) => j.breadth === 'targeted')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
