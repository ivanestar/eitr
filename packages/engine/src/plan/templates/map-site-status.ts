// Template for scripts/map-site-status.mjs — deterministic Mode Resolution for /map-site. Per the
// project's own rule (any multi-step guided flow needs a deterministic stage-dispatch script, not
// prose telling the model how to figure out what's next), this script answers "does site-map.json
// already exist, how big is it, when was it last touched, and what does that mean for the
// create/update mode the user asked for" - the skill's own prose used to reason through this itself
// and compose the reset-warning text fresh each time, the same failure mode pipeline-status.mjs's
// own preFlightNotice already guards against elsewhere (a model composing a warning it's supposed to
// print verbatim can silently shorten or drop it).
export function renderMapSiteStatus(): string {
  return `#!/usr/bin/env node

/**
 * Resolves /map-site's create/update mode from real artifacts/site-map/site-map.json state - zero
 * model involvement, safe to run at any time.
 *
 * Usage:
 *   node scripts/map-site-status.mjs <create|update>
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

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

function main() {
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

  const result = {
    requestedMode,
    resolvedMode,
    siteMapExists,
    routeCount,
    lastTouched,
    modeRedirected,
    noticeMessage,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
