// A dataset on disk: a generated project (the same one a person gets), the dataset's application
// served on its own port, and every artifact the stage before /define-test-conditions leaves behind
// - site map, inventories recorded by the project's own page-inventory script, screenshots, a
// reviewed feature map, the app profile - so the stage under evaluation starts exactly where it
// would in a real run, and nothing upstream varies between trials.
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Browser } from '@playwright/test';
import { plan } from '../../../engine/src/plan/plan.js';
import { apply } from '../../../engine/src/apply/apply.js';
import { baselineStackProfile } from '../../../engine/src/detect/baseline.js';
import type { DatasetSpec } from './model.js';
import type { GoldApp } from './gold.js';
import { buildApp } from './apps.js';

export const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

export interface RouteRecord {
  path: string;
  routeId: string;
  title: string;
  // data-testid -> inventory control id.
  controlOf: Record<string, string>;
  contentHash: string;
  inventory: string;
  inFeature: boolean;
}

export interface PreparedDataset {
  spec: DatasetSpec;
  gold: GoldApp;
  dir: string;
  port: number;
  featureId: string;
  routes: RouteRecord[];
  files: Record<string, string>;
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function uuidOf(text: string): string {
  const h = hash(text);
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-' +
    h.slice(12, 16) +
    '-' +
    h.slice(16, 20) +
    '-' +
    h.slice(20, 32)
  );
}

export function serve(files: Record<string, string>, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const body = files[url] ?? files[url.replace(/\/$/, '')];
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': url.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8',
    });
    res.end(body);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

function node(
  dir: string,
  args: string[],
): { status: number | null; out: any; stdout: string; stderr: string } {
  const r = spawnSync('node', args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let out: any = null;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = null;
  }
  return { status: r.status, out, stdout: r.stdout, stderr: r.stderr };
}

export function writeJson(file: string, data: unknown) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// The generated project once, shared by every dataset: generating it is the slow part and is the
// same for all of them.
let templateDir: string | null = null;
export async function projectTemplate(cacheRoot: string): Promise<string> {
  if (templateDir && existsSync(templateDir)) return templateDir;
  const dir = join(cacheRoot, '_template');
  if (!existsSync(join(dir, 'scripts', 'validate-test-conditions.mjs'))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const generated = plan(baselineStackProfile(dir), {
      baseUrl: 'http://127.0.0.1:41000',
      projectName: 'tester-tools-tests',
      aiAssistants: ['antigravity', 'claude'],
      ciCd: 'none',
      docker: false,
    });
    await apply(generated, dir);
  }
  templateDir = dir;
  return dir;
}

