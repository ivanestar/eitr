import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTestConditionsEngine } from '../src/plan/templates/test-conditions-engine.js';

interface ConditionFixture {
  conditionId: string;
  parameters: Record<string, string>;
  technique: string;
  verification: Record<string, unknown>;
  isSpeculative: boolean;
  reviewed: boolean;
}

interface RouteEntry {
  routeId: string;
  parameters: Array<{
    name: string;
    kind: string;
    partitions: Array<{ id: string; kind: string; sampleValues: string[] }>;
    boundaries: Array<{ boundary: string; values: [string, string, string] }>;
    evidence: Array<{ signal: string; excerpt: string }>;
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
  schemaVersion: 1;
  generatedAt: string;
  routes: Record<string, RouteEntry>;
} {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-03T11:00:00.000Z',
    routes: {
      'route-checkout': {
        routeId: 'route-checkout',
        parameters: [
          {
            name: 'shippingMethod',
            kind: 'select',
            partitions: [
              { id: 'standard', kind: 'valid', sampleValues: ['Standard'] },
              { id: 'express', kind: 'valid', sampleValues: ['Express'] },
            ],
            boundaries: [],
            evidence: [{ signal: 'select-option-text', excerpt: 'Standard' }],
          },
          {
            name: 'paymentMethod',
            kind: 'select',
            partitions: [
              { id: 'card', kind: 'valid', sampleValues: ['Card'] },
              { id: 'paypal', kind: 'valid', sampleValues: ['PayPal'] },
            ],
            boundaries: [],
            evidence: [{ signal: 'select-option-text', excerpt: 'Card' }],
          },
          {
            name: 'quantity',
            kind: 'number',
            partitions: [
              { id: 'valid', kind: 'valid', sampleValues: ['5'] },
              { id: 'too-high', kind: 'invalid', sampleValues: ['1000'] },
            ],
            boundaries: [{ boundary: 'max', values: ['9', '10', '11'] }],
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
  mkdirSync(join(dir, 'docs', 'analysis'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'analysis', 'test-conditions.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  return dir;
}

function run(dir: string) {
  return spawnSync('node', ['generate-test-conditions.mjs'], { cwd: dir, encoding: 'utf8' });
}

function readReport(dir: string): { routes: Record<string, RouteEntry> } {
  return JSON.parse(readFileSync(join(dir, 'docs', 'analysis', 'test-conditions.json'), 'utf8'));
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
      schemaVersion: 1 as const,
      generatedAt: '2026-09-03T11:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          parameters: [
            {
              name: 'paramA',
              kind: 'select',
              partitions: [
                { id: 'x', kind: 'valid', sampleValues: ['X'] },
                { id: 'not-x', kind: 'valid', sampleValues: ['Not X'] },
              ],
              boundaries: [],
              evidence: [{ signal: 'select-option-text', excerpt: 'X' }],
            },
            {
              name: 'paramB',
              kind: 'select',
              partitions: [
                { id: 'y', kind: 'valid', sampleValues: ['Y'] },
                { id: 'not-y', kind: 'valid', sampleValues: ['Not Y'] },
              ],
              boundaries: [],
              evidence: [{ signal: 'select-option-text', excerpt: 'Y' }],
            },
            {
              name: 'paramC',
              kind: 'select',
              partitions: [
                { id: 'z', kind: 'valid', sampleValues: ['Z'] },
                { id: 'w', kind: 'valid', sampleValues: ['W'] },
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
      schemaVersion: 1,
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
});
