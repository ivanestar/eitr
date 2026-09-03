import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderBusinessIntentTypes } from '../src/plan/templates/business-intent-types.js';
import { renderBusinessIntentValidator } from '../src/plan/templates/business-intent-validator.js';

const SITE_MAP = {
  schemaVersion: 2,
  generatedAt: '2026-09-02T10:00:00.000Z',
  baseUrl: 'https://example.com',
  routes: {
    '/checkout': {
      routeId: 'route-checkout',
      sampleUrls: ['https://example.com/checkout'],
      title: 'Checkout',
      discoveredAt: '2026-09-02T10:00:00.000Z',
      lastCheckedAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'abc123',
      status: 'active',
    },
    '/account': {
      routeId: 'route-account',
      sampleUrls: ['https://example.com/account'],
      title: 'Account',
      discoveredAt: '2026-09-02T10:00:00.000Z',
      lastCheckedAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'def456',
      status: 'active',
    },
  },
};

function wellFormedReport() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-02T11:00:00.000Z',
    routes: {
      'route-checkout': {
        routeId: 'route-checkout',
        businessFeature: {
          value: 'Checkout',
          confidence: 'high',
          source: 'heading-text',
          evidence: [{ signal: 'heading-text', excerpt: 'Checkout' }],
        },
        criticalityTier: {
          value: 'critical',
          confidence: 'high',
          source: 'route-path',
          evidence: [{ signal: 'route-path', excerpt: '/checkout' }],
        },
        sourceContentHash: 'abc123',
        analyzedAt: '2026-09-02T11:00:00.000Z',
        reviewed: false,
      },
      'route-account': {
        routeId: 'route-account',
        businessFeature: {
          value: 'Account Settings',
          confidence: 'medium',
          source: 'heading-text',
          evidence: [{ signal: 'heading-text', excerpt: 'Account' }],
        },
        criticalityTier: {
          value: 'medium',
          confidence: 'medium',
          source: 'route-path',
          evidence: [{ signal: 'route-path', excerpt: '/account' }],
        },
        sourceContentHash: 'def456',
        analyzedAt: '2026-09-02T11:00:00.000Z',
        reviewed: false,
      },
    },
  };
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-business-intent-'));
  writeFileSync(join(dir, 'validate-business-intent.mjs'), renderBusinessIntentValidator(), 'utf8');
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
    join(dir, 'docs', 'analysis', 'business-intent.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string) {
  return spawnSync('node', ['validate-business-intent.mjs'], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/validate-business-intent.mjs (real execution)', () => {
  // AC3
  it('passes validation for a well-formed multi-route fixture', () => {
    const dir = setupProject();
    try {
      writeReport(dir, wellFormedReport());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC4, case 1/6: literal JSON null content must not crash the validator (D2's own rationale).
  it('fails cleanly (not a crash) when the report file content is the literal JSON value null', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'docs', 'analysis', 'business-intent.json'), 'null', 'utf8');
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

  // AC4, case 2/6
  it('fails when schemaVersion is missing', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport()) as Record<string, unknown>;
      delete bad.schemaVersion;
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC4, case 3/6
  it('fails when schemaVersion is wrong', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport()) as Record<string, unknown>;
      bad.schemaVersion = 2;
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC4, case 4/6
  it('fails when an entry is missing the reviewed field', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport());
      delete (bad.routes['route-checkout'] as Record<string, unknown>).reviewed;
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('.reviewed must be a boolean'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when reviewed:true has no reviewedBy', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport()) as {
        routes: Record<string, { reviewed: boolean; reviewedBy?: string }>;
      };
      bad.routes['route-checkout'].reviewed = true;
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

  it('passes when reviewed:true and reviewedBy:"human" are both set', () => {
    const dir = setupProject();
    try {
      const good = structuredClone(wellFormedReport()) as {
        routes: Record<string, { reviewed: boolean; reviewedBy?: string }>;
      };
      good.routes['route-checkout'].reviewed = true;
      good.routes['route-checkout'].reviewedBy = 'human';
      writeReport(dir, good);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC4, case 5/6
  it('fails on an invalid criticalityTier enum value', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport());
      bad.routes['route-checkout'].criticalityTier.value = 'urgent';
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('criticalityTier.value'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC4, case 6/6
  it('fails on a routeId with no matching entry in site-map.json', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport());
      bad.routes['route-ghost'] = {
        ...bad.routes['route-checkout'],
        routeId: 'route-ghost',
      };
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('dangling reference'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC11 (validator-level half)
  it('fails an entry whose evidence excerpt exceeds 100 chars', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport());
      bad.routes['route-checkout'].businessFeature.evidence[0].excerpt = 'x'.repeat(101);
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('<=100 chars'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // skill-reviewer pass (2026-09-02): the skill prose bounds businessFeature to <=40 characters -
  // the validator must enforce that bound mechanically, matching how excerpt's own bound is
  // enforced, rather than leaving it as a prose-only convention.
  it('fails a businessFeature value exceeding 40 characters', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport());
      bad.routes['route-checkout'].businessFeature.value = 'x'.repeat(41);
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('<=40 characters'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Review-phase regression: isField()'s evidence check previously only inspected excerpt.length
  // once excerpt already happened to be a string, never validating that an evidence entry has a
  // known signal or an excerpt at all - a malformed entry like `{}` silently passed the gate.
  it('fails an evidence entry with an unknown signal or a missing excerpt', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedReport());
      bad.routes['route-checkout'].businessFeature.evidence = [{ signal: 'not-a-real-signal' }];
      writeReport(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('.signal must be a known signal'))).toBe(
        true,
      );
      expect(output.errors.some((e: string) => e.includes('.excerpt must be a string'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Review-phase regression: the dangling-routeId check was gated on knownRouteIds.size > 0,
  // conflating "site-map.json missing/unparseable" with "site-map.json present but legitimately
  // has zero routes" - in the latter case a real dangling reference silently passed.
  it('fails a dangling routeId even when site-map.json legitimately has zero routes', () => {
    const dir = setupProject();
    try {
      writeFileSync(
        join(dir, 'docs', 'site-map', 'site-map.json'),
        JSON.stringify({ ...SITE_MAP, routes: {} }, null, 2),
        'utf8',
      );
      writeReport(dir, wellFormedReport());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('dangling reference'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('renderBusinessIntentTypes (real standalone tsc check)', () => {
  // AC2 - "tsc-clean" verified by an actual isolated compile, not a substring match: docs/ is
  // outside every generated project's own tsconfig include list (see AC2's Implementation Note in
  // the plan), so this is the only mechanism that actually proves the emitted TypeScript compiles.
  it('renders a schemaVersion-1 BusinessIntentReport interface keyed by routeId, and the output is tsc --noEmit clean in isolation', () => {
    const text = renderBusinessIntentTypes();
    expect(text).toContain('BusinessIntentReport');
    expect(text).toContain('BusinessIntentEntry');
    expect(text).toContain('Field<T>');
    expect(text).toContain('schemaVersion: 1');
    expect(text).toContain('Keyed by routeId');
    expect(text).toContain("reviewedBy?: 'human' | 'auto-pilot';");

    const dir = mkdtempSync(join(tmpdir(), 'eitr-business-intent-types-'));
    try {
      const filePath = join(dir, 'business-intent.types.ts');
      writeFileSync(filePath, text, 'utf8');
      // Invoke this repo's own locally-installed tsc.js directly via `node`, rather than the
      // .bin/tsc(.cmd) wrapper or `npx` (which would need a node_modules/package.json of its own
      // in this isolated temp dir). Spawning a .cmd wrapper directly fails on Windows without
      // `shell: true` (CreateProcess can't execute a .cmd the way it executes a real .exe) -
      // going straight to `node tsc.js` sidesteps that entirely and matches this suite's existing
      // convention of invoking `node <script>` directly (see swarm-dispatcher.test.ts).
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
