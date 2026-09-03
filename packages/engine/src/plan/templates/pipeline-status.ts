// Template for generating scripts/pipeline-status.mjs. create-if-absent.
// Single source of truth for "what stage is this project at, what's next" - computed fresh from
// real artifact state every time, never a cached belief. Consulted by /ground-zero-setup (to decide
// what to run next) and by individual skills' own end-of-run hints (e.g. /map-site Step 6, instead
// of a hardcoded "run X next" string that goes stale as new stages get added). Adding a future
// stage (Stage 3 journeys, Stage 4 spec synthesis) only ever means extending this one script - the
// orchestrator's own sequencing logic reads whatever this reports, it never hardcodes the stage list
// itself.

export function renderPipelineStatus(): string {
  return `#!/usr/bin/env node

/**
 * Computes the current app-analysis pipeline stage from real artifact state on disk.
 * Zero model involvement - pure structural checks, safe to run at any time.
 *
 * Usage:
 *   node scripts/pipeline-status.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'docs', 'site-map', 'site-map.json');
const BUSINESS_INTENT_PATH = path.join(CWD, 'docs', 'analysis', 'business-intent.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'docs', 'analysis', 'test-conditions.json');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function anyRouteHasReviewedTrue(routes) {
  if (!routes || typeof routes !== 'object') return false;
  return Object.values(routes).some(function (entry) {
    return entry && entry.reviewed === true;
  });
}

function anyRouteHasReviewedCondition(routes) {
  if (!routes || typeof routes !== 'object') return false;
  return Object.values(routes).some(function (entry) {
    return (
      entry &&
      Array.isArray(entry.conditions) &&
      entry.conditions.some(function (c) {
        return c && c.reviewed === true;
      })
    );
  });
}

function computeStatus() {
  if (!fs.existsSync(SITE_MAP_PATH)) {
    return {
      stage: 'not-started',
      nextCommand: '/map-site create',
      nextCommandDescription: 'No site map yet - run /map-site create to crawl the application.',
    };
  }

  const businessIntent = loadJson(BUSINESS_INTENT_PATH);
  if (!businessIntent) {
    return {
      stage: 'business-intent-pending-review',
      nextCommand: null,
      nextCommandDescription:
        'Site map exists, but business-intent analysis has not run yet. Continue /map-site Step 6 to generate it.',
    };
  }
  if (!anyRouteHasReviewedTrue(businessIntent.routes)) {
    return {
      stage: 'business-intent-pending-review',
      nextCommand: null,
      nextCommandDescription:
        'Business-intent entries exist, but none are reviewed yet. Review the Business-Intent Review Artifact table from /map-site Step 6, then approve entries in conversation.',
    };
  }

  const testConditions = loadJson(TEST_CONDITIONS_PATH);
  if (!testConditions) {
    return {
      stage: 'business-intent-reviewed',
      nextCommand: '/derive-test-conditions',
      nextCommandDescription: 'Business-intent is reviewed. Run /derive-test-conditions next.',
    };
  }

  if (!anyRouteHasReviewedCondition(testConditions.routes)) {
    return {
      stage: 'test-conditions-pending-review',
      nextCommand: null,
      nextCommandDescription:
        'Test conditions exist, but none are reviewed yet. Review the Test-Conditions Review Artifact, then approve entries in conversation.',
    };
  }

  return {
    stage: 'ready-to-automate',
    nextCommand: '/automate-ticket',
    nextCommandDescription:
      'Test conditions are reviewed. Journey placement and spec synthesis are not built yet - create a TMS ticket by hand describing the scenario, then run /automate-ticket against it.',
  };
}

process.stdout.write(JSON.stringify(computeStatus(), null, 2) + '\\n');
`;
}
