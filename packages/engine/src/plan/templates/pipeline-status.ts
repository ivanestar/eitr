// Template for generating scripts/pipeline-status.mjs. create-if-absent.
// Single source of truth for "what stage is this project at, what's next" - computed fresh from
// real artifact state every time, never a cached belief. Consulted by /ground-zero-setup (to decide
// what to run next) and by individual skills' own end-of-run hints (e.g. /map-site Step 6, instead
// of a hardcoded "run X next" string that goes stale as new stages get added). Adding a future
// stage (Stage 3 journeys, Stage 4 spec synthesis) only ever means extending this one script - the
// orchestrator's own sequencing logic reads whatever this reports, it never hardcodes the stage list
// itself.
//
// Also computes routeCoverage, stageTimings, and preFlightNotice - all authored here, not by the
// model at the point they're needed. A model reasoning through a long pipeline has been observed to
// skip or shorten a cost-warning it was supposed to compose itself; printing a script-authored field
// verbatim removes that degree of freedom instead of relying on the model remembering.

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

function countReviewedTrue(routes) {
  if (!routes || typeof routes !== 'object') return 0;
  return Object.values(routes).filter(function (entry) {
    return entry && entry.reviewed === true;
  }).length;
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

function countRoutesWithReviewedCondition(routes) {
  if (!routes || typeof routes !== 'object') return 0;
  return Object.values(routes).filter(function (entry) {
    return (
      entry &&
      Array.isArray(entry.conditions) &&
      entry.conditions.some(function (c) {
        return c && c.reviewed === true;
      })
    );
  }).length;
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

// Fixed, deterministic roadmap of the whole greenfield pipeline - one string, printed by every
// skill at every human-facing stop, so the human always sees where they are without re-deriving it
// themselves. Position is computed from the stage value below, never guessed by the model.
const ROADMAP_STEPS = [
  'Stage 1: Create a site map',
  'Review',
  'Stage 2: Define test conditions',
  'Review',
  'Stage 3: Design test cases',
  'Review',
  'Stage 4: Automate test cases',
  'Review',
];

const STAGE_TO_ROADMAP_INDEX = {
  'not-started': 0,
  'business-intent-pending-review': 1,
  'business-intent-reviewed': 2,
  'test-conditions-pending-review': 3,
  'test-conditions-reviewed': 4,
  'test-cases-drafted': 5,
  complete: 7,
};

function formatRoadmap(stage) {
  const currentIndex = STAGE_TO_ROADMAP_INDEX[stage];
  if (currentIndex === undefined) return ROADMAP_STEPS.join(' -> ');
  return ROADMAP_STEPS.map(function (step, i) {
    return i === currentIndex ? '[' + step + ' <- you are here]' : step;
  }).join(' -> ');
}

// Route-level counters a human-facing report can print without re-deriving them from raw artifacts
// itself - zero model involvement, same as every other computation in this script.
function computeRouteCoverage(siteMap, businessIntent, testConditions, journeysRoutes) {
  const routes = siteMap && typeof siteMap.routes === 'object' ? Object.values(siteMap.routes) : [];
  const activeRoutes = routes.filter(function (r) {
    return r && r.status === 'active';
  });
  const likelyPhantomRoutes = activeRoutes.filter(function (r) {
    return (
      r.visualTriage &&
      Array.isArray(r.visualTriage.flags) &&
      r.visualTriage.flags.indexOf('likely-phantom-route') !== -1
    );
  });
  return {
    totalRoutes: routes.length,
    activeRoutes: activeRoutes.length,
    likelyPhantomRoutes: likelyPhantomRoutes.length,
    businessIntentReviewed: countReviewedTrue(businessIntent && businessIntent.routes),
    testConditionsReviewed: countRoutesWithReviewedCondition(testConditions && testConditions.routes),
    testCasesDrafted: collectJourneys(journeysRoutes).filter(function (j) {
      return j && j.testCase;
    }).length,
    automated: collectJourneys(journeysRoutes).filter(function (j) {
      return j && j.testCase && j.reviewed === true;
    }).length,
  };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return totalMinutes + 'm';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours + 'h ' + minutes + 'm';
}

// Per-stage elapsed time derived from each artifact's own generatedAt/lastUpdatedAt timestamp -
// never the model's own guess at how long a session felt. This measures wall-clock time between
// artifacts being written, which includes any human review wait folded into the gap after it - it
// is not a claim about pure agent working time.
function computeStageTimings(siteMap, businessIntent, testConditions, journeysData) {
  const points = [];
  if (siteMap && siteMap.generatedAt) {
    points.push({ label: 'Stage 1: Site map crawled', timestamp: siteMap.generatedAt });
  }
  if (businessIntent && businessIntent.generatedAt) {
    points.push({ label: 'Stage 1: Business-intent analysis', timestamp: businessIntent.generatedAt });
  }
  if (testConditions && testConditions.generatedAt) {
    points.push({ label: 'Stage 2: Test conditions defined', timestamp: testConditions.generatedAt });
  }
  if (journeysData && journeysData.generatedAt) {
    points.push({ label: 'Stage 3: Test cases drafted', timestamp: journeysData.generatedAt });
  }
  if (journeysData && journeysData.lastUpdatedAt) {
    points.push({ label: 'Stage 4: Test cases automated', timestamp: journeysData.lastUpdatedAt });
  }
  return points.map(function (point, i) {
    if (i === 0) return { label: point.label, timestamp: point.timestamp, sincePrevious: null };
    const deltaMs = new Date(point.timestamp).getTime() - new Date(points[i - 1].timestamp).getTime();
    return { label: point.label, timestamp: point.timestamp, sincePrevious: formatDuration(deltaMs) };
  });
}

const COST_WARNING =
  "This can take anywhere from tens of minutes to multiple hours depending on application size, and consumes a meaningful share of the session's generation budget.";
const HUMAN_GATES_DISCLOSURE =
  "By default there is a pause after every stage, where that stage's own review artifact is presented and you must approve before the next stage runs.";

function computePreFlightNotice(roadmap, coverage) {
  const lines = ['Roadmap: ' + roadmap, 'Cost warning: ' + COST_WARNING, 'Human gates: ' + HUMAN_GATES_DISCLOSURE];
  if (coverage.likelyPhantomRoutes > 0) {
    lines.push(
      'Heads up: ' +
        coverage.likelyPhantomRoutes +
        " route(s) already on record look like crawler artifacts (found only via a hidden DOM link, resolving to an empty/error-shell page) - they'll be called out separately at the next review, not treated as equal active routes.",
    );
  }
  return lines.join('\\n');
}

function computeStatus(siteMap, businessIntent, testConditions, journeysData) {
  if (!siteMap) {
    return {
      stage: 'not-started',
      nextCommand: '/map-site create',
      nextCommandDescription: 'No site map yet - run /map-site create to crawl the application.',
    };
  }

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
      nextCommand: '/automate-test',
      nextCommandDescription:
        'Test cases are drafted in artifacts/test-cases/test-cases.json. Run /automate-test with no ticket ID to automate them directly - no TMS ticket required.',
    };
  }

  return {
    stage: 'complete',
    nextCommand: null,
    nextCommandDescription:
      'Every drafted test case has been automated. Run /map-site update to discover new routes, or /define-test-conditions to cover changed ones.',
  };
}

function main() {
  const siteMap = loadJson(SITE_MAP_PATH);
  const businessIntent = loadJson(BUSINESS_INTENT_PATH);
  const testConditions = loadJson(TEST_CONDITIONS_PATH);
  const journeysData = loadJson(JOURNEYS_PATH);
  const journeysRoutes = journeysData && typeof journeysData.routes === 'object' ? journeysData.routes : {};

  const status = computeStatus(siteMap, businessIntent, testConditions, journeysData);
  const roadmap = formatRoadmap(status.stage);
  const routeCoverage = computeRouteCoverage(siteMap, businessIntent, testConditions, journeysRoutes);
  const stageTimings = computeStageTimings(siteMap, businessIntent, testConditions, journeysData);
  const preFlightNotice = computePreFlightNotice(roadmap, routeCoverage);

  process.stdout.write(
    JSON.stringify(
      Object.assign(
        { roadmap: roadmap, routeCoverage: routeCoverage, stageTimings: stageTimings, preFlightNotice: preFlightNotice },
        status,
      ),
      null,
      2,
    ) + '\\n',
  );
}

main();
`;
}
