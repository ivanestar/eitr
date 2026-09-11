import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReviewArtifactRenderer } from '../src/plan/templates/review-artifact-renderer.js';
import { renderCorroboration } from '../src/plan/templates/corroboration.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-review-renderer-'));
  writeFileSync(join(dir, 'render-review-artifact.mjs'), renderReviewArtifactRenderer(), 'utf8');
  writeFileSync(join(dir, 'corroboration.mjs'), renderCorroboration(), 'utf8');
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
      // A page no feature covers still shows the fields it leaves out.
      expect(output.markdown).toContain('**Other pages**');
      expect(output.markdown).toContain(
        'Not tested here: checkbox "Gift wrap" (disabled - enabled only after checkout); textbox next to "Result" (result-output)',
      );

      // With a route named for the frame, the line says where the frame's fields are tested; and a
      // property shows the relation it checks next to its technique.
      const conditions = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'analysis', 'test-conditions.json'), 'utf8'),
      );
      conditions.frameRouteId = 'id-0';
      conditions.features = {
        'f-gen': {
          featureId: 'f-gen',
          purpose: 'Generates GUIDs.',
          fitsApplication: 'One of the testing tools the application collects.',
          archetype: 'id generator',
          fields: [],
          questions: [{ text: 'Is 1000 the real upper limit?', about: 'c9' }],
          research: { status: 'skipped', archetype: 'id generator', reason: 'no web access' },
        },
      };
      conditions.routes['id-0'].conditions = [
        {
          conditionId: 'p1',
          technique: 'property',
          relation: 'all-unique',
          description: 'Verify no two generated values are the same',
          featureId: 'f-gen',
          layer: 'behavior',
          oracle: 'domain',
          priority: 'P1',
          riskScore: 6,
        },
        {
          conditionId: 'p2',
          technique: 'boundary-value',
          description: 'With count="1001": the count is refused',
          featureId: 'f-gen',
          layer: 'field',
          oracle: 'markup',
          priority: 'P2',
          riskScore: 4,
        },
      ];
      writeJson(dir, 'artifacts/analysis/test-conditions.json', conditions);
      const framed = run(dir, '--kind=test-conditions').output;
      expect(framed.markdown).toContain('Site frame fields are tested once, on /route-00');
      // Per feature: the open question, then each page with the fields it leaves out and its
      // conditions as "Verify ..." lines in priority order. What the analysis understood stays in the
      // JSON; the stage report carries the research.
      expect(framed.markdown).not.toContain('What it is');
      expect(framed.markdown).toContain('Q1. Is 1000 the real upper limit?');
      expect(framed.markdown).toContain('   P1. Page: /route-00 - Page 0\n   Notes:');
      expect(framed.markdown).toContain('C1. Verify no two generated values are the same (P1)');
      expect(framed.markdown).toContain(
        'C2. Verify with count="1001": the count is refused (P2, regression only)',
      );
      expect(framed.summary).toContain('P1: 1, P2: 1, P3: 0');
      expect(framed.summary).toContain('1 question(s) for you');
      expect(framed.report).toContain(
        'Research: 0 feature(s) researched, 1 skipped (no web access)',
      );
      expect(framed.report).toContain('Questions for you: 1');
      // What the page should do apart from how its fields take malformed input, each with a box.
      expect(framed.markdown).toMatch(
        /- \[ \] G1\. Meaning - what the page should do \(1\)\n {5}- \[ \] C1\. Verify no two generated values/,
      );
      expect(framed.markdown).toMatch(
        /- \[ \] G2\. Format - limits, malformed and hostile values \(1\)\n {5}- \[ \] C2\. Verify with count/,
      );
      // The report names the file the review is in, so printing it shows where to go.
      expect(framed.report).toMatch(
        /\n- Review it in: artifacts\/review\/test-conditions-review\.md$/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Counted by features, a run of 1050 conditions over seven features was handed over as fit to
  // print in the chat. What a person approves one by one is a condition.
  it('counts a test conditions review by its conditions when deciding inline or file', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(1));
      const condition = (i: number) => ({
        conditionId: 'c' + i,
        technique: 'error-guessing',
        description: 'Verify case ' + i,
        featureId: 'f1',
        layer: 'rule',
        oracle: 'domain',
        priority: 'P2',
        riskScore: 4,
      });
      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        schemaVersion: 3,
        routes: {
          'id-0': {
            routeId: 'id-0',
            parameters: [],
            constraints: [],
            conditions: Array.from({ length: 12 }, (_, i) => condition(i)),
          },
        },
        features: { f1: { featureId: 'f1', fields: [], questions: [] } },
      });
      const { output } = run(dir, '--kind=test-conditions');
      expect(output.entryCount).toBe(12);
      expect(output.mode).toBe('file');
      expect(output.markdown).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A live review printed every value of every vector, a 1000-character probe in full, on each of
  // 117 lines. A generated condition now names what it is about, and a page says once what all of its
  // combinations share.
  it('writes each generated condition as one short Verify line, with shared values said once', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(1));
      const parameters = [
        {
          name: 'size',
          partitions: [
            {
              id: 'p_s',
              kind: 'valid',
              sampleValues: ['S'],
              expectedOutcome: 'Size S is selected',
            },
            {
              id: 'p_l',
              kind: 'valid',
              sampleValues: ['L'],
              expectedOutcome: 'Size L is selected',
            },
          ],
        },
        {
          name: 'note',
          partitions: [
            {
              id: 'p_n',
              kind: 'valid',
              sampleValues: ['gift'],
              expectedOutcome: 'The note is shown',
            },
          ],
        },
      ];
      const generated = (
        id: string,
        vector: Record<string, string>,
        scenario: string,
        outcome: string,
      ) => ({
        conditionId: id,
        technique: 'combinatorial',
        parameters: vector,
        description: 'With ...: ' + outcome + ' (' + scenario + ')',
        expectedOutcome: outcome,
        scenario,
        origin: 'generated',
        featureId: 'f1',
        oracle: 'domain',
        priority: 'P2',
      });
      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        schemaVersion: 3,
        generatedAt: '2026-09-10T00:00:00.000Z',
        features: {
          f1: { featureId: 'f1', fields: [], questions: [], research: { status: 'done' } },
        },
        routes: {
          'id-0': {
            routeId: 'id-0',
            parameters,
            conditions: [
              generated(
                'c1',
                { size: 'p_s', note: 'p_n' },
                'positive',
                'Size S is selected; The note is shown',
              ),
              generated(
                'c2',
                { size: 'p_l', note: 'p_n' },
                'positive',
                'Size L is selected; The note is shown',
              ),
              generated(
                'c3',
                { size: 'p_s', note: 'A'.repeat(1000) },
                'negative',
                'the value is rejected',
              ),
            ],
          },
        },
      });
      const { markdown } = run(dir, '--kind=test-conditions').output;
      expect(markdown).toContain('   Same in every combination below: note = "gift"');
      expect(markdown).toContain('Verify size = "S": Size S is selected (P2)');
      expect(markdown).toContain('Verify size = "L": Size L is selected (P2)');
      expect(markdown).toContain(
        'Verify note = "AAAAAAAAAAAAAAAAAAAAAAAA…" (1000 characters): the value is rejected (P2)',
      );
      expect(markdown).not.toContain('A'.repeat(100));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A person may review by editing the file, so it is always written for the editable stages - with
