import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { renderJourneysTypes } from '../src/plan/templates/journeys-types.js';
import { renderJourneysValidator } from '../src/plan/templates/journeys-validator.js';

function testConditionsFixture() {
  return {
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
          {
            conditionId: 'b2c3d4e5f6a1b2c3',
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
        sourceParamsHash: 'def456',
        analyzedAt: '2026-09-03T11:00:00.000Z',
      },
      'route-confirm': {
        routeId: 'route-confirm',
        parameters: [],
        constraints: [],
        conditions: [
          {
            conditionId: 'c3d4e5f6a1b2c3d4',
            parameters: {},
            technique: 'combinatorial',
            verification: {},
            isSpeculative: false,
            reviewed: true,
            reviewedBy: 'human',
          },
        ],
        unsatisfiedPairs: [],
        sourceContentHash: 'abc124',
        sourceParamsHash: 'def457',
        analyzedAt: '2026-09-03T11:00:00.000Z',
      },
    },
  };
}

type JourneyFixture = Record<string, unknown>;

function targetedJourney(overrides: JourneyFixture = {}): JourneyFixture {
  return {
    journeyId: 'j1a2b3c4d5e6f7a8',
    routeIds: ['route-checkout'],
    testInterface: 'api',
    breadth: 'targeted',
    level: 'integration',
    conditionAssignments: [
      {
        conditionId: 'a1b2c3d4e5f6a1b2',
        routeId: 'route-checkout',
        reason: 'non-baseline-vector',
      },
    ],
    reviewed: false,
    sourceConditionsHash: 'hash1',
    analyzedAt: '2026-09-03T12:00:00.000Z',
    ...overrides,
  };
}

function featureJourney(overrides: JourneyFixture = {}): JourneyFixture {
  return {
    journeyId: 'f1a2b3c4d5e6f7a8',
    routeIds: ['route-checkout', 'route-confirm'],
    featureId: 'feature-checkout',
    testInterface: 'ui',
    breadth: 'e2e',
    level: 'system',
    conditionAssignments: [
      {
        conditionId: 'b2c3d4e5f6a1b2c3',
        routeId: 'route-checkout',
        reason: 'feature-lifecycle-step',
      },
      {
        conditionId: 'c3d4e5f6a1b2c3d4',
        routeId: 'route-confirm',
        reason: 'feature-lifecycle-step',
      },
    ],
    reviewed: false,
    sourceConditionsHash: 'hash2',
    analyzedAt: '2026-09-03T12:00:00.000Z',
    ...overrides,
  };
}

function report(journeys: JourneyFixture[]) {
  const keyed: Record<string, unknown> = {};
  for (const journey of journeys) keyed[journey.journeyId as string] = journey;
  return { schemaVersion: 2, generatedAt: '2026-09-03T12:00:00.000Z', journeys: keyed };
}

function wellFormed() {
  return report([targetedJourney(), featureJourney()]);
}

function withTestCase() {
  return report([
    targetedJourney({
      testCase: {
        title: 'Checkout rejects an over-limit quantity',
        preconditions: ['User is authenticated'],
        steps: [
          {
            description: 'Submit the checkout form with a quantity above the limit',
            expectedResult: 'The request is rejected with a validation message',
          },
        ],
      },
    }),
  ]);
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-journeys-'));
  writeFileSync(join(dir, 'validate-journeys.mjs'), renderJourneysValidator(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'test-cases'), { recursive: true });
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'test-conditions.json'),
    JSON.stringify(testConditionsFixture(), null, 2),
    'utf8',
  );
  return dir;
}

function writeJourneys(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'test-cases', 'test-cases.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string, args: string[] = []) {
  return spawnSync('node', ['validate-journeys.mjs', ...args], { cwd: dir, encoding: 'utf8' });
}

