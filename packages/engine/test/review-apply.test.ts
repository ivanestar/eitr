import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReviewArtifactRenderer } from '../src/plan/templates/review-artifact-renderer.js';
import { renderReviewApply } from '../src/plan/templates/review-apply.js';
import { renderCorroboration } from '../src/plan/templates/corroboration.js';
import { renderFeatureMapValidator } from '../src/plan/templates/feature-map-validator.js';

// The generated project's own layout: every script under scripts/, run from the project root.
function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-review-apply-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'render-review-artifact.mjs'),
    renderReviewArtifactRenderer(),
    'utf8',
  );
  writeFileSync(join(dir, 'scripts', 'apply-review.mjs'), renderReviewApply(), 'utf8');
  writeFileSync(join(dir, 'scripts', 'corroboration.mjs'), renderCorroboration(), 'utf8');
  writeFileSync(
    join(dir, 'scripts', 'validate-feature-map.mjs'),
    renderFeatureMapValidator(),
    'utf8',
  );
  for (const sub of ['site-map', 'analysis', 'test-cases']) {
    mkdirSync(join(dir, 'artifacts', sub), { recursive: true });
  }
  return dir;
}

function writeJson(dir: string, relPath: string, data: unknown) {
  writeFileSync(join(dir, relPath), JSON.stringify(data, null, 2), 'utf8');
}

function readJson(dir: string, relPath: string) {
  return JSON.parse(readFileSync(join(dir, relPath), 'utf8'));
}

function node(dir: string, script: string, ...args: string[]) {
  const result = spawnSync('node', [join('scripts', script), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return JSON.parse(result.stdout);
}

const VIEW = 'artifacts/review/feature-map-review.md';

function readView(dir: string, kind = 'feature-map') {
  return readFileSync(join(dir, 'artifacts', 'review', kind + '-review.md'), 'utf8');
}

function editView(dir: string, edit: (text: string) => string, kind = 'feature-map') {
  const file = join(dir, 'artifacts', 'review', kind + '-review.md');
  writeFileSync(file, edit(readFileSync(file, 'utf8')), 'utf8');
}

function siteMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-08T00:00:00.000Z',
    routes: {
      '/orders': { routeId: 'id-0', title: 'Orders', visualTriage: { state: 'ready', flags: [] } },
      '/orders/list': {
        routeId: 'id-1',
        title: 'Order list',
        visualTriage: { state: 'ready', flags: [] },
      },
    },
  };
}

function intent(routeId: string, value: string, reasoning: string, excerpt: string) {
  return {
    routeId,
    featureId: 'f1',
    criticality: {
      value,
      confidence: 'medium',
      source: 'form-labels',
      reasoning,
      evidence: [{ signal: 'form-labels', excerpt }],
    },
    sourceContentHash: 'h-' + routeId,
    analyzedAt: '2026-09-08T00:00:00.000Z',
    reviewed: false,
  };
}

function featureMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-08T00:00:00.000Z',
    routes: {
      'id-0': intent('id-0', 'high', 'Places real orders.', 'Quantity'),
      'id-1': intent('id-1', 'medium', 'Lists existing orders.', 'Order number'),
    },
    features: {
      f1: {
        featureId: 'f1',
        name: 'Ordering',
        memberRouteIds: ['id-0', 'id-1'],
        entityIds: ['e1'],
        impact: 'high',
        impactSourceRouteId: 'id-0',
        evidence: [{ signal: 'route-convention', excerpt: '/orders -> "Ordering"' }],
        reviewed: false,
      },
    },
    entities: {
      e1: {
        entityId: 'e1',
        name: 'orders',
        operations: [],
        relations: [],
        lifecycle: { states: [], transitions: [] },
        evidence: [{ signal: 'route-convention', excerpt: '/orders' }],
        reviewed: false,
      },
    },
    sourceHash: 'hash',
  };
}

function prepare(dir: string) {
  writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
  writeJson(dir, 'artifacts/analysis/feature-map.json', featureMap());
  const rendered = node(dir, 'render-review-artifact.mjs', '--kind=feature-map');
  expect(rendered.filePath).toBe(VIEW);
}

