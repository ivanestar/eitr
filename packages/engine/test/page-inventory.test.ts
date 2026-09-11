import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { renderPageInventory } from '../src/plan/templates/page-inventory.js';

type Control = Record<string, unknown> & { landmark: number; role: string; name: string };

// What the probe returns for a page shaped like the live GUID generator: the site frame (header
// with navigation, a theme toggle and a language switcher; a footer) around a form of seven fields.
function guidObservation(): {
  title: string;
  path: string;
  landmarks: unknown[];
  controls: Control[];
  totalControls: number;
} {
  const controls: Control[] = [
    { landmark: 0, role: 'link', name: 'Home', tag: 'a', href: '/' },
    { landmark: 0, role: 'link', name: 'Tools', tag: 'a', href: '/tools' },
    { landmark: 0, role: 'button', name: 'Toggle theme', tag: 'button' },
    {
      landmark: 0,
      role: 'combobox',
      name: 'Language',
      tag: 'select',
      options: ['English', 'Russian'],
      optionCount: 2,
    },
    {
      landmark: 1,
      role: 'spinbutton',
      name: 'How many GUIDs do you want (1-1000):',
      tag: 'input',
      type: 'number',
      constraints: { min: '1', max: '1000' },
    },
    ...['Hyphens (-)', 'Braces ({ })', 'Uppercase', 'Quotes (" ")', 'Commas (,)'].map((name) => ({
      landmark: 1,
      role: 'checkbox',
      name,
      tag: 'input',
      type: 'checkbox',
    })),
    { landmark: 1, role: 'textbox', name: '', tag: 'textarea', hint: 'Result' },
    { landmark: 1, role: 'button', name: 'Generate GUIDs', tag: 'button' },
    { landmark: 1, role: 'button', name: 'Copy to Clipboard', tag: 'button', output: true },
    { landmark: 2, role: 'link', name: 'Terms', tag: 'a', href: '/terms' },
  ];
  return {
    title: 'UUID/GUID Generator',
    path: '/tools/guid-generator',
    landmarks: [
      { region: 'header', name: '' },
      { region: 'main', name: '' },
      { region: 'footer', name: '' },
    ],
    controls,
    totalControls: controls.length,
  };
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-page-inventory-'));
  writeFileSync(join(dir, 'page-inventory.mjs'), renderPageInventory(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  return dir;
}

function run(dir: string, args: string[]) {
  const result = spawnSync('node', ['page-inventory.mjs', ...args], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, output: JSON.parse(result.stdout) };
}

let observationCount = 0;

function record(
  dir: string,
  routeId: string,
  observation: unknown,
  route = '/tools/guid-generator',
  extra: string[] = [],
) {
  const file = join(dir, 'observation-' + observationCount++ + '.json');
  writeFileSync(file, JSON.stringify(observation), 'utf8');
  return run(dir, [
    'record',
    '--route=' + route,
    '--route-id=' + routeId,
    '--observation=' + file,
    ...extra,
  ]);
}

function classify(dir: string, routeId: string, answers: unknown) {
  const file = join(dir, 'answers-' + observationCount++ + '.json');
  writeFileSync(file, JSON.stringify(answers), 'utf8');
  return run(dir, ['classify', '--route-id=' + routeId, '--answers=' + file]);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('scripts/page-inventory.mjs record', () => {
  it('stores the full inventory and answers with what the route entry needs', () => {
    const dir = setupProject();
    try {
      const { status, output } = record(dir, 'route-guid', guidObservation());
      expect(status).toBe(0);
      expect(output.inventory).toBe('artifacts/site-map/inventory/route-guid.json');
      expect(output.regions).toEqual(['footer', 'header', 'main']);
      expect(output.contentHash).toMatch(/^[a-f0-9]{64}$/);

      const stored = readJson(join(dir, output.inventory));
      expect(stored.routeId).toBe('route-guid');
      expect(stored.controls).toHaveLength(14);
      // The id a later stage cites a field by.
      expect(stored.controls.slice(0, 3).map((c: { id: string }) => c.id)).toEqual([
        'c0',
        'c1',
        'c2',
      ]);
      expect(stored.landmarks.map((l: { fingerprint: string }) => l.fingerprint)).toHaveLength(3);
      expect(stored.contentHash).toBe(output.contentHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Headings are what a later stage quotes as evidence of what a page is for - so they are kept, to
  // check that quote against.
  it('keeps the headings the page shows, redacted like every other text', () => {
    const dir = setupProject();
    try {
      const observation = {
        ...guidObservation(),
        headings: [
          { level: 1, text: 'UUID/GUID Generator' },
          { level: 2, text: 'Order 1234567 shipped' },
          { level: 9, text: 'Odd level' },
          { level: 2, text: '' },
        ],
      };
      const { output } = record(dir, 'route-guid', observation);
      expect(readJson(join(dir, output.inventory)).headings).toEqual([
        { level: 1, text: 'UUID/GUID Generator' },
        { level: 2, text: 'Order [REDACTED] shipped' },
        { level: 2, text: 'Odd level' },
      ]);
      // An observation from before headings were collected records none rather than failing.
      const { output: older } = record(dir, 'route-old', guidObservation(), '/old');
      expect(readJson(join(dir, older.inventory)).headings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The live failure this replaces: `components` held tag names, and the next stage saw two
  // parameters on a page with seven while taking the header's language switcher for a field.
  it("lists the page's own fields and buttons as components and leaves the frame and links out", () => {
    const dir = setupProject();
    try {
      const { output } = record(dir, 'route-guid', guidObservation());
      expect(output.components).toEqual([
        'spinbutton "How many GUIDs do you want (1-1000):"',
        'checkbox "Hyphens (-)"',
        'checkbox "Braces ({ })"',
        'checkbox "Uppercase"',
        'checkbox "Quotes (" ")"',
        'checkbox "Commas (,)"',
        'textbox (no accessible name, next to "Result")',
        'button "Generate GUIDs"',
        'button "Copy to Clipboard"',
      ]);
      expect(output.components.some((c: string) => c.includes('Language'))).toBe(false);
      expect(output.counts).toMatchObject({ fields: 8, outputs: 1, unnamedFields: 1, links: 3 });
      expect(output.warnings.some((w: string) => w.includes('no accessible name'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts digit- and email-shaped text the page handed over', () => {
    const dir = setupProject();
    try {
      const observation = guidObservation();
      observation.controls[3].options = ['English', 'Account 123456789', 'ann@example.com'];
      const { output } = record(dir, 'route-guid', observation);
      const stored = JSON.stringify(readJson(join(dir, output.inventory)));
      expect(stored).not.toContain('123456789');
      expect(stored).not.toContain('ann@example.com');
      expect(stored).toContain('[REDACTED]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A limit the markup declares is what the test conditions check their boundaries against: masked,
  // max="1000000" is a limit nobody can test. A pattern is text like any other.
  it('records a number or date in a limit exactly as written, and masks a pattern like any text', () => {
    const dir = setupProject();
    try {
      const observation = guidObservation();
      observation.controls[4].constraints = {
        min: '100000',
        max: '1000000',
        step: '0.5',
        maxlength: '1000000',
        pattern: 'ACC-1234567',
      };
      observation.controls.push({
        landmark: 1,
        role: 'textbox',
        name: 'Start date',
        tag: 'input',
        type: 'date',
        constraints: { min: '2024-01-01', max: '2026-12-31T23:59' },
      });
      const { output } = record(dir, 'route-guid', observation);
      const controls = readJson(join(dir, output.inventory)).controls;
      expect(controls[4].constraints).toEqual({
        min: '100000',
        max: '1000000',
        step: '0.5',
        maxlength: '1000000',
        pattern: 'ACC-[REDACTED]',
      });
      expect(controls.find((c: { name: string }) => c.name === 'Start date').constraints).toEqual({
        min: '2024-01-01',
        max: '2026-12-31T23:59',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The crawl budget stops a template after three pages that hash alike - how a pagination chain is
  // caught. Page two of a listing names different items than page one, so names must stay out.
  it('hashes structure only: renamed items and changed digits keep the hash, a new control changes it', () => {
    const dir = setupProject();
    try {
      const pageOne = guidObservation();
      pageOne.title = 'Products - page 1';
      const pageTwo = guidObservation();
      pageTwo.title = 'Products - page 2';
      pageTwo.controls = pageTwo.controls.map((c) =>
        c.role === 'link' ? { ...c, name: c.name + ' next' } : c,
      );
      const withExtra = guidObservation();
      withExtra.title = 'Products - page 1';
      withExtra.controls.push({
        landmark: 1,
        role: 'radio',
        name: 'Extra',
        tag: 'input',
        type: 'radio',
      });

      const one = record(dir, 'route-a', pageOne).output.contentHash;
      const two = record(dir, 'route-b', pageTwo).output.contentHash;
      const extra = record(dir, 'route-c', withExtra).output.contentHash;
      expect(two).toBe(one);
      expect(extra).not.toBe(one);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a malformed route id and an observation that is not a probe result', () => {
    const dir = setupProject();
    try {
      expect(record(dir, '../escape', guidObservation()).status).toBe(1);
      const bad = record(dir, 'route-guid', { title: 'x' });
      expect(bad.status).toBe(1);
      expect(bad.output.error).toContain('not the probe result');
      expect(existsSync(join(dir, 'artifacts', 'site-map', 'inventory', 'route-guid.json'))).toBe(
        false,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Whether the page is the application at all. Every verdict rests on something the server or the
// page states - a header, a status on a near-empty page, the same page at two addresses - and none
// on words, since the block pages met live were in English, Russian and Spanish.
describe('scripts/page-inventory.mjs record: is this the application?', () => {
  const blockPage = {
    title: 'Just a moment...',
    path: '/',
    landmarks: [],
    controls: [{ landmark: -1, role: 'link', name: 'Privacy', tag: 'a', href: 'external:x.test' }],
    totalControls: 1,
    textLength: 180,
  };

  it('names a bot check by its header and a refusal by its status on a near-empty page', () => {
    const dir = setupProject();
    try {
      const challenged = record(dir, 'r1', blockPage, '/', ['--mitigated=challenge']);
      expect(challenged.output.access.state).toBe('challenge');
      const refused = record(dir, 'r2', blockPage, '/login', ['--status=403']);
      expect(refused.output.access).toMatchObject({ state: 'refused', status: 403 });
      expect(refused.output.warnings[0]).toContain('refusal or block page');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live: Stack Overflow answered 403 with a Cloudflare challenge, which the browser passed on its
  // own and reloaded into the real page; Rakuten answered 503 and served its search results.
  it('keeps a page with real content even when its status or header said refusal', () => {
    const dir = setupProject();
    try {
      const refused = record(dir, 'r1', guidObservation(), '/questions', ['--status=403']);
      expect(refused.output.access.state).toBe('ok');
      const challenged = record(dir, 'r2', { ...guidObservation(), title: 'Questions' }, '/q', [
        '--status=403',
        '--mitigated=challenge',
      ]);
      expect(challenged.output.access.state).toBe('ok');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live: a portal served its "Ошибка" page with 200 at the first address and 403 at the next.
  it('reports a refusal page repeated at a second address as a copy, carrying the refusal status', () => {
    const dir = setupProject();
    try {
      const errorPage = { ...blockPage, title: 'Ошибка', textLength: 240 };
      expect(record(dir, 'r1', errorPage, '/', ['--status=200']).output.access.state).toBe('ok');
      expect(record(dir, 'r2', errorPage, '/help', ['--status=403']).output.access).toMatchObject({
        state: 'stub',
        sameAs: '/',
        status: 403,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recognises one page served at two addresses, but not a route re-recorded under its own id', () => {
    const dir = setupProject();
    try {
      const picker = {
        title: 'Select your Country',
        path: '/',
        landmarks: [],
        controls: ['English', 'Francais', 'Espanol'].map((name) => ({
          landmark: -1,
          role: 'button',
          name,
          tag: 'button',
        })),
        totalControls: 3,
        textLength: 420,
      };
      expect(record(dir, 'r1', picker, '/').output.access.state).toBe('ok');
      expect(record(dir, 'r1', picker, '/').output.access.state).toBe('ok');
      expect(record(dir, 'r2', picker, '/search').output.access).toMatchObject({
        state: 'stub',
        sameAs: '/',
      });
      // Same shape, different text: a different page, not a copy.
      expect(record(dir, 'r3', { ...picker, textLength: 900 }, '/other').output.access.state).toBe(
        'ok',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Live: calculator.net draws all 51 calculator keys as spans with a pointer cursor, so the page
// looked as if there was nothing to press. The probe finds such elements; a reader says what they
// are; the script checks every answer against what it asked.
describe('scripts/page-inventory.mjs classify', () => {
  function calculator(lang = 'en') {
    return {
      ...guidObservation(),
      lang,
      candidates: [
        { tag: 'span', text: '7', label: '', classHint: 'scinm', signals: 'pointer', landmark: 1 },
        { tag: 'span', text: '8', label: '', classHint: 'scinm', signals: 'pointer', landmark: 1 },
        {
          tag: 'span',
          text: 'sin',
          label: '',
          classHint: 'scifunc',
          signals: 'pointer',
          landmark: 1,
        },
        {
          tag: 'div',
          text: 'Popular calculators',
          label: '',
          classHint: 'heading',
          signals: 'pointer',
          landmark: 1,
        },
      ],
      candidateTotal: 4,
    };
  }

  it('asks once per distinct element and shows the copies it stands for', () => {
    const dir = setupProject();
    try {
      const { output } = record(dir, 'r1', calculator());
      expect(
        output.classify.items.map((i: { id: string; text: string; count: number }) => [
          i.id,
          i.text,
          i.count,
        ]),
      ).toEqual([
        ['k1', '7', 2],
        ['k2', 'sin', 1],
        ['k3', 'Popular calculators', 1],
      ]);
      expect(output.classify.items[0].examples).toEqual(['7', '8']);
      expect(output.classify.command).toContain('classify --route-id=r1');
      expect(output.warnings.some((w: string) => w.includes('need an answer'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a reply that skips an item, adds one, or names a role outside the list - and changes nothing', () => {
    const dir = setupProject();
    try {
      const { output } = record(dir, 'r1', calculator());
      const stored = () => readJson(join(dir, output.inventory));
      const before = stored().controls.length;

      const partial = classify(dir, 'r1', { k1: 'button', k2: 'button' });
      expect(partial.status).toBe(1);
      expect(partial.output.errors.join(' ')).toContain('k3 has no answer');

      const invented = classify(dir, 'r1', {
        k1: 'button',
        k2: 'button',
        k3: 'none',
        k9: 'button',
      });
      expect(invented.output.errors.join(' ')).toContain('"k9" was not asked about');

      const wrongRole = classify(dir, 'r1', { k1: 'textbox', k2: 'button', k3: 'none' });
      expect(wrongRole.output.errors.join(' ')).toContain('"textbox" is not one of');

      expect(stored().controls).toHaveLength(before);
      expect(stored().pendingClassification.items).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds each copy as a control named by the element's own text, and applies the answer on the next route", () => {
    const dir = setupProject();
    try {
      const { output } = record(dir, 'r1', calculator());
      const answered = classify(dir, 'r1', { k1: 'button', k2: 'button', k3: 'none' });
      expect(answered.status).toBe(0);
      expect(answered.output.added).toBe(3);
      expect(answered.output.components).toContain('button "7" [no role in markup]');
      expect(answered.output.components).toContain('button "sin" [no role in markup]');
      expect(answered.output.components.join(' ')).not.toContain('Popular calculators');

      const stored = readJson(join(dir, output.inventory));
      const added = stored.controls.filter((c: { classifiedBy?: string }) => c.classifiedBy);
      expect(added.map((c: { id: string; name: string }) => [c.id, c.name])).toEqual([
        ['c14', '7'],
        ['c15', '8'],
        ['c16', 'sin'],
      ]);
      expect(stored.pendingClassification).toBeUndefined();
      expect(stored.assistantDecisions).toHaveLength(3);

      const next = record(dir, 'r2', calculator(), '/tools/scientific');
      expect(next.output.classify).toBeNull();
      expect(next.output.components).toContain('button "7" [no role in markup]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks whether a button labelled in another language hands the result somewhere', () => {
    const dir = setupProject();
    try {
      const observation = { ...guidObservation(), lang: 'ru' };
      observation.controls = observation.controls.map((c) => {
        if (c.name === 'Copy to Clipboard') return { ...c, name: 'Скопировать', output: false };
        if (c.name === 'Generate GUIDs') return { ...c, name: 'Сгенерировать' };
        return c;
      });
      const { output } = record(dir, 'r1', observation);
      // The header's theme toggle is the site frame's, not where this page hands anything over.
      const items = output.classify.items.map((i: { id: string; name: string }) => [i.id, i.name]);
      expect(items).toEqual([
        ['o1', 'Сгенерировать'],
        ['o2', 'Скопировать'],
      ]);
      const answered = classify(dir, 'r1', { o1: false, o2: true });
      expect(answered.output.outputsMarked).toBe(1);
      expect(answered.output.counts.outputs).toBe(1);
      const copy = readJson(join(dir, output.inventory)).controls.find(
        (c: { name: string }) => c.name === 'Скопировать',
      );
      expect(copy).toMatchObject({ output: true, outputBy: 'assistant' });

      // An English page is matched by the word list and asks nothing.
      expect(record(dir, 'r2', guidObservation()).output.classify).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/page-inventory.mjs shared', () => {
  function writeSiteMap(dir: string, routes: Record<string, { routeId: string; status: string }>) {
    const entries: Record<string, unknown> = {};
    for (const [path, route] of Object.entries(routes)) {
      entries[path] = {
        ...route,
        sampleUrls: ['http://localhost' + path],
        discoveredAt: '2026-09-10T10:00:00.000Z',
        lastCheckedAt: '2026-09-10T10:00:00.000Z',
        contentHash: 'h',
      };
    }
    writeFileSync(
      join(dir, 'artifacts', 'site-map', 'site-map.json'),
      JSON.stringify({
        schemaVersion: 2,
        generatedAt: '2026-09-10T10:00:00.000Z',
        baseUrl: 'http://localhost/',
        routes: entries,
      }),
      'utf8',
    );
  }

  // Same frame on every page, a different form underneath, and one page with a labelled navigation.
  function pageWith(mainName: string, extraNav = false) {
    const observation = guidObservation();
    observation.controls = observation.controls.map((c) =>
      c.landmark === 1 && c.role === 'button' && c.name === 'Generate GUIDs'
        ? { ...c, name: mainName }
        : c,
    );
    if (extraNav) {
      observation.landmarks.push({ region: 'nav', name: 'Main navigation' });
      observation.controls.push({
        landmark: 3,
        role: 'link',
        name: 'Docs',
        tag: 'a',
        href: '/docs',
      });
    }
    return observation;
  }

  it('names every frame region found on two or more active routes and records its controls', () => {
    const dir = setupProject();
    try {
      record(dir, 'r1', pageWith('Generate GUIDs', true), '/a');
      record(dir, 'r2', pageWith('Convert', true), '/b');
      record(dir, 'r3', pageWith('Count'), '/c');
      record(dir, 'r4', pageWith('Gone'), '/gone');
      writeSiteMap(dir, {
        '/a': { routeId: 'r1', status: 'active' },
        '/b': { routeId: 'r2', status: 'active' },
        '/c': { routeId: 'r3', status: 'active' },
        '/gone': { routeId: 'r4', status: 'removed' },
        '/never-visited': { routeId: 'r5', status: 'active' },
      });
      const { status, output } = run(dir, ['shared']);
      expect(status).toBe(0);
      expect(output.widgets).toEqual([
        { name: 'Header', region: 'header', routeCount: 3, controlCount: 4, foundBy: 'markup' },
        { name: 'Footer', region: 'footer', routeCount: 3, controlCount: 1, foundBy: 'markup' },
        {
          name: 'MainNavigation',
          region: 'nav',
          routeCount: 2,
          controlCount: 1,
          foundBy: 'markup',
        },
      ]);
      expect(output.warnings.some((w: string) => w.includes('/never-visited'))).toBe(true);

      const siteMap = readJson(join(dir, 'artifacts', 'site-map', 'site-map.json'));
      expect(siteMap.sharedWidgets).toEqual(['Footer', 'Header', 'MainNavigation']);
      expect(siteMap.baseUrl).toBe('http://localhost/');

      const shared = readJson(join(dir, 'artifacts', 'site-map', 'inventory', 'shared.json'));
      const header = shared.widgets.find((w: { name: string }) => w.name === 'Header');
      expect(header.routes).toEqual(['/a', '/b', '/c']);
      expect(header.controls.map((c: { name: string }) => c.name)).toContain('Language');
      expect(header.routeIds).not.toContain('r4');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes sharedWidgets when nothing recurs, rather than leaving a stale list', () => {
    const dir = setupProject();
    try {
      record(dir, 'r1', pageWith('Generate GUIDs'), '/a');
      writeSiteMap(dir, { '/a': { routeId: 'r1', status: 'active' } });
      const siteMapPath = join(dir, 'artifacts', 'site-map', 'site-map.json');
      writeFileSync(
        siteMapPath,
        JSON.stringify({ ...readJson(siteMapPath), sharedWidgets: ['Old'] }),
        'utf8',
      );
      const { output } = run(dir, ['shared']);
      expect(output.widgets).toEqual([]);
      expect('sharedWidgets' in readJson(siteMapPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live: 19 of 39 reachable sites mark up no header, navigation or footer at all, so no frame was
  // found and every page would have carried its own copy of the site menu into testing.
  function unmarkedPage(main: string, footer = ['Terms', 'Privacy']) {
    return {
      title: 'Tool ' + main,
      path: '/',
      lang: 'en',
      landmarks: [],
      controls: [
        { landmark: -1, role: 'link', name: 'Home', tag: 'a', href: '/', block: 0 },
        { landmark: -1, role: 'link', name: 'Tools', tag: 'a', href: '/tools', block: 0 },
        { landmark: -1, role: 'button', name: 'Search', tag: 'button', block: 0 },
        { landmark: -1, role: 'button', name: main, tag: 'button', block: 1 },
        {
          landmark: -1,
          role: 'textbox',
          name: 'Input ' + main,
          tag: 'input',
          type: 'text',
          block: 1,
        },
        ...footer.map((name) => ({ landmark: -1, role: 'link', name, tag: 'a', block: 2 })),
      ],
      totalControls: 5 + footer.length,
      blocks: [
        { top: 0, height: 80, left: 0, width: 1280 },
        { top: 80, height: 900, left: 0, width: 1280 },
        { top: 980, height: 120, left: 0, width: 1280 },
      ],
      viewport: { width: 1280, height: 800 },
      textLength: 3000,
    };
  }

  it('finds a header and footer nobody marked up, by their repetition, and moves them into the frame', () => {
    const dir = setupProject();
    try {
      record(dir, 'r1', unmarkedPage('Alpha'), '/a');
      record(dir, 'r2', unmarkedPage('Beta'), '/b');
      record(dir, 'r3', unmarkedPage('Gamma'), '/c');
      writeSiteMap(dir, {
        '/a': { routeId: 'r1', status: 'active' },
        '/b': { routeId: 'r2', status: 'active' },
        '/c': { routeId: 'r3', status: 'active' },
      });
      const { output } = run(dir, ['shared']);
      expect(output.widgets).toEqual([
        { name: 'Header', region: 'header', routeCount: 3, controlCount: 3, foundBy: 'repetition' },
        { name: 'Footer', region: 'footer', routeCount: 3, controlCount: 2, foundBy: 'repetition' },
      ]);

      const stored = readJson(join(dir, 'artifacts', 'site-map', 'inventory', 'r1.json'));
      const search = stored.controls.find((c: { name: string }) => c.name === 'Search');
      expect(search).toMatchObject({ region: 'header', frameBy: 'repetition' });
      const siteMap = readJson(join(dir, 'artifacts', 'site-map', 'site-map.json'));
      expect(siteMap.routes['/a'].components).toEqual(['button "Alpha"', 'textbox "Input Alpha"']);

      // Running it again decides the same thing rather than drifting.
      expect(run(dir, ['shared']).output.widgets).toEqual(output.widgets);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live: MDN's header held 119 controls on one page and 122 on the next (breadcrumbs), and an
  // exact comparison never recognised it as one header.
  it('recognises one header whose content differs slightly from page to page', () => {
    const dir = setupProject();
    try {
      const withCrumb = (main: string, crumb: string) => {
        const observation = pageWith(main);
        observation.controls.splice(2, 0, {
          landmark: 0,
          role: 'link',
          name: crumb,
          tag: 'a',
          href: '/' + crumb,
        });
        return observation;
      };
      // Four header controls shared, one breadcrumb each: 4 of 6 in common is below the line,
      // so give the header enough shared links for one crumb to be a small difference.
      const richer = (main: string, crumb: string) => {
        const observation = withCrumb(main, crumb);
        for (const name of ['Docs', 'Blog', 'Pricing', 'About', 'Careers', 'Status']) {
          observation.controls.unshift({ landmark: 0, role: 'link', name, tag: 'a', href: '/x' });
        }
        return observation;
      };
      record(dir, 'r1', richer('Alpha', 'Converters'), '/a');
      record(dir, 'r2', richer('Beta', 'Generators'), '/b');
      writeSiteMap(dir, {
        '/a': { routeId: 'r1', status: 'active' },
        '/b': { routeId: 'r2', status: 'active' },
      });
      const header = run(dir, ['shared']).output.widgets.find(
        (w: { name: string }) => w.name === 'Header',
      );
      expect(header).toMatchObject({ routeCount: 2, foundBy: 'markup' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live: GOV.UK's consent banner sits above its real <header>, recurs on every page, and was named
  // "Header" beside it.
  it('does not look for a header by repetition on pages that mark one up', () => {
    const dir = setupProject();
    try {
      const banner = (main: string) => {
        const observation = unmarkedPage(main);
        return {
          ...observation,
          landmarks: [{ region: 'header', name: '' }],
          controls: [
            ...observation.controls,
            { landmark: 0, role: 'link', name: 'GOV.UK', tag: 'a', href: '/' },
            { landmark: 0, role: 'button', name: 'Menu', tag: 'button' },
          ],
        };
      };
      record(dir, 'r1', banner('Alpha'), '/a');
      record(dir, 'r2', banner('Beta'), '/b');
      writeSiteMap(dir, {
        '/a': { routeId: 'r1', status: 'active' },
        '/b': { routeId: 'r2', status: 'active' },
      });
      const widgets = run(dir, ['shared']).output.widgets.map(
        (w: { name: string; foundBy: string }) => w.name + ':' + w.foundBy,
      );
      expect(widgets).toContain('Header:markup');
      expect(widgets).toContain('Footer:repetition');
      expect(widgets.some((w: string) => w.startsWith('Header2'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not call a block the frame when it recurs on only a few of many routes', () => {
    const dir = setupProject();
    try {
      const routes: Record<string, { routeId: string; status: string }> = {};
      for (let i = 0; i < 10; i++) {
        // Routes 0 and 1 share a bottom strip; every other route has its own. Letters, not digits:
        // digits never take part in a comparison.
        const own = String.fromCharCode(65 + i);
        const footer = i < 2 ? ['Related', 'More like this'] : ['Only on ' + own, 'Also ' + own];
        record(dir, 'r' + i, unmarkedPage('Page' + i, footer), '/p' + i);
        routes['/p' + i] = { routeId: 'r' + i, status: 'active' };
      }
      writeSiteMap(dir, routes);
      const names = run(dir, ['shared']).output.widgets.map((w: { name: string }) => w.name);
      expect(names).toEqual(['Header']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/page-inventory.mjs prune', () => {
  it('deletes only files no route refers to, and nothing while the site map is unreadable', () => {
    const dir = setupProject();
    try {
      record(dir, 'keep-me', guidObservation(), '/a');
      record(dir, 'stale', { ...guidObservation(), title: 'Another page' }, '/b');
      const inventoryDir = join(dir, 'artifacts', 'site-map', 'inventory');
      writeFileSync(join(inventoryDir, 'shared.json'), '{}', 'utf8');

      const refused = run(dir, ['prune']);
      expect(refused.output).toMatchObject({ ok: false, removed: 0 });
      expect(existsSync(join(inventoryDir, 'stale.json'))).toBe(true);

      writeFileSync(
        join(dir, 'artifacts', 'site-map', 'site-map.json'),
        JSON.stringify({ routes: { '/a': { routeId: 'keep-me', status: 'active' } } }),
        'utf8',
      );
      expect(run(dir, ['prune']).output).toMatchObject({ ok: true, removed: 1, kept: 1 });
      expect(existsSync(join(inventoryDir, 'stale.json'))).toBe(false);
      expect(existsSync(join(inventoryDir, 'keep-me.json'))).toBe(true);
      expect(existsSync(join(inventoryDir, 'shared.json'))).toBe(true);
      // Crawl-wide side files are not routes and survive, minus entries for routes that are gone.
      const identities = readJson(join(inventoryDir, '.identities.json'));
      expect(
        Object.values(identities).map((entry) => (entry as { routeId: string }).routeId),
      ).toEqual(['keep-me']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The browser half runs where Chromium is installed; CI does not install browsers, so there it is
// skipped and the node-side tests above carry the contract.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

describe.skipIf(!browserAvailable)('scripts/page-inventory.mjs probe in a real browser', () => {
  const fixture = `<!doctype html><html><head><title>GUID Generator</title></head><body>
    <header><a href="/">Home</a><nav><a href="/tools">Tools</a></nav>
      <button aria-label="Toggle theme"><svg></svg></button>
      <select aria-label="Language"><option>English</option><option>Russian</option></select></header>
    <main>
      <label for="count">How many GUIDs do you want (1-1000):</label>
      <input id="count" type="number" min="1" max="1000" value="424242424242">
      <label><input type="checkbox" checked> Hyphens (-)</label>
      <label><input type="checkbox"> Braces ({ })</label>
      <label><input type="checkbox"> Uppercase</label>
      <label><input type="checkbox"> Quotes (" ")</label>
      <label><input type="checkbox"> Commas (,)</label>
      <span>Result</span><textarea>ann@example.com</textarea>
      <button>Generate GUIDs</button><button>Copy to Clipboard</button>
      <a href="https://example.org/docs">Docs</a>
    </main>
    <footer><a href="/terms?session=abc">Terms</a></footer>
  </body></html>`;

  it('collects every control with its region, name and constraints, and never a field value', async () => {
    const dir = setupProject();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      // A real origin, so same-origin links resolve to paths the way they do on a crawled site.
      await page.route('http://inventory.test/**', (route) =>
        route.fulfill({ body: fixture, contentType: 'text/html' }),
      );
      await page.goto('http://inventory.test/tools/guid-generator');
      const probe = run(dir, ['probe']).output;
      const observation = await page.evaluate(
        `(${probe.source})(${JSON.stringify(probe.options)})`,
      );
      const { output } = record(dir, 'route-guid', observation);

      expect(output.regions).toEqual(['footer', 'header', 'main']);
      expect(output.counts).toMatchObject({ fields: 8, outputs: 1, unnamedFields: 1 });
      expect(output.components).toContain('spinbutton "How many GUIDs do you want (1-1000):"');
      expect(output.components).toContain('checkbox "Quotes (" ")"');
      expect(output.components).toContain('textbox (no accessible name, next to "Result")');

      const stored = readJson(join(dir, output.inventory));
      const count = stored.controls.find((c: { type?: string }) => c.type === 'number');
      expect(count.constraints).toEqual({ min: '1', max: '1000' });
      const language = stored.controls.find((c: { name: string }) => c.name === 'Language');
      expect(language).toMatchObject({ region: 'header', options: ['English', 'Russian'] });
      const links = stored.controls.filter((c: { role: string }) => c.role === 'link');
      expect(links.map((c: { href: string }) => c.href)).toEqual([
        '/',
        '/tools',
        'external:example.org',
        '/terms',
      ]);

      const text = JSON.stringify(stored);
      expect(text).not.toContain('424242424242');
      expect(text).not.toContain('ann@example.com');
      expect(text).not.toContain('session=abc');
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Everything the 50-site run found the probe blind to, on one page: a control inside a web
  // component, a field inside an embedded frame, a drawing surface, calculator keys drawn as spans,
  // a file link labelled in Russian, a disclosure widget, and a frame with no header markup at all.
  const unmarked = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Calculator</title>
    <style>.key{cursor:pointer;display:inline-block;width:30px;height:30px}</style></head><body>
    <div id="root">
      <div class="top"><a href="/">Home</a> <a href="/tools">Tools</a></div>
      <div class="content">
        <x-toolbar></x-toolbar>
        <span class="key">7</span><span class="key">8</span><span class="key">sin</span>
        <a href="/files/report.pdf">Отчёт</a>
        <details><summary>More options</summary><p>Advanced</p></details>
        <iframe title="inner" width="300" height="120" srcdoc="<input aria-label='Inner field'>"></iframe>
        <canvas width="300" height="300"></canvas>
      </div>
      <div class="bottom"><a href="/terms">Terms</a> <a href="/privacy">Privacy</a></div>
    </div>
    <script>
      customElements.define('x-toolbar', class extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<button>Shadow action</button>'; }
      });
    </script>
  </body></html>`;

  it('reads inside web components and same-origin frames, and lists what it cannot read', async () => {
    const dir = setupProject();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.route('http://inventory.test/**', (route) =>
        route.fulfill({ body: unmarked, contentType: 'text/html' }),
      );
      await page.goto('http://inventory.test/calculator');
      const probe = run(dir, ['probe']).output;
      const observation = await page.evaluate(
        `(${probe.source})(${JSON.stringify(probe.options)})`,
      );
      const { output } = record(dir, 'route-calc', observation, '/calculator', ['--status=200']);
      const stored = readJson(join(dir, output.inventory));
      const byName = (name: string) =>
        stored.controls.find((c: { name: string }) => c.name === name);

      expect(output.access.state).toBe('ok');
      expect(byName('Shadow action')).toMatchObject({ role: 'button', inShadow: true });
      expect(byName('Inner field')).toMatchObject({ role: 'textbox', frame: 0 });
      expect(stored.frames).toHaveLength(1);
      expect(stored.frames[0]).toMatchObject({
        index: 0,
        host: '',
        title: 'inner',
        readable: true,
      });
      expect(stored.frames[0].width).toBeGreaterThanOrEqual(300);
      expect(stored.canvases).toHaveLength(1);
      expect(output.warnings.some((w: string) => w.includes('drawing surface'))).toBe(true);
      expect(byName('More options')).toMatchObject({ role: 'summary', tag: 'summary' });
      expect(byName('Отчёт')).toMatchObject({ role: 'link', output: true });

      expect(
        output.classify.items.map((i: { text: string; count: number }) => [i.text, i.count]),
      ).toEqual([
        ['7', 2],
        ['sin', 1],
      ]);
      expect(stored.blocks.map((b: { position: string }) => b.position)).toEqual([
        'top',
        'middle',
        'bottom',
      ]);
      expect(byName('Home').block).toBe(0);
      expect(byName('Terms').block).toBe(2);
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
