import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
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
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-07T00:00:00.000Z',
    corePurpose: {
      candidates: [{ value: 'A test fixture application', evidence: [] }],
      mostLikelyIndex: 0,
      selected: {
        value: 'A test fixture application',
        confidence: 'high',
        source: 'heading-text',
        reasoning: 'fixture default',
        evidence: [],
      },
      reviewed: true,
      reviewedBy: 'human',
    },
    routes,
  };
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['render-review-artifact.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { result, output: result.stdout ? JSON.parse(result.stdout) : null };
}

// Approving a review changes the entries it describes, and nothing re-renders it - so the file
// left behind states the pre-approval draft. Live-observed claiming "criticality (draft)" for 45
// entries a human had confirmed, with the JSON written two minutes after the markdown.
describe('scripts/render-review-artifact.mjs --discard', () => {
  it('removes the rendered view and leaves the artifact untouched', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(20));
      writeJson(dir, 'artifacts/analysis/business-intent.json', businessIntentWith(20));
      const rendered = run(dir, '--kind=business-intent').output;
      expect(rendered.mode).toBe('file');
      const reviewPath = join(dir, 'artifacts', 'review', 'business-intent-review.md');
      expect(existsSync(reviewPath)).toBe(true);

      const discarded = run(dir, '--kind=business-intent', '--discard').output;
      expect(discarded.discarded).toBe(true);
      expect(existsSync(reviewPath)).toBe(false);
      // The record survives; only the view was thrown away.
      expect(existsSync(join(dir, 'artifacts', 'analysis', 'business-intent.json'))).toBe(true);
      expect(discarded.note).toContain('Re-render');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is harmless when there is nothing rendered to discard', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
      writeJson(dir, 'artifacts/analysis/business-intent.json', businessIntentWith(2));
      const output = run(dir, '--kind=business-intent', '--discard').output;
      expect(output.discarded).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

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
      expect(output.markdown).toContain('Confirmed core purpose: A test fixture application');
      // Renders the route's resolved path/title, never the raw routeId.
      expect(output.markdown).toContain('**1. /route-00 - Page 0**');
      expect(output.markdown).toContain('Feature: Feature 0');
      expect(output.markdown).toContain('**Route criticality (draft): CRITICAL**');
      expect(output.markdown).toContain('Reasoning: tier reason 0');
      expect(output.markdown).toContain('Evidences: "Heading 0"');
      expect(output.markdown).not.toContain('id-0');
      // confidence is an internal, mechanically-checked signal only - never shown to the human.
      expect(output.markdown).not.toContain('Confidence:');
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
        schemaVersion: 2,
        generatedAt: '2026-09-07T00:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['id-0'],
            testInterface: 'ui',
            breadth: 'targeted',
            level: 'system',
            reviewed: true,
            testCase: {
              title: 'Done one',
              preconditions: [],
              steps: [{ description: 'Do a thing', expectedResult: 'It happened' }],
            },
          },
          j2: {
            journeyId: 'j2',
            routeIds: ['id-0'],
            testInterface: 'api',
            breadth: 'targeted',
            level: 'integration',
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
        },
      });

      const { output } = run(dir, '--kind=test-cases');
      expect(output.summary).toContain('1 already automated');
      expect(output.summary).toContain('1 awaiting automation');
      expect(output.markdown).toContain('[NO OBSERVED API CONTRACT]');
      // What drives the test and how far it reaches are on the heading, where a reviewer sees them
      // before reading a single step.
      expect(output.markdown).toContain('[targeted via ui]');
      expect(output.markdown).toContain('[targeted via api]');
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

  describe('--kind=feature-map', () => {
    function featureMap() {
      return {
        schemaVersion: 1,
        generatedAt: '2026-09-08T00:00:00.000Z',
        features: {
          f1: {
            featureId: 'f1',
            name: 'Ordering',
            memberRouteIds: ['id-0', 'id-1'],
            entityIds: ['e1', 'e2'],
            impact: 'high',
            impactSourceRouteId: 'id-0',
            evidence: [{ signal: 'business-intent-label', excerpt: '/route-00 -> "Ordering"' }],
            reviewed: false,
          },
        },
        entities: {
          e1: {
            entityId: 'e1',
            name: 'orders',
            operations: [
              {
                kind: 'create',
                contractId: 'c1',
                routeIds: ['id-0'],
                confidence: 'observed',
                evidence: [{ signal: 'api-resource', excerpt: 'POST /api/orders' }],
              },
            ],
            relations: [
              {
                kind: 'references',
                targetEntityId: 'e2',
                viaField: 'customerId',
                confidence: 'inferred',
                evidence: [{ signal: 'api-payload-field', excerpt: 'request field "customerId"' }],
              },
            ],
            lifecycle: {
              states: [
                { name: 'absent', initial: true, terminal: false },
                { name: 'exists', initial: false, terminal: true },
              ],
              transitions: [
                {
                  from: 'absent',
                  to: 'exists',
                  trigger: 'create',
                  confidence: 'inferred',
                  evidence: [{ signal: 'api-resource', excerpt: 'a create operation' }],
                },
              ],
            },
            evidence: [{ signal: 'route-convention', excerpt: '/orders' }],
            reviewed: false,
          },
          e2: {
            entityId: 'e2',
            name: 'customers',
            operations: [],
            relations: [],
            lifecycle: { states: [], transitions: [] },
            evidence: [{ signal: 'route-convention', excerpt: '/customers' }],
            reviewed: false,
          },
        },
        sourceHash: 'hash',
      };
    }

    it('renders features, their pages, and every link a person has to confirm', () => {
      const dir = setupProject();
      try {
        writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
        writeJson(dir, 'artifacts/analysis/feature-map.json', featureMap());
        const { output } = run(dir, '--kind=feature-map');
        expect(output.entryCount).toBe(3);
        expect(output.mode).toBe('inline');
        expect(output.summary).toBe('1 feature(s), 2 thing(s), 1 link(s) between them to confirm');
        expect(output.markdown).toContain('1. Ordering - **HIGH IMPACT**');
        // Route ids are resolved to something a person can recognise.
        expect(output.markdown).toContain('/route-00 - Page 0');
        expect(output.markdown).toContain('Works with: customers, orders');
        expect(output.markdown).toContain('Can be: created (seen in real traffic)');
        expect(output.markdown).toContain('Lifecycle: absent -> exists (create)');
        expect(output.markdown).toContain(
          'Needs a customers to already exist - via the field "customerId", guessed from that name alone.',
        );
        expect(output.markdown).toContain('Nothing links it to anything else.');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('says plainly where a fallback impact came from instead of presenting it as a judgment', () => {
      const dir = setupProject();
      try {
        const data = featureMap() as any;
        delete data.features.f1.impactSourceRouteId;
        writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
        writeJson(dir, 'artifacts/analysis/feature-map.json', data);
        const { output } = run(dir, '--kind=feature-map');
        expect(output.markdown).toContain('assumed important until you say otherwise');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
