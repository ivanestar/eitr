// Template for generating scripts/orchestrate-swarm.mjs in scaffolded projects. create-if-absent.
// Zero-dependency, deterministic replacement for natural-language "dispatch N parallel workers"
// instructions in sdet-orchestrator and the /scan-and-generate-pom, /bulk-rescan, and /map-site
// operational skills. Computes a machine-readable work plan from artifacts/site-map/site-map.json
// instead of relying on an AI agent to reason through route enumeration, worker counting, and
// concurrency limits under context pressure - exactly the failure mode (skipped routes, no
// parallelization, token exhaustion) this replaces. Host-environment script (see the Host
// Environment Runtime Note in Track 9 of the SDD remediation spec): Node.js is available to every
// modern AI coding assistant regardless of the generated project's own language.

export function renderSwarmDispatcher(): string {
  return `#!/usr/bin/env node

/**
 * Deterministic Swarm Dispatch Planner
 * Computes route-dispatch plans and result barriers for AI coding assistants operating on this
 * project - a deterministic replacement for LLM-reasoned "dispatch N parallel workers" decisions.
 *
 * Usage:
 *   node scripts/orchestrate-swarm.mjs --phase=plan [--routes=<a,b,c>] [--routes-file=<path>]
 *   node scripts/orchestrate-swarm.mjs --phase=verify --targets=<a,b,c>
 *   node scripts/orchestrate-swarm.mjs --phase=verify-worker --target=<path>
 *   node scripts/orchestrate-swarm.mjs --phase=reindex
 *
 * --phase=plan reads artifacts/site-map/site-map.json and outputs a 4-tier DAG: Level 0 (base
 * primitives, always empty - pre-existing seed content), Level 1 (shared widgets, from the site
 * map's own sharedWidgets list), Level 2 (pages - one worker per active route, optionally scoped
 * via --routes/--routes-file), Level 3 (journeys - one worker per drafted journey in
 * artifacts/test-cases/test-cases.json that is not yet automated, i.e. reviewed !== true, scoped by
 * the same route filter; empty until /design-test-cases has run). Workers carry routeId/path/sampleUrl/slug only - never a full target file path, since
 * the Page Object naming convention (*.page.ts vs *_page.py vs *Page.java/.cs) is per-language and
 * already lives in this project's own AI rules; the calling agent already knows the language.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const JOURNEYS_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function fail(message) {
  process.stderr.write('[orchestrate-swarm] ' + message + '\\n');
  process.exit(1);
}

function toSlug(routePath) {
  const cleaned = routePath.replace(/[{}]/g, '').replace(/^\\/+|\\/+$/g, '');
  const slug = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'root';
}

function loadSiteMap() {
  if (!fs.existsSync(SITE_MAP_PATH)) {
    fail(path.relative(CWD, SITE_MAP_PATH) + ' not found. Run /map-site first.');
  }
  let raw;
  try {
    raw = fs.readFileSync(SITE_MAP_PATH, 'utf8');
  } catch (err) {
    fail('failed to read ' + path.relative(CWD, SITE_MAP_PATH) + ': ' + err.message);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(path.relative(CWD, SITE_MAP_PATH) + ' is not valid JSON: ' + err.message);
  }
}

function resolveRouteFilter() {
  const inline = argValue('routes');
  const fromFile = argValue('routes-file');
  if (inline) {
    return new Set(
      inline
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
    );
  }
  if (fromFile) {
    if (!fs.existsSync(fromFile)) {
      fail('--routes-file ' + fromFile + ' not found.');
    }
    let raw;
    try {
      raw = fs.readFileSync(fromFile, 'utf8');
    } catch (err) {
      fail('failed to read --routes-file ' + fromFile + ': ' + err.message);
    }
    return new Set(
      raw
        .split(/\\r?\\n/)
        .map((r) => r.trim())
        .filter(Boolean),
    );
  }
  return null;
}

function planPhase() {
  const siteMap = loadSiteMap();
  const filter = resolveRouteFilter();
  const routes = siteMap && typeof siteMap.routes === 'object' && siteMap.routes !== null
    ? siteMap.routes
    : {};

  const routeEntries = Object.keys(routes)
    .filter((routePath) => {
      const route = routes[routePath];
      if (!route || typeof route !== 'object') {
        fail(
          'malformed route entry for "' +
            routePath +
            '" in ' +
            path.relative(CWD, SITE_MAP_PATH) +
            ' (expected an object). Re-run /map-site.',
        );
      }
      if (route.status !== 'active') return false;
      if (filter && !filter.has(routePath) && !filter.has(route.routeId)) return false;
      return true;
    })
    .sort();

  const workers = routeEntries.map((routePath) => {
    const route = routes[routePath];
    const slug = toSlug(routePath);
    return {
      workerId: 'worker-' + slug,
      routeId: route.routeId,
      path: routePath,
      sampleUrl: (route.sampleUrls && route.sampleUrls[0]) || null,
      slug: slug,
    };
  });

  const sharedWidgets = Array.isArray(siteMap.sharedWidgets)
    ? siteMap.sharedWidgets.slice().sort()
    : [];
  const journeyWorkers = planJourneyWorkers(routes, filter);
  const maxConcurrency = Math.max(1, Math.min(os.cpus().length, 4));

  const output = {
    status: workers.length > 0 || journeyWorkers.length > 0 ? 'READY' : 'EMPTY',
    maxConcurrency: maxConcurrency,
    dag_waves: [
      { level: 0, name: 'primitives', workers: [] },
      { level: 1, name: 'shared_widgets', workers: sharedWidgets },
      { level: 2, name: 'pages', workers: workers },
      { level: 3, name: 'journeys', workers: journeyWorkers },
    ],
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
  if (workers.length === 0 && !filter) {
    process.stderr.write('[orchestrate-swarm] no active routes found in site-map.json.\\n');
  }
}

// Level 3 is one worker per drafted-but-not-yet-automated journey. A journey is the natural unit
// here because each one produces exactly one spec file, so two workers never write the same file.
// Automating a large batch serially in a single agent turn was live-observed stopping at 12 of 92
// with no explicit hand-off; a deterministic worker list makes "how many are left" a fact the
// caller reads rather than a number it has to keep in its head.
function planJourneyWorkers(routes, filter) {
  if (!fs.existsSync(JOURNEYS_PATH)) return [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(JOURNEYS_PATH, 'utf8'));
  } catch {
    return [];
  }
  const allJourneys =
    data && typeof data.journeys === 'object' && data.journeys !== null
      ? Object.values(data.journeys)
      : [];

  const routePathByRouteId = new Map();
  for (const [routePath, route] of Object.entries(routes)) {
    if (route && typeof route.routeId === 'string') routePathByRouteId.set(route.routeId, routePath);
  }

  const workers = [];
  for (const journey of allJourneys) {
    if (!journey || !journey.testCase) continue;
    // reviewed:true is what /automate-test sets once a journey's test is written and green.
    if (journey.reviewed === true) continue;
    const journeyRouteIds = Array.isArray(journey.routeIds) ? journey.routeIds : [];
    const paths = journeyRouteIds.map((routeId) => routePathByRouteId.get(routeId) || null);
    // A journey walking several routes belongs to the filter if any of them is named - filtering it
    // out because its first route was not mentioned would drop the whole flow.
    if (
      filter &&
      !journeyRouteIds.some((routeId) => filter.has(routeId)) &&
      !paths.some((routePath) => routePath !== null && filter.has(routePath))
    ) {
      continue;
    }
    workers.push({
      workerId: 'journey-' + String(journey.journeyId || '').slice(0, 12),
      journeyId: journey.journeyId || null,
      routeIds: journeyRouteIds,
      paths: paths,
      testInterface: journey.testInterface || null,
      breadth: journey.breadth || null,
      title: (journey.testCase && journey.testCase.title) || null,
    });
  }
  workers.sort((a, b) => String(a.workerId).localeCompare(String(b.workerId)));
  return workers;
}

function checkTarget(target) {
  const abs = path.isAbsolute(target) ? target : path.join(CWD, target);
  if (!fs.existsSync(abs)) {
    return { target: target, exists: false, nonEmpty: false, status: 'MISSING' };
  }
  const stat = fs.statSync(abs);
  const nonEmpty = stat.isFile() && stat.size > 0;
  return {
    target: target,
    exists: true,
    nonEmpty: nonEmpty,
    status: nonEmpty ? 'OK' : 'EMPTY',
  };
}

function verifyPhase() {
  const targetsArg = argValue('targets');
  if (!targetsArg) {
    fail('--phase=verify requires --targets=<comma-separated-paths>');
  }
  const targets = targetsArg
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const results = targets.map(checkTarget);
  const allOk = results.every((r) => r.status === 'OK');
  process.stdout.write(
    JSON.stringify({ status: allOk ? 'PASSED' : 'FAILED', results: results }, null, 2) + '\\n',
  );
  if (!allOk) process.exit(1);
}

function verifyWorkerPhase() {
  const target = argValue('target');
  if (!target) {
    fail('--phase=verify-worker requires --target=<path>');
  }
  const result = checkTarget(target);
  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
  if (result.status !== 'OK') process.exit(1);
}

function reindexPhase() {
  const widgetsDir = path.join(CWD, 'components', 'widgets');
  if (!fs.existsSync(widgetsDir)) {
    process.stdout.write('[INFO] components/widgets/ not found; nothing to reindex.\\n');
    return;
  }
  const widgetFiles = fs
    .readdirSync(widgetsDir)
    .filter((f) => f.endsWith('.widget.ts') && f !== 'index.ts')
    .sort();

  if (widgetFiles.length === 0) {
    process.stdout.write('[INFO] no widget files found; nothing to reindex.\\n');
    return;
  }

  const lines = widgetFiles.map((f) => {
    const base = f.replace(/\\.ts$/, '');
    return "export * from './" + base + "';";
  });
  const content = lines.join('\\n') + '\\n';
  fs.writeFileSync(path.join(widgetsDir, 'index.ts'), content, 'utf8');
  process.stdout.write(
    '[PASS] Reindexed components/widgets/index.ts (' + widgetFiles.length + ' widgets).\\n',
  );
}

const phase = argValue('phase');
switch (phase) {
  case 'plan':
    planPhase();
    break;
  case 'verify':
    verifyPhase();
    break;
  case 'verify-worker':
    verifyWorkerPhase();
    break;
  case 'reindex':
    reindexPhase();
    break;
  default:
    process.stderr.write(
      '[orchestrate-swarm] Unknown or missing --phase. Use plan|verify|verify-worker|reindex.\\n',
    );
    process.exit(1);
}
`;
}
