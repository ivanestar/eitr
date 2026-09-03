import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPipelineStatus } from '../src/plan/templates/pipeline-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-pipeline-status-'));
  writeFileSync(join(dir, 'pipeline-status.mjs'), renderPipelineStatus(), 'utf8');
  mkdirSync(join(dir, 'docs', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'analysis'), { recursive: true });
  return dir;
}

function writeSiteMap(dir: string) {
  writeFileSync(
    join(dir, 'docs', 'site-map', 'site-map.json'),
    JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-03T10:00:00.000Z', routes: {} }),
    'utf8',
  );
}

function writeBusinessIntent(dir: string, reviewed: boolean) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'business-intent.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-03T10:00:00.000Z',
      routes: {
        'route-checkout': {
          routeId: 'route-checkout',
          businessFeature: {
            value: 'Checkout',
            confidence: 'high',
            source: 'heading-text',
            evidence: [],
          },
          criticalityTier: {
            value: 'high',
            confidence: 'high',
            source: 'heading-text',
            evidence: [],
          },
          sourceContentHash: 'abc123',
          analyzedAt: '2026-09-03T10:00:00.000Z',
          reviewed,
          ...(reviewed ? { reviewedBy: 'human' } : {}),
        },
      },
    }),
    'utf8',
  );
}

function writeTestConditions(dir: string, reviewed: boolean) {
  writeFileSync(
    join(dir, 'docs', 'analysis', 'test-conditions.json'),
    JSON.stringify({
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
              isSpeculative: !reviewed,
              reviewed,
              ...(reviewed ? { reviewedBy: 'human' } : {}),
            },
          ],
          unsatisfiedPairs: [],
          sourceContentHash: 'abc123',
          sourceParamsHash: '',
          analyzedAt: '2026-09-03T11:00:00.000Z',
        },
      },
    }),
    'utf8',
  );
}

function run(dir: string) {
  return spawnSync('node', ['pipeline-status.mjs'], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/pipeline-status.mjs (real execution)', () => {
  it('reports not-started when no site-map.json exists', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('not-started');
      expect(output.nextCommand).toBe('/map-site create');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports business-intent-pending-review when site-map.json exists but business-intent.json does not', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-pending-review');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports business-intent-pending-review when every business-intent entry has reviewed:false', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, false);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-pending-review');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not crash on a malformed business-intent.json - degrades to business-intent-pending-review', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeFileSync(join(dir, 'docs', 'analysis', 'business-intent.json'), 'not valid json', 'utf8');
    try {
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-pending-review');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports business-intent-reviewed (next: /derive-test-conditions) once reviewed, before test-conditions.json exists', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('business-intent-reviewed');
      expect(output.nextCommand).toBe('/derive-test-conditions');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports test-conditions-pending-review when test-conditions.json exists but no condition is reviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, false);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('test-conditions-pending-review');
      expect(output.nextCommand).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports ready-to-automate once at least one condition is reviewed', () => {
    const dir = setupProject();
    writeSiteMap(dir);
    writeBusinessIntent(dir, true);
    writeTestConditions(dir, true);
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.stage).toBe('ready-to-automate');
      expect(output.nextCommand).toBe('/automate-ticket');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
