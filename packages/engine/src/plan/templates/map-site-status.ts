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
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const SCREENSHOT_DIR = path.join(CWD, 'artifacts', 'site-map', 'screenshots');
const SCREENSHOT_EXTENSIONS = ['.jpg', '.jpeg', '.webp', '.png'];

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

// A screenshot is stale when its filename stem is not a routeId in the CURRENT site map. Anything
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
    const stem = path.basename(entry.name, path.extname(entry.name));
    if (ids.has(stem)) continue;
    stale.push(entry.name);
  }
  return stale;
}

function fileSize(name) {
  try {
    return fs.statSync(path.join(SCREENSHOT_DIR, name)).size;
  } catch {
    return 0;
  }
}

// Refuses to delete anything when the site map is missing or unparseable: with no current route set
// to compare against, EVERY file would look stale, which would silently wipe a directory whose
// contents may be the only surviving evidence of the last crawl.
function pruneScreenshots() {
  const siteMap = loadSiteMap();
  if (siteMap === null) {
    return {
      action: 'prune-screenshots',
      pruned: 0,
      freedBytes: 0,
      skippedReason: 'no readable artifacts/site-map/site-map.json - nothing was deleted',
    };
  }

  const stale = listStaleScreenshots(siteMap);
  let freedBytes = 0;
  let pruned = 0;
  const failures = [];
  for (const name of stale) {
    const size = fileSize(name);
    try {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, name));
      pruned += 1;
      freedBytes += size;
    } catch (err) {
      failures.push(name + ': ' + err.message);
    }
  }

  return {
    action: 'prune-screenshots',
    pruned,
    freedBytes,
    remaining: knownRouteIds(siteMap).size,
    failures,
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
      'artifact keyed by routeId (e.g. artifacts/analysis/business-intent.json) will need ' +
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
  };
}

function main() {
  const action = (process.argv[2] || '').toLowerCase();
  const result = action === 'prune-screenshots' ? pruneScreenshots() : resolveMode();
  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
