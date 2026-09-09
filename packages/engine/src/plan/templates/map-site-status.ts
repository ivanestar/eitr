// Template for scripts/map-site-status.mjs — deterministic Mode Resolution for /map-site. Per the
// project's own rule (any multi-step guided flow needs a deterministic stage-dispatch script, not
// prose telling the model how to figure out what's next), this script answers "does site-map.json
// already exist, how big is it, when was it last touched, and what does that mean for the
// create/update mode the user asked for" - the skill's own prose used to reason through this itself
// and compose the reset-warning text fresh each time, the same failure mode pipeline-status.mjs's
// own preFlightNotice already guards against elsewhere (a model composing a warning it's supposed to
// print verbatim can silently shorten or drop it).
//
// It also owns screenshot lifecycle. A `create` pass regenerates every routeId, and screenshots are
// keyed by routeId - so every re-crawl orphaned the previous pass's image files, which nothing ever
// deleted. Live-observed result: 1239 files (~146 MB) on disk backing a 44-route site map. Pruning
// belongs here rather than in the skill's prose for the same reason mode resolution does: "which
// files are no longer referenced" is a pure fact about on-disk state, not a judgment call.
//
// Pruning after the fact is not the same as starting clean, which is why reset-screenshots exists
// alongside it. A `create` pass is already defined as starting from nothing, so the directory it
// leaves behind should hold that pass's images and nothing else - wiping at the start rather than
// reconciling at the end also means a pass that dies half-way leaves a partial set of its OWN
// images rather than a mix of two crawls that no later prune can tell apart. `update` needs none of
// this: it keeps each route's id, so re-capturing a route overwrites that route's own file in place
// and the directory can never accumulate a second copy of anything.
export function renderMapSiteStatus(): string {
  return `#!/usr/bin/env node

/**
 * Resolves /map-site's create/update mode from real artifacts/site-map/site-map.json state, and
 * prunes screenshot files no current route references - zero model involvement, safe to run at any
 * time.
 *
 * Usage:
 *   node scripts/map-site-status.mjs <create|update>
 *   node scripts/map-site-status.mjs prune-screenshots
 *   node scripts/map-site-status.mjs prune-screenshots --orphaned
 *   node scripts/map-site-status.mjs reset-screenshots
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const SCREENSHOT_DIR = path.join(CWD, 'artifacts', 'site-map', 'screenshots');
const MARKS_DIR = path.join(CWD, 'artifacts', 'site-map', '.visual-marks');
const CRAWL_STATE_PATH = path.join(CWD, 'artifacts', 'site-map', '.crawl-budget.json');
const SCREENSHOT_EXTENSIONS = ['.jpg', '.jpeg', '.webp', '.png'];

// How recently the crawl's own state file must have been written for another pass to count as live.
// A crawl touches it on every check and every visit, so a gap wider than this means nothing is
// walking the site right now.
const ACTIVE_CRAWL_WINDOW_MS = 120000;

function loadSiteMap() {
  if (!fs.existsSync(SITE_MAP_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(SITE_MAP_PATH, 'utf8'));
    // Same "absent or unparseable schemaVersion means treat as absent" rule the skill's own Step
    // 3a already documents for a corrupt/pre-schema file - never attempt to migrate it in place.
    if (!data || typeof data !== 'object' || typeof data.schemaVersion !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function knownRouteIds(siteMap) {
  const ids = new Set();
  if (!siteMap || !siteMap.routes || typeof siteMap.routes !== 'object') return ids;
  for (const entry of Object.values(siteMap.routes)) {
    if (entry && typeof entry.routeId === 'string') ids.add(entry.routeId);
  }
  return ids;
}

// Screenshots are named "<path slug>--<routeId>.<ext>" so a human can tell which page a file shows
// without cross-referencing UUIDs. The routeId is what identifies the file, so it is read from
// after the last "--": the slug rule collapses every run of non-alphanumerics to a single "-", so a
// double hyphen can never occur inside the slug itself and the split is unambiguous. The older
// bare "<routeId>.<ext>" form is still recognised - a project generated before the rename must not
// have its whole screenshot directory deleted by the first prune that runs after upgrading.
function routeIdFromScreenshotName(fileName) {
  const stem = path.basename(fileName, path.extname(fileName));
  const separatorIndex = stem.lastIndexOf('--');
  return separatorIndex === -1 ? stem : stem.slice(separatorIndex + 2);
}

// A screenshot is stale when the routeId in its filename is not in the CURRENT site map. Anything
// that is not a recognised image extension is left alone rather than guessed about - this function
// only ever proposes deleting files it can positively identify as this pipeline's own output.
function listStaleScreenshots(siteMap) {
  if (!fs.existsSync(SCREENSHOT_DIR)) return [];
  const ids = knownRouteIds(siteMap);
  let entries;
  try {
    entries = fs.readdirSync(SCREENSHOT_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const stale = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SCREENSHOT_EXTENSIONS.includes(ext)) continue;
    if (ids.has(routeIdFromScreenshotName(entry.name))) continue;
    stale.push(entry.name);
  }
  return stale;
}

// Every file in the directory this script recognises as its own output, regardless of any site map.
// Only meaningful when there is no site map to compare against - see pruneScreenshots.
function listAllScreenshots() {
  if (!fs.existsSync(SCREENSHOT_DIR)) return [];
  try {
    return fs
      .readdirSync(SCREENSHOT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .filter((entry) => SCREENSHOT_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function fileSize(name) {
  try {
    return fs.statSync(path.join(SCREENSHOT_DIR, name)).size;
  } catch {
    return 0;
  }
}

function totalSize(names) {
  let sum = 0;
  for (const name of names) sum += fileSize(name);
  return sum;
}

function deleteAll(names) {
  let freedBytes = 0;
  let pruned = 0;
  const failures = [];
  for (const name of names) {
    const size = fileSize(name);
    try {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, name));
      pruned += 1;
      freedBytes += size;
    } catch (err) {
      failures.push(name + ': ' + err.message);
    }
  }
  return { pruned, freedBytes, failures };
}

// Refuses to delete anything when the site map is missing or unparseable: with no current route set
// to compare against, EVERY file would look stale, which would silently wipe a directory whose
// contents may be the only surviving evidence of the last crawl.
//
// --orphaned is the deliberate exception, for the one state that refusal strands: a crawl that died
// before writing site-map.json leaves its whole screenshot directory referenced by nothing and
// unreachable by any normal prune. Live-observed at 5507 files (657 MB) after a crawl that ran 31
// minutes and produced no site map at all. It stays behind an explicit flag precisely because it
// cannot check its work - it deletes on the operator's say-so, not on evidence - and it still
// refuses whenever a readable site map exists, where the evidence-based prune is the right tool.
function pruneScreenshots(orphanedRequested) {
  const siteMap = loadSiteMap();

  if (siteMap === null) {
    const all = listAllScreenshots();
    if (!orphanedRequested) {
      return {
        action: 'prune-screenshots',
        pruned: 0,
        freedBytes: 0,
        orphanedScreenshotCount: all.length,
        orphanedBytes: totalSize(all),
        skippedReason:
          all.length === 0
            ? 'no readable artifacts/site-map/site-map.json - nothing was deleted'
            : 'no readable artifacts/site-map/site-map.json, so ' +
              all.length +
              ' screenshot file(s) cannot be matched to any route. Re-run with --orphaned to delete ' +
              'them, which is only correct if no crawl is currently in progress.',
      };
    }
    const outcome = deleteAll(all);
    return {
      action: 'prune-screenshots',
      mode: 'orphaned',
      pruned: outcome.pruned,
      freedBytes: outcome.freedBytes,
      remaining: 0,
      failures: outcome.failures,
      skippedReason: null,
    };
  }

  if (orphanedRequested) {
    return {
      action: 'prune-screenshots',
      pruned: 0,
      freedBytes: 0,
      skippedReason:
        'artifacts/site-map/site-map.json is readable, so --orphaned was refused - run without it ' +
        'to prune only the files no current route references.',
    };
  }

  const outcome = deleteAll(listStaleScreenshots(siteMap));
  return {
    action: 'prune-screenshots',
    pruned: outcome.pruned,
    freedBytes: outcome.freedBytes,
    remaining: knownRouteIds(siteMap).size,
    failures: outcome.failures,
    skippedReason: null,
  };
}

// Transient marked-up copies the visual pass hands to its worker. They are deleted as each route
// finishes, so anything still here belongs to a run that stopped early.
function purgeMarksDir() {
  if (!fs.existsSync(MARKS_DIR)) return 0;
  let removed = 0;
  try {
    for (const entry of fs.readdirSync(MARKS_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!SCREENSHOT_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
      try {
        fs.unlinkSync(path.join(MARKS_DIR, entry.name));
        removed += 1;
      } catch {
        // A file we cannot delete is reported by count, not by failing the reset - the pass that
        // follows overwrites by route id anyway.
      }
    }
  } catch {
    return removed;
  }
  return removed;
}

// Whether a crawl looks like it is running right now. The only evidence available is how recently
// the frontier gatekeeper wrote its state, which is exactly what a live crawl does constantly.
function crawlLooksActive() {
  try {
    const stat = fs.statSync(CRAWL_STATE_PATH);
    return Date.now() - stat.mtimeMs < ACTIVE_CRAWL_WINDOW_MS;
  } catch {
    return false;
  }
}

// Start-of-pass wipe for \`create\`, whose contract is already "this starts clean". Unlike
// prune-screenshots this deletes without comparing against a site map, so it is deliberately not
// reachable from any other mode, and it refuses outright while another crawl is visibly running -
// the one situation where deleting the directory would destroy work in progress rather than the
// leftovers of a finished pass.
function resetScreenshots(force) {
  if (!force && crawlLooksActive()) {
    return {
      action: 'reset-screenshots',
      pruned: 0,
      freedBytes: 0,
      marksRemoved: 0,
      skippedReason:
        'artifacts/site-map/.crawl-budget.json was written in the last ' +
        Math.round(ACTIVE_CRAWL_WINDOW_MS / 1000) +
        's, so a crawl appears to be running. Refusing to wipe the screenshot directory - wait for ' +
        'it to finish, or pass --force if you are certain nothing else is crawling.',
    };
  }
  const all = listAllScreenshots();
  const outcome = deleteAll(all);
  return {
    action: 'reset-screenshots',
    pruned: outcome.pruned,
    freedBytes: outcome.freedBytes,
    marksRemoved: purgeMarksDir(),
    failures: outcome.failures,
    skippedReason: null,
  };
}

function resolveMode() {
  const requestedModeArg = (process.argv[2] || '').toLowerCase();
  const requestedMode = requestedModeArg === 'update' ? 'update' : 'create';

  const siteMap = loadSiteMap();
  const siteMapExists = siteMap !== null;
  const routeCount =
    siteMapExists && siteMap.routes && typeof siteMap.routes === 'object'
      ? Object.keys(siteMap.routes).length
      : 0;
  const lastTouched = siteMapExists ? siteMap.lastUpdatedAt || siteMap.generatedAt || null : null;

  // Reported separately from staleScreenshotCount, which can only ever be counted against a site map
  // that exists. Collapsing both into one number reported 0 while 5507 files sat on disk after an
  // aborted crawl, which read as "nothing to clean up" rather than "nothing can be checked."
  const orphanedScreenshotCount = siteMapExists ? 0 : listAllScreenshots().length;

  let resolvedMode = requestedMode;
  let modeRedirected = false;
  let noticeMessage = null;

  if (requestedMode === 'update' && !siteMapExists) {
    resolvedMode = 'create';
    modeRedirected = true;
    noticeMessage =
      'No existing artifacts/site-map/site-map.json found - running a full create pass instead.';
  } else if (requestedMode === 'create' && siteMapExists) {
    noticeMessage =
      'Found an existing site-map.json with ' +
      routeCount +
      ' routes (last touched ' +
      (lastTouched || 'unknown') +
      '). create starts fresh: routeId identity resets for every route, so any downstream ' +
      'artifact keyed by routeId (e.g. artifacts/analysis/feature-map.json) will need ' +
      're-review. Use /map-site update instead to refresh in place and preserve routeId/history.';
  }

  return {
    requestedMode,
    resolvedMode,
    siteMapExists,
    routeCount,
    lastTouched,
    modeRedirected,
    noticeMessage,
    staleScreenshotCount: siteMapExists ? listStaleScreenshots(siteMap).length : 0,
    orphanedScreenshotCount,
  };
}

function main() {
  const action = (process.argv[2] || '').toLowerCase();
  const flags = process.argv.slice(3);
  let result;
  if (action === 'prune-screenshots') result = pruneScreenshots(flags.includes('--orphaned'));
  else if (action === 'reset-screenshots') result = resetScreenshots(flags.includes('--force'));
  else result = resolveMode();
  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