// the rendering kept beside it, what apply-review.mjs compares an edited file against - and it is
// never deleted: rendering again after a change is what keeps it from showing an older state.
describe('scripts/render-review-artifact.mjs editable review files', () => {
  it('always writes the file for an editable stage, with the rendering and its labels beside it', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMapWith(2));
      const output = run(dir, '--kind=feature-map').output;
      expect(output.mode).toBe('inline');
      expect(output.editable).toBe(true);
      expect(output.filePath).toBe('artifacts/review/feature-map-review.md');

      const written = readFileSync(
        join(dir, 'artifacts', 'review', 'feature-map-review.md'),
        'utf8',
      );
      expect(written.split('\n')[0]).toMatch(
        /^<!-- review of artifacts\/analysis\/feature-map\.json @ [0-9a-f]{16} /,
      );
      expect(written).toContain('- [ ] ALL. Approve every entry I did not change');
      expect(written).toContain('- [ ] F1. Feature 0 - **HIGH IMPACT**');
      expect(written).toContain('   - [ ] P1. /route-00 - Page 0 - **HIGH**');

      const base = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'review', '.base', 'feature-map-review.json'), 'utf8'),
      );
      expect(base.text).toBe(written);
      expect(base.source).toBe('artifacts/analysis/feature-map.json');
      expect(base.labels.F1).toEqual({ type: 'feature', id: 'f-0' });
      expect(base.labels.P1).toEqual({ type: 'page', routeId: 'id-0' });
      expect(base.owners.length).toBe(written.split('\n').length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ticks the box of what is already approved, so a later rendering shows the current state', () => {
    const dir = setupProject();
    try {
      const map = featureMapWith(2) as any;
      map.features['f-0'].reviewed = true;
      map.features['f-0'].reviewedBy = 'human';
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);
      const { markdown } = run(dir, '--kind=feature-map').output;
      expect(markdown).toContain('- [x] F1. Feature 0');
      expect(markdown).toContain('- [ ] F2. Feature 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes the test-cases view only past the threshold - it is read, not edited, for now', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(1));
      writeJson(dir, 'artifacts/test-cases/test-cases.json', { schemaVersion: 2, journeys: {} });
      const output = run(dir, '--kind=test-cases').output;
      expect(output.editable).toBe(false);
      expect(output.filePath).toBeNull();
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
      expect(output.markdown).toContain('Confirmed core purpose: A test fixture application');
      expect(output.markdown).toContain('- [ ] F1. Feature 0 - **HIGH IMPACT**');
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

  // A page the person left out belongs to no feature on purpose - it is listed in the site map
  // review under "Left out by you", not here as something missed.
  it('does not count a left-out page among the pages no feature claims', () => {
    const dir = setupProject();
    try {
      const sites = siteMapWith(3) as Record<string, any>;
      Object.assign(sites.routes['/route-02'], { status: 'removed', removedBy: 'human' });
      writeJson(dir, 'artifacts/site-map/site-map.json', sites);
      const map = featureMapWith(3) as Record<string, any>;
      delete map.features['f-2'];
      delete map.routes['id-2'];
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);

      const { output } = run(dir, '--kind=feature-map');
      expect(output.markdown).not.toContain('**Pages no feature claims**');
      expect(output.markdown).not.toContain('/route-02');
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
        expect(output.markdown).toContain('- [ ] F1. Ordering - **HIGH IMPACT**');
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
        expect(output.markdown).not.toContain('None found:');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // A client-only application yields no entities, and the review used to drop the section
    // without a word - a person could not tell the map had lost its flow-based half.
    it('says so when no entity was found, and what that costs the later stages', () => {
      const dir = setupProject();
      try {
        const map = featureMap() as Record<string, any>;
        map.entities = {};
        map.features.f1.entityIds = [];
        writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
        writeJson(dir, 'artifacts/analysis/feature-map.json', map);
        const { markdown } = run(dir, '--kind=feature-map').output;
        expect(markdown).toMatch(/\*\*Things this application works with\*\*\n\nNone found: /);
        expect(markdown).toContain(
          'no state-transition or use-case test conditions will be drafted',
        );
        expect(markdown).not.toMatch(/\n{3}/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('separates every multi-line entry with a blank line: each page, feature and entity', () => {
      const dir = setupProject();
      try {
        writeJson(dir, 'artifacts/site-map/site-map.json', siteMapWith(2));
        writeJson(dir, 'artifacts/analysis/feature-map.json', featureMap());
        const { markdown } = run(dir, '--kind=feature-map').output;
        // A page's reasoning, evidence and notes end before the next page starts.
        expect(markdown).toMatch(
          /Evidences: "Place an order"\n {5}Notes:\n\n {3}- \[ \] P2\. \/route-01/,
        );
        // The feature's last line ends before the entity section starts.
        expect(markdown).toMatch(
          /Impact comes from: [^\n]+\n\n\*\*Things this application works with\*\*/,
        );
        // One entity's block ends before the next one's heading.
        expect(markdown).toMatch(/\n\n- \[ \] E2\. orders\n/);
        expect(markdown).not.toMatch(/\n{3}/);
        expect(markdown).not.toMatch(/\s$/);
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
