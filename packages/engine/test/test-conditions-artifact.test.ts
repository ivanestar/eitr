import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTestConditionsTypes } from '../src/plan/templates/test-conditions-types.js';
import { renderTestConditionsValidator } from '../src/plan/templates/test-conditions-validator.js';

const SITE_MAP = {
  schemaVersion: 2,
  generatedAt: '2026-09-03T10:00:00.000Z',
  baseUrl: 'https://example.com',
  routes: {
    '/checkout': {
      routeId: 'route-checkout',
      sampleUrls: ['https://example.com/checkout'],
      title: 'Checkout',
      discoveredAt: '2026-09-03T10:00:00.000Z',
      lastCheckedAt: '2026-09-03T10:00:00.000Z',
      contentHash: 'abc123',
      status: 'active',
    },
  },
};

function wellFormedParametersOnly() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T11:00:00.000Z',
    routes: {
      'route-checkout': {
        routeId: 'route-checkout',
        parameters: [
          {
            name: 'email',
            kind: 'email',
            partitions: [
              {
                id: 'valid',
                kind: 'valid',
                sampleValues: ['user@example.com'],
                expectedOutcome: 'the confirmation names the address',
              },
              {
                id: 'empty',
                kind: 'invalid',
                sampleValues: [''],
                expectedOutcome: 'a message under the field says the email is required',
                rule: { signal: 'html5-constraint', excerpt: 'required' },
              },
            ],
            boundaries: [],
            evidence: [{ signal: 'form-label', excerpt: 'Email' }],
          },
          {
            name: 'quantity',
            kind: 'number',
            partitions: [
              {
                id: 'valid',
                kind: 'valid',
                sampleValues: ['5'],
                expectedOutcome: 'the line total updates to the chosen quantity',
              },
              {
                id: 'too-high',
                kind: 'invalid',
                sampleValues: ['1000'],
                expectedOutcome: 'a message under the field says at most 10 can be ordered',
                rule: { signal: 'html5-constraint', excerpt: 'max=10' },
              },
            ],
            boundaries: [
              {
                boundary: 'max',
                values: ['9', '10', '11'],
                rule: { signal: 'html5-constraint', excerpt: 'max=10' },
                acceptedOutcome: 'the line total matches the quantity entered',
                rejectedOutcome: 'the field is marked invalid and the order cannot be placed',
              },
            ],
            evidence: [{ signal: 'html5-constraint', excerpt: 'max=10' }],
          },
        ],
        constraints: [],
        conditions: [],
        unsatisfiedPairs: [],
        sourceContentHash: 'abc123',
        sourceParamsHash: '',
        analyzedAt: '2026-09-03T11:00:00.000Z',
      },
    },
  };
}