describe('scripts/apply-review.mjs - feature map', () => {
  it('reports nothing to do on a file nobody touched', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      expect(node(dir, 'apply-review.mjs', '--kind=feature-map').status).toBe('NO_CHANGES');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approves what was ticked, then shows the approval in a fresh rendering', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      editView(dir, (text) =>
        text.replace('- [ ] F1. Ordering', '- [x] F1. Ordering').replace('- [ ] P2.', '- [X] P2.'),
      );
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.status).toBe('APPLIED');
      expect(result.applied.approved.sort()).toEqual(['F1', 'P2']);
      expect(result.freeEdits).toEqual([]);
      expect(result.validation).toBe('PASSED');

      const map = readJson(dir, 'artifacts/analysis/feature-map.json');
      expect(map.features.f1).toMatchObject({ reviewed: true, reviewedBy: 'human' });
      expect(map.routes['id-1']).toMatchObject({ reviewed: true, reviewedBy: 'human' });
      expect(map.routes['id-0'].reviewed).toBe(false);

      // Re-rendered on the spot: the file shows the JSON again and matches its own saved rendering.
      expect(readView(dir)).toContain('- [x] F1. Ordering');
      expect(node(dir, 'apply-review.mjs', '--kind=feature-map').status).toBe('NO_CHANGES');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The empty-entities notice invites a note. It sits under a section heading, so a note there
  // belongs to no feature or page and comes back as a general correction.
  it('hands back a note written under the no-entities notice without pinning it on an entry', () => {
    const dir = setupProject();
    try {
      const map = featureMap() as Record<string, any>;
      map.entities = {};
      map.features.f1.entityIds = [];
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);
      node(dir, 'render-review-artifact.mjs', '--kind=feature-map');
      editView(dir, (text) =>
        text
          .replace('- [ ] F1. Ordering', '- [x] F1. Ordering')
          .replace(/(write which ones under this line\.)/, '$1\nIt keeps orders.'),
      );
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.status).toBe('APPLIED');
      expect(result.applied.approved).toEqual(['F1']);
      expect(result.freeEdits).toEqual([
        { label: null, entry: null, removed: [], added: ['It keeps orders.'] },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approves everything untouched with ALL, and holds back an entry the person also corrected', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      editView(dir, (text) =>
        text
          .replace('- [ ] ALL.', '- [x] ALL.')
          .replace('Lists existing orders.', 'Lists existing orders and lets you cancel one.'),
      );
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.status).toBe('APPLIED');
      expect(result.applied.approved.sort()).toEqual(['E1', 'F1', 'P1']);
      expect(result.approveAfterChange).toEqual(['P2']);
      expect(result.freeEdits).toEqual([
        {
          label: 'P2',
          entry: { type: 'page', routeId: 'id-1' },
          removed: ['     Lists existing orders.'],
          added: ['     Lists existing orders and lets you cancel one.'],
        },
      ]);
      // The correction is not lost: the file stays as the person left it until the assistant has
      // applied it and rendered again.
      expect(readView(dir)).toContain('lets you cancel one');
      expect(result.next).toContain('render-review-artifact.mjs --kind=feature-map');
      expect(readJson(dir, 'artifacts/analysis/feature-map.json').routes['id-1'].reviewed).toBe(
        false,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hands back a note written under an entry, attributed to that entry', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      editView(dir, (text) =>
        text.replace(
          'Places real orders.',
          'Places real orders.\n     This one also refunds - it is high for that too.',
        ),
      );
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.freeEdits).toEqual([
        {
          label: 'P1',
          entry: { type: 'page', routeId: 'id-0' },
          removed: [],
          added: ['     This one also refunds - it is high for that too.'],
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('withdraws an approval when a ticked box is cleared', () => {
    const dir = setupProject();
    try {
      const map = featureMap() as any;
      map.entities.e1.reviewed = true;
      map.entities.e1.reviewedBy = 'human';
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);
      node(dir, 'render-review-artifact.mjs', '--kind=feature-map');
      editView(dir, (text) => text.replace('- [x] E1. orders', '- [ ] E1. orders'));
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.applied.revoked).toEqual(['E1']);
      const entity = readJson(dir, 'artifacts/analysis/feature-map.json').entities.e1;
      expect(entity.reviewed).toBe(false);
      expect(entity.reviewedBy).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a file rendered from an older JSON, keeps it, and hands every edit back', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      editView(dir, (text) => text.replace('- [ ] F1. Ordering', '- [x] F1. Ordering'));
      // Something else changed the feature map after the file was rendered.
      const changed = featureMap() as any;
      changed.routes['id-1'].criticality.value = 'low';
      writeJson(dir, 'artifacts/analysis/feature-map.json', changed);

      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.status).toBe('STALE');
      expect(result.unappliedFile).toBe('artifacts/review/feature-map-review.unapplied.md');
      expect(readFileSync(join(dir, result.unappliedFile), 'utf8')).toContain('- [x] F1. Ordering');
      expect(result.freeEdits[0].label).toBe('F1');
      expect(readJson(dir, 'artifacts/analysis/feature-map.json').features.f1.reviewed).toBe(false);
      // The view now shows the current JSON.
      expect(readView(dir)).toContain('**LOW**');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies nothing when the stage validator would fail, and leaves the JSON byte for byte', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      writeFileSync(
        join(dir, 'scripts', 'validate-feature-map.mjs'),
        [
          "import fs from 'node:fs';",
          "const map = JSON.parse(fs.readFileSync('artifacts/analysis/feature-map.json', 'utf8'));",
          "const errors = map.features.f1.reviewed ? ['features.f1 cannot be approved in this fixture'] : [];",
          "process.stdout.write(JSON.stringify({ status: errors.length ? 'FAILED' : 'PASSED', errors }));",
          'if (errors.length) process.exit(1);',
        ].join('\n'),
        'utf8',
      );
      const before = readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8');
      editView(dir, (text) => text.replace('- [ ] F1. Ordering', '- [x] F1. Ordering'));
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.status).toBe('INVALID');
      expect(result.errors).toEqual(['features.f1 cannot be approved in this fixture']);
      expect(readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8')).toBe(
        before,
      );
      expect(readView(dir)).toContain('- [x] F1. Ordering');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says there is nothing to read when no view was rendered', () => {
    const dir = setupProject();
    try {
      expect(node(dir, 'apply-review.mjs', '--kind=feature-map').status).toBe('NO_VIEW');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function conditionsFixture() {
  const condition = (id: string, description: string, featureId: string) => ({
    conditionId: id,
    parameters: {},
    technique: 'error-guessing',
    description,
    expectedOutcome: 'the page refuses it',
    scenario: 'negative',
    verification: {},
    isSpeculative: true,
    reviewed: false,
    featureId,
    layer: 'rule',
    oracle: 'domain',
    anchors: [{ kind: 'feature', ref: featureId }],
    origin: 'model',
    risk: { likelihood: 'medium', reason: 'a reason' },
    priority: 'P2',
    riskScore: 4,
  });
  return {
    schemaVersion: 3,
    generatedAt: '2026-09-08T00:00:00.000Z',
    basis: { mode: 'live-app', sources: ['http://localhost'] },
    features: {
      f1: {
        featureId: 'f1',
        purpose: 'Places orders.',
        fitsApplication: 'The shop exists to take orders.',
        archetype: 'checkout',
        confidence: 'medium',
        anchors: [{ kind: 'feature', ref: 'f1' }],
        fields: [],
        dependencies: [],
        questions: [{ text: 'What is the largest quantity one order may hold?', about: 'feature' }],
        research: { status: 'skipped', archetype: 'checkout', reason: 'no web access' },
        analyzedAt: '2026-09-08T00:00:00.000Z',
      },
    },
    routes: {
      'id-0': {
        routeId: 'id-0',
        parameters: [],
        constraints: [],
        conditions: [
          condition('c-aaaa', 'Ordering zero items is refused', 'f1'),
          condition('c-bbbb', 'Ordering a negative quantity is refused', 'f1'),
          condition('c-cccc', 'A double submit places one order', 'f1'),
        ],
        unsatisfiedPairs: [],
        sourceContentHash: 'h',
        sourceParamsHash: '',
        analyzedAt: '2026-09-08T00:00:00.000Z',
      },
    },
  };
}

describe('scripts/apply-review.mjs - test conditions', () => {
  function prepareConditions(dir: string) {
    writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
    writeJson(dir, 'artifacts/analysis/feature-map.json', featureMap());
    writeJson(dir, 'artifacts/analysis/test-conditions.json', conditionsFixture());
    node(dir, 'render-review-artifact.mjs', '--kind=test-conditions');
  }

  function condition(dir: string, id: string) {
    return readJson(dir, 'artifacts/analysis/test-conditions.json').routes['id-0'].conditions.find(
      (c: { conditionId: string }) => c.conditionId === id,
    );
  }

  it('cuts a condition whose line was deleted, and brings it back when its box is ticked', () => {
    const dir = setupProject();
    try {
      prepareConditions(dir);
      const view = readView(dir, 'test-conditions');
      const line = view.split('\n').find((l) => l.includes('A double submit places one order'))!;
      editView(dir, (text) => text.replace(line + '\n', ''), 'test-conditions');

      const result = node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(result.status).toBe('APPLIED');
      expect(result.applied.cut.length).toBe(1);
      expect(result.freeEdits).toEqual([]);
      expect(condition(dir, 'c-cccc')).toMatchObject({ cut: true, reviewed: false });

      const cutView = readView(dir, 'test-conditions');
      expect(cutView).toContain('**Cut by you (1)**');
      const cutLine = cutView
        .split('\n')
        .find((l) => l.includes('A double submit places one order'))!;
      expect(cutLine).toMatch(/^- \[ \] C\d+\. /);

      editView(
        dir,
        (text) => text.replace(cutLine, cutLine.replace('[ ]', '[x]')),
        'test-conditions',
      );
      const restored = node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(restored.applied.restored.length).toBe(1);
      expect(condition(dir, 'c-cccc').cut).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records an answer written on its line and asks for it to be carried through', () => {
    const dir = setupProject();
    try {
      prepareConditions(dir);
      editView(
        dir,
        (text) => text.replace(/Answer: $/m, 'Answer: 50 - the warehouse ships no more per order'),
        'test-conditions',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(result.applied.answered).toEqual(['Q1']);
      expect(result.next).toContain('apply each to every field meaning');
      const question = readJson(dir, 'artifacts/analysis/test-conditions.json').features.f1
        .questions[0];
      expect(question.answer).toBe('50 - the warehouse ships no more per order');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("approves every condition of a feature through the feature's own box, no longer speculative", () => {
    const dir = setupProject();
    try {
      prepareConditions(dir);
      editView(
        dir,
        (text) => text.replace('- [ ] F1. **Ordering**', '- [x] F1. **Ordering**'),
        'test-conditions',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(result.applied.approved.length).toBe(3);
      for (const id of ['c-aaaa', 'c-bbbb', 'c-cccc']) {
        expect(condition(dir, id)).toMatchObject({
          reviewed: true,
          reviewedBy: 'human',
          isSpeculative: false,
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/apply-review.mjs - site map', () => {
  it('records a verdict on a disagreement and lists the pages a person says the crawl missed', () => {
    const dir = setupProject();
    try {
      const map = siteMap() as any;
      map.routes['/orders'].httpStatus = 200;
      map.routes['/orders'].visualTriage = { state: 'error_page', source: 'vision', flags: [] };
      writeJson(dir, 'artifacts/site-map/site-map.json', map);
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      const view = readView(dir, 'site-map');
      expect(view).toContain('- D1. `/orders`');
      expect(view).toContain('Screenshot: an error page (broken)');

      editView(
        dir,
        (text) =>
          text.replace('  Verdict: ', '  Verdict: broken').replace(/-\s*$/, '- /checkout\n'),
        'site-map',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.status).toBe('APPLIED');
      expect(result.applied.verdicts).toEqual(['D1']);
      expect(result.missingPages).toEqual(['/checkout']);
      expect(result.freeEdits).toEqual([]);
      // Nothing holds the named page but the file, so the file keeps it until the assistant acts.
      expect(readView(dir, 'site-map')).toContain('- /checkout');

      const report = node(dir, 'corroboration.mjs', 'report');
      const screen = report.sensors.find((row: { sensor: string }) => row.sensor === 'screen');
      const server = report.sensors.find((row: { sensor: string }) => row.sensor === 'server');
      expect(screen).toMatchObject({ right: 1, wrong: 0 });
      expect(server).toMatchObject({ right: 0, wrong: 1 });
      // The verdict survives a fresh rendering, where it was written.
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      expect(readView(dir, 'site-map')).toContain('  Verdict: broken');
      expect(existsSync(join(dir, 'artifacts', 'analysis', 'sensor-journal.jsonl'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
