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
) {
  const file = join(dir, 'observation-' + observationCount++ + '.json');
  writeFileSync(file, JSON.stringify(observation), 'utf8');
  return run(dir, ['record', '--route=' + route, '--route-id=' + routeId, '--observation=' + file]);
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
        { name: 'Header', region: 'header', routeCount: 3, controlCount: 4 },
        { name: 'Footer', region: 'footer', routeCount: 3, controlCount: 1 },
        { name: 'MainNavigation', region: 'nav', routeCount: 2, controlCount: 1 },
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
});

describe('scripts/page-inventory.mjs prune', () => {
  it('deletes only files no route refers to, and nothing while the site map is unreadable', () => {
    const dir = setupProject();
    try {
      record(dir, 'keep-me', guidObservation(), '/a');
      record(dir, 'stale', guidObservation(), '/b');
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
});