function failsWith(data: unknown, fragment: string, args: string[] = ['--stage=structural']) {
  const dir = setupProject();
  try {
    writeJourneys(dir, data);
    const result = run(dir, args);
    const output = JSON.parse(result.stdout);
    expect(output.status).toBe('FAILED');
    expect(output.errors.some((e: string) => e.includes(fragment))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('scripts/validate-journeys.mjs (real execution)', () => {
  it('passes --stage=structural validation for a targeted journey and a feature walk side by side', () => {
    const dir = setupProject();
    try {
      writeJourneys(dir, wellFormed());
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes full validation for a well-formed fixture including testCase', () => {
    const dir = setupProject();
    try {
      writeJourneys(dir, withTestCase());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when schemaVersion is still the route-keyed version 1', () => {
    const data = wellFormed() as Record<string, unknown>;
    data.schemaVersion = 1;
    failsWith(data, 'schemaVersion must be exactly 2');
  });

  it('fails when testInterface is anything but ui or api', () => {
    failsWith(report([targetedJourney({ testInterface: 'ui-only' })]), 'testInterface');
  });

  it('fails when breadth is anything but targeted or e2e', () => {
    failsWith(report([targetedJourney({ breadth: 'wide' })]), 'breadth');
  });

  it('fails when a UI journey claims to be an integration test - a browser exercises the whole system', () => {
    failsWith(
      report([targetedJourney({ testInterface: 'ui', level: 'integration' })]),
      "level 'integration' only describes a targeted API journey",
    );
  });

  it('fails when a feature walk claims to be an integration test', () => {
    failsWith(
      report([featureJourney({ level: 'integration' })]),
      "level 'integration' only describes a targeted API journey",
    );
  });

  it('fails when an e2e journey names no feature it is walking', () => {
    const journey = featureJourney();
    delete journey.featureId;
    failsWith(report([journey]), 'requires a featureId');
  });

  it('fails when an e2e journey covers a single route - that is a targeted test', () => {
    failsWith(
      report([featureJourney({ routeIds: ['route-checkout'] })]),
      'requires at least 2 routes',
    );
  });

  it('fails when a targeted journey carries a featureId it has no business having', () => {
    failsWith(
      report([targetedJourney({ featureId: 'feature-checkout' })]),
      'featureId is only meaningful on a journey walking a feature',
    );
  });

  it('fails when a conditionAssignment names a route the journey does not walk', () => {
    failsWith(
      report([
        targetedJourney({
          conditionAssignments: [
            { conditionId: 'a1b2c3d4e5f6a1b2', routeId: 'route-elsewhere', reason: 'x' },
          ],
        }),
      ]),
      'is not one of the routes this journey walks',
    );
  });

  it('fails when a conditionAssignment references a conditionId absent from test-conditions.json', () => {
    failsWith(
      report([
        targetedJourney({
          conditionAssignments: [
            { conditionId: 'ghost0000000000', routeId: 'route-checkout', reason: 'x' },
          ],
        }),
      ]),
      'does not exist in artifacts/analysis/test-conditions.json',
    );
  });

  it('fails when a journeyId disagrees with its own key', () => {
    const data = report([targetedJourney()]) as {
      journeys: Record<string, { journeyId: string }>;
    };
    data.journeys['j1a2b3c4d5e6f7a8'].journeyId = 'somethingelse01';
    failsWith(data, 'must equal its own key');
  });

  // Two journeys covering one condition means the same check gets written as two separate tests,
  // which nothing downstream would notice on its own.
  it('fails when two journeys claim the same condition', () => {
    failsWith(
      report([
        targetedJourney(),
        targetedJourney({
          journeyId: 'j2a2b3c4d5e6f7a8',
          testInterface: 'ui',
          level: 'system',
        }),
      ]),
      'is claimed by two journeys',
    );
  });

  it('fails when acceptance is claimed by anything other than a person', () => {
    failsWith(
      report([
        targetedJourney({
          acceptanceCriterion: { statedBy: 'auto-pilot', statedAt: '2026-09-08T00:00:00.000Z' },
        }),
      ]),
      "acceptanceCriterion.statedBy must be 'human'",
    );
  });

  it('passes when a person marked a journey as their acceptance criterion', () => {
    const dir = setupProject();
    try {
      writeJourneys(
        dir,
        report([
          targetedJourney({
            acceptanceCriterion: {
              statedBy: 'human',
              statedAt: '2026-09-08T00:00:00.000Z',
              note: 'this is what we sign checkout off on',
            },
          }),
        ]),
      );
      expect(JSON.parse(run(dir, ['--stage=structural']).stdout).status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when testCase.preconditions contains a non-string element', () => {
    const data = withTestCase() as {
      journeys: Record<string, { testCase: { preconditions: unknown[] } }>;
    };
    data.journeys['j1a2b3c4d5e6f7a8'].testCase.preconditions = [42];
    failsWith(data, '.preconditions must be an array of strings', []);
  });

  it('fails when a journey has reviewed:true with no reviewedBy', () => {
    failsWith(
      report([targetedJourney({ reviewed: true })]),
      'reviewedBy must be "human" or "auto-pilot"',
    );
  });

  it('passes when a journey has reviewed:true and reviewedBy:"human"', () => {
    const dir = setupProject();
    try {
      writeJourneys(dir, report([targetedJourney({ reviewed: true, reviewedBy: 'human' })]));
      const output = JSON.parse(run(dir, ['--stage=structural']).stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails full validation when testCase.steps is empty, but --stage=structural ignores it', () => {
    const dir = setupProject();
    try {
      const bad = withTestCase() as {
        journeys: Record<string, { testCase: { steps: unknown[] } }>;
      };
      bad.journeys['j1a2b3c4d5e6f7a8'].testCase.steps = [];
      writeJourneys(dir, bad);

      expect(JSON.parse(run(dir, ['--stage=structural']).stdout).status).toBe('PASSED');

      const full = JSON.parse(run(dir).stdout);
      expect(full.status).toBe('FAILED');
      expect(full.errors.some((e: string) => e.includes('.steps must be a non-empty array'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('renderJourneysTypes (real standalone tsc check)', () => {
  it('renders a schemaVersion-2 JourneysReport keyed by journeyId, and the output is tsc --noEmit clean in isolation', () => {
    const text = renderJourneysTypes();
    expect(text).toContain('JourneysReport');
    expect(text).toContain('JourneyEntry');
    expect(text).toContain('ConditionAssignment');
    expect(text).toContain('DraftTestCase');
    expect(text).toContain("export type TestInterface = 'ui' | 'api';");
    expect(text).toContain("export type TestBreadth = 'targeted' | 'e2e';");
    expect(text).toContain("export type TestLevel = 'integration' | 'system';");
    expect(text).toContain('schemaVersion: 2');
    expect(text).toContain("reviewedBy?: 'human' | 'auto-pilot';");

    const dir = mkdtempSync(join(tmpdir(), 'eitr-journeys-types-'));
    try {
      const filePath = join(dir, 'test-cases.types.ts');
      writeFileSync(filePath, text, 'utf8');
      const tscJs = join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
      const result = spawnSync('node', [tscJs, '--noEmit', '--strict', filePath], {
        encoding: 'utf8',
      });
      expect(result.status, (result.stdout || '') + (result.stderr || '')).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