export async function prepareDataset(
  spec: DatasetSpec,
  index: number,
  cacheRoot: string,
  browser: Browser,
  opts: { reuse?: boolean } = {},
): Promise<PreparedDataset> {
  const port = 41001 + index;
  const baseUrl = 'http://127.0.0.1:' + port;
  const { gold, files } = buildApp(spec);
  const dir = join(cacheRoot, spec.id);
  // A dataset built by this same version is reused: building it is a browser run per page.
  const stamp = join(dir, 'dataset', 'built.json');
  const fingerprint = hash(JSON.stringify({ files, gold }));
  if (opts.reuse !== false && existsSync(stamp)) {
    const built = JSON.parse(readFileSync(stamp, 'utf8'));
    if (built.fingerprint === fingerprint) {
      const routesFile = JSON.parse(readFileSync(join(dir, 'dataset', 'routes.json'), 'utf8'));
      return {
        spec,
        gold,
        dir,
        port: routesFile.port,
        featureId: routesFile.featureId,
        routes: routesFile.routes,
        files,
      };
    }
  }
  rmSync(dir, { recursive: true, force: true });
  cpSync(await projectTemplate(cacheRoot), dir, { recursive: true });
  // The project's scripts import Playwright from node_modules; one install serves every dataset.
  if (!existsSync(join(dir, 'node_modules')))
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  writeJson(join(dir, 'dataset', 'app.json'), files);

  const featureId = hash(spec.id + '|feature').slice(0, 16);
  const featurePaths = new Set(gold.pages.map((p) => p.path));
  const server = await serve(files, port);
  const routes: RouteRecord[] = [];
  const now = new Date().toISOString();
  const siteRoutes: Record<string, unknown> = {};
  try {
    const probe = node(dir, ['scripts/page-inventory.mjs', 'probe']).out;
    if (!probe || typeof probe.source !== 'string')
      throw new Error('page-inventory probe returned no source');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    // A page whose own script throws is a broken dataset, not a hard case.
    const scriptErrors: string[] = [];
    page.on('pageerror', (e) => scriptErrors.push(e.message));
    const paths = ['/'].concat(gold.pages.map((p) => p.path));
    for (const path of paths) {
      const routeId = uuidOf(spec.id + '|' + path);
      const response = await page.goto(baseUrl + path, { waitUntil: 'networkidle' });
      const observation = await page.evaluate(
        ({ source, options }) => {
          const fn = new Function('return (' + source + ')')();
          return fn(options);
        },
        { source: probe.source, options: probe.options },
      );
      const obsFile = join(dir, 'dataset', 'observations', routeId + '.json');
      writeJson(obsFile, observation);
      const recorded = node(dir, [
        'scripts/page-inventory.mjs',
        'record',
        '--route=' + path,
        '--route-id=' + routeId,
        '--observation=' + obsFile,
        '--status=' + (response ? response.status() : 200),
      ]);
      if (!recorded.out || !recorded.out.contentHash)
        throw new Error(
          'page-inventory record failed on ' +
            path +
            ': ' +
            recorded.stdout.slice(0, 400) +
            recorded.stderr.slice(0, 400),
        );
      const slug =
        (path === '/' ? 'home' : path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')) +
        '--' +
        routeId;
      const screenshot = 'artifacts/site-map/screenshots/' + slug + '.jpg';
      mkdirSync(join(dir, 'artifacts', 'site-map', 'screenshots'), { recursive: true });
      await page.screenshot({
        path: join(dir, screenshot),
        type: 'jpeg',
        quality: 60,
        fullPage: true,
      });
      const inventory = 'artifacts/site-map/inventory/' + routeId + '.json';
      // A control whose label is not English reaches the crawl as a question rather than as an
      // output; the crawl's model answers it, and so does the fixture - from the gold.
      let inv = JSON.parse(readFileSync(join(dir, inventory), 'utf8'));
      if (
        inv.pendingClassification &&
        Array.isArray(inv.pendingClassification.items) &&
        inv.pendingClassification.items.length > 0
      ) {
        const page = gold.pages.find((p) => p.path === path);
        const outputTestIds = new Set(
          (page ? page.outputs : [])
            .filter((o) => o.testId && (o.kind === 'copy-button' || o.kind === 'download'))
            .map((o) => o.testId as string),
        );
        const byId = new Map((inv.controls || []).map((c: any) => [c.id, c]));
        const answers: Record<string, unknown> = {};
        for (const item of inv.pendingClassification.items) {
          if (item.kind === 'control') {
            answers[item.id] = 'none';
            continue;
          }
          answers[item.id] = (item.members || []).some((id: string) =>
            outputTestIds.has((byId.get(id) as any)?.testId),
          );
        }
        const answerFile = join(dir, 'dataset', 'classify', routeId + '.json');
        writeJson(answerFile, answers);
        const classified = node(dir, [
          'scripts/page-inventory.mjs',
          'classify',
          '--route-id=' + routeId,
          '--answers=' + answerFile,
        ]);
        if (!classified.out || classified.out.ok === false)
          throw new Error(
            'page-inventory classify failed on ' + path + ': ' + classified.stdout.slice(0, 400),
          );
        if (Array.isArray(classified.out.components))
          recorded.out.components = classified.out.components;
        inv = JSON.parse(readFileSync(join(dir, inventory), 'utf8'));
      }
      const controlOf: Record<string, string> = {};
      for (const control of inv.controls || [])
        if (control.testId) controlOf[control.testId] = control.id;
      const title = await page.title();
      routes.push({
        path,
        routeId,
        title,
        controlOf,
        contentHash: recorded.out.contentHash,
        inventory,
        inFeature: featurePaths.has(path),
      });
      siteRoutes[path] = {
        routeId,
        sampleUrls: [baseUrl + path],
        title,
        regions: recorded.out.regions,
        components: recorded.out.components,
        discoveredAt: now,
        lastCheckedAt: now,
        contentHash: recorded.out.contentHash,
        inventory,
        status: 'active',
        httpStatus: 200,
        discoveryMethod: path === '/' ? 'seed' : 'navigation',
        screenshot,
        visualTriage: { state: 'ready', source: 'heuristic', confidence: 'high', flags: [] },
        reviewed: true,
        reviewedBy: 'human',
      };
    }
    await context.close();
    if (scriptErrors.length > 0)
      throw new Error(spec.id + ': the page script throws - ' + scriptErrors.join('; '));
  } finally {
    server.close();
  }
  writeJson(join(dir, 'artifacts', 'site-map', 'site-map.json'), {
    schemaVersion: 2,
    generatedAt: now,
    baseUrl,
    routes: siteRoutes,
    sharedWidgets: [],
  });
  const shared = node(dir, ['scripts/page-inventory.mjs', 'shared']).out;
  if (shared && Array.isArray(shared.widgets)) {
    const siteMap = JSON.parse(
      readFileSync(join(dir, 'artifacts', 'site-map', 'site-map.json'), 'utf8'),
    );
    siteMap.sharedWidgets = shared.widgets;
    writeJson(join(dir, 'artifacts', 'site-map', 'site-map.json'), siteMap);
  }
  if (gold.api) {
    writeJson(join(dir, 'artifacts', 'site-map', 'api-contracts.json'), {
      schemaVersion: 1,
      generatedAt: now,
      contracts: [
        {
          contractId: hash('GET|' + gold.api.path + '|').slice(0, 16),
          method: 'GET',
          pathTemplate: gold.api.path,
          observedFromRouteIds: routes
            .filter((r) => gold.api!.routes.includes(r.path))
            .map((r) => r.routeId),
          responseStatus: 200,
          responseShape: Array.isArray(gold.api.body)
            ? { '[]': '[ [ string, string, number, boolean ] ]' }
            : Object.fromEntries(
                Object.keys(gold.api.body as object).map((k) => [
                  k,
                  typeof (gold.api!.body as Record<string, unknown>)[k],
                ]),
              ),
          observedAt: now,
        },
      ],
    });
  }
  const memberRouteIds = routes.filter((r) => r.inFeature).map((r) => r.routeId);
  const featureMap = {
    schemaVersion: 2,
    generatedAt: now,
    features: {
      [featureId]: {
        featureId,
        name: gold.feature.name,
        memberRouteIds,
        entityIds: [],
        impact: gold.feature.impact,
        impactSourceRouteId: memberRouteIds[0],
        evidence: gold.pages.map((p) => ({ signal: 'heading-text', excerpt: p.title })),
        reviewed: true,
        reviewedBy: 'human',
      },
    },
    entities: {},
    routes: Object.fromEntries(
      routes
        .filter((r) => r.inFeature)
        .map((r) => [
          r.routeId,
          {
            routeId: r.routeId,
            featureId,
            criticality: {
              value: gold.feature.impact,
              confidence: 'high',
              source: 'heading-text',
              reasoning: 'Its result is taken as correct and used as an expected value in tests.',
              evidence: [{ signal: 'heading-text', excerpt: r.title }],
            },
            sourceContentHash: r.contentHash,
            analyzedAt: now,
            reviewed: true,
            reviewedBy: 'human',
          },
        ]),
    ),
    sourceHash: hash(JSON.stringify(memberRouteIds)),
  };
  writeJson(join(dir, 'artifacts', 'analysis', 'feature-map.json'), featureMap);
  const sandbox = gold.appKind === 'sandbox';
  writeJson(join(dir, 'artifacts', 'analysis', 'app-profile.json'), {
    schemaVersion: 1,
    generatedAt: now,
    applicationKind: {
      value: sandbox ? 'sandbox-demo' : 'production',
      source: 'human',
      recordedAt: now,
    },
    corePurpose: {
      candidates: [
        {
          value: gold.purpose,
          reasoning: 'The home page lists small tools for preparing tests.',
          evidence: [{ signal: 'heading-text', excerpt: gold.appName }],
        },
      ],
      mostLikelyIndex: 0,
      selected: { value: gold.purpose, source: 'human', recordedAt: now },
      reviewed: true,
      reviewedBy: 'human',
    },
    crawlBoundary: { value: sandbox ? 'full' : 'read-only', source: 'human', recordedAt: now },
    apiStyle: { value: gold.api ? 'rest' : 'none-observable', source: 'human', recordedAt: now },
    domainNotes: gold.notes.map((n) => ({
      note: n.note,
      statedDuring: 'feature-map review',
      recordedAt: now,
      about: { review: 'feature-map', type: 'feature', id: featureId },
    })),
  });
  if (gold.research) {
    for (const slug of gold.research.slugs) {
      writeJson(join(dir, 'artifacts', 'analysis', 'research', slug + '.json'), {
        schemaVersion: 1,
        archetype: gold.research.archetype,
        recordedAt: now,
        queries: [
          'how to test a ' + gold.research.archetype,
          gold.research.archetype + ' common defects',
          gold.research.archetype + ' boundary values',
        ],
        sources: gold.research.sources,
        checks: gold.research.checks.map((c) => ({
          id: c.id,
          statement: c.statement,
          sourceIds: c.sourceIds,
        })),
      });
    }
  }
  writeJson(join(dir, 'dataset', 'gold.json'), gold);
  writeJson(join(dir, 'dataset', 'routes.json'), { port, featureId, routes });
  writeJson(stamp, { fingerprint, builtAt: now });
  return { spec, gold, dir, port, featureId, routes, files };
}

// A trial's own copy of a prepared dataset, so trials never share state - and without the answer
// key, without any analysis a previous run left, and without the review that would tell the
// assistant what an earlier one decided.
const WITHHELD = [
  'node_modules',
  'dataset',
  join('artifacts', 'analysis', 'test-conditions.json'),
  join('artifacts', 'review'),
  join('artifacts', 'test-cases'),
  'decisions.json',
  'agent-run.json',
];

export function trialCopy(prepared: PreparedDataset, trialRoot: string): string {
  rmSync(trialRoot, { recursive: true, force: true });
  cpSync(prepared.dir, trialRoot, {
    recursive: true,
    filter: (from) => {
      const relative = from.slice(prepared.dir.length + 1);
      return !WITHHELD.some((held) => relative === held || relative.startsWith(held + sep));
    },
  });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(trialRoot, 'node_modules'), 'junction');
  spawnSync('git', ['init', '-q'], { cwd: trialRoot });
  return trialRoot;
}
