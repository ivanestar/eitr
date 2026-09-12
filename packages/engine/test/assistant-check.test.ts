import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAssistantCheck } from '../src/plan/templates/assistant-check.js';
import { renderTestConditionsEngine } from '../src/plan/templates/test-conditions-engine.js';
import { renderPipelineStatus } from '../src/plan/templates/pipeline-status.js';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-assistant-check-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'assistant-check.mjs'), renderAssistantCheck(), 'utf8');
  writeFileSync(
    join(dir, 'scripts', 'generate-test-conditions.mjs'),
    renderTestConditionsEngine(),
    'utf8',
  );
  writeFileSync(join(dir, 'scripts', 'pipeline-status.mjs'), renderPipelineStatus(), 'utf8');
  return dir;
}

function writeJson(dir: string, rel: string, data: unknown) {
  writeFileSync(join(dir, rel), JSON.stringify(data, null, 2), 'utf8');
}

function readConditions(dir: string) {
  return JSON.parse(
    readFileSync(join(dir, 'artifacts', 'analysis', 'test-conditions.json'), 'utf8'),
  );
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', [join('scripts', args[0]), ...args.slice(1)], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

// A page with one number field holding a limit, a free-text field, and one condition the analysis
// wrote itself - enough for every kind of reviewer the generator assigns.
function report() {
  return {
    schemaVersion: 3,
    generatedAt: '2026-09-11T10:00:00.000Z',
    basis: { mode: 'live-app', sources: ['http://localhost:3000/'] },
    features: {},
    routes: {
      'route-guid': {
        routeId: 'route-guid',
        parameters: [
          {
            name: 'how many',
            kind: 'number',
            partitions: [
              {
                id: 'some',
                kind: 'valid',
                sampleValues: ['5'],
                expectedOutcome: 'exactly 5 GUIDs are listed',
              },
              {
                id: 'too-many',
                kind: 'invalid',
                sampleValues: ['1001'],
                expectedOutcome: 'the field is marked invalid and nothing is generated',
                rule: { signal: 'html5-constraint', excerpt: 'max=1000' },
              },
            ],
            boundaries: [],
            evidence: [{ signal: 'html5-constraint', excerpt: 'max=1000' }],
          },
          {
            name: 'label',
            kind: 'text',
            partitions: [
              {
                id: 'short',
                kind: 'valid',
                sampleValues: ['batch 7'],
                expectedOutcome: 'the list is headed "batch 7"',
              },
            ],
            boundaries: [],
            evidence: [{ signal: 'form-label', excerpt: 'Label' }],
          },
        ],
        constraints: [],
        conditions: [
          {
            conditionId: 'unique',
            technique: 'property',
            relation: 'all-unique',
            description: 'No two generated GUIDs are the same',
            expectedOutcome: 'every GUID in the list differs from every other',
            scenario: 'positive',
            parameters: {},
            verification: {},
            isSpeculative: true,
            reviewed: false,
            origin: 'model',
            layer: 'behavior',
            oracle: 'domain',
            anchors: [],
            risk: { likelihood: 'medium', reason: 'a generator can repeat itself' },
          },
        ],
        unsatisfiedPairs: [],
        sourceContentHash: 'h',
        sourceParamsHash: '',
        analyzedAt: '2026-09-11T10:00:00.000Z',
      },
    },
  };
}

function generated(dir: string) {
  writeJson(dir, 'artifacts/analysis/test-conditions.json', report());
  expect(run(dir, 'generate-test-conditions.mjs').output.status).toBe('GENERATED');
  return readConditions(dir).routes['route-guid'].conditions as Array<Record<string, any>>;
}

describe('who reviews a condition, set by the generator', () => {
  it('gives a person what the analysis wrote and what rests on words, and the assistant what the markup settles', () => {
    const dir = setupProject();
    try {
      const conditions = generated(dir);
      const by = (predicate: (c: Record<string, any>) => boolean) =>
        conditions.filter(predicate).map((c) => c.reviewer);
      expect(by((c) => c.conditionId === 'unique')).toEqual(['person']);
      expect(new Set(by((c) => c.technique === 'checklist-based'))).toEqual(new Set(['assistant']));
      // The limit comes from max=1000 in the markup: the assistant's.
      expect(new Set(by((c) => c.technique === 'combinatorial'))).toEqual(new Set(['assistant']));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/assistant-check.mjs (real execution)', () => {
  it('lists what needs no person, page by page, with what decides its relevance', () => {
    const dir = setupProject();
    try {
      const conditions = generated(dir);
      writeJson(dir, 'artifacts/site-map/site-map.json', {
        routes: { '/tools/guid': { routeId: 'route-guid', title: 'GUID generator' } },
      });
      const { output } = run(dir, 'assistant-check.mjs', 'list');
      expect(output.status).toBe('LIST');
      expect(output.pending).toBe(conditions.filter((c) => c.reviewer === 'assistant').length);
      expect(output.pages[0]).toMatchObject({
        routeId: 'route-guid',
        path: '/tools/guid',
        callsApi: false,
      });
      expect(output.pages[0].conditions.some((c: { id: string }) => c.id === 'unique')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records kept and cut decisions, and refuses a person's condition, a cut without a reason, and a second decision", () => {
    const dir = setupProject();
    try {
      const conditions = generated(dir);
      const mine = conditions.filter((c) => c.reviewer === 'assistant');
      const sql = mine.find((c) => /OR '1'='1/.test(JSON.stringify(c.parameters)))!;
      const rest = mine.filter((c) => c !== sql);

      writeJson(dir, 'bad.json', {
        keep: [{ route: 'route-guid', id: 'unique' }],
        cut: [{ route: 'route-guid', id: sql.conditionId, reason: 'no' }],
      });
      const refused = run(dir, 'assistant-check.mjs', 'record', '--file=bad.json');
      expect(refused.status).toBe(1);
      expect(refused.output.errors.join(' ')).toContain("is a person's to review");
      expect(refused.output.errors.join(' ')).toContain('say why');
      expect(
        readConditions(dir).routes['route-guid'].conditions.find(
          (c: { conditionId: string }) => c.conditionId === 'unique',
        ).reviewed,
      ).toBe(false);

      writeJson(dir, 'good.json', {
        keep: rest.map((c) => ({ route: 'route-guid', id: c.conditionId })),
        cut: [
          {
            route: 'route-guid',
            id: sql.conditionId,
            reason: 'SQL injection: this page sends nothing to a server',
          },
        ],
      });
      const recorded = run(dir, 'assistant-check.mjs', 'record', '--file=good.json');
      expect(recorded.output).toMatchObject({
        status: 'RECORDED',
        kept: rest.length,
        cut: 1,
        pending: 0,
      });
      const after = readConditions(dir).routes['route-guid'].conditions as Array<
        Record<string, any>
      >;
      for (const c of after.filter(
        (x) => x.reviewer === 'assistant' && x.conditionId !== sql.conditionId,
      )) {
        expect(c).toMatchObject({ reviewed: true, reviewedBy: 'assistant', isSpeculative: false });
      }
      expect(after.find((c) => c.conditionId === sql.conditionId)).toMatchObject({
        cut: true,
        cutBy: 'assistant',
        cutReason: 'SQL injection: this page sends nothing to a server',
      });
      expect(
        run(dir, 'assistant-check.mjs', 'record', '--file=good.json').output.errors.join(' '),
      ).toContain('already decided');

      // Regenerating from the same parameters keeps the assistant's cut and its reason.
      const regenerated = readConditions(dir);
      regenerated.routes['route-guid'].sourceParamsHash = '';
      writeJson(dir, 'artifacts/analysis/test-conditions.json', regenerated);
      run(dir, 'generate-test-conditions.mjs');
      expect(
        readConditions(dir).routes['route-guid'].conditions.find(
          (c: { conditionId: string }) => c.conditionId === sql.conditionId,
        ),
      ).toMatchObject({
        cut: true,
        cutBy: 'assistant',
        cutReason: 'SQL injection: this page sends nothing to a server',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // What the assistant approved in a person's place is checked before the person's review, so it
  // must never carry the pipeline past that review.
  it("does not let the assistant's approvals count as the review of the stage", () => {
    const dir = setupProject();
    try {
      const conditions = generated(dir);
      writeJson(dir, 'decisions.json', {
        keep: conditions
          .filter((c) => c.reviewer === 'assistant')
          .map((c) => ({ route: 'route-guid', id: c.conditionId })),
        cut: [],
      });
      run(dir, 'assistant-check.mjs', 'record', '--file=decisions.json');
      writeJson(dir, 'artifacts/site-map/site-map.json', {
        routes: {
          '/tools/guid': {
            routeId: 'route-guid',
            status: 'active',
            reviewed: true,
            reviewedBy: 'human',
          },
        },
      });
      writeJson(dir, 'artifacts/analysis/feature-map.json', {
        features: { f1: { featureId: 'f1', reviewed: true, reviewedBy: 'human' } },
        entities: {},
        routes: {
          'route-guid': {
            routeId: 'route-guid',
            featureId: 'f1',
            reviewed: true,
            reviewedBy: 'human',
          },
        },
      });
      expect(run(dir, 'pipeline-status.mjs').output.stage).toBe('test-conditions-pending-review');

      const data = readConditions(dir);
      const unique = data.routes['route-guid'].conditions.find(
        (c: { conditionId: string }) => c.conditionId === 'unique',
      );
      Object.assign(unique, { reviewed: true, reviewedBy: 'human', isSpeculative: false });
      writeJson(dir, 'artifacts/analysis/test-conditions.json', data);
      expect(run(dir, 'pipeline-status.mjs').output.stage).toBe('test-conditions-reviewed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is part of what gets generated', () => {
    expect(plan(muiProfile(), planOptions()).files.map((f) => f.path)).toContain(
      'scripts/assistant-check.mjs',
    );
  });
});
