import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReviewArtifactRenderer } from '../src/plan/templates/review-artifact-renderer.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-review-renderer-'));
  writeFileSync(join(dir, 'render-review-artifact.mjs'), renderReviewArtifactRenderer(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'test-cases'), { recursive: true });
  return dir;
}

function writeJson(dir: string, relPath: string, data: unknown) {
  writeFileSync(join(dir, relPath), JSON.stringify(data, null, 2), 'utf8');
}

function siteMapWith(routeCount: number) {
  const routes: Record<string, unknown> = {};
  for (let i = 0; i < routeCount; i++) {
    routes['/route-' + String(i).padStart(2, '0')] = {
      routeId: 'id-' + i,
      title: 'Page ' + i,
      visualTriage: { state: 'ready', flags: [] },
    };
  }
  return { schemaVersion: 2, generatedAt: '2026-09-07T00:00:00.000Z', routes };
}

function businessIntentWith(routeCount: number) {
  const routes: Record<string, unknown> = {};
  for (let i = 0; i < routeCount; i++) {
    routes['id-' + i] = {
      routeId: 'id-' + i,
      businessFeature: {
        value: 'Feature ' + i,
        confidence: 'high',
        source: 'heading-text',
        reasoning: 'because ' + i,
        evidence: [{ signal: 'heading-text', excerpt: 'Heading ' + i }],
      },
      criticalityTier: {
        value: i === 0 ? 'critical' : 'medium',
        confidence: 'high',
        source: 'heading-text',
        reasoning: 'tier reason ' + i,
        evidence: [{ signal: 'heading-text', excerpt: 'Heading ' + i }],
      },
      reviewed: true,
    };
  }
  return { schemaVersion: 1, generatedAt: '2026-09-07T00:00:00.000Z', routes };
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['render-review-artifact.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { result, output: result.stdout ? JSON.parse(result.stdout) : null };
}

describe('scripts/render-review-artifact.mjs (real execution)', () => {
  it('prints inline when the artifact is small enough to read in a terminal', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
      writeJson(dir, 'artifacts/analysis/business-intent.json', businessIntentWith(2));

      const { output } = run(dir, '--kind=business-intent');
      expect(output.mode).toBe('inline');
      expect(output.entryCount).toBe(2);
      expect(output.filePath).toBeNull();
      // Renders the route's resolved path/title, never the raw routeId.
      expect(output.markdown).toContain('**1. /route-00 - Page 0**');
      expect(output.markdown).toContain('**Route criticality (draft): CRITICAL**');
      expect(output.markdown).toContain('Evidences: "Heading 0"');
      expect(output.markdown).not.toContain('id-0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a file instead of a wall of text once the artifact is past the threshold', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(46));
      writeJson(dir, 'artifacts/analysis/business-intent.json', businessIntentWith(46));

      const { output } = run(dir, '--kind=business-intent');
      expect(output.mode).toBe('file');
      expect(output.filePath).toBe('artifacts/review/business-intent-review.md');
      expect(output.markdown).toBe('');
      expect(output.summary).toContain('46 route(s) analysed');

      // Every entry is in the file - the point of the threshold is that nothing gets elided.
      const written = readFileSync(
        join(dir, 'artifacts', 'review', 'business-intent-review.md'),
        'utf8',
      );
      expect(written).toContain('**1. /route-00 - Page 0**');
      expect(written).toContain('**46. /route-45 - Page 45**');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honours an explicit --threshold', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(3));
      writeJson(dir, 'artifacts/analysis/business-intent.json', businessIntentWith(3));

      expect(run(dir, '--kind=business-intent', '--threshold=2').output.mode).toBe('file');
      expect(run(dir, '--kind=business-intent', '--threshold=99').output.mode).toBe('inline');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('separates likely-phantom routes from the numbered list, and renders confirmed roles', () => {
    const dir = setupProject();
    try {
      const siteMap = siteMapWith(2) as {
        routes: Record<string, { visualTriage: { flags: string[] } }>;
      };
      siteMap.routes['/route-01'].visualTriage.flags = ['likely-phantom-route'];
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap);

      const intent = businessIntentWith(2) as Record<string, unknown>;
      intent.roles = {
        admin: {
          name: 'admin',
          purpose: {
            value: 'Manages user accounts',
            confidence: 'high',
            source: 'manual',
            reasoning: 'confirmed by the human',
            evidence: [{ signal: 'manual', excerpt: 'admin manages accounts' }],
          },
          exclusiveRoutes: ['/route-00'],
          reviewed: true,
          reviewedBy: 'human',
        },
      };
      writeJson(dir, 'artifacts/analysis/business-intent.json', intent);

      const { output } = run(dir, '--kind=business-intent');
      expect(output.markdown).toContain('**Roles crawled**');
      expect(output.markdown).toContain('admin: Manages user accounts');
      expect(output.markdown).toContain('**Possibly not real routes**');
      expect(output.summary).toContain('1 flagged as possibly not real');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('summarises drafted test cases including how many are still not automated', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(1));
      writeJson(dir, 'artifacts/test-cases/test-cases.json', {
        schemaVersion: 1,
        generatedAt: '2026-09-07T00:00:00.000Z',
        routes: {
          'id-0': {
            journeys: [
              {
                journeyId: 'j1',
                routeId: 'id-0',
                layer: 'e2e',
                reviewed: true,
                testCase: {
                  title: 'Done one',
                  preconditions: [],
                  steps: [{ description: 'Do a thing', expectedResult: 'It happened' }],
                },
              },
              {
                journeyId: 'j2',
                routeId: 'id-0',
                layer: 'api',
                reviewed: false,
                testCase: {
                  title: 'Pending one',
                  preconditions: [],
                  steps: [
                    {
                      description: 'Call the endpoint',
                      expectedResult: 'Status is 200',
                      api: { contractGrounded: false },
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const { output } = run(dir, '--kind=test-cases');
      expect(output.summary).toContain('1 already automated');
      expect(output.summary).toContain('1 awaiting automation');
      expect(output.markdown).toContain('[NO OBSERVED API CONTRACT]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails loudly on an unknown kind rather than rendering nothing', () => {
    const dir = setupProject();
    try {
      const { result } = run(dir, '--kind=nonsense');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown --kind');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
