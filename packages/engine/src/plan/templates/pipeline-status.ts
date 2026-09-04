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
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const BUSINESS_INTENT_PATH = path.join(CWD, 'artifacts', 'analysis', 'business-intent.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const JOURNEYS_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');

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

function collectJourneys(routes) {
  if (!routes || typeof routes !== 'object') return [];
  const all = [];
  for (const entry of Object.values(routes)) {
    if (entry && Array.isArray(entry.journeys)) {
      for (const j of entry.journeys) all.push(j);
    }
  }
  return all;
}

function anyJourneyNeedsAutomation(journeys) {
  return journeys.some(function (j) {
    return j && j.testCase && j.reviewed !== true;
  });
}

// Checks drafting completeness per-route against test-conditions.json, not just "does at least one
// journey somewhere have a testCase" - a route can have reviewed conditions but either no journey
// entry yet (compose-journeys.mjs hasn't run since that route's conditions were reviewed) or a
// journey with conditionAssignments but no testCase yet (the /design-test-cases LLM drafting step
// was interrupted before reaching it). Either state must route back to /design-test-cases; treating
// it as done would silently report 'complete' while a route was never even drafted.
function everyReviewedRouteHasDraftedTestCase(testConditionRoutes, journeysRoutes) {
  if (!testConditionRoutes || typeof testConditionRoutes !== 'object') return true;
  for (const [routeId, entry] of Object.entries(testConditionRoutes)) {
    const hasReviewedCondition =
      entry &&
      Array.isArray(entry.conditions) &&
      entry.conditions.some(function (c) {
        return c && c.reviewed === true;
      });
    if (!hasReviewedCondition) continue;
    const routeJourneyEntry = journeysRoutes && journeysRoutes[routeId];
    const routeJourneys =
      routeJourneyEntry && Array.isArray(routeJourneyEntry.journeys) ? routeJourneyEntry.journeys : [];
    const hasDraftedTestCase = routeJourneys.some(function (j) {
      return j && j.testCase;
    });
    if (!hasDraftedTestCase) return false;
  }
  return true;
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
      nextCommand: '/define-test-conditions',
      nextCommandDescription: 'Business-intent is reviewed. Run /define-test-conditions next.',
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

  const journeysData = loadJson(JOURNEYS_PATH);
  const journeysRoutes = journeysData && typeof journeysData.routes === 'object' ? journeysData.routes : {};
  const journeys = collectJourneys(journeysRoutes);

  if (!everyReviewedRouteHasDraftedTestCase(testConditions.routes, journeysRoutes)) {
    return {
      stage: 'test-conditions-reviewed',
      nextCommand: '/design-test-cases',
      nextCommandDescription:
        'Test conditions are reviewed. Run /design-test-cases to classify them onto test levels and draft a test case per journey.',
    };
  }

  if (anyJourneyNeedsAutomation(journeys)) {
    return {
      stage: 'test-cases-drafted',
      nextCommand: '/automate-ticket',
      nextCommandDescription:
        'Test cases are drafted in artifacts/test-cases/test-cases.json. Run /automate-ticket with no ticket ID to automate them directly - no TMS ticket required.',
    };
  }

  return {
    stage: 'complete',
    nextCommand: null,
    nextCommandDescription:
      'Every drafted test case has been automated. Run /map-site update to discover new routes, or /define-test-conditions to cover changed ones.',
  };
}

process.stdout.write(JSON.stringify(computeStatus(), null, 2) + '\\n');
`;
}
