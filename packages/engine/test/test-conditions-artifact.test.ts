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

  // Every field the crawl recorded outside the site frame is a parameter or an explicit exclusion,
  // and what the inventory read off the page - options, HTML5 attributes, the field type - is what
  // the parameters are checked against.
  describe('field accounting against the route inventory', () => {
    type Report = {
      routes: Record<string, { parameters: Array<Record<string, any>>; excluded?: unknown[] }>;
    };

    function checkoutInventory(overrides: Record<string, unknown> = {}) {
      return {
        schemaVersion: 1,
        routeId: 'route-checkout',
        contentHash: 'abc123',
        controls: [
          {
            id: 'c0',
            region: 'header',
            role: 'combobox',
            name: 'Language',
            tag: 'select',
            options: ['English', 'Deutsch'],
            optionCount: 2,
          },
          {
            id: 'c1',
            region: 'main',
            role: 'textbox',
            name: 'Email',
            tag: 'input',
            type: 'email',
            constraints: { required: true },
          },
          {
            id: 'c2',
            region: 'main',
            role: 'spinbutton',
            name: 'Quantity',
            tag: 'input',
            type: 'number',
            constraints: { max: '10' },
          },
          {
            id: 'c3',
            region: 'main',
            role: 'checkbox',
            name: 'Gift wrap',
            tag: 'input',
            type: 'checkbox',
          },
          {
            id: 'c4',
            region: 'main',
            role: 'textbox',
            name: '',
            hint: 'Order summary',
            tag: 'textarea',
          },
          { id: 'c5', region: 'main', role: 'button', name: 'Place order', tag: 'button' },
          {
            id: 'c6',
            region: 'main',
            role: 'combobox',
            name: 'Shipping',
            tag: 'select',
            options: ['Standard', 'Express'],
            optionCount: 2,
          },
        ],
        ...overrides,
      };
    }

    function accounted(): Report {
      const report = structuredClone(wellFormedParametersOnly()) as unknown as Report;
      const route = report.routes['route-checkout'];
      route.parameters[0].control = 'c1';
      route.parameters[1].control = 'c2';
      route.parameters.push({
        name: 'shipping',
        kind: 'select',
        control: 'c6',
        partitions: [
          {
            id: 'standard',
            kind: 'valid',
            sampleValues: ['Standard'],
            expectedOutcome: 'the summary shows a standard shipping line',
          },
        ],
        boundaries: [],
        evidence: [{ signal: 'select-option-text', excerpt: 'Standard' }],
      });
      route.excluded = [
        { control: 'c3', reason: 'disabled' },
        { control: 'c4', reason: 'result-output' },
      ];
      return report;
    }

    function validateWith(
      report: unknown,
      inventory: unknown = checkoutInventory(),
      args: string[] = ['--stage=parameters'],
    ) {
      const dir = setupProject();
      try {
        writeReport(dir, report);
        if (inventory) {
          mkdirSync(join(dir, 'artifacts', 'site-map', 'inventory'), { recursive: true });
          writeFileSync(
            join(dir, 'artifacts', 'site-map', 'inventory', 'route-checkout.json'),
            JSON.stringify(inventory),
            'utf8',
          );
        }
        return JSON.parse(run(dir, args).stdout) as {
          errors: string[];
          warnings: string[];
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('passes when every field of the page is a parameter or excluded, with options read from the inventory', () => {
      const output = validateWith(accounted());
      expect(output.errors).toEqual([]);
      expect(output.warnings.some((w) => w.includes('no inventory'))).toBe(false);
    });

    it('fails a field nobody accounted for', () => {
      const report = accounted();
      report.routes['route-checkout'].excluded = [{ control: 'c4', reason: 'result-output' }];
      expect(
        validateWith(report).errors.some((e) =>
          e.includes('leaves c3 checkbox "Gift wrap" unaccounted'),
        ),
      ).toBe(true);
    });

    // Live-observed: the header's language switcher was a parameter on 13 of 28 routes.
    it('fails a parameter citing a field of the site frame', () => {
      const report = accounted();
      report.routes['route-checkout'].parameters.push({
        ...report.routes['route-checkout'].parameters[2],
        name: 'language',
        control: 'c0',
        partitions: [
          {
            id: 'en',
            kind: 'valid',
            sampleValues: ['English'],
            expectedOutcome: 'the page reads in English',
          },
        ],
      });
      expect(validateWith(report).errors.some((e) => e.includes('belongs to the site frame'))).toBe(
        true,
      );
    });

    // Without this, a parameter simply omitting control passed as "revealed by a probe" - live-observed
    // on the home page, whose only parameter was the header's language switcher.
    it('fails a parameter with no control unless it names the own field that revealed it', () => {
      const orphan = accounted();
      orphan.routes['route-checkout'].parameters.push({
        ...orphan.routes['route-checkout'].parameters[2],
        name: 'language',
        control: undefined,
        options: ['English'],
        partitions: [
          {
            id: 'en',
            kind: 'valid',
            sampleValues: ['English'],
            expectedOutcome: 'the page reads in English',
          },
        ],
      });
      expect(
        validateWith(orphan).errors.some((e) => e.includes('has no control and no revealedBy')),
      ).toBe(true);

      const revealed = structuredClone(orphan);
      revealed.routes['route-checkout'].parameters[3].revealedBy = 'c3';
      expect(validateWith(revealed).errors).toEqual([]);

      const byFrame = structuredClone(orphan);
      byFrame.routes['route-checkout'].parameters[3].revealedBy = 'c0';
      expect(
        validateWith(byFrame).errors.some((e) => e.includes('has no control and no revealedBy')),
      ).toBe(true);
    });

    it('fails an html5 rule the field does not carry', () => {
      const wrongValue = validateWith(
        accounted(),
        checkoutInventory({
          controls: checkoutInventory().controls.map((c) =>
            c.id === 'c2' ? { ...c, constraints: { max: '1000' } } : c,
          ),
        }),
      );
      expect(wrongValue.errors.some((e) => e.includes('carries max=1000'))).toBe(true);

      const report = accounted();
      report.routes['route-checkout'].parameters[1].boundaries[0].rule = {
        signal: 'html5-constraint',
        excerpt: 'min=0',
      };
      expect(validateWith(report).errors.some((e) => e.includes('recorded no min'))).toBe(true);
    });

    it('fails a non-numeric sample on a number field, which the browser would empty', () => {
      const report = accounted();
      report.routes['route-checkout'].parameters[1].partitions[1].sampleValues = ['abc'];
      expect(
        validateWith(report).errors.some((e) =>
          e.includes('cannot be the value of a number field'),
        ),
      ).toBe(true);
    });

    it('checks select samples against the options on the page, and the kind against the field', () => {
      const offered = accounted();
      offered.routes['route-checkout'].parameters[2].partitions.push({
        id: 'express-as-invalid',
        kind: 'invalid',
        sampleValues: ['Express'],
        expectedOutcome: 'no shipping line is shown',
        rule: { signal: 'select-option-text', excerpt: 'Standard, Express' },
        executionLevel: 'dom',
      });
      expect(
        validateWith(offered).errors.some((e) =>
          e.includes('sample "Express" is one of the options'),
        ),
      ).toBe(true);

      const mislabelled = accounted();
      mislabelled.routes['route-checkout'].parameters[2].kind = 'text';
      expect(
        validateWith(mislabelled).errors.some((e) => e.includes('is a select field on the page')),
      ).toBe(true);
    });

    it('refuses control ids from an inventory recorded after the extraction', () => {
      const output = validateWith(accounted(), checkoutInventory({ contentHash: 're-crawled' }));
      expect(output.errors.some((e) => e.includes('does not match the inventory'))).toBe(true);
    });

    it('accepts no parameters at all on a page whose only fields belong to the frame', () => {
      const report = structuredClone(wellFormedParametersOnly()) as unknown as Report;
      report.routes['route-checkout'].parameters = [];
      const inventory = checkoutInventory({
        controls: checkoutInventory().controls.filter((c) => c.id === 'c0' || c.id === 'c5'),
      });
      expect(validateWith(report, inventory).errors).toEqual([]);
    });

    describe('output properties, output channels and the site frame', () => {
      const copyControl = {
        id: 'c7',
        region: 'main',
        role: 'button',
        name: 'Copy summary',
        tag: 'button',
        output: true,
      };

      function withOutputs() {
        return checkoutInventory({ controls: [...checkoutInventory().controls, copyControl] });
      }

      function property(overrides: Record<string, unknown> = {}) {
        return {
          conditionId: 'p1',
          parameters: {},
          technique: 'property',
          relation: 'output-matches-display',
          sourceInput: 'an order of 2 with standard shipping',
          outputs: ['c7'],
          description: 'Verify Copy summary copies exactly the summary the page shows',
          expectedOutcome: 'the clipboard holds the same text as the summary box',
          scenario: 'positive',
          verification: {},
          isSpeculative: true,
          reviewed: false,
          ...overrides,
        };
      }

      function withConditions(conditions: unknown[]) {
        const report = accounted() as unknown as Report & {
          routes: Record<string, Record<string, unknown>>;
        };
        Object.assign(report.routes['route-checkout'], {
          conditions,
          unsatisfiedPairs: [],
          sourceParamsHash: '',
        });
        return report;
      }

      const full: string[] = [];

      it('passes a property that checks the page output channel', () => {
        expect(validateWith(withConditions([property()]), withOutputs(), full).errors).toEqual([]);
      });

      it('fails an output control no condition checks, unless excluded with a reason', () => {
        const uncovered = validateWith(withConditions([]), withOutputs(), full);
        expect(
          uncovered.errors.some((e) =>
            e.includes('c7 button "Copy summary" sends the page\'s result elsewhere'),
          ),
        ).toBe(true);

        const excluded = withConditions([]);
        (excluded.routes['route-checkout'].excluded as unknown[]).push({
          control: 'c7',
          reason: 'off-limits',
          note: 'the human left the clipboard out of scope',
        });
        expect(validateWith(excluded, withOutputs(), full).errors).toEqual([]);
      });

      it('fails a relation from the wrong list, a metamorphic relation with no follow-up run, and a negative property', () => {
        const wrong = validateWith(
          withConditions([property({ relation: 'round-trip' })]),
          withOutputs(),
          full,
        );
        expect(
          wrong.errors.some((e) => e.includes('.relation must be one of count-matches-request')),
        ).toBe(true);

        const metamorphic = validateWith(
          withConditions([
            property(),
            property({
              conditionId: 'm1',
              technique: 'metamorphic',
              relation: 'round-trip',
              outputs: undefined,
            }),
          ]),
          withOutputs(),
          full,
        );
        expect(metamorphic.errors.some((e) => e.includes('.followUpInput must say'))).toBe(true);

        const negative = validateWith(
          withConditions([property({ scenario: 'negative' })]),
          withOutputs(),
          full,
        );
        expect(negative.errors.some((e) => e.includes('.scenario must be "positive"'))).toBe(true);
      });

      it('fails outputs naming a control that is not an output', () => {
        const output = validateWith(
          withConditions([property({ outputs: ['c7', 'c5'] })]),
          withOutputs(),
          full,
        );
        expect(output.errors.some((e) => e.includes('outputs cites "c5"'))).toBe(true);
      });

      // The frame's fields are tested once: allowed, and required, on the route frameRouteId names.
      it('takes the site frame fields on the frame route only, and warns when no route carries them', () => {
        const unhomed = validateWith(accounted());
        expect(unhomed.warnings.some((w) => w.includes('no route is named in frameRouteId'))).toBe(
          true,
        );

        const framed = accounted() as unknown as Record<string, unknown> & Report;
        framed.frameRouteId = 'route-checkout';
        const missing = validateWith(framed);
        expect(
          missing.errors.some((e) => e.includes('leaves c0 combobox "Language" unaccounted')),
        ).toBe(true);

        framed.routes['route-checkout'].parameters.push({
          name: 'language',
          kind: 'select',
          control: 'c0',
          partitions: [
            {
              id: 'en',
              kind: 'valid',
              sampleValues: ['English'],
              expectedOutcome: 'the page reads in English',
            },
          ],
          boundaries: [],
          evidence: [{ signal: 'form-label', excerpt: 'Language' }],
        });
        const homed = validateWith(framed);
        expect(homed.errors).toEqual([]);
        expect(homed.warnings.some((w) => w.includes('frameRouteId'))).toBe(false);

        const dangling = accounted() as unknown as Record<string, unknown>;
        dangling.frameRouteId = 'route-nowhere';
        expect(
          validateWith(dangling).errors.some((e) =>
            e.includes('frameRouteId, when present, must name a route'),
          ),
        ).toBe(true);
      });
    });

    it('warns, without failing, when the route has no inventory to check against', () => {
      const output = validateWith(wellFormedParametersOnly(), null);
      expect(output.errors).toEqual([]);
      expect(output.warnings.some((w) => w.includes('no inventory'))).toBe(true);
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
