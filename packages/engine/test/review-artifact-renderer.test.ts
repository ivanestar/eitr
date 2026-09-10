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

// One feature per route, so the entry count scales the same way the old per-route artifact did and
// the threshold behaviour stays comparable.
function featureMapWith(routeCount: number) {
  const features: Record<string, unknown> = {};
  const routes: Record<string, unknown> = {};
  for (let i = 0; i < routeCount; i++) {
    const featureId = 'f-' + i;
    features[featureId] = {
      featureId,
      name: 'Feature ' + i,
      memberRouteIds: ['id-' + i],
      entityIds: [],
      impact: i === 0 ? 'high' : 'medium',
      impactSourceRouteId: 'id-' + i,
      evidence: [{ signal: 'heading-text', excerpt: 'Heading ' + i }],
      reviewed: false,
    };
    routes['id-' + i] = {
      routeId: 'id-' + i,
      featureId,
      criticality: {
        value: i === 0 ? 'high' : 'medium',
        confidence: 'high',
        source: 'heading-text',
        reasoning: 'tier reason ' + i,
        evidence: [{ signal: 'heading-text', excerpt: 'Heading ' + i }],
      },
      sourceContentHash: 'hash-' + i,
      analyzedAt: '2026-09-07T00:00:00.000Z',
      reviewed: false,
    };
  }
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-07T00:00:00.000Z',
    features,
    entities: {},
    routes,
    sourceHash: 'fixture',
  };
}

function appProfileWithPurpose() {
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
  };
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['render-review-artifact.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { result, output: result.stdout ? JSON.parse(result.stdout) : null };
}

