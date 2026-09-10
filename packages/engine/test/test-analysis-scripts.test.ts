import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { renderFieldProbe } from '../src/plan/templates/field-probe.js';
import { renderTestResearch } from '../src/plan/templates/test-research.js';
import { renderTestAnalysisPlan } from '../src/plan/templates/test-analysis-plan.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-test-analysis-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'site-map', 'inventory'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'field-probe.mjs'), renderFieldProbe(), 'utf8');
  writeFileSync(join(dir, 'scripts', 'test-research.mjs'), renderTestResearch(), 'utf8');
  writeFileSync(join(dir, 'scripts', 'test-analysis-plan.mjs'), renderTestAnalysisPlan(), 'utf8');
  return dir;
}

function writeJson(dir: string, relative: string, data: unknown) {
  writeFileSync(join(dir, relative), JSON.stringify(data, null, 2), 'utf8');
}

function run(dir: string, script: string, args: string[] = []) {
  const result = spawnSync('node', [join('scripts', script), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

function profile(dir: string, boundary: string | null, kind: string | null) {
  writeJson(dir, 'artifacts/analysis/app-profile.json', {
    schemaVersion: 1,
    generatedAt: '2026-09-10T00:00:00.000Z',
    ...(boundary
      ? {
          crawlBoundary: {
            value: boundary,
            source: 'human',
            recordedAt: '2026-09-10T00:00:00.000Z',
          },
        }
      : {}),
    ...(kind
      ? {
          applicationKind: { value: kind, source: 'human', recordedAt: '2026-09-10T00:00:00.000Z' },
        }
      : {}),
  });
}

describe('scripts/field-probe.mjs', () => {
  // Typing is an interaction and submitting creates something: each needs its own permission, and
  // the second is never given on production.
  it('decides from the recorded boundary and kind of application whether to type or submit', () => {
    const dir = setupProject();
    try {
      const cases: Array<[string | null, string | null, boolean, boolean]> = [
        [null, null, false, false],
        ['read-only', 'sandbox-demo', false, false],
        ['safe-interactions', 'sandbox-demo', true, false],
        ['full', 'production', true, false],
        ['full', null, true, false],
        ['full', 'staging-of-production', true, true],
      ];
      for (const [boundary, kind, fill, submit] of cases) {
        profile(dir, boundary, kind);
        const { output } = run(dir, 'field-probe.mjs', ['permissions']);
        expect({ boundary, kind, fill: output.fill, submit: output.submit }).toEqual({
          boundary,
          kind,
          fill,
          submit,
        });
        expect(typeof output.reason).toBe('string');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('grades a reading and stores it under an id a condition can cite, redacting what it keeps', () => {
    const dir = setupProject();
    try {
      profile(dir, 'safe-interactions', 'sandbox-demo');
      const readings = [
        {
          ok: true,
          validity: ['rangeUnderflow'],
          validationMessage: 'Value must be 1 or more',
          ariaInvalid: false,
          described: '',
          appeared: [],
          rewritten: false,
        },
        {
          ok: true,
          validity: [],
          validationMessage: '',
          ariaInvalid: false,
          described: '',
          appeared: [],
          rewritten: true,
          valueAfter: '',
        },
        {
          ok: true,
          validity: [],
          validationMessage: '',
          ariaInvalid: false,
          described: '',
          appeared: [],
          rewritten: false,
        },
      ];
      const verdicts = readings.map((reading, i) => {
        writeJson(dir, 'reading.json', reading);
        const { output } = run(dir, 'field-probe.mjs', [
          'record',
          '--route=r1',
          '--control=c' + i,
          '--value=' + (i === 2 ? 'call 4155550123456' : '-5'),
          '--via=blur',
          '--observation=reading.json',
        ]);
        return [output.id, output.verdict];
      });
      expect(verdicts).toEqual([
        ['p1', 'rejected'],
        ['p2', 'rewritten'],
        ['p3', 'accepted'],
      ]);
      const stored = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'analysis', 'field-probes.json'), 'utf8'),
      );
      expect(stored.probes[0]).toMatchObject({
        id: 'p1',
        message: 'Value must be 1 or more',
        validity: ['rangeUnderflow'],
      });
      expect(JSON.stringify(stored)).not.toContain('4155550123456');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to record a probe the boundary did not allow, and a submit on production', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'reading.json', { outcome: 'rejected', message: 'Amount too high' });
      profile(dir, 'read-only', 'sandbox-demo');
      const typed = run(dir, 'field-probe.mjs', [
        'record',
        '--route=r1',
        '--control=c1',
        '--value=x',
        '--via=blur',
        '--observation=reading.json',
      ]);
      expect(typed.status).toBe(1);
      expect(typed.output.error).toContain('read-only');

      profile(dir, 'full', 'production');
      const submitted = run(dir, 'field-probe.mjs', [
        'record',
        '--route=r1',
        '--control=c1',
        '--value=x',
        '--via=submit',
        '--observation=reading.json',
      ]);
      expect(submitted.status).toBe(1);
      expect(submitted.output.error).toContain('production');
      expect(existsSync(join(dir, 'artifacts', 'analysis', 'field-probes.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/test-research.mjs', () => {
  function research(overrides: Record<string, unknown> = {}) {
    return {
      queries: ['how to test a unit converter', 'unit conversion precision defects'],
      sources: [
        {
          id: 's1',
          url: 'https://www.nist.gov/pml/owm/metric-si/unit-conversion',
          title: 'Unit Conversion',
          publisher: 'NIST',
          kind: 'standard',
        },
        {
          id: 's2',
          url: 'https://www.iso.org/standard/30669.html',
          title: 'ISO 80000-1',
          publisher: 'ISO',
          kind: 'standard',
        },
        {
          id: 's3',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON',
          title: 'Number.EPSILON',
          publisher: 'MDN',
          kind: 'official-docs',
        },
        {
          id: 's4',
          url: 'https://floating-point-gui.de/',
          title: 'The Floating-Point Guide',
          publisher: 'floating-point-gui.de',
          kind: 'article',
        },
        {
          id: 's5',
          url: 'https://en.wikipedia.org/wiki/Conversion_of_units',
          title: 'Conversion of units',
          publisher: 'Wikipedia',
          kind: 'community',
        },
      ],
      checks: [
        {
          id: 'k1',
          statement: 'Converting a value to its own unit returns it unchanged',
          sourceIds: ['s1', 's4'],
        },
      ],
      ...overrides,
    };
  }

  it('stores a record resting on five sources from four sites, and reuses it for the same kind of feature', () => {
    const dir = setupProject();
    try {
      expect(
        run(dir, 'test-research.mjs', ['status', '--archetype=Unit converter']).output.cached,
      ).toBe(false);
      writeJson(dir, 'research.json', research());
      const recorded = run(dir, 'test-research.mjs', [
        'record',
        '--archetype=Unit converter',
        '--file=research.json',
      ]);
      expect(recorded.output).toMatchObject({
        ok: true,
        file: 'artifacts/analysis/research/unit-converter.json',
        sources: 5,
      });
      expect(recorded.output.summary).toEqual({
        status: 'done',
        archetype: 'Unit converter',
        file: 'artifacts/analysis/research/unit-converter.json',
      });
      const again = run(dir, 'test-research.mjs', ['status', '--archetype=unit converter']).output;
      expect(again).toMatchObject({ cached: true, sources: 5, stale: false });
      expect(again.summary.status).toBe('cached');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses thin research, a finding that cites nothing real, and a query naming the application', () => {
    const dir = setupProject();
    try {
      writeJson(dir, 'artifacts/site-map/site-map.json', {
        baseUrl: 'https://tools.onlytests.io/',
        routes: {},
      });
      const forbidden = run(dir, 'test-research.mjs', ['status', '--archetype=unit converter'])
        .output.forbiddenTerms;
      expect(forbidden).toContain('onlytests');

      const base = research();
      writeJson(dir, 'research.json', {
        ...base,
        queries: ['onlytests unit converter bugs'],
        sources: base.sources.slice(0, 3),
        checks: [{ id: 'k1', statement: 'Round trips return the input', sourceIds: ['s7'] }],
      });
      const refused = run(dir, 'test-research.mjs', [
        'record',
        '--archetype=unit converter',
        '--file=research.json',
      ]);
      expect(refused.status).toBe(1);
      const errors = refused.output.errors.join(' ');
      expect(errors).toContain('carries "onlytests"');
      expect(errors).toContain('research rests on at least 5');
      expect(errors).toContain('cites "s7"');

      // Five pages of one site are one opinion.
      writeJson(dir, 'research.json', {
        ...base,
        sources: base.sources.map((source, i) => ({
          ...source,
          url: 'https://example.org/page-' + i,
        })),
      });
      const oneSite = run(dir, 'test-research.mjs', [
        'record',
        '--archetype=unit converter',
        '--file=research.json',
      ]);
      expect(oneSite.output.errors.join(' ')).toContain('1 different site(s)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/test-analysis-plan.mjs', () => {
  function crawled(dir: string) {
    writeJson(dir, 'artifacts/site-map/site-map.json', {
      baseUrl: 'http://localhost:3000/',
      routes: {
        '/convert': { routeId: 'r1', inventory: 'artifacts/site-map/inventory/r1.json' },
        '/guid': { routeId: 'r2', inventory: 'artifacts/site-map/inventory/r2.json' },
      },
    });
    writeJson(dir, 'artifacts/site-map/inventory/r1.json', {
      controls: [
        { id: 'c0', role: 'link', name: 'Home', tag: 'a', region: 'header' },
        {
          id: 'c1',
          role: 'spinbutton',
          name: 'Value',
          tag: 'input',
          type: 'number',
          region: 'main',
        },
        { id: 'c2', role: 'combobox', name: 'From', tag: 'select', region: 'main' },
      ],
    });
    writeJson(dir, 'artifacts/site-map/inventory/r2.json', {
      controls: [
        {
          id: 'c1',
          role: 'spinbutton',
          name: 'How many',
          tag: 'input',
          type: 'number',
          region: 'main',
        },
      ],
    });
    writeJson(dir, 'artifacts/analysis/feature-map.json', {
      features: {
        fconv: {
          featureId: 'fconv',
          name: 'Unit converter',
          memberRouteIds: ['r1'],
          impact: 'medium',
        },
        fguid: {
          featureId: 'fguid',
          name: 'GUID generator',
          memberRouteIds: ['r2'],
          impact: 'high',
        },
      },
      routes: {
        r1: { routeId: 'r1', featureId: 'fconv', reviewed: true },
        r2: { routeId: 'r2', featureId: 'fguid', reviewed: true },
      },
    });
  }

  it('stops with the reason when there is nothing to analyse', () => {
    const dir = setupProject();
    try {
      const { output } = run(dir, 'test-analysis-plan.mjs');
      expect(output).toMatchObject({ status: 'STOP', reason: 'nothing-to-analyse' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks which basis to use when there are both an application and documents, and says documents alone are not built yet', () => {
    const dir = setupProject();
    try {
      crawled(dir);
      writeFileSync(join(dir, 'requirements.md'), '# Converter\nValues convert both ways.', 'utf8');
      const asked = run(dir, 'test-analysis-plan.mjs', ['--from=requirements.md,PROJ-142']);
      expect(asked.output.status).toBe('ASK');
      expect(asked.output.question.options.map((o: { id: string }) => o.id)).toEqual([
        'mixed',
        'live-app',
        'documents',
      ]);

      const mixed = run(dir, 'test-analysis-plan.mjs', [
        '--from=requirements.md,PROJ-142',
        '--answers={"basis":"mixed"}',
      ]);
      expect(mixed.output.basis).toEqual({
        mode: 'mixed',
        sources: ['http://localhost:3000/', 'requirements.md', 'PROJ-142'],
      });

      const documents = run(dir, 'test-analysis-plan.mjs', [
        '--from=requirements.md',
        '--answers={"basis":"documents"}',
      ]);
      expect(documents.output).toMatchObject({
        status: 'STOP',
        reason: 'documents-basis-not-built',
      });

      const missing = run(dir, 'test-analysis-plan.mjs', ['--from=no-such-file.md']);
      expect(missing.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('walks each feature through its steps, riskiest first', () => {
    const dir = setupProject();
    try {
      crawled(dir);
      const first = run(dir, 'test-analysis-plan.mjs').output;
      expect(first.basis).toEqual({ mode: 'live-app', sources: ['http://localhost:3000/'] });
      expect(first.features.map((f: { featureId: string }) => f.featureId)).toEqual([
        'fguid',
        'fconv',
      ]);
      expect(first.next).toMatchObject({ featureId: 'fguid', step: 'analyse' });
      expect(first.permissions.fill).toBe(false);

      const analysis = {
        featureId: 'fguid',
        fields: [{ routeId: 'r2', control: 'c1' }],
        questions: [{ text: 'Is 1000 the real limit?', about: 'c1' }],
      };
      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        features: { fguid: analysis },
        routes: {},
      });
      expect(run(dir, 'test-analysis-plan.mjs').output.next).toMatchObject({
        featureId: 'fguid',
        step: 'research',
      });

      const withResearch = {
        ...analysis,
        research: { status: 'skipped', archetype: 'id generator', reason: 'offline' },
      };
      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        features: { fguid: withResearch },
        routes: {},
      });
      const extract = run(dir, 'test-analysis-plan.mjs').output;
      expect(extract.next.step).toBe('extract-parameters');
      expect(extract.features[0].progress).toMatchObject({
        fieldsExplained: '1/1',
        research: 'skipped',
        openQuestions: 1,
      });

      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        features: { fguid: withResearch },
        routes: { r2: { routeId: 'r2', parameters: [], conditions: [] } },
      });
      expect(run(dir, 'test-analysis-plan.mjs').output.next.step).toBe('write-ideas');

      writeJson(dir, 'artifacts/analysis/test-conditions.json', {
        features: { fguid: withResearch },
        routes: {
          r2: {
            routeId: 'r2',
            parameters: [],
            sourceParamsHash: 'h',
            conditions: [
              { technique: 'property', origin: 'model', featureId: 'fguid', priority: 'P1' },
            ],
          },
        },
      });
      // The GUID generator is through; the converter is next, and it has not been analysed.
      expect(run(dir, 'test-analysis-plan.mjs').output.next).toMatchObject({
        featureId: 'fconv',
        step: 'analyse',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The browser half runs where Chromium is installed; CI does not install browsers.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

describe.skipIf(!browserAvailable)('scripts/field-probe.mjs probe in a real browser', () => {
  const page = `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <label>Speed <input id="speed" type="text" value="42"></label><span id="speed-error"></span>
    <label>Count <input id="count" type="number" min="1" max="1000" value="7"></label>
    <label>Notes <input id="notes" type="text" value="my own note"></label>
    <label>Phone <input id="phone" type="text" minlength="10" maxlength="10"></label>
    <script>
      const speed = document.getElementById('speed');
      speed.addEventListener('blur', function () {
        document.getElementById('speed-error').textContent = Number(speed.value) < 0 ? 'Speed cannot be negative' : '';
      });
    </script>
  </body></html>`;

  it('types, moves the focus away, reads what the page said, and puts the field back', async () => {
    const dir = setupProject();
    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage();
      await tab.setContent(page);
      const probe = run(dir, 'field-probe.mjs', ['probe']).output;
      const fn = new Function('return ' + probe.source)();
      const read = (selector: string, value: string) =>
        tab.locator(selector).evaluate(fn, { ...probe.options, value });

      const negative = await read('#speed', '-5');
      expect(negative.appeared).toContain('Speed cannot be negative');
      const below = await read('#count', '0');
      expect(below.validity).toContain('rangeUnderflow');
      const letters = await read('#count', 'abc');
      expect(letters.rewritten).toBe(true);
      const free = await read('#notes', 'anything at all');
      expect(free.validity).toEqual([]);
      expect(free.appeared).toEqual([]);
      // The browser checks length only on typing; the probe applies the attributes itself.
      // Live-observed: demoqa's phone field (minlength 10) passed five scripted digits as valid.
      const short = await read('#phone', '12345');
      expect(short.validity).toContain('tooShort');
      const long = await read('#phone', '123456789012');
      expect(long.byAttribute).toEqual(['maxlength=10']);
      profile(dir, 'safe-interactions', 'sandbox-demo');
      writeJson(dir, 'reading.json', short);
      expect(
        run(dir, 'field-probe.mjs', [
          'record',
          '--route=r1',
          '--control=c9',
          '--value=12345',
          '--via=blur',
          '--observation=reading.json',
        ]).output,
      ).toMatchObject({ verdict: 'rejected', message: expect.stringContaining('minlength=10') });
      writeJson(dir, 'reading.json', long);
      expect(
        run(dir, 'field-probe.mjs', [
          'record',
          '--route=r1',
          '--control=c9',
          '--value=123456789012',
          '--via=blur',
          '--observation=reading.json',
        ]).output.verdict,
      ).toBe('rewritten');

      // Every field is back as it was, and what it held was never handed over.
      expect(await tab.locator('#speed').inputValue()).toBe('42');
      expect(await tab.locator('#count').inputValue()).toBe('7');
      expect(await tab.locator('#notes').inputValue()).toBe('my own note');
      expect(JSON.stringify([negative, below, letters, free])).not.toContain('my own note');

      profile(dir, 'safe-interactions', 'sandbox-demo');
      writeJson(dir, 'reading.json', negative);
      const recorded = run(dir, 'field-probe.mjs', [
        'record',
        '--route=r1',
        '--control=c1',
        '--value=-5',
        '--via=blur',
        '--observation=reading.json',
      ]);
      expect(recorded.output).toMatchObject({
        verdict: 'rejected',
        message: 'Speed cannot be negative',
      });
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
