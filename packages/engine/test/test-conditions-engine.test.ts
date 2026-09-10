import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTestConditionsEngine } from '../src/plan/templates/test-conditions-engine.js';

interface ConditionFixture {
  conditionId: string;
  parameters: Record<string, string>;
  technique: string;
  description: string;
  expectedOutcome: string;
  executionLevel?: string;
  scenario: string;
  verification: Record<string, unknown>;
  isSpeculative: boolean;
  reviewed: boolean;
}

interface PartitionFixture {
  id: string;
  kind: string;
  sampleValues: string[];
  expectedOutcome: string;
  rule?: { signal: string; excerpt: string };
  executionLevel?: string;
}

interface RouteEntry {
  routeId: string;
  parameters: Array<{
    name: string;
    kind: string;
    partitions: PartitionFixture[];
    boundaries: Array<{
      boundary: string;
      values: [string, string, string];
      rule: { signal: string; excerpt: string };
      acceptedOutcome: string;
      rejectedOutcome: string;
    }>;
    evidence: Array<{ signal: string; excerpt: string }>;
    options?: string[];
  }>;
  constraints: Array<{
    ifParam: string;
    ifPartition: string;
    thenParam: string;
    thenExcludesPartition: string;
  }>;
  conditions: ConditionFixture[];
  unsatisfiedPairs: Array<{
    paramA: string;
    partitionA: string;
    paramB: string;
    partitionB: string;
    reason: string;
  }>;
  sourceContentHash: string;
  sourceParamsHash: string;
  analyzedAt: string;
}