// A field left out of a page's conditions is a decision nothing downstream will test it, so the
// review names each one; and the site frame's fields, left out of every page, get one line saying so.
describe('scripts/render-review-artifact.mjs --kind=test-conditions field accounting', () => {
  it('names each field left out with its reason, and the frame fields no page carries', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(1));
      mkdirSync(join(dir, 'artifacts', 'site-map', 'inventory'), { recursive: true });
      writeJson(dir, 'artifacts/site-map/inventory/id-0.json', {
        routeId: 'id-0',
        controls: [
          { id: 'c3', role: 'checkbox', name: 'Gift wrap', tag: 'input' },
          { id: 'c4', role: 'textbox', name: '', hint: 'Result', tag: 'textarea' },
        ],
      });
      writeJson(dir, 'artifacts/site-map/inventory/shared.json', {
        widgets: [
          {
            name: 'Header',
            controls: [
              { role: 'link', name: 'Home', tag: 'a' },
              { role: 'combobox', name: 'Select language', tag: 'select' },
            ],
          },
        ],
      });
      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        schemaVersion: 2,
        generatedAt: '2026-09-10T00:00:00.000Z',
        routes: {
          'id-0': {
            routeId: 'id-0',
            parameters: [],
            excluded: [
              { control: 'c3', reason: 'disabled', note: 'enabled only after checkout' },
              { control: 'c4', reason: 'result-output' },
            ],
            constraints: [],
            conditions: [],
            unsatisfiedPairs: [],
          },
        },
      });
      const { output } = run(dir, '--kind=test-conditions');
      expect(output.markdown).toContain(
        'Site frame fields are not part of any page below: Header: combobox "Select language"',
      );
      expect(output.markdown).not.toContain('Header: link');
      expect(output.markdown).toContain(
        'Fields left out: checkbox "Gift wrap" - disabled (enabled only after checkout); textbox next to "Result" - result-output',
      );

      // With a route named for the frame, the line says where the frame's fields are tested; and a
      // property shows the relation it checks next to its technique.
      const conditions = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'analysis', 'test-conditions.json'), 'utf8'),
      );
      conditions.frameRouteId = 'id-0';
      conditions.routes['id-0'].conditions = [
        {
          conditionId: 'p1',
          technique: 'property',
          relation: 'all-unique',
          description: 'Verify no two generated values are the same',
        },
      ];
      writeJson(dir, 'artifacts/analysis/test-conditions.json', conditions);
      const framed = run(dir, '--kind=test-conditions').output;
      expect(framed.markdown).toContain('Site frame fields are tested once, on /route-00');
      expect(framed.markdown).toContain(
        'Verify no two generated values are the same  [property, all-unique]',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Approving a review changes the entries it describes, and nothing re-renders it - so the file
// left behind states the pre-approval draft. Live-observed claiming "criticality (draft)" for 45
// entries a human had confirmed, with the JSON written two minutes after the markdown.
describe('scripts/render-review-artifact.mjs --discard', () => {
  it('removes the rendered view and leaves the artifact untouched', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(20));
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(20));
      const rendered = run(dir, '--kind=feature-map').output;
      expect(rendered.mode).toBe('file');
      const reviewPath = join(dir, 'artifacts', 'review', 'feature-map-review.md');
      expect(existsSync(reviewPath)).toBe(true);

      const discarded = run(dir, '--kind=feature-map', '--discard').output;
      expect(discarded.discarded).toBe(true);
      expect(existsSync(reviewPath)).toBe(false);
      // The record survives; only the view was thrown away.
      expect(existsSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'))).toBe(true);
      expect(discarded.note).toContain('Re-render');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is harmless when there is nothing rendered to discard', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(2));
      const output = run(dir, '--kind=feature-map', '--discard').output;
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
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(2));
      writeJson(dir, 'artifacts/analysis/app-profile.json', appProfileWithPurpose());

      const { output } = run(dir, '--kind=feature-map');
      expect(output.mode).toBe('inline');
      expect(output.filePath).toBeNull();
      expect(output.markdown).toContain('Confirmed core purpose: A test fixture application');
      expect(output.markdown).toContain('1. Feature 0 - **HIGH IMPACT**');
      // Renders the route's resolved path/title, never the raw routeId.
      expect(output.markdown).toContain('/route-00 - Page 0');
      expect(output.markdown).toContain('tier reason 0');
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
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(46));

      const { output } = run(dir, '--kind=feature-map');
      expect(output.mode).toBe('file');
      expect(output.filePath).toBe('artifacts/review/feature-map-review.md');
      expect(output.markdown).toBe('');
      expect(output.summary).toContain('46 feature(s) over 46 page(s)');

      // Every entry is in the file - the point of the threshold is that nothing gets elided.
      const written = readFileSync(
        join(dir, 'artifacts', 'review', 'feature-map-review.md'),
        'utf8',
      );
      expect(written).toContain('/route-00 - Page 0');
      expect(written).toContain('/route-45 - Page 45');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honours an explicit --threshold', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(3));
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(3));

      expect(run(dir, '--kind=feature-map', '--threshold=2').output.mode).toBe('file');
      expect(run(dir, '--kind=feature-map', '--threshold=99').output.mode).toBe('inline');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks a likely-phantom route where it sits, and renders confirmed roles', () => {
    const dir = setupProject();
    try {
      const siteMap = siteMapWith(2) as {
        routes: Record<string, { visualTriage: { flags: string[] } }>;
      };
      siteMap.routes['/route-01'].visualTriage.flags = ['likely-phantom-route'];
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap);
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(2));

      const profile = appProfileWithPurpose() as Record<string, unknown>;
      profile.roles = {
        admin: {
          name: 'admin',
          purpose: {
            value: 'Manages user accounts',
            confidence: 'high',
            source: 'human',
            reasoning: 'confirmed by the human',
            evidence: [{ signal: 'human', excerpt: 'admin manages accounts' }],
          },
          exclusiveRoutes: ['/route-00'],
          reviewed: true,
          reviewedBy: 'human',
        },
      };
      writeJson(dir, 'artifacts/analysis/app-profile.json', profile);

      const { output } = run(dir, '--kind=feature-map');
      expect(output.markdown).toContain('**Roles crawled**');
      expect(output.markdown).toContain('admin: Manages user accounts');
      expect(output.markdown).toContain('[possibly not a real route]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the pages no feature claims, since nothing downstream will ever test them', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(3));
      const map = featureMapWith(3) as Record<string, any>;
      delete map.features['f-2'];
      delete map.routes['id-2'];
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);

      const { output } = run(dir, '--kind=feature-map');
      expect(output.markdown).toContain('**Pages no feature claims**');
      expect(output.markdown).toContain('/route-02 - Page 2');
      expect(output.summary).toContain('1 page(s) no feature claims');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a reasoning sentence reused across pages rather than rejecting it', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
      const map = featureMapWith(2) as Record<string, any>;
      map.routes['id-0'].criticality.reasoning = 'Same sentence for both.';
      map.routes['id-1'].criticality.reasoning = 'Same sentence for both.';
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);

      const { output } = run(dir, '--kind=feature-map');
      expect(output.summary).toContain('2 page(s) share a reasoning sentence');
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
        schemaVersion: 2,
        generatedAt: '2026-09-08T00:00:00.000Z',
        routes: {
          'id-0': {
            routeId: 'id-0',
            featureId: 'f1',
            criticality: {
              value: 'high',
              confidence: 'high',
              source: 'heading-text',
              reasoning: 'Places real orders.',
              evidence: [{ signal: 'heading-text', excerpt: 'Place an order' }],
            },
            sourceContentHash: 'h0',
            analyzedAt: '2026-09-08T00:00:00.000Z',
            reviewed: false,
          },
          'id-1': {
            routeId: 'id-1',
            featureId: 'f1',
            criticality: {
              value: 'medium',
              confidence: 'medium',
              source: 'form-labels',
              reasoning: 'Lists existing orders.',
              evidence: [{ signal: 'form-labels', excerpt: 'Order number' }],
            },
            sourceContentHash: 'h1',
            analyzedAt: '2026-09-08T00:00:00.000Z',
            reviewed: false,
          },
        },
        features: {
          f1: {
            featureId: 'f1',
            name: 'Ordering',
            memberRouteIds: ['id-0', 'id-1'],
            entityIds: ['e1', 'e2'],
            impact: 'high',
            impactSourceRouteId: 'id-0',
            evidence: [{ signal: 'route-convention', excerpt: '/route-00 -> "Ordering"' }],
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
        expect(output.entryCount).toBe(5);
        expect(output.mode).toBe('inline');
        expect(output.summary).toBe(
          '1 feature(s) over 2 page(s) (1 high, 1 medium), 2 thing(s), 1 link(s) between them to confirm',
        );
        expect(output.markdown).toContain('1. Ordering - **HIGH IMPACT**');
        // Route ids are resolved to something a person can recognise, with the tier a reviewer is
        // actually being asked to check sitting next to the page it was given for.
        expect(output.markdown).toContain('/route-00 - Page 0 - **HIGH**');
        expect(output.markdown).toContain('Places real orders.');
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