function wellFormedWithConditions() {
  const report = structuredClone(wellFormedParametersOnly()) as {
    routes: Record<string, { conditions: unknown[] }>;
  };
  report.routes['route-checkout'].conditions = [
    {
      conditionId: 'a1b2c3d4e5f6a1b2',
      parameters: { email: 'valid', quantity: 'valid' },
      technique: 'combinatorial',
      description:
        'With email="user@example.com", quantity="5": the confirmation names the address; the line total updates to the chosen quantity (positive)',
      expectedOutcome:
        'the confirmation names the address; the line total updates to the chosen quantity',
      scenario: 'positive',
      verification: {},
      isSpeculative: true,
      reviewed: false,
    },
  ];
  return report;
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-test-conditions-'));
  writeFileSync(join(dir, 'validate-test-conditions.mjs'), renderTestConditionsValidator(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify(SITE_MAP, null, 2),
    'utf8',
  );
  return dir;
}

function writeReport(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'test-conditions.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string, args: string[] = []) {
  return spawnSync('node', ['validate-test-conditions.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

describe('scripts/validate-test-conditions.mjs (real execution)', () => {
  // AC1, AC10
  it('passes --stage=parameters validation for a well-formed parameters-only fixture', () => {
    const dir = setupProject();
    try {
      writeReport(dir, wellFormedParametersOnly());
      const result = run(dir, ['--stage=parameters']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes full validation for a well-formed fixture including conditions', () => {
    const dir = setupProject();
    try {
      writeReport(dir, wellFormedWithConditions());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a condition has reviewed:true with no reviewedBy', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedWithConditions()) as {
        routes: Record<
          string,
          { conditions: Array<{ isSpeculative: boolean; reviewed: boolean }> }
        >;
      };
      bad.routes['route-checkout'].conditions[0].isSpeculative = false;
      bad.routes['route-checkout'].conditions[0].reviewed = true;
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('reviewedBy must be "human" or "auto-pilot"')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when a condition has reviewed:true and reviewedBy:"human"', () => {
    const dir = setupProject();
    try {
      const good = structuredClone(wellFormedWithConditions()) as {
        routes: Record<
          string,
          { conditions: Array<{ isSpeculative: boolean; reviewed: boolean; reviewedBy?: string }> }
        >;
      };
      good.routes['route-checkout'].conditions[0].isSpeculative = false;
      good.routes['route-checkout'].conditions[0].reviewed = true;
      good.routes['route-checkout'].conditions[0].reviewedBy = 'human';
      writeReport(dir, good);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The equivalence-partition fallback (single-parameter routes) must pass the same gate as
  // combinatorial/boundary-value - the allowlist here has to move in lockstep with
  // TestConditionTechnique in test-conditions-types.ts and what the generator actually emits.
  it('passes full validation for a condition tagged technique: equivalence-partition', () => {
    const dir = setupProject();
    try {
      const report = structuredClone(wellFormedWithConditions()) as {
        routes: Record<string, { conditions: Array<{ technique: string }> }>;
      };
      report.routes['route-checkout'].conditions[0].technique = 'equivalence-partition';
      writeReport(dir, report);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes full validation for a condition tagged technique: checklist-based', () => {
    const dir = setupProject();
    try {
      const report = structuredClone(wellFormedWithConditions()) as {
        routes: Record<string, { conditions: Array<{ technique: string }> }>;
      };
      report.routes['route-checkout'].conditions[0].technique = 'checklist-based';
      writeReport(dir, report);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a condition has no description - a human cannot review what they cannot see', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedWithConditions()) as {
        routes: Record<string, { conditions: Array<{ description?: string }> }>;
      };
      delete bad.routes['route-checkout'].conditions[0].description;
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.description must be a non-empty string')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a condition has an out-of-taxonomy scenario value', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedWithConditions()) as {
        routes: Record<string, { conditions: Array<{ scenario: string }> }>;
      };
      bad.routes['route-checkout'].conditions[0].scenario = 'maybe';
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.scenario must be one of positive|negative')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC5, case 1/2
  it('fails on a routeId with no matching entry in site-map.json', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedParametersOnly()) as {
        routes: Record<string, unknown>;
      };
      bad.routes['route-ghost'] = {
        ...(bad.routes['route-checkout'] as object),
        routeId: 'route-ghost',
      };
      writeReport(dir, bad);
      const result = run(dir, ['--stage=parameters']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('dangling reference'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC5, case 2/2 - the "legitimately zero routes" regression Stage 1 already has.
  it('fails a dangling routeId even when site-map.json legitimately has zero routes', () => {
    const dir = setupProject();
    try {
      writeFileSync(
        join(dir, 'artifacts', 'site-map', 'site-map.json'),
        JSON.stringify({ ...SITE_MAP, routes: {} }, null, 2),
        'utf8',
      );
      writeReport(dir, wellFormedParametersOnly());
      const result = run(dir, ['--stage=parameters']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('dangling reference'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC4
  it('fails a condition with isSpeculative:true and reviewed:true at the same time', () => {
    const dir = setupProject();
    try {
      const bad = wellFormedWithConditions() as {
        routes: Record<string, { conditions: Array<{ reviewed: boolean }> }>;
      };
      bad.routes['route-checkout'].conditions[0].reviewed = true;
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('isSpeculative:true and reviewed:true')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC9
  it('fails on a duplicate conditionId within the same route', () => {
    const dir = setupProject();
    try {
      const bad = wellFormedWithConditions() as {
        routes: Record<string, { conditions: unknown[] }>;
      };
      bad.routes['route-checkout'].conditions.push({
        ...(bad.routes['route-checkout'].conditions[0] as object),
      });
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('duplicate within this route'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC11
  it('fails a parameter with boundaries but no valid-kind partition', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedParametersOnly()) as {
        routes: Record<string, { parameters: Array<{ partitions: unknown[] }> }>;
      };
      bad.routes['route-checkout'].parameters[1].partitions = [
        { id: 'too-high', kind: 'invalid', sampleValues: ['1000'] },
      ];
      writeReport(dir, bad);
      const result = run(dir, ['--stage=parameters']);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes("no 'valid'-kind partition"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('oracle and partition validity', () => {
    type Fixture = {
      routes: Record<
        string,
        {
          parameters: Array<Record<string, any>>;
          conditions: Array<Record<string, any>>;
        }
      >;
    };

    function paramsFixture(): Fixture {
      return structuredClone(wellFormedParametersOnly()) as unknown as Fixture;
    }

    function conditionsFixture(): Fixture {
      return structuredClone(wellFormedWithConditions()) as unknown as Fixture;
    }

    // The unit-converter shape: a select with its offered options recorded.
    function withMeasureSelect(report: Fixture, partitions: Array<Record<string, any>>) {
      report.routes['route-checkout'].parameters.push({
        name: 'measure',
        kind: 'select',
        options: ['Length', 'Weight', 'Speed'],
        partitions,
        boundaries: [],
        evidence: [{ signal: 'form-label', excerpt: 'Measure' }],
      });
      return report;
    }

    const lengthPartition = {
      id: 'length',
      kind: 'valid',
      sampleValues: ['Length'],
      expectedOutcome: 'the result lists metres, feet and inches',
    };

    function errorsFor(report: unknown, args: string[] = []): string[] {
      const dir = setupProject();
      try {
        writeReport(dir, report);
        const output = JSON.parse(run(dir, args).stdout);
        return output.errors as string[];
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('fails an invalid partition that names no rule it breaks', () => {
      const report = paramsFixture();
      delete report.routes['route-checkout'].parameters[0].partitions[1].rule;
      const errors = errorsFor(report, ['--stage=parameters']);
      expect(errors.some((e) => e.includes('partitions[1].rule is required'))).toBe(true);
    });

    it('fails a rule or a boundary that quotes a placeholder example', () => {
      const report = paramsFixture();
      report.routes['route-checkout'].parameters[1].boundaries[0].rule = {
        signal: 'form-label',
        excerpt: 'e.g. 20',
      };
      const errors = errorsFor(report, ['--stage=parameters']);
      expect(errors.some((e) => e.includes('"e.g. 20" is an example value, not a rule'))).toBe(
        true,
      );
    });

    it('fails a boundary with no stated limit or without either of its outcomes', () => {
      const report = paramsFixture();
      delete report.routes['route-checkout'].parameters[1].boundaries[0].rule;
      delete report.routes['route-checkout'].parameters[1].boundaries[0].acceptedOutcome;
      delete report.routes['route-checkout'].parameters[1].boundaries[0].rejectedOutcome;
      const errors = errorsFor(report, ['--stage=parameters']);
      expect(errors.some((e) => e.includes('boundaries[0].rule is required'))).toBe(true);
      for (const field of ['acceptedOutcome', 'rejectedOutcome']) {
        expect(
          errors.some((e) => e.includes('boundaries[0].' + field + ' must be a non-empty string')),
        ).toBe(true);
      }
    });

    // A positive vector's outcome joins one outcome per value, so over six parameters it runs long;
    // the ceiling is for what a model writes by hand.
    it('lets a generated condition outcome run long but caps the one an invariant states itself', () => {
      const long = 'every GUID is wrapped in braces; '.repeat(8).trim();
      const generated = conditionsFixture();
      generated.routes['route-checkout'].conditions[0].expectedOutcome = long;
      expect(errorsFor(generated)).toEqual([]);

      const invariant = conditionsFixture();
      invariant.routes['route-checkout'].conditions[0] = {
        ...invariant.routes['route-checkout'].conditions[0],
        technique: 'architectural-invariant',
        parameters: {},
        scenario: 'negative',
        negativeCategory: 'concurrent_conflict',
        description: 'Verify a double-clicked order button places one order',
        expectedOutcome: long,
      };
      expect(
        errorsFor(invariant).some((e) => e.includes('.expectedOutcome must be <=200 chars')),
      ).toBe(true);
    });

    it('fails a partition whose outcome is a placeholder phrase', () => {
      const report = paramsFixture();
      report.routes['route-checkout'].parameters[0].partitions[1].expectedOutcome =
        'the page correctly handles the empty value';
      const errors = errorsFor(report, ['--stage=parameters']);
      expect(errors.some((e) => e.includes('says "correctly handles"'))).toBe(true);
    });

    // Live-observed: "speed" from a converter's own unit list recorded as invalid.
    it('fails an invalid sample that is one of the options the select itself offers', () => {
      const report = withMeasureSelect(paramsFixture(), [
        lengthPartition,
        {
          id: 'invalid-measure',
          kind: 'invalid',
          sampleValues: ['speed'],
          expectedOutcome: 'no result is shown',
          rule: { signal: 'select-option-text', excerpt: 'Length, Weight' },
          executionLevel: 'dom',
        },
      ]);
      const errors = errorsFor(report, ['--stage=parameters']);
      expect(errors.some((e) => e.includes('sample "speed" is one of the options'))).toBe(true);
    });

    it('fails a valid sample the select does not offer, and a select with no options recorded', () => {
      const offered = withMeasureSelect(paramsFixture(), [
        { ...lengthPartition, sampleValues: ['Volume'] },
      ]);
      expect(
        errorsFor(offered, ['--stage=parameters']).some((e) =>
          e.includes('sample "Volume" is not one of the options'),
        ),
      ).toBe(true);

      const unlisted = withMeasureSelect(paramsFixture(), [lengthPartition]);
      delete unlisted.routes['route-checkout'].parameters[2].options;
      expect(
        errorsFor(unlisted, ['--stage=parameters']).some((e) =>
          e.includes('.options must list the option labels'),
        ),
      ).toBe(true);
    });

    it('requires a dom or api level on an invalid select value, and accepts dom', () => {
      const invalidMeasure = {
        id: 'unknown-measure',
        kind: 'invalid',
        sampleValues: ['Parsecs'],
        expectedOutcome: 'no result is shown and the list keeps its last choice',
        rule: { signal: 'select-option-text', excerpt: 'Length, Weight, Speed' },
      };
      const missing = withMeasureSelect(paramsFixture(), [lengthPartition, invalidMeasure]);
      expect(
        errorsFor(missing, ['--stage=parameters']).some((e) =>
          e.includes('which the control itself can never produce'),
        ),
      ).toBe(true);

      const dom = withMeasureSelect(paramsFixture(), [
        lengthPartition,
        { ...invalidMeasure, executionLevel: 'dom' },
      ]);
      expect(errorsFor(dom, ['--stage=parameters'])).toEqual([]);
    });

    it('allows an api-level value only on a route where the crawl observed an API call', () => {
      const report = withMeasureSelect(paramsFixture(), [
        lengthPartition,
        {
          id: 'unknown-measure',
          kind: 'invalid',
          sampleValues: ['Parsecs'],
          expectedOutcome: 'the API answers 400 and names the measure',
          rule: { signal: 'select-option-text', excerpt: 'Length, Weight, Speed' },
          executionLevel: 'api',
        },
      ]);
      expect(
        errorsFor(report, ['--stage=parameters']).some((e) =>
          e.includes('no API call was observed on this route'),
        ),
      ).toBe(true);

      const dir = setupProject();
      try {
        writeReport(dir, report);
        writeFileSync(
          join(dir, 'artifacts', 'site-map', 'api-contracts.json'),
          JSON.stringify({ contracts: [{ observedFromRouteIds: ['route-checkout'] }] }),
          'utf8',
        );
        const output = JSON.parse(run(dir, ['--stage=parameters']).stdout);
        expect(output.errors).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails a parameter with no valid partition even when it has no boundaries', () => {
      const report = paramsFixture();
      report.routes['route-checkout'].parameters[0].partitions.splice(0, 1);
      const errors = errorsFor(report, ['--stage=parameters']);
      expect(errors.some((e) => e.includes("no 'valid'-kind partition"))).toBe(true);
    });

    it('fails a condition with no expected outcome, or a description that only says it is handled', () => {
      const missing = conditionsFixture();
      delete missing.routes['route-checkout'].conditions[0].expectedOutcome;
      expect(
        errorsFor(missing).some((e) => e.includes('.expectedOutcome must be a non-empty string')),
      ).toBe(true);

      const vague = conditionsFixture();
      vague.routes['route-checkout'].conditions[0].description =
        'Verify the page correctly handles email="", quantity="5" (negative)';
      expect(
        errorsFor(vague).some((e) => e.includes('.description says "correctly handles"')),
      ).toBe(true);
    });

    it('fails a combinatorial condition carrying two invalid values', () => {
      const report = conditionsFixture();
      report.routes['route-checkout'].conditions[0] = {
        ...report.routes['route-checkout'].conditions[0],
        parameters: { email: 'empty', quantity: 'too-high' },
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        expectedOutcome: 'a message under the field says the email is required',
      };
      expect(errorsFor(report).some((e) => e.includes('carries more than one invalid value'))).toBe(
        true,
      );
    });
  });

  it('fails cleanly (not a crash) when the report file content is the literal JSON value null', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'artifacts', 'analysis', 'test-conditions.json'), 'null', 'utf8');
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
});

describe('renderTestConditionsTypes (real standalone tsc check)', () => {
  // AC7 - "tsc-clean" verified by an actual isolated compile, not a substring match.
  it('renders a schemaVersion-2 TestConditionsReport interface keyed by routeId, and the output is tsc --noEmit clean in isolation', () => {
    const text = renderTestConditionsTypes();
    expect(text).toContain('TestConditionsReport');
    expect(text).toContain('TestConditionsEntry');
    expect(text).toContain('UnsatisfiedPair');
    expect(text).toContain('schemaVersion: 2');
    expect(text).toContain('expectedOutcome: string;');
    expect(text).toContain("export type ExecutionLevel = 'ui' | 'dom' | 'api';");
    expect(text).toContain("reviewedBy?: 'human' | 'auto-pilot';");

    const dir = mkdtempSync(join(tmpdir(), 'eitr-test-conditions-types-'));
    try {
      const filePath = join(dir, 'test-conditions.types.ts');
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