function threeParamRoute(): {
  schemaVersion: 2;
  generatedAt: string;
  routes: Record<string, RouteEntry>;
} {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T11:00:00.000Z',
    routes: {
      'route-checkout': {
        routeId: 'route-checkout',
        parameters: [
          {
            name: 'shippingMethod',
            kind: 'select',
            options: ['Standard', 'Express'],
            partitions: [
              {
                id: 'standard',
                kind: 'valid',
                sampleValues: ['Standard'],
                expectedOutcome: 'the summary shows a standard shipping line',
              },
              {
                id: 'express',
                kind: 'valid',
                sampleValues: ['Express'],
                expectedOutcome: 'the summary shows an express shipping line',
              },
            ],
            boundaries: [],
            evidence: [{ signal: 'select-option-text', excerpt: 'Standard' }],
          },
          {
            name: 'paymentMethod',
            kind: 'select',
            options: ['Card', 'PayPal'],
            partitions: [
              {
                id: 'card',
                kind: 'valid',
                sampleValues: ['Card'],
                expectedOutcome: 'the card number fields appear',
              },
              {
                id: 'paypal',
                kind: 'valid',
                sampleValues: ['PayPal'],
                expectedOutcome: 'a PayPal button appears',
              },
            ],
            boundaries: [],
            evidence: [{ signal: 'select-option-text', excerpt: 'Card' }],
          },
          {
            name: 'quantity',
            kind: 'number',
            partitions: [
              {
                id: 'valid',
                kind: 'valid',
                sampleValues: ['5'],
                expectedOutcome: 'the line total updates to the chosen quantity.',
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
                acceptedOutcome: 'the line total matches the quantity entered.',
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

function setupProject(report: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-tc-engine-'));
  writeFileSync(join(dir, 'generate-test-conditions.mjs'), renderTestConditionsEngine(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'test-conditions.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  return dir;
}

function run(dir: string) {
  return spawnSync('node', ['generate-test-conditions.mjs'], { cwd: dir, encoding: 'utf8' });
}

// Per-route criticality lives in the feature map now, beside the feature that contains the route.
function routeIntentEntry(routeId: string, tier: string, reviewed: boolean) {
  return {
    routeId,
    featureId: 'f1',
    criticality: {
      value: tier,
      confidence: 'high',
      source: 'heading-text',
      reasoning: 'Fixture route for the checklist reduction.',
      evidence: [{ signal: 'heading-text', excerpt: 'Contact us' }],
    },
    sourceContentHash: 'abc123',
    analyzedAt: '2026-09-03T11:00:00.000Z',
    reviewed,
    ...(reviewed ? { reviewedBy: 'human' } : {}),
  };
}

function writeRouteCriticality(dir: string, routeId: string, tier: string, reviewed = true) {
  const target = join(dir, 'artifacts', 'analysis', 'feature-map.json');
  const existing = existsSync(target)
    ? (JSON.parse(readFileSync(target, 'utf8')) as Record<string, any>)
    : {
        schemaVersion: 2,
        generatedAt: '2026-09-03T11:00:00.000Z',
        features: {
          f1: {
            featureId: 'f1',
            name: 'Contact',
            memberRouteIds: [routeId],
            entityIds: [],
            impact: tier,
            evidence: [{ signal: 'route-convention', excerpt: '/contact' }],
            reviewed: true,
            reviewedBy: 'human',
          },
        },
        entities: {},
        routes: {},
        sourceHash: 'hash',
      };
  existing.routes = existing.routes || {};
  existing.routes[routeId] = routeIntentEntry(routeId, tier, reviewed);
  writeFileSync(target, JSON.stringify(existing), 'utf8');
}

function singleTextParamRoute(routeId: string) {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T11:00:00.000Z',
    routes: {
      [routeId]: {
        routeId,
        parameters: [
          {
            name: 'name',
            kind: 'text',
            partitions: [
              {
                id: 'valid-name',
                kind: 'valid',
                sampleValues: ['Ann'],
                expectedOutcome: 'the greeting reads "Hello, Ann"',
              },
            ],
            boundaries: [],
            evidence: [{ signal: 'form-label', excerpt: 'Name' }],
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

function readReport(dir: string): { routes: Record<string, RouteEntry> } {
  return JSON.parse(
    readFileSync(join(dir, 'artifacts', 'analysis', 'test-conditions.json'), 'utf8'),
  );
}

describe('scripts/generate-test-conditions.mjs (real execution)', () => {
  // AC2
  it('generates a combinatorial covering array touching every 2-way parameter-value pair at least once, with zero duplicate vectors', () => {
    const dir = setupProject(threeParamRoute());
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const combinatorial = report.routes['route-checkout'].conditions.filter(
        (c) => c.technique === 'combinatorial',
      );
      expect(combinatorial.length).toBeGreaterThan(0);

      const params = ['shippingMethod', 'paymentMethod', 'quantity'];
      const partitionsByParam: Record<string, string[]> = {
        shippingMethod: ['standard', 'express'],
        paymentMethod: ['card', 'paypal'],
        quantity: ['valid', 'too-high'],
      };
      const covered = new Set<string>();
      for (const c of combinatorial) {
        for (let i = 0; i < params.length; i++) {
          for (let j = i + 1; j < params.length; j++) {
            covered.add(
              params[i] +
                '=' +
                c.parameters[params[i]] +
                '|' +
                params[j] +
                '=' +
                c.parameters[params[j]],
            );
          }
        }
      }
      for (let i = 0; i < params.length; i++) {
        for (let j = i + 1; j < params.length; j++) {
          for (const pa of partitionsByParam[params[i]]) {
            for (const pb of partitionsByParam[params[j]]) {
              const key = params[i] + '=' + pa + '|' + params[j] + '=' + pb;
              expect(covered.has(key)).toBe(true);
            }
          }
        }
      }
      const ids = combinatorial.map((c) => c.conditionId);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC3
  it('generates 3-value boundary conditions for a bounded parameter, holding other parameters at their valid partition', () => {
    const dir = setupProject(threeParamRoute());
    try {
      run(dir);
      const report = readReport(dir);
      const boundary = report.routes['route-checkout'].conditions.filter(
        (c) => c.technique === 'boundary-value',
      );
      expect(boundary).toHaveLength(3);
      const values = boundary.map((c) => c.parameters.quantity).sort();
      expect(values).toEqual(['10', '11', '9']);
      for (const c of boundary) {
        expect(c.parameters.shippingMethod).toBe('standard');
        expect(c.parameters.paymentMethod).toBe('card');
        expect(c.isSpeculative).toBe(true);
        expect(c.reviewed).toBe(false);
        expect(c.verification).toEqual({});
      }
      // HTML5 max is inclusive: max-1 and max itself are still valid, only max+1 is invalid.
      const byValue = Object.fromEntries(boundary.map((c) => [c.parameters.quantity, c]));
      expect(byValue['9'].scenario).toBe('positive');
      expect(byValue['10'].scenario).toBe('positive');
      expect(byValue['11'].scenario).toBe('negative');
      expect(byValue['11'].description).toContain('quantity="11"');
      expect(byValue['11'].description).toContain('(negative)');
      expect(byValue['9'].description).toContain('(positive)');
      // Each probe says where it sits relative to the limit and takes its outcome from the boundary:
      // the value past the limit the recorded rejection, the values at and inside it the accepted
      // outcome - never the valid partition's, which was written for a different value (trailing
      // full stop trimmed so the sentence still reads as one).
      expect(byValue['11'].description).toContain('quantity="11" (one above the maximum)');
      expect(byValue['11'].expectedOutcome).toBe(
        'the field is marked invalid and the order cannot be placed',
      );
      expect(byValue['10'].description).toContain('quantity="10" (at the maximum)');
      for (const inside of ['9', '10']) {
        expect(byValue[inside].expectedOutcome).toBe('the line total matches the quantity entered');
      }
      expect(byValue['9'].description).toContain(
        ': the line total matches the quantity entered (positive)',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC8 - a partition that CAN combine with something (only one specific pairing is blocked)
  // must never appear in a violating vector, and the run must complete normally.
  it('never emits a combinatorial vector that violates a constraint', () => {
    const route = threeParamRoute();
    route.routes['route-checkout'].constraints = [
      {
        ifParam: 'shippingMethod',
        ifPartition: 'express',
        thenParam: 'paymentMethod',
        thenExcludesPartition: 'paypal',
      },
    ];
    const dir = setupProject(route);
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      for (const c of report.routes['route-checkout'].conditions.filter(
        (c) => c.technique === 'combinatorial',
      )) {
        if (c.parameters.shippingMethod === 'express') {
          expect(c.parameters.paymentMethod).not.toBe('paypal');
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC8 - a genuinely unsatisfiable partition (BOTH payment values excluded whenever
  // shippingMethod=express, so express can never appear in any valid complete vector at all):
  // must not hang or crash, must never appear in any emitted condition, and must report the
  // EXACT unsatisfied set (not a superset) with the real describeDeadEnds()-derived reason, not a
  // generic placeholder.
  it('reports the exact UnsatisfiedPair set with the real conflict reason for a partition that can never combine with anything, and never emits it', () => {
    const route = threeParamRoute();
    route.routes['route-checkout'].constraints = [
      {
        ifParam: 'shippingMethod',
        ifPartition: 'express',
        thenParam: 'paymentMethod',
        thenExcludesPartition: 'card',
      },
      {
        ifParam: 'shippingMethod',
        ifPartition: 'express',
        thenParam: 'paymentMethod',
        thenExcludesPartition: 'paypal',
      },
    ];
    const dir = setupProject(route);
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const entry = report.routes['route-checkout'];
      // Exactly the 2 pairs pairing shippingMethod=express with each quantity partition - not a
      // superset (e.g. never the unrelated paymentMethod=paypal/quantity=valid pair, which has no
      // constraint relation to anything and is trivially coverable).
      expect(entry.unsatisfiedPairs).toEqual([
        {
          paramA: 'shippingMethod',
          partitionA: 'express',
          paramB: 'quantity',
          partitionB: 'valid',
          reason:
            'combining these two values leaves no valid assignment for another parameter: ' +
            'excluded by constraint: shippingMethod=express -> paymentMethod!=card; ' +
            'excluded by constraint: shippingMethod=express -> paymentMethod!=paypal',
        },
        {
          paramA: 'shippingMethod',
          partitionA: 'express',
          paramB: 'quantity',
          partitionB: 'too-high',
          reason:
            'combining these two values leaves no valid assignment for another parameter: ' +
            'excluded by constraint: shippingMethod=express -> paymentMethod!=card; ' +
            'excluded by constraint: shippingMethod=express -> paymentMethod!=paypal',
        },
      ]);
      for (const c of entry.conditions) {
        expect(c.parameters.shippingMethod).not.toBe('express');
      }
      // Every other pair in the route (i.e. every pair not touching shippingMethod=express) still
      // achieved full pairwise coverage despite the 2 unsatisfiable pairs.
      const combinatorial = entry.conditions.filter((c) => c.technique === 'combinatorial');
      const coveredPaymentQuantity = new Set(
        combinatorial.map((c) => c.parameters.paymentMethod + '|' + c.parameters.quantity),
      );
      for (const pm of ['card', 'paypal']) {
        for (const q of ['valid', 'too-high']) {
          expect(coveredPaymentQuantity.has(pm + '|' + q)).toBe(true);
        }
      }
      const coveredShippingPayment = new Set(
        combinatorial
          .filter((c) => c.parameters.shippingMethod === 'standard')
          .map((c) => c.parameters.paymentMethod),
      );
      expect(coveredShippingPayment.has('card')).toBe(true);
      expect(coveredShippingPayment.has('paypal')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC8 - a real 3-way conflict from two INDEPENDENT 2-clause ConstraintRules interacting through
  // a third parameter, rather than any single rule directly forbidding the seed pair itself
  // (buildNeededPairs already excludes anything a single rule directly forbids before it can ever
  // become a seed - this is the case that can only be discovered by actually trying to fill the
  // third column around the seed).
  it('discovers a 3-way conflict between two independent constraints interacting through a third parameter', () => {
    const route = {
      schemaVersion: 2 as const,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          parameters: [
            {
              name: 'paramA',
              kind: 'select',
              partitions: [
                { id: 'x', kind: 'valid', sampleValues: ['X'], expectedOutcome: 'X is shown' },
                {
                  id: 'not-x',
                  kind: 'valid',
                  sampleValues: ['Not X'],
                  expectedOutcome: 'Not X is shown',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'select-option-text', excerpt: 'X' }],
            },
            {
              name: 'paramB',
              kind: 'select',
              partitions: [
                { id: 'y', kind: 'valid', sampleValues: ['Y'], expectedOutcome: 'Y is shown' },
                {
                  id: 'not-y',
                  kind: 'valid',
                  sampleValues: ['Not Y'],
                  expectedOutcome: 'Not Y is shown',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'select-option-text', excerpt: 'Y' }],
            },
            {
              name: 'paramC',
              kind: 'select',
              partitions: [
                { id: 'z', kind: 'valid', sampleValues: ['Z'], expectedOutcome: 'Z is shown' },
                { id: 'w', kind: 'valid', sampleValues: ['W'], expectedOutcome: 'W is shown' },
              ],
              boundaries: [],
              evidence: [{ signal: 'select-option-text', excerpt: 'Z' }],
            },
          ],
          constraints: [
            {
              ifParam: 'paramA',
              ifPartition: 'x',
              thenParam: 'paramC',
              thenExcludesPartition: 'z',
            },
            {
              ifParam: 'paramB',
              ifPartition: 'y',
              thenParam: 'paramC',
              thenExcludesPartition: 'w',
            },
          ],
          conditions: [],
          unsatisfiedPairs: [],
          sourceContentHash: 'abc123',
          sourceParamsHash: '',
          analyzedAt: '2026-09-03T11:00:00.000Z',
        },
      },
    };
    const dir = setupProject(route);
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const entry = report.routes['route-checkout'];
      // paramA=x and paramB=y are each individually fine (paramA=x only forbids paramC=z, leaving
      // paramC=w available; paramB=y only forbids paramC=w, leaving paramC=z available) - only
      // their COMBINATION exhausts paramC's only 2 values. Nothing else is unsatisfiable.
      expect(entry.unsatisfiedPairs).toEqual([
        {
          paramA: 'paramA',
          partitionA: 'x',
          paramB: 'paramB',
          partitionB: 'y',
          reason:
            'combining these two values leaves no valid assignment for another parameter: ' +
            'excluded by constraint: paramA=x -> paramC!=z; ' +
            'excluded by constraint: paramB=y -> paramC!=w',
        },
      ]);
      const combinatorial = entry.conditions.filter((c) => c.technique === 'combinatorial');
      const covered = new Set<string>();
      for (const c of combinatorial) {
        covered.add('paramA=' + c.parameters.paramA + '|paramB=' + c.parameters.paramB);
        covered.add('paramA=' + c.parameters.paramA + '|paramC=' + c.parameters.paramC);
        covered.add('paramB=' + c.parameters.paramB + '|paramC=' + c.parameters.paramC);
      }
      const expectedPairs = [
        'paramA=x|paramB=not-y',
        'paramA=not-x|paramB=y',
        'paramA=not-x|paramB=not-y',
        'paramA=x|paramC=w',
        'paramA=not-x|paramC=z',
        'paramA=not-x|paramC=w',
        'paramB=y|paramC=z',
        'paramB=not-y|paramC=z',
        'paramB=not-y|paramC=w',
      ];
      for (const key of expectedPairs) {
        expect(covered.has(key)).toBe(true);
      }
      // The 2 directly-forbidden pairs (never in `needed` to begin with) and the 1 genuinely
      // unsatisfiable pair must never appear in any emitted condition either.
      expect(covered.has('paramA=x|paramC=z')).toBe(false);
      expect(covered.has('paramB=y|paramC=w')).toBe(false);
      expect(covered.has('paramA=x|paramB=y')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC12
  it('deterministically redacts a PII-shaped sample value and evidence excerpt regardless of what was written upstream', () => {
    const route = threeParamRoute();
    route.routes['route-checkout'].parameters[0].partitions[0].sampleValues = ['4111111111111111'];
    route.routes['route-checkout'].parameters[0].evidence[0].excerpt =
      'Card ending in 4111111111111111';
    const dir = setupProject(route);
    try {
      run(dir);
      const report = readReport(dir);
      const param = report.routes['route-checkout'].parameters[0];
      expect(param.partitions[0].sampleValues[0]).toBe('[REDACTED]');
      expect(param.evidence[0].excerpt).toContain('[REDACTED]');
      expect(param.evidence[0].excerpt).not.toContain('4111111111111111');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC12 - separator-broken PII must not defeat the redaction backstop: a spaced card number,
  // a hyphenated SSN-shaped string, and a phone number with parens all redact fully, not just
  // their first unbroken digit run.
  it('redacts PII-shaped digit runs even when broken up by spaces, hyphens, or parentheses', () => {
    const route = threeParamRoute();
    route.routes['route-checkout'].parameters[0].partitions[0].sampleValues = [
      '4111 1111 1111 1111',
      '123-45-6789',
    ];
    route.routes['route-checkout'].parameters[0].evidence[0].excerpt =
      'Call (555) 123-4567 for help';
    const dir = setupProject(route);
    try {
      run(dir);
      const report = readReport(dir);
      const param = report.routes['route-checkout'].parameters[0];
      expect(param.partitions[0].sampleValues[0]).toBe('[REDACTED]');
      expect(param.partitions[0].sampleValues[1]).toBe('[REDACTED]');
      expect(param.evidence[0].excerpt).toContain('[REDACTED]');
      expect(param.evidence[0].excerpt).not.toContain('555');
      expect(param.evidence[0].excerpt).not.toContain('1234567');
      expect(param.evidence[0].excerpt).not.toContain('123-4567');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a clean FAILED shape (not a crash) for a route entry missing a valid parameters array', () => {
    const dir = setupProject({
      schemaVersion: 2,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          constraints: [],
          conditions: [],
          unsatisfiedPairs: [],
          sourceContentHash: 'abc123',
          sourceParamsHash: '',
          analyzedAt: '2026-09-03T11:00:00.000Z',
        },
      },
    });
    try {
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('parameters'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC13
  it('is idempotent: re-running against unchanged parameters/constraints does not regenerate conditions', () => {
    const dir = setupProject(threeParamRoute());
    try {
      run(dir);
      const first = readReport(dir);
      const firstConditions = JSON.stringify(first.routes['route-checkout'].conditions);
      const firstHash = first.routes['route-checkout'].sourceParamsHash;

      run(dir);
      const second = readReport(dir);
      expect(JSON.stringify(second.routes['route-checkout'].conditions)).toBe(firstConditions);
      expect(second.routes['route-checkout'].sourceParamsHash).toBe(firstHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails clearly (not a crash) when the report file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eitr-tc-engine-missing-'));
    try {
      writeFileSync(
        join(dir, 'generate-test-conditions.mjs'),
        renderTestConditionsEngine(),
        'utf8',
      );
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('not found'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Equivalence-partition fallback: a route with a single parameter (a search box, a one-field
  // subscribe form) has nothing to pair - pairwise coverage alone produces zero conditions here,
  // which is the common case on a simple real site, not a rare edge case.
  it('covers a single-parameter route with one condition per partition instead of zero', () => {
    const dir = setupProject({
      schemaVersion: 2,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-search': {
          routeId: 'route-search',
          parameters: [
            {
              name: 's',
              kind: 'text',
              partitions: [
                {
                  id: 'valid-search-term',
                  kind: 'valid',
                  sampleValues: ['widgets'],
                  expectedOutcome: 'results containing the term are listed',
                },
                {
                  id: 'empty-search-term',
                  kind: 'invalid',
                  sampleValues: [''],
                  expectedOutcome: 'the search button stays disabled',
                  rule: { signal: 'html5-constraint', excerpt: 'required' },
                },
                {
                  id: 'special-characters',
                  kind: 'valid',
                  sampleValues: ['A&B!'],
                  expectedOutcome: 'results containing the term are listed',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'form-label', excerpt: 'Search' }],
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
    });
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const conditions = report.routes['route-search'].conditions.filter(
        (c) => c.technique === 'equivalence-partition',
      );
      expect(conditions.length).toBe(3);
      const coveredPartitions = new Set(conditions.map((c) => c.parameters.s));
      expect(coveredPartitions).toEqual(
        new Set(['valid-search-term', 'empty-search-term', 'special-characters']),
      );
      const ids = conditions.map((c) => c.conditionId);
      expect(new Set(ids).size).toBe(ids.length);

      const byPartition = Object.fromEntries(conditions.map((c) => [c.parameters.s, c]));
      expect(byPartition['valid-search-term'].scenario).toBe('positive');
      expect(byPartition['valid-search-term'].description).toContain('s="widgets"');
      expect(byPartition['empty-search-term'].scenario).toBe('negative');
      expect(byPartition['empty-search-term'].description).toContain('(negative)');

      // Idempotency: unchanged parameters -> re-run is a no-op, same guarantee combinatorial
      // routes already have (AC13). Compares the full (unfiltered) condition list, not just the
      // equivalence-partition subset checked above.
      const firstConditions = JSON.stringify(report.routes['route-search'].conditions);
      const firstHash = report.routes['route-search'].sourceParamsHash;
      run(dir);
      const second = readReport(dir);
      expect(JSON.stringify(second.routes['route-search'].conditions)).toBe(firstConditions);
      expect(second.routes['route-search'].sourceParamsHash).toBe(firstHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Checklist-based technique: a closed, deterministic list of well-known malformed-format/
  // injection-class values per parameter kind, independent of parameter count or boundaries.
  it('probes the closed checklist for text/email/number/date parameters, holding other parameters at their valid partition', () => {
    const dir = setupProject({
      schemaVersion: 2,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-contact': {
          routeId: 'route-contact',
          parameters: [
            {
              name: 'name',
              kind: 'text',
              partitions: [
                {
                  id: 'valid-name',
                  kind: 'valid',
                  sampleValues: ['Ann'],
                  expectedOutcome: 'the name shows in the summary',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'form-label', excerpt: 'Name' }],
            },
            {
              name: 'email',
              kind: 'email',
              partitions: [
                {
                  id: 'valid-email',
                  kind: 'valid',
                  sampleValues: ['ann@example.com'],
                  expectedOutcome: 'the email shows in the summary',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'form-label', excerpt: 'Email' }],
            },
            {
              name: 'age',
              kind: 'number',
              partitions: [
                {
                  id: 'valid-age',
                  kind: 'valid',
                  sampleValues: ['30'],
                  expectedOutcome: 'the age shows in the summary',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'form-label', excerpt: 'Age' }],
            },
            {
              name: 'birthdate',
              kind: 'date',
              partitions: [
                {
                  id: 'valid-birthdate',
                  kind: 'valid',
                  sampleValues: ['1996-05-01'],
                  expectedOutcome: 'the birthdate shows in the summary',
                },
              ],
              boundaries: [],
              evidence: [{ signal: 'form-label', excerpt: 'Birthdate' }],
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
    });
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const checklist = report.routes['route-contact'].conditions.filter(
        (c) => c.technique === 'checklist-based',
      );
      // 4 text + 4 email + 3 number + 3 date checklist values = 14 conditions.
      expect(checklist.length).toBe(14);
      const nameProbes = checklist.filter((c) => c.parameters.name !== 'valid-name');
      expect(nameProbes.length).toBe(4);
      for (const c of nameProbes) {
        expect(c.parameters.email).toBe('valid-email');
        expect(c.parameters.age).toBe('valid-age');
        expect(c.parameters.birthdate).toBe('valid-birthdate');
        // Checklist probes are malformed/injection-class by construction - always negative, and the
        // outcome is the robustness a person can check whether or not the value is accepted.
        expect(c.scenario).toBe('negative');
        expect(c.description).toContain('(negative)');
        expect(c.description).toContain(
          'name=' + JSON.stringify(c.parameters.name) + ' (malformed-input checklist)',
        );
        expect(c.expectedOutcome).toContain('no script runs');
      }
      const emailProbes = checklist.filter((c) => c.parameters.email !== 'valid-email');
      expect(emailProbes.length).toBe(4);
      for (const c of emailProbes) {
        expect(c.parameters.name).toBe('valid-name');
      }
      const ageProbes = checklist.filter((c) => c.parameters.age !== 'valid-age');
      expect(ageProbes.length).toBe(3);
      for (const c of ageProbes) {
        expect(c.parameters.name).toBe('valid-name');
      }
      const birthdateProbes = checklist.filter((c) => c.parameters.birthdate !== 'valid-birthdate');
      expect(birthdateProbes.length).toBe(3);
      for (const c of birthdateProbes) {
        expect(c.parameters.name).toBe('valid-name');
      }
      const ids = checklist.map((c) => c.conditionId);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Checklist-based probing scales with the route's own the feature map criticality rather
  // than firing uniformly everywhere.
  it('runs the checklist on a critical route', () => {
    const dir = setupProject(singleTextParamRoute('route-checkout'));
    writeRouteCriticality(dir, 'route-checkout', 'critical');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const checklist = report.routes['route-checkout'].conditions.filter(
        (c) => c.technique === 'checklist-based',
      );
      expect(checklist.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips the checklist on a low-criticality route', () => {
    const dir = setupProject(singleTextParamRoute('route-about'));
    writeRouteCriticality(dir, 'route-about', 'low');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const checklist = report.routes['route-about'].conditions.filter(
        (c) => c.technique === 'checklist-based',
      );
      expect(checklist.length).toBe(0);
      // Other techniques are unaffected by criticality - equivalence-partition still fires.
      const equivalencePartition = report.routes['route-about'].conditions.filter(
        (c) => c.technique === 'equivalence-partition',
      );
      expect(equivalencePartition.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('defaults to running the checklist when feature-map.json is absent (unknown criticality)', () => {
    const dir = setupProject(singleTextParamRoute('route-orphan'));
    // Deliberately not calling writeBusinessIntent - no artifacts/analysis/feature-map.json at all.
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const checklist = report.routes['route-orphan'].conditions.filter(
        (c) => c.technique === 'checklist-based',
      );
      expect(checklist.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips the checklist on a medium-criticality route', () => {
    const dir = setupProject(singleTextParamRoute('route-faq'));
    writeRouteCriticality(dir, 'route-faq', 'medium');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const checklist = report.routes['route-faq'].conditions.filter(
        (c) => c.technique === 'checklist-based',
      );
      expect(checklist.length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // An unreviewed route in the feature map is never ground truth for another skill (the same rule
  // /map-features' own Human Sign-Off Gateway states) - a low-tier value that hasn't been signed
  // off must not silently reduce this generator's coverage.
  it('ignores the criticality of an unreviewed route, running the full checklist', () => {
    const dir = setupProject(singleTextParamRoute('route-unreviewed'));
    writeRouteCriticality(dir, 'route-unreviewed', 'low', false);
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const report = readReport(dir);
      const checklist = report.routes['route-unreviewed'].conditions.filter(
        (c) => c.technique === 'checklist-based',
      );
      expect(checklist.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('single-fault vectors and recorded outcomes', () => {
    // Shaped on the live unit-converter case: a select whose invalid value the control cannot
    // produce, a number field with a stated rule, and a free-text field - three parameters that
    // each carry one invalid partition, so a naive covering array would pair invalid with invalid.
    function faultRoute() {
      return {
        schemaVersion: 2,
        generatedAt: '2026-09-10T11:00:00.000Z',
        routes: {
          'route-convert': {
            routeId: 'route-convert',
            parameters: [
              {
                name: 'measure',
                kind: 'select',
                options: ['Length', 'Weight'],
                partitions: [
                  {
                    id: 'length',
                    kind: 'valid',
                    sampleValues: ['Length'],
                    expectedOutcome: 'the result lists metres, feet and inches',
                  },
                  {
                    id: 'weight',
                    kind: 'valid',
                    sampleValues: ['Weight'],
                    expectedOutcome: 'the result lists kilograms and pounds',
                  },
                  {
                    id: 'unknown-measure',
                    kind: 'invalid',
                    sampleValues: ['Speed of light'],
                    expectedOutcome:
                      'no result is shown and the measure list keeps its last choice',
                    rule: { signal: 'select-option-text', excerpt: 'Length, Weight' },
                    executionLevel: 'dom',
                  },
                ],
                boundaries: [],
                evidence: [{ signal: 'form-label', excerpt: 'Measure' }],
              },
              {
                name: 'amount',
                kind: 'number',
                partitions: [
                  {
                    id: 'number',
                    kind: 'valid',
                    sampleValues: ['100'],
                    expectedOutcome: 'every listed unit shows a converted value',
                  },
                  {
                    id: 'not-a-number',
                    kind: 'invalid',
                    sampleValues: ['abc'],
                    expectedOutcome: 'a message under the field asks for a number',
                    rule: { signal: 'html5-constraint', excerpt: 'type=number' },
                  },
                ],
                boundaries: [],
                evidence: [{ signal: 'form-label', excerpt: 'Amount' }],
              },
              {
                name: 'label',
                kind: 'text',
                partitions: [
                  {
                    id: 'short',
                    kind: 'valid',
                    sampleValues: ['Trip'],
                    expectedOutcome: 'the result is titled with the label',
                  },
                  {
                    id: 'too-long',
                    kind: 'invalid',
                    sampleValues: ['x'.repeat(41)],
                    expectedOutcome: 'the counter under the field turns red at 41 of 40',
                    rule: { signal: 'html5-constraint', excerpt: 'maxlength=40' },
                  },
                ],
                boundaries: [],
                evidence: [{ signal: 'form-label', excerpt: 'Label' }],
              },
            ],
            constraints: [],
            conditions: [],
            unsatisfiedPairs: [],
            sourceContentHash: 'abc123',
            sourceParamsHash: '',
            analyzedAt: '2026-09-10T11:00:00.000Z',
          },
        },
      };
    }

    type Report = ReturnType<typeof faultRoute>;
    type FaultParam = Report['routes']['route-convert']['parameters'][number];

    function combinatorialOf(dir: string) {
      return readReport(dir).routes['route-convert'].conditions.filter(
        (c) => c.technique === 'combinatorial',
      );
    }

    function invalidIn(condition: ConditionFixture, parameters: FaultParam[]): string[] {
      return parameters
        .filter((p) =>
          p.partitions.some(
            (part) => part.kind === 'invalid' && part.id === condition.parameters[p.name],
          ),
        )
        .map((p) => p.name);
    }

    it('never puts two invalid values in one vector, and pairs each with every valid value of the other parameters', () => {
      const report = faultRoute();
      const parameters = report.routes['route-convert'].parameters;
      const dir = setupProject(report);
      try {
        expect(run(dir).status).toBe(0);
        const combinatorial = combinatorialOf(dir);
        for (const c of combinatorial) {
          expect(invalidIn(c, parameters).length).toBeLessThanOrEqual(1);
        }
        for (const p of parameters) {
          for (const bad of p.partitions.filter((part) => part.kind === 'invalid')) {
            for (const q of parameters.filter((other) => other.name !== p.name)) {
              for (const good of q.partitions.filter((part) => part.kind === 'valid')) {
                expect(
                  combinatorial.some(
                    (c) => c.parameters[p.name] === bad.id && c.parameters[q.name] === good.id,
                  ),
                  p.name + '=' + bad.id + ' with ' + q.name + '=' + good.id,
                ).toBe(true);
              }
            }
          }
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // A rejected submission never exercised the valid values beside the rejected one, so a valid
    // pair only counts as covered in a vector where every value is valid.
    it('covers every valid pair in an all-valid vector', () => {
      const report = faultRoute();
      const parameters = report.routes['route-convert'].parameters;
      const dir = setupProject(report);
      try {
        run(dir);
        const positives = combinatorialOf(dir).filter((c) => invalidIn(c, parameters).length === 0);
        for (let i = 0; i < parameters.length; i++) {
          for (let j = i + 1; j < parameters.length; j++) {
            for (const a of parameters[i].partitions.filter((part) => part.kind === 'valid')) {
              for (const b of parameters[j].partitions.filter((part) => part.kind === 'valid')) {
                expect(
                  positives.some(
                    (c) =>
                      c.parameters[parameters[i].name] === a.id &&
                      c.parameters[parameters[j].name] === b.id,
                  ),
                  parameters[i].name + '=' + a.id + ' with ' + parameters[j].name + '=' + b.id,
                ).toBe(true);
              }
            }
          }
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('takes a negative condition outcome from its one invalid value and a positive one from every value it holds', () => {
      const report = faultRoute();
      const parameters = report.routes['route-convert'].parameters;
      const dir = setupProject(report);
      try {
        run(dir);
        const conditions = readReport(dir).routes['route-convert'].conditions;
        for (const c of combinatorialOf(dir)) {
          const invalid = invalidIn(c, parameters);
          if (invalid.length === 1) {
            const param = parameters.find((p) => p.name === invalid[0])!;
            const partition = param.partitions.find(
              (part) => part.id === c.parameters[param.name],
            )!;
            expect(c.scenario).toBe('negative');
            expect(c.expectedOutcome).toBe(partition.expectedOutcome);
            expect(c.description).toContain(': ' + partition.expectedOutcome + ' (negative)');
          } else {
            expect(c.scenario).toBe('positive');
            for (const p of parameters) {
              const partition = p.partitions.find((part) => part.id === c.parameters[p.name])!;
              expect(c.expectedOutcome).toContain(partition.expectedOutcome);
            }
          }
        }
        for (const c of conditions) {
          expect(c.description).not.toMatch(/correctly handles|as expected/i);
          expect(c.expectedOutcome.length).toBeGreaterThan(0);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('carries a dom-level invalid value onto the condition and says how it is delivered', () => {
      const dir = setupProject(faultRoute());
      try {
        run(dir);
        const combinatorial = combinatorialOf(dir);
        const forced = combinatorial.filter((c) => c.parameters.measure === 'unknown-measure');
        expect(forced.length).toBeGreaterThan(0);
        for (const c of forced) {
          expect(c.executionLevel).toBe('dom');
          expect(c.description).toContain(
            'measure="Speed of light" (invalid, set by script - the control does not offer it)',
          );
        }
        for (const c of combinatorial.filter((c) => c.parameters.measure !== 'unknown-measure')) {
          expect(c.executionLevel).toBeUndefined();
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('refuses to generate from a partition with no recorded outcome rather than inventing one', () => {
      const report = singleTextParamRoute('route-greet') as {
        routes: Record<
          string,
          { parameters: Array<{ partitions: Array<Record<string, unknown>> }> }
        >;
      };
      delete report.routes['route-greet'].parameters[0].partitions[0].expectedOutcome;
      const dir = setupProject(report);
      try {
        const result = run(dir);
        expect(result.status).toBe(1);
        const output = JSON.parse(result.stdout);
        expect(output.status).toBe('FAILED');
        expect(
          output.errors.some((e: string) =>
            e.includes('partitions[0].expectedOutcome must be a non-empty string'),
          ),
        ).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('flow-oriented techniques from the feature map', () => {
    function writeFeatureMap(
      dir: string,
      opts: {
        routeIds: string[];
        transitions: Array<{ from: string; to: string; trigger: string }>;
        states: string[];
        reviewed?: boolean;
        entityReviewed?: boolean;
      },
    ) {
      // Per-route criticality may already have been written into this same file - it lives here
      // now - so this preserves whatever routes are already recorded instead of overwriting them.
      const target = join(dir, 'artifacts', 'analysis', 'feature-map.json');
      const existingRoutes = existsSync(target)
        ? ((JSON.parse(readFileSync(target, 'utf8')) as Record<string, any>).routes ?? {})
        : {};
      writeFileSync(
        target,
        JSON.stringify({
          schemaVersion: 2,
          generatedAt: '2026-09-08T10:00:00.000Z',
          routes: existingRoutes,
          features: {
            f1: {
              featureId: 'f1',
              name: 'Ordering',
              memberRouteIds: opts.routeIds,
              entityIds: ['e1'],
              impact: 'high',
              evidence: [{ signal: 'route-convention', excerpt: 'x' }],
              reviewed: opts.reviewed ?? true,
              ...(opts.reviewed === false ? {} : { reviewedBy: 'human' }),
            },
          },
          entities: {
            e1: {
              entityId: 'e1',
              name: 'orders',
              operations: [],
              relations: [],
              lifecycle: {
                states: opts.states.map((name, i) => ({
                  name,
                  initial: i === 0,
                  terminal: i === opts.states.length - 1,
                })),
                transitions: opts.transitions.map((t) => ({
                  ...t,
                  confidence: 'inferred',
                  evidence: [{ signal: 'api-resource', excerpt: 'x' }],
                })),
              },
              evidence: [{ signal: 'route-convention', excerpt: '/orders' }],
              reviewed: opts.entityReviewed ?? true,
              ...(opts.entityReviewed === false ? {} : { reviewedBy: 'human' }),
            },
          },
          sourceHash: 'hash',
        }),
        'utf8',
      );
    }

    const fullLifecycle = {
      states: ['absent', 'exists', 'removed'],
      transitions: [
        { from: 'absent', to: 'exists', trigger: 'create' },
        { from: 'exists', to: 'exists', trigger: 'update' },
        { from: 'exists', to: 'removed', trigger: 'delete' },
      ],
    };

    function conditionsOf(dir: string, technique: string) {
      return readReport(dir).routes['route-contact'].conditions.filter(
        (c) => c.technique === technique,
      );
    }

    it('generates one positive condition per defined transition', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        writeFeatureMap(dir, { routeIds: ['route-contact', 'route-other'], ...fullLifecycle });
        expect(run(dir).status).toBe(0);
        const positives = conditionsOf(dir, 'state-transition').filter(
          (c) => (c as unknown as { scenario: string }).scenario === 'positive',
        );
        expect(positives).toHaveLength(3);
        expect(
          positives.map((c) => (c as unknown as { description: string }).description),
        ).toContain('Verify a orders moves from "absent" to "exists" on create.');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // The textbook invalid-transition set: every (state, trigger) pair the lifecycle leaves
    // undefined. Three states and three triggers give nine pairs, three of them defined.
    it('generates one negative condition per state and trigger the lifecycle leaves undefined', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        writeFeatureMap(dir, { routeIds: ['route-contact', 'route-other'], ...fullLifecycle });
        run(dir);
        const negatives = conditionsOf(dir, 'state-transition').filter(
          (c) => (c as unknown as { scenario: string }).scenario === 'negative',
        );
        expect(negatives).toHaveLength(6);
        expect(
          negatives.every(
            (c) =>
              (c as unknown as { negativeCategory: string }).negativeCategory === 'state_violation',
          ),
        ).toBe(true);
        expect(
          negatives.map((c) => (c as unknown as { description: string }).description),
        ).toContain('Verify a orders rejects create while it is "exists", leaving it unchanged.');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('drops the invalid-transition half on a low-impact route, the same reduction the checklist makes', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'low');
        writeFeatureMap(dir, { routeIds: ['route-contact', 'route-other'], ...fullLifecycle });
        run(dir);
        const transitions = conditionsOf(dir, 'state-transition');
        expect(transitions).toHaveLength(3);
        expect(
          transitions.every((c) => (c as unknown as { scenario: string }).scenario === 'positive'),
        ).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('generates one use-case condition naming the whole main flow', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        writeFeatureMap(dir, { routeIds: ['route-contact', 'route-other'], ...fullLifecycle });
        run(dir);
        const useCases = conditionsOf(dir, 'use-case');
        expect(useCases).toHaveLength(1);
        expect((useCases[0] as unknown as { description: string }).description).toBe(
          'Verify the main flow of Ordering: a orders can be create, then update, then delete, and the result of each step is visible in the next.',
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('writes a lifecycle only once, on the feature first member route rather than on every page it touches', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        // route-contact sorts after route-a, so the bundle lands there and not here.
        writeFeatureMap(dir, { routeIds: ['route-a', 'route-contact'], ...fullLifecycle });
        run(dir);
        expect(conditionsOf(dir, 'state-transition')).toHaveLength(0);
        expect(conditionsOf(dir, 'use-case')).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('generates nothing flow-shaped when there is no feature map at all', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        expect(run(dir).status).toBe(0);
        expect(conditionsOf(dir, 'state-transition')).toHaveLength(0);
        expect(conditionsOf(dir, 'use-case')).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('ignores an unreviewed entity - a derived lifecycle nobody confirmed is not a test basis', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        writeFeatureMap(dir, {
          routeIds: ['route-contact', 'route-other'],
          ...fullLifecycle,
          entityReviewed: false,
        });
        run(dir);
        expect(conditionsOf(dir, 'state-transition')).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('writes no use case for an entity whose life goes nowhere', () => {
      const dir = setupProject(singleTextParamRoute('route-contact'));
      try {
        writeRouteCriticality(dir, 'route-contact', 'high');
        writeFeatureMap(dir, {
          routeIds: ['route-contact', 'route-other'],
          states: ['exists'],
          transitions: [],
        });
        run(dir);
        expect(conditionsOf(dir, 'use-case')).toHaveLength(0);
        expect(conditionsOf(dir, 'state-transition')).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
