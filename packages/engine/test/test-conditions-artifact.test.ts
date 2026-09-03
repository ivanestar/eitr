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
    schemaVersion: 1,
    generatedAt: '2026-09-03T11:00:00.000Z',
    routes: {
      'route-checkout': {
        routeId: 'route-checkout',
        parameters: [
          {
            name: 'email',
            kind: 'email',
            partitions: [
              { id: 'valid', kind: 'valid', sampleValues: ['user@example.com'] },
              { id: 'empty', kind: 'invalid', sampleValues: [''] },
            ],
            boundaries: [],
            evidence: [{ signal: 'form-label', excerpt: 'Email' }],
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

function wellFormedWithConditions() {
  const report = structuredClone(wellFormedParametersOnly()) as {
    routes: Record<string, { conditions: unknown[] }>;
  };
  report.routes['route-checkout'].conditions = [
    {
      conditionId: 'a1b2c3d4e5f6a1b2',
      parameters: { email: 'valid', quantity: 'valid' },
      technique: 'combinatorial',
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
  mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'analysis'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'site-map', 'site-map.json'),
    JSON.stringify(SITE_MAP, null, 2),
    'utf8',
  );
  return dir;
}

function writeReport(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'test-conditions.json'),
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
        join(dir, 'docs', 'site-map', 'site-map.json'),
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

  it('fails cleanly (not a crash) when the report file content is the literal JSON value null', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'docs', 'analysis', 'test-conditions.json'), 'null', 'utf8');
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
  it('renders a schemaVersion-1 TestConditionsReport interface keyed by routeId, and the output is tsc --noEmit clean in isolation', () => {
    const text = renderTestConditionsTypes();
    expect(text).toContain('TestConditionsReport');
    expect(text).toContain('TestConditionsEntry');
    expect(text).toContain('UnsatisfiedPair');
    expect(text).toContain('schemaVersion: 1');

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
