import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReviewArtifactRenderer } from '../src/plan/templates/review-artifact-renderer.js';
import { renderReviewApply } from '../src/plan/templates/review-apply.js';
import { renderCorroboration } from '../src/plan/templates/corroboration.js';
import { renderFeatureMapValidator } from '../src/plan/templates/feature-map-validator.js';
import { renderFeatureMapEngine } from '../src/plan/templates/feature-map-engine.js';

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

  // Deleting a page in the feature map review means the same as in the site map review: the page is
  // left out of every later stage, and the features are regrouped without it at once.
  it('leaves a deleted page out and regroups the features without it', () => {
    const dir = setupProject();
    try {
      writeFileSync(
        join(dir, 'scripts', 'derive-feature-map.mjs'),
        renderFeatureMapEngine(),
        'utf8',
      );
      prepare(dir);
      editView(dir, (text) => text.replace(/ {3}- \[ \] P2\.[\s\S]*?\n\n/, ''));
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.applied.leftOut).toEqual(['P2']);
      expect(result.featureMap).toBe('DRAFTED');
      expect(
        readJson(dir, 'artifacts/site-map/site-map.json').routes['/orders/list'],
      ).toMatchObject({
        status: 'removed',
        removedBy: 'human',
      });
      const map = readJson(dir, 'artifacts/analysis/feature-map.json');
      expect(map.routes['id-1']).toBeUndefined();
      for (const feature of Object.values(map.features) as { memberRouteIds: string[] }[]) {
        expect(feature.memberRouteIds).not.toContain('id-1');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // From a live review: everything approved, then the last page of one feature deleted. The redrawn
  // map no longer carries that feature's approval, which the person has to hear; and the lines
  // after the page - the next feature - are not a correction.
  it('names the approvals a left-out page withdrew, and reads nothing more into the deletion', () => {
    const dir = setupProject();
    try {
      writeFileSync(
        join(dir, 'scripts', 'derive-feature-map.mjs'),
        renderFeatureMapEngine(),
        'utf8',
      );
      const sites = siteMap() as Record<string, any>;
      sites.routes['/terms'] = {
        routeId: 'id-2',
        title: 'Terms',
        visualTriage: { state: 'ready', flags: [] },
      };
      const map = featureMap() as Record<string, any>;
      map.routes['id-2'] = {
        ...intent('id-2', 'low', 'Legal text only.', 'Terms'),
        featureId: 'f2',
      };
      map.features.f2 = {
        ...map.features.f1,
        featureId: 'f2',
        name: 'Legal',
        memberRouteIds: ['id-2'],
        entityIds: [],
        impact: 'low',
        impactSourceRouteId: 'id-2',
      };
      writeJson(dir, 'artifacts/site-map/site-map.json', sites);
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);
      node(dir, 'derive-feature-map.mjs', '--force');
      const derived = readJson(dir, 'artifacts/analysis/feature-map.json');
      for (const table of ['features', 'routes', 'entities']) {
        for (const record of Object.values(derived[table] || {}) as Record<string, unknown>[]) {
          record.reviewed = true;
          record.reviewedBy = 'human';
        }
      }
      writeJson(dir, 'artifacts/analysis/feature-map.json', derived);
      node(dir, 'render-review-artifact.mjs', '--kind=feature-map');

      const page = readView(dir).match(/ {3}- \[x\] (P\d+)\. \/orders\/list[\s\S]*?\n\n/)!;
      editView(dir, (text) => text.replace(page[0], ''));
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.applied.leftOut).toEqual([page[1]]);
      expect(result.freeEdits).toEqual([]);
      expect(result.approvalWithdrawn).toEqual(['feature "Ordering"']);
      expect(result.next).toContain('the approval on each no longer holds');
      const after = readJson(dir, 'artifacts/analysis/feature-map.json');
      const legal = Object.values(after.features).find(
        (f) => (f as { name: string }).name === 'Legal',
      ) as { reviewed: boolean };
      expect(legal.reviewed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps notes written on a feature, a page and an entity with each of them', () => {
    const dir = setupProject();
    try {
      prepare(dir);
      editView(dir, (text) =>
        text
          .replace(/(F1\. Ordering[^\n]*\n {3}Notes:)/, '$1 главная фича')
          .replace(/(P2\. [^\n]*\n(?: {5}[^\n]*\n)*? {5}Notes:)/, '$1 список видит только менеджер')
          .replace(/(E1\. orders[\s\S]*?Notes:)/, '$1 заказ нельзя удалить'),
      );
      const result = node(dir, 'apply-review.mjs', '--kind=feature-map');
      expect(result.status).toBe('APPLIED');
      expect(result.freeEdits).toEqual([]);
      const about = result.applied.entryNotes.map(
        (n: { about: { type: string; id: string }; note: string }) =>
          n.about.type + ':' + n.about.id + ':' + n.note,
      );
      expect(about.sort()).toEqual([
        'entity:e1:заказ нельзя удалить',
        'feature:f1:главная фича',
        'page:id-1:список видит только менеджер',
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

  it('keeps a note written after // on a condition, and on a page, without holding back the approval', () => {
    const dir = setupProject();
    try {
      prepareConditions(dir);
      const view = readView(dir, 'test-conditions');
      const line = view.split('\n').find((l) => l.includes('A double submit places one order'))!;
      editView(
        dir,
        (text) =>
          text
            .replace(line, line.replace('[ ]', '[x]') + ' // только при медленной сети')
            .replace(/(P1\. Page: [^\n]*\n {3}Notes:)/, '$1 страница оформления'),
        'test-conditions',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(result.status).toBe('APPLIED');
      expect(result.freeEdits).toEqual([]);
      expect(result.applied.approved).toHaveLength(1);
      expect(condition(dir, 'c-cccc')).toMatchObject({ reviewed: true, reviewedBy: 'human' });
      const about = result.applied.entryNotes.map(
        (n: { about: { type: string; id: string } }) => n.about.type + ':' + n.about.id,
      );
      expect(about.sort()).toEqual(['condition:c-cccc', 'page:id-0']);
      const redrawn = readView(dir, 'test-conditions');
      expect(redrawn).toContain('A double submit places one order');
      expect(redrawn).toMatch(
        /A double submit places one order[^\n]* \/\/ только при медленной сети/,
      );
      expect(redrawn).toMatch(/P1\. Page: [^\n]*\n {3}Notes: страница оформления/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The box on a page's assistant-checked line is the person's veto: cleared, every one of those
  // conditions leaves testing; ticked again, they come back as the person's approval. What the
  // assistant cut as not applying stays cut either way.
  it("leaves out and brings back a page's assistant-checked conditions through their one box", () => {
    const dir = setupProject();
    try {
      const fixture = conditionsFixture() as Record<string, any>;
      const extra = (id: string, state: Record<string, unknown>) => ({
        ...fixture.routes['id-0'].conditions[0],
        conditionId: id,
        technique: 'checklist-based',
        origin: 'generated',
        layer: 'field',
        reviewer: 'assistant',
        description: 'malformed ' + id,
        isSpeculative: true,
        ...state,
      });
      fixture.routes['id-0'].conditions.push(
        extra('a-kept', { reviewed: true, reviewedBy: 'assistant', isSpeculative: false }),
        extra('a-cut', {
          cut: true,
          cutBy: 'assistant',
          cutReason: 'SQL injection: nothing reaches a server',
        }),
      );
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMap());
      writeJson(dir, 'artifacts/analysis/test-conditions.json', fixture);
      node(dir, 'render-review-artifact.mjs', '--kind=test-conditions');
      const view = readView(dir, 'test-conditions');
      expect(view).not.toContain('malformed a-kept');
      const line = view.split('\n').find((l) => /G\d+\. Checked by the assistant/.test(l))!;
      expect(line).toMatch(/^ {3}- \[x\] G\d+\./);

      editView(dir, (text) => text.replace(line, line.replace('[x]', '[ ]')), 'test-conditions');
      const out = node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(out.applied.vetoes).toEqual([
        expect.objectContaining({ inTesting: false, conditions: 1 }),
      ]);
      const cond = (id: string) =>
        readJson(dir, 'artifacts/analysis/test-conditions.json').routes['id-0'].conditions.find(
          (c: { conditionId: string }) => c.conditionId === id,
        );
      expect(cond('a-kept')).toMatchObject({ cut: true, cutBy: 'person', reviewed: false });
      expect(cond('a-cut')).toMatchObject({ cut: true, cutBy: 'assistant' });
      const cleared = readView(dir, 'test-conditions')
        .split('\n')
        .find((l) => /G\d+\. Checked by the assistant/.test(l))!;
      expect(cleared).toContain('1 left out by you - tick to bring them back');

      editView(
        dir,
        (text) => text.replace(cleared, cleared.replace('[ ]', '[x]')),
        'test-conditions',
      );
      node(dir, 'apply-review.mjs', '--kind=test-conditions');
      expect(cond('a-kept')).toMatchObject({ reviewed: true, reviewedBy: 'human' });
      expect(cond('a-kept').cut).toBeUndefined();
      expect(cond('a-cut')).toMatchObject({ cut: true, cutBy: 'assistant' });
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
          text
            .replace('  Verdict: ', '  Verdict: broken')
            .replace('one per line:\n\n-', 'one per line:\n\n- /checkout'),
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

  function disputedMap() {
    const map = siteMap() as any;
    map.routes['/orders'].httpStatus = 200;
    map.routes['/orders'].visualTriage = { state: 'error_page', source: 'vision', flags: [] };
    return map;
  }

  // A live review: the verdict was a sentence, and the route was deleted to say the page is not
  // needed. Neither reached the JSON, and the page came back as a feature at the next stage.
  it('reads a verdict written as a sentence and leaves a deleted route out of every later stage', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', disputedMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      const view = readView(dir, 'site-map');
      expect(view).toContain('- D1. `/orders` - route R1 below');
      expect(view).toContain('The records disagree about this page - see D1 above.');

      editView(
        dir,
        (text) =>
          text
            .replace('  Verdict: ', '  Verdict: сломано - это сломанный функционал, он не нужен')
            .replace(/- \[ \] R1\. `\/orders`[\s\S]*?\n\n/, ''),
        'site-map',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.status).toBe('APPLIED');
      expect(result.applied.verdicts).toEqual(['D1']);
      expect(result.applied.leftOut).toEqual(['R1']);
      expect(result.freeEdits).toEqual([]);
      expect(result.unreadVerdicts).toEqual([]);

      const map = readJson(dir, 'artifacts/site-map/site-map.json');
      expect(map.routes['/orders']).toMatchObject({ status: 'removed', removedBy: 'human' });
      expect(map.routes['/orders'].removedNote).toBe('это сломанный функционал, он не нужен');
      const profile = readJson(dir, 'artifacts/analysis/app-profile.json');
      expect(profile.leftOutRoutes).toEqual([
        expect.objectContaining({ path: '/orders', routeId: 'id-0', by: 'human' }),
      ]);
      const journal = readFileSync(
        join(dir, 'artifacts', 'analysis', 'sensor-journal.jsonl'),
        'utf8',
      );
      expect(journal).toContain('это сломанный функционал, он не нужен');

      // Redrawn at once: the page sits under "Left out by you", with a box to bring it back.
      const redrawn = readView(dir, 'site-map');
      expect(redrawn).toContain('**Left out by you (1)**');
      expect(redrawn).toContain('- [ ] L1. `/orders` - это сломанный функционал, он не нужен');
      expect(redrawn).not.toContain('R1. `/orders`');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('brings a left-out page back when its box is ticked', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      editView(dir, (text) => text.replace(/- \[ \] R1\. `\/orders`[\s\S]*?\n\n/, ''), 'site-map');
      expect(node(dir, 'apply-review.mjs', '--kind=site-map').applied.leftOut).toEqual(['R1']);

      editView(dir, (text) => text.replace('- [ ] L1.', '- [x] L1.'), 'site-map');
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.applied.broughtBack).toEqual(['L1']);
      const route = readJson(dir, 'artifacts/site-map/site-map.json').routes['/orders'];
      expect(route.status).toBe('active');
      expect(route.removedBy).toBeUndefined();
      expect(readJson(dir, 'artifacts/analysis/app-profile.json').leftOutRoutes).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A page left out after the later stages ran: what they built on it has to go too, or its test
  // conditions still become test cases.
  it('takes the test conditions and test cases of a left-out page with it', () => {
    const dir = setupProject();
    try {
      const conditions = conditionsFixture() as Record<string, any>;
      conditions.routes['id-1'] = { ...conditions.routes['id-0'], routeId: 'id-1', conditions: [] };
      conditions.features.f1.fields = [
        { routeId: 'id-0', control: 'qty', meaning: 'How many to order', role: 'input' },
        { routeId: 'id-1', control: 'search', meaning: 'Finds an order', role: 'input' },
      ];
      conditions.frameRouteId = 'id-1';
      const journey = (routeIds: string[], reviewed: boolean) => ({
        routeIds,
        conditionAssignments: [],
        reviewed,
        ...(reviewed ? { reviewedBy: 'human' } : {}),
      });
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      writeJson(dir, 'artifacts/analysis/feature-map.json', featureMap());
      writeJson(dir, 'artifacts/analysis/test-conditions.json', conditions);
      writeJson(dir, 'artifacts/test-cases/test-cases.json', {
        journeys: {
          'j-list': journey(['id-1'], true),
          'j-walk': journey(['id-0', 'id-1'], true),
          'j-orders': journey(['id-0'], true),
        },
      });
      node(dir, 'render-review-artifact.mjs', '--kind=test-conditions');
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');

      editView(
        dir,
        (text) => text.replace(/- \[ \] R2\. `\/orders\/list`[\s\S]*?\n\n/, ''),
        'site-map',
      );
      const first = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(first.applied.leftOut).toEqual(['R2']);
      expect(first.followedLeftOut).toEqual({
        routes: ['id-1'],
        features: [],
        frame: 'id-1',
        testCasesDropped: ['j-list'],
        testCasesUnticked: ['j-walk'],
      });
      expect(first.next).toContain(
        'Dropped the test conditions of /orders/list, 1 test case(s) that walk no page still in',
      );
      expect(first.next).toContain('/orders/list carried the fields of the site frame');
      expect(first.next).toContain('run /design-test-cases');
      let saved = readJson(dir, 'artifacts/analysis/test-conditions.json');
      expect(Object.keys(saved.routes)).toEqual(['id-0']);
      expect(saved.features.f1.fields.map((f: { routeId: string }) => f.routeId)).toEqual(['id-0']);
      expect(saved.frameRouteId).toBeUndefined();
      let cases = readJson(dir, 'artifacts/test-cases/test-cases.json').journeys;
      expect(Object.keys(cases).sort()).toEqual(['j-orders', 'j-walk']);
      expect(cases['j-walk'].reviewed).toBe(false);
      expect(cases['j-walk'].reviewedBy).toBeUndefined();
      expect(cases['j-orders'].reviewed).toBe(true);
      // The test conditions review is redrawn without the page.
      expect(first.redrawn).toEqual(['test-conditions']);
      expect(readView(dir, 'test-conditions')).not.toContain('/orders/list');

      // The last page of the feature goes too: its analysis has nothing left to stand on.
      editView(dir, (text) => text.replace(/- \[ \] R1\. `\/orders`[\s\S]*?\n\n/, ''), 'site-map');
      const second = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(second.followedLeftOut).toMatchObject({ routes: ['id-0'], features: ['f1'] });
      expect(second.followedLeftOut.testCasesDropped.sort()).toEqual(['j-orders', 'j-walk']);
      expect(second.next).toContain('the analysis of feature "Ordering", which has no page left');
      saved = readJson(dir, 'artifacts/analysis/test-conditions.json');
      expect(saved.routes).toEqual({});
      expect(saved.features).toEqual({});
      cases = readJson(dir, 'artifacts/test-cases/test-cases.json').journeys;
      expect(cases).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Asked for in conversation rather than done in the file: the same edit, through the same path, so
  // the note, the site map and everything later stages built on the page come out the same.
  it('leaves a page out and brings it back when the person asks in conversation', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      writeJson(dir, 'artifacts/analysis/test-conditions.json', conditionsFixture());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      const out = node(
        dir,
        'apply-review.mjs',
        '--kind=site-map',
        '--leave-out=R1',
        '--note=не нужна',
      );
      expect(out.status).toBe('APPLIED');
      expect(out.applied.leftOut).toEqual(['R1']);
      expect(out.freeEdits).toEqual([]);
      expect(out.followedLeftOut.routes).toEqual(['id-0']);
      expect(readJson(dir, 'artifacts/site-map/site-map.json').routes['/orders']).toMatchObject({
        status: 'removed',
        removedBy: 'human',
        removedNote: 'не нужна',
      });
      expect(readView(dir, 'site-map')).toContain('- [ ] L1. `/orders` - не нужна');

      const back = node(dir, 'apply-review.mjs', '--kind=site-map', '--bring-back=L1');
      expect(back.applied.broughtBack).toEqual(['L1']);
      expect(readJson(dir, 'artifacts/site-map/site-map.json').routes['/orders'].status).toBe(
        'active',
      );
      expect(back.next).toContain('run /define-test-conditions so it is analysed again');

      const wrong = node(dir, 'apply-review.mjs', '--kind=site-map', '--leave-out=L1');
      expect(wrong.status).toBe('INVALID');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A note belongs where the person thinks of it - under the entry, not at the end of the file - and
  // is kept with the entry it is about: shown there again, replaced in place, withdrawn when cleared.
  it('keeps a note written on a route with that route, and never reads it as a correction', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      const view = readView(dir, 'site-map');
      expect(view).toMatch(/- \[ \] R1\. `\/orders`[^\n]*\n(?: {3}[^\n]*\n)* {3}Notes:\n/);

      editView(
        dir,
        (text) =>
          text
            .replace('- [ ] R1.', '- [x] R1.')
            .replace(/(R1\. `\/orders`[\s\S]*?Notes:)/, '$1 заказы видит только менеджер'),
        'site-map',
      );
      const first = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(first.status).toBe('APPLIED');
      expect(first.freeEdits).toEqual([]);
      expect(first.applied.approved).toEqual(['R1']);
      expect(first.applied.entryNotes).toEqual([
        {
          label: 'R1',
          about: {
            review: 'site-map',
            type: 'route',
            id: 'id-0',
            routeId: 'id-0',
            path: '/orders',
          },
          note: 'заказы видит только менеджер',
        },
      ]);
      expect(first.next).toContain('act on it');
      let notes = readJson(dir, 'artifacts/analysis/app-profile.json').domainNotes;
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        note: 'заказы видит только менеджер',
        statedDuring: 'site-map review',
      });
      // Shown under its route again, and not among the notes about the application as a whole.
      const redrawn = readView(dir, 'site-map');
      expect(redrawn).toContain('   Notes: заказы видит только менеджер');
      expect(redrawn.slice(redrawn.indexOf('**Your notes**'))).not.toContain('заказы');

      // Replaced in place: the old one stays, withdrawn, so a condition citing it still resolves.
      editView(
        dir,
        (text) => text.replace('Notes: заказы видит только менеджер', 'Notes: и администратор'),
        'site-map',
      );
      node(dir, 'apply-review.mjs', '--kind=site-map');
      notes = readJson(dir, 'artifacts/analysis/app-profile.json').domainNotes;
      expect(notes).toHaveLength(2);
      expect(notes[0].withdrawnAt).toBeDefined();
      expect(notes[1]).toMatchObject({ note: 'и администратор' });
      expect(notes[1].withdrawnAt).toBeUndefined();

      // Cleared: withdrawn, and the line is empty again.
      editView(dir, (text) => text.replace('Notes: и администратор', 'Notes:'), 'site-map');
      node(dir, 'apply-review.mjs', '--kind=site-map');
      notes = readJson(dir, 'artifacts/analysis/app-profile.json').domainNotes;
      expect(notes.every((n: { withdrawnAt?: string }) => n.withdrawnAt)).toBe(true);
      expect(readView(dir, 'site-map')).not.toContain('и администратор');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approves routes by their boxes and by ALL, like every other review', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      editView(dir, (text) => text.replace('- [ ] ALL.', '- [x] ALL.'), 'site-map');
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.applied.approved.sort()).toEqual(['R1', 'R2']);
      const routes = readJson(dir, 'artifacts/site-map/site-map.json').routes;
      expect(routes['/orders']).toMatchObject({ reviewed: true, reviewedBy: 'human' });
      expect(readView(dir, 'site-map')).toContain('- [x] R1. `/orders`');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Anything the script cannot read is asked about, never guessed - and the answer goes through the
  // same checks as one read from the file.
  it('hands back a verdict it cannot read, and records the one the person then gives', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', disputedMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      editView(
        dir,
        (text) => text.replace('  Verdict: ', '  Verdict: не уверен, надо уточнить'),
        'site-map',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.applied.verdicts).toEqual([]);
      expect(result.unreadVerdicts).toEqual([
        { label: 'D1', path: '/orders', text: 'не уверен, надо уточнить' },
      ]);
      expect(result.freeEdits).toEqual([]);
      expect(result.next).toContain('--verdict=<label>:<works|broken>');
      expect(existsSync(join(dir, 'artifacts', 'review', '.pending', 'site-map.json'))).toBe(true);

      expect(node(dir, 'apply-review.mjs', '--kind=site-map', '--verdict=D1:maybe').status).toBe(
        'INVALID',
      );
      const recorded = node(
        dir,
        'apply-review.mjs',
        '--kind=site-map',
        '--verdict=D1:works',
        '--note=the error was a flaky backend',
      );
      expect(recorded.applied.verdicts).toEqual(['D1']);
      expect(existsSync(join(dir, 'artifacts', 'review', '.pending', 'site-map.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps what the person wrote under "Your notes" with what the project knows, once', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      editView(
        dir,
        (text) =>
          text.replace(
            /One thought per line;[^\n]*\n\n- $/m,
            (match) => match + 'Orders older than a year are archived',
          ),
        'site-map',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.notes).toEqual(['Orders older than a year are archived']);
      expect(result.freeEdits).toEqual([]);
      const profile = readJson(dir, 'artifacts/analysis/app-profile.json');
      expect(profile.domainNotes).toEqual([
        expect.objectContaining({
          note: 'Orders older than a year are archived',
          statedDuring: 'site-map review',
        }),
      ]);
      // Redrawn with the note shown back, and a second read of an already-read file adds nothing.
      expect(readView(dir, 'site-map')).toContain('- Orders older than a year are archived');
      expect(node(dir, 'apply-review.mjs', '--kind=site-map').status).toBe('NO_CHANGES');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The failure that lost a verdict and a deleted route: the file was redrawn before anything read it.
  it('refuses to redraw a file whose edits nobody has read, and keeps them if told to anyway', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      editView(dir, (text) => text.replace('- [ ] R1.', '- [x] R1.'), 'site-map');

      const refused = spawnSync(
        'node',
        [join('scripts', 'render-review-artifact.mjs'), '--kind=site-map'],
        {
          cwd: dir,
          encoding: 'utf8',
        },
      );
      expect(refused.status).toBe(1);
      expect(JSON.parse(refused.stdout).status).toBe('EDITS_UNREAD');
      expect(readView(dir, 'site-map')).toContain('- [x] R1.');

      const forced = node(dir, 'render-review-artifact.mjs', '--kind=site-map', '--discard-edits');
      expect(forced.keptEdits).toBe('artifacts/review/site-map-review.unapplied.md');
      expect(readFileSync(join(dir, forced.keptEdits), 'utf8')).toContain('- [x] R1.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a correction waiting, shown in the redrawn file, until the assistant says it is done', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', siteMap());
      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      editView(
        dir,
        (text) =>
          text.replace(/(R1\. `\/orders`[^\n]*\n)/, '$1   This page also lists archived orders\n'),
        'site-map',
      );
      const result = node(dir, 'apply-review.mjs', '--kind=site-map');
      expect(result.freeEdits).toEqual([
        expect.objectContaining({
          label: 'R1',
          added: ['   This page also lists archived orders'],
        }),
      ]);
      expect(result.next).toContain('--done');

      node(dir, 'render-review-artifact.mjs', '--kind=site-map');
      const redrawn = readView(dir, 'site-map');
      expect(redrawn).toContain('**Waiting for the assistant**');
      expect(redrawn).toContain('R1: you wrote "This page also lists archived orders"');

      expect(node(dir, 'apply-review.mjs', '--kind=site-map', '--done').cleared).toBe(true);
      expect(readView(dir, 'site-map')).not.toContain('Waiting for the assistant');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
