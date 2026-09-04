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
  mkdirSync(join(dir, 'docs', 'analysis'), { recursive: true });
  // Deliberately NOT pre-creating docs/test-cases - the script must create its own output
  // directory, unlike docs/analysis, which an earlier pipeline stage already writes into.
  return dir;
}

function writeTestConditions(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'test-conditions.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function writeJourneys(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'docs', 'test-cases', 'test-cases.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function readJourneys(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'docs', 'test-cases', 'test-cases.json'), 'utf8'));
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

function assignmentFor(
  journeys: {
    routes: Record<
      string,
      {
        journeys: Array<{
          conditionAssignments: Array<{ conditionId: string; testLevel: string }>;
        }>;
      }
    >;
  },
  routeId: string,
  conditionId: string,
) {
  const assignments = journeys.routes[routeId].journeys[0].conditionAssignments;
  return assignments.find((a) => a.conditionId === conditionId);
}

describe('scripts/compose-journeys.mjs (real execution)', () => {
  it('creates docs/test-cases itself - unlike docs/analysis, no earlier stage writes into it first', () => {
    const dir = setupProject();
    try {
      expect(existsSync(join(dir, 'docs', 'test-cases'))).toBe(false);
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      const result = run(dir);
      expect(result.status).toBe(0);
      expect(existsSync(join(dir, 'docs', 'test-cases', 'test-cases.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assigns the all-valid vector e2e, and the anchor is never downgraded by a sibling condition', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      const result = run(dir);
      expect(result.status).toBe(0);
      const journeys = readJourneys(dir);
      expect(assignmentFor(journeys, 'route-checkout', 'anchor00000000a')?.testLevel).toBe('e2e');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('picks the lowest conditionId as the deterministic tie-break when multiple all-valid vectors exist', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeCFixtureTwoAnchors()));
      run(dir);
      const journeys = readJourneys(dir);
      expect(assignmentFor(journeys, 'route-two-anchors', 'aaafirstanchor0')?.testLevel).toBe(
        'e2e',
      );
      expect(assignmentFor(journeys, 'route-two-anchors', 'zzzsecondanchor')?.testLevel).toBe(
        'api',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports zero e2e assignments for a route with no all-valid vector, without crashing', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeBFixtureNoAnchor()));
      const result = run(dir);
      expect(result.status).toBe(0);
      const journeys = readJourneys(dir);
      const assignments = journeys.routes['route-no-anchor'].journeys[0].conditionAssignments;
      expect(assignments.some((a: { testLevel: string }) => a.testLevel === 'e2e')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assigns checklist-based on an html5-constraint parameter to ui-only', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      run(dir);
      const journeys = readJourneys(dir);
      expect(assignmentFor(journeys, 'route-checkout', 'checklisthtml5d')?.testLevel).toBe(
        'ui-only',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assigns checklist-based on a non-html5-constraint parameter to api', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      run(dir);
      const journeys = readJourneys(dir);
      expect(assignmentFor(journeys, 'route-checkout', 'checklistplaine')?.testLevel).toBe('api');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assigns a combinatorial vector selecting an invalid html5-constraint partition to ui-only, while the anchor in the same route stays e2e', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      run(dir);
      const journeys = readJourneys(dir);
      expect(assignmentFor(journeys, 'route-checkout', 'invhtml500000b')?.testLevel).toBe(
        'ui-only',
      );
      expect(assignmentFor(journeys, 'route-checkout', 'anchor00000000a')?.testLevel).toBe('e2e');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assigns a combinatorial vector selecting an invalid non-html5-constraint partition to api', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      run(dir);
      const journeys = readJourneys(dir);
      expect(assignmentFor(journeys, 'route-checkout', 'invnohtml5000c')?.testLevel).toBe('api');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves an existing testCase/reviewed/reviewedBy when the route condition set is unchanged', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      run(dir);
      const firstPass = readJourneys(dir);
      const journey = firstPass.routes['route-checkout'].journeys[0];
      journey.testCase = {
        title: 'Manually drafted',
        preconditions: [],
        steps: [{ description: 'do it', expectedResult: 'works' }],
      };
      journey.reviewed = true;
      journey.reviewedBy = 'human';
      writeJourneys(dir, firstPass);

      // Re-run with the exact same test-conditions.json - nothing structurally changed.
      run(dir);
      const secondPass = readJourneys(dir);
      const preserved = secondPass.routes['route-checkout'].journeys[0];
      expect(preserved.testCase.title).toBe('Manually drafted');
      expect(preserved.reviewed).toBe(true);
      expect(preserved.reviewedBy).toBe('human');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('regenerates and drops a prior draft when the route condition set actually changes', () => {
    const dir = setupProject();
    try {
      writeTestConditions(dir, testConditionsFixture(routeAFixture()));
      run(dir);
      const firstPass = readJourneys(dir);
      firstPass.routes['route-checkout'].journeys[0].testCase = {
        title: 'Stale draft',
        preconditions: [],
        steps: [{ description: 'x', expectedResult: 'y' }],
      };
      writeJourneys(dir, firstPass);

      // Change the underlying reviewed condition set (drop one condition) - sourceConditionsHash
      // must change, so this is treated as structurally different and regenerated fresh.
      const changed = testConditionsFixture(routeAFixture()) as {
        routes: Record<string, { conditions: unknown[] }>;
      };
      changed.routes['route-checkout'].conditions = changed.routes[
        'route-checkout'
      ].conditions.slice(0, 3);
      writeTestConditions(dir, changed);
      run(dir);
      const secondPass = readJourneys(dir);
      expect(secondPass.routes['route-checkout'].journeys[0].testCase).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips a route with zero reviewed conditions entirely', () => {
    const dir = setupProject();
    try {
      const fixture = testConditionsFixture(routeAFixture()) as {
        routes: Record<string, { conditions: Array<{ reviewed: boolean }> }>;
      };
      fixture.routes['route-checkout'].conditions.forEach((c) => (c.reviewed = false));
      writeTestConditions(dir, fixture);
      const result = run(dir);
      expect(result.status).toBe(0);
      const journeys = readJourneys(dir);
      expect(journeys.routes['route-checkout']).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
