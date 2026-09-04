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
        ],
        unsatisfiedPairs: [],
        sourceContentHash: 'abc123',
        sourceParamsHash: 'def456',
        analyzedAt: '2026-09-03T11:00:00.000Z',
      },
    },
  };
}

function wellFormedJourneysStructuralOnly() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-03T12:00:00.000Z',
    routes: {
      'route-checkout': {
        routeId: 'route-checkout',
        journeys: [
          {
            journeyId: 'j1a2b3c4d5e6f7a8',
            routeId: 'route-checkout',
            conditionAssignments: [
              {
                conditionId: 'a1b2c3d4e5f6a1b2',
                testLevel: 'e2e',
                reason: 'baseline-valid-vector',
              },
            ],
            reviewed: false,
            sourceConditionsHash: 'hash1',
            analyzedAt: '2026-09-03T12:00:00.000Z',
          },
        ],
      },
    },
  };
}

function wellFormedJourneysWithTestCase() {
  const report = structuredClone(wellFormedJourneysStructuralOnly()) as {
    routes: Record<string, { journeys: Array<Record<string, unknown>> }>;
  };
  report.routes['route-checkout'].journeys[0].testCase = {
    title: 'Checkout succeeds with valid data',
    preconditions: ['User is authenticated'],
    steps: [
      {
        description: 'Submit the checkout form with valid data',
        expectedResult: 'Order confirmed',
      },
    ],
  };
  return report;
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

describe('scripts/validate-journeys.mjs (real execution)', () => {
  it('passes --stage=structural validation for a well-formed structural-only fixture', () => {
    const dir = setupProject();
    try {
      writeJourneys(dir, wellFormedJourneysStructuralOnly());
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
      writeJourneys(dir, wellFormedJourneysWithTestCase());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a conditionAssignment.testLevel is not e2e|api|ui-only', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysStructuralOnly()) as {
        routes: Record<
          string,
          { journeys: Array<{ conditionAssignments: Array<{ testLevel: string }> }> }
        >;
      };
      bad.routes['route-checkout'].journeys[0].conditionAssignments[0].testLevel = 'unit';
      writeJourneys(dir, bad);
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('testLevel must be one of'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a conditionAssignment references a conditionId absent from test-conditions.json', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysStructuralOnly()) as {
        routes: Record<
          string,
          { journeys: Array<{ conditionAssignments: Array<{ conditionId: string }> }> }
        >;
      };
      bad.routes['route-checkout'].journeys[0].conditionAssignments[0].conditionId =
        'ghost0000000000';
      writeJourneys(dir, bad);
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('does not exist in artifacts/analysis/test-conditions.json'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a JourneyEntry.routeId does not match its outer key', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysStructuralOnly()) as {
        routes: Record<string, { journeys: Array<{ routeId: string }> }>;
      };
      bad.routes['route-checkout'].journeys[0].routeId = 'route-other';
      writeJourneys(dir, bad);
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.routeId must equal "route-checkout"')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when testCase.preconditions contains a non-string element', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysWithTestCase()) as {
        routes: Record<string, { journeys: Array<{ testCase: { preconditions: unknown[] } }> }>;
      };
      bad.routes['route-checkout'].journeys[0].testCase.preconditions = [42];
      writeJourneys(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.preconditions must be an array of strings')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a journey has reviewed:true with no reviewedBy', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysStructuralOnly()) as {
        routes: Record<string, { journeys: Array<{ reviewed: boolean }> }>;
      };
      bad.routes['route-checkout'].journeys[0].reviewed = true;
      writeJourneys(dir, bad);
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('reviewedBy must be "human" or "auto-pilot"')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when a journey has reviewed:true and reviewedBy:"human"', () => {
    const dir = setupProject();
    try {
      const good = structuredClone(wellFormedJourneysStructuralOnly()) as {
        routes: Record<string, { journeys: Array<{ reviewed: boolean; reviewedBy?: string }> }>;
      };
      good.routes['route-checkout'].journeys[0].reviewed = true;
      good.routes['route-checkout'].journeys[0].reviewedBy = 'human';
      writeJourneys(dir, good);
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails full validation when testCase.steps is empty, but --stage=structural ignores it', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysWithTestCase()) as {
        routes: Record<string, { journeys: Array<{ testCase: { steps: unknown[] } }> }>;
      };
      bad.routes['route-checkout'].journeys[0].testCase.steps = [];
      writeJourneys(dir, bad);

      const structural = JSON.parse(run(dir, ['--stage=structural']).stdout);
      expect(structural.status).toBe('PASSED');

      const full = JSON.parse(run(dir).stdout);
      expect(full.status).toBe('FAILED');
      expect(full.errors.some((e: string) => e.includes('.steps must be a non-empty array'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when journeyId is duplicated across journeys', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedJourneysStructuralOnly()) as {
        routes: Record<string, { journeys: Array<Record<string, unknown>> }>;
      };
      const journeyCopy = structuredClone(bad.routes['route-checkout'].journeys[0]);
      bad.routes['route-checkout'].journeys.push(journeyCopy);
      writeJourneys(dir, bad);
      const result = run(dir, ['--stage=structural']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('is a duplicate'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('renderJourneysTypes (real standalone tsc check)', () => {
  it('renders a schemaVersion-1 JourneysReport interface keyed by routeId, and the output is tsc --noEmit clean in isolation', () => {
    const text = renderJourneysTypes();
    expect(text).toContain('JourneysReport');
    expect(text).toContain('JourneyEntry');
    expect(text).toContain('ConditionAssignment');
    expect(text).toContain('DraftTestCase');
    expect(text).toContain("export type TestLevel = 'e2e' | 'api' | 'ui-only';");
    expect(text).toContain('schemaVersion: 1');
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
