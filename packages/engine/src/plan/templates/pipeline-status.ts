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
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const JOURNEYS_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');
const REVIEW_DIR = path.join(CWD, 'artifacts', 'review');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function countReviewedTrue(routes) {
  if (!routes || typeof routes !== 'object') return 0;
  return Object.values(routes).filter(function (entry) {
    return entry && entry.reviewed === true;
  }).length;
}

// A feature map is only past its own gate once every feature, every entity AND every route in it is
// reviewed. Entity relations are the one thing in this pipeline that a later stage builds
// preconditions out of, so a half-reviewed map would hand a downstream stage a link nobody
// confirmed - and a route whose criticality nobody confirmed decides how much testing it gets.
function featureMapFullyReviewed(featureMap) {
  if (!featureMap) return false;
  const features = Object.values(featureMap.features || {});
  const entities = Object.values(featureMap.entities || {});
  const routes = Object.values(featureMap.routes || {});
  if (features.length === 0) return false;
  return features
    .concat(entities)
    .concat(routes)
    .every(function (record) {
      return record && record.reviewed === true;
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

function collectJourneys(journeysData) {
  if (!journeysData || typeof journeysData.journeys !== 'object' || journeysData.journeys === null) {
    return [];
  }
  return Object.values(journeysData.journeys).filter(Boolean);
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
function everyReviewedRouteHasDraftedTestCase(testConditionRoutes, journeys) {
  if (!testConditionRoutes || typeof testConditionRoutes !== 'object') return true;
  const draftedRouteIds = new Set();
  for (const journey of journeys) {
    if (!journey || !journey.testCase) continue;
    for (const routeId of journey.routeIds || []) draftedRouteIds.add(routeId);
  }
  for (const [routeId, entry] of Object.entries(testConditionRoutes)) {
    const hasReviewedCondition =
      entry &&
      Array.isArray(entry.conditions) &&
      entry.conditions.some(function (c) {
        return c && c.reviewed === true;
      });
    if (!hasReviewedCondition) continue;
    if (!draftedRouteIds.has(routeId)) return false;
  }
  return true;
}

// Fixed, deterministic roadmap of the whole greenfield pipeline - one string, printed by every
// skill at every human-facing stop, so the human always sees where they are without re-deriving it
// themselves. Position is computed from the stage value below, never guessed by the model.
// Only the four real stages. An earlier version interleaved a literal 'Review' step between each
// pair, which rendered as one long line repeating the same context-free word four times and wrapped
// into an illegible block in any real terminal - the review pause is a property of every stage, so
// it is stated once in the pre-flight notice instead of being fake-staged four times here.
const ROADMAP_STEPS = [
  { short: 'Site map', blurb: 'crawl the app, and work out what each page is for' },
  { short: 'Feature map', blurb: 'group those pages into features, and work out what the app is made of' },
  { short: 'Test conditions', blurb: 'decide what should be tested' },
  { short: 'Test cases', blurb: 'turn those into concrete, readable test cases' },
  { short: 'Automated tests', blurb: 'write the real test code and run it' },
  { short: 'Test closure', blurb: 'check what is covered, and decide whether that is enough' },
];

// Each stage has two distinguishable positions - being worked on, and waiting for the human's
// review - so a stage index alone cannot say which of the two the human is looking at.
const STAGE_POSITION = {
  'not-started': { index: 0, phase: 'run' },
  'site-map-reviewed': { index: 1, phase: 'run' },
  'feature-map-pending-review': { index: 1, phase: 'review' },
  'feature-map-reviewed': { index: 2, phase: 'run' },
  'test-conditions-pending-review': { index: 2, phase: 'review' },
  'test-conditions-reviewed': { index: 3, phase: 'run' },
  'test-cases-drafted': { index: 4, phase: 'run' },
  // The last stage is a stage, not a finish line. Whether the suite may actually be closed is
  // scripts/coverage-status.mjs's answer, computed from exit criteria; duplicating that judgment
  // here would give the project two places to disagree about whether it is done.
  'test-closure': { index: 5, phase: 'run' },
};

function positionFor(stage) {
  return STAGE_POSITION[stage] || { index: 0, phase: 'run' };
}

// The current stage is marked by brackets alone - the same convention the test-case artifacts use
// for a value under discussion. An earlier version appended "<- you are here", which restated in
// four words what the brackets already say and pushed the line past the terminal's width.
function formatRoadmap(stage) {
  const position = STAGE_POSITION[stage];
  return ROADMAP_STEPS.map(function (step, i) {
    const label = 'S' + (i + 1) + ' ' + step.short;
    if (!position || i !== position.index) return label;
    return '[' + label + ']';
  }).join(' -> ');
}

// Route-level counters a human-facing report can print without re-deriving them from raw artifacts
// itself - zero model involvement, same as every other computation in this script.
function computeRouteCoverage(siteMap, featureMap, testConditions, journeys) {
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
    routesWithIntent: featureMap ? Object.keys(featureMap.routes || {}).length : 0,
    routeIntentReviewed: countReviewedTrue(featureMap && featureMap.routes),
    features: featureMap ? Object.keys(featureMap.features || {}).length : 0,
    featuresReviewed: countReviewedTrue(featureMap && featureMap.features),
    entities: featureMap ? Object.keys(featureMap.entities || {}).length : 0,
    entitiesReviewed: countReviewedTrue(featureMap && featureMap.entities),
    testConditionsReviewed: countRoutesWithReviewedCondition(testConditions && testConditions.routes),
    testCasesDrafted: journeys.filter(function (j) {
      return j && j.testCase;
    }).length,
    automated: journeys.filter(function (j) {
      return j && j.testCase && j.reviewed === true;
    }).length,
    // A journey that walks a feature across routes rather than testing one screen. Counted on its
    // own because it is the shape a route-keyed pipeline could not produce at all.
    featureJourneys: journeys.filter(function (j) {
      return j && j.breadth === 'e2e';
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
function computeStageTimings(siteMap, featureMap, testConditions, journeysData) {
  const points = [];
  if (siteMap && siteMap.generatedAt) {
    points.push({ label: 'Stage 1: Site map crawled', timestamp: siteMap.generatedAt });
  }
  if (featureMap && featureMap.generatedAt) {
    points.push({ label: 'Stage 2: Feature map derived', timestamp: featureMap.generatedAt });
  }
  if (testConditions && testConditions.generatedAt) {
    points.push({ label: 'Stage 3: Test conditions defined', timestamp: testConditions.generatedAt });
  }
  if (journeysData && journeysData.generatedAt) {
    points.push({ label: 'Stage 4: Test cases drafted', timestamp: journeysData.generatedAt });
  }
  if (journeysData && journeysData.lastUpdatedAt) {
    points.push({ label: 'Stage 5: Test cases automated', timestamp: journeysData.lastUpdatedAt });
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

// Rendered in the same block shape as every skill briefing it follows: a heading on its own line,
// its text below, one blank line between blocks, and [WARNING] / [NOTE] on the two facts a
// first-time user must not miss. The current stage carries the same brackets as the roadmap, and
// the descriptions share one column wide enough for the bracketed name, whichever stage that is.
function computePreFlightNotice(stage, coverage) {
  const position = positionFor(stage);
  const names = ROADMAP_STEPS.map(function (step, i) {
    return i === position.index ? '[' + step.short + ']' : step.short;
  });
  const widest = names.reduce(function (max, name) {
    return Math.max(max, name.length);
  }, 0);
  const stageLines = ROADMAP_STEPS.map(function (step, i) {
    return '  ' + (i + 1) + '. ' + names[i] + ' '.repeat(widest - names[i].length) + '  ' + step.blurb;
  });
  const blocks = [
    ROADMAP_STEPS.length + ' stages, each one ending with your review:\\n\\n' + stageLines.join('\\n'),
    '[WARNING] Time and cost:\\n' + COST_WARNING,
    '[NOTE] Your control:\\n' + HUMAN_GATES_DISCLOSURE,
  ];
  if (coverage.likelyPhantomRoutes > 0) {
    blocks.push(
      '[NOTE] Routes that look like crawler artifacts:\\n' +
        coverage.likelyPhantomRoutes +
        " route(s) already on record were found only via a hidden link and open an empty or error page. They'll be called out separately at the next review, not treated as equal active routes.",
    );
  }
  return blocks.join('\\n\\n');
}

function computeStatus(siteMap, featureMap, testConditions, journeysData) {
  if (!siteMap) {
    return {
      stage: 'not-started',
      nextCommand: '/map-site create',
      nextCommandDescription: 'No site map yet - run /map-site create to crawl the application.',
    };
  }

  if (!featureMap) {
    return {
      stage: 'site-map-reviewed',
      nextCommand: '/map-features',
      nextCommandDescription:
        'The site map exists. Run /map-features to work out what each page is for, group them into features, and derive the application\\'s entities and their lifecycles.',
    };
  }
  if (!featureMapFullyReviewed(featureMap)) {
    return {
      stage: 'feature-map-pending-review',
      nextCommand: null,
      nextCommandDescription:
        'A feature map exists, but not every feature, entity and page in it is reviewed yet. Review the Feature-Map Review Artifact from /map-features, then approve entries in conversation.',
    };
  }

  if (!testConditions) {
    return {
      stage: 'feature-map-reviewed',
      nextCommand: '/define-test-conditions',
      nextCommandDescription: 'The feature map is reviewed. Run /define-test-conditions next.',
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

  const journeys = collectJourneys(journeysData);

  if (!everyReviewedRouteHasDraftedTestCase(testConditions.routes, journeys)) {
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
    stage: 'test-closure',
    nextCommand: null,
    nextCommandDescription:
      'Every drafted test case has been automated. Run node scripts/coverage-status.mjs for the exit-criteria verdict - it names what is still uncovered and why. Closing a gap means going back to the stage that owns it (/map-site update for new routes, /map-features for a changed domain, /define-test-conditions for changed ones); closing the suite means deciding the remaining gaps are acceptable.',
  };
}

// A review file a person edited that nobody has applied yet: their approvals and corrections are on
// disk, but not in the JSON the next stage reads. Compared with the rendering the file was made from,
// which render-review-artifact.mjs keeps beside it.
function pendingReviewEdits() {
  const pending = [];
  const tidy = function (text) {
    return String(text)
      .replace(/\\r\\n/g, '\\n')
      .split('\\n')
      .map(function (line) {
        return line.replace(/\\s+$/, '');
      })
      .join('\\n')
      .trim();
  };
  for (const kind of ['site-map', 'feature-map', 'test-conditions']) {
    const view = path.join(REVIEW_DIR, kind + '-review.md');
    const base = path.join(REVIEW_DIR, '.base', kind + '-review.json');
    if (!fs.existsSync(view) || !fs.existsSync(base)) continue;
    const rendered = loadJson(base);
    if (!rendered || typeof rendered.text !== 'string') continue;
    if (tidy(fs.readFileSync(view, 'utf8')) === tidy(rendered.text)) continue;
    pending.push({
      kind: kind,
      filePath: 'artifacts/review/' + kind + '-review.md',
      apply: 'node scripts/apply-review.mjs --kind=' + kind,
    });
  }
  return pending;
}

function main() {
  const siteMap = loadJson(SITE_MAP_PATH);
  const featureMap = loadJson(FEATURE_MAP_PATH);
  const testConditions = loadJson(TEST_CONDITIONS_PATH);
  const journeysData = loadJson(JOURNEYS_PATH);

  const status = computeStatus(siteMap, featureMap, testConditions, journeysData);
  const roadmap = formatRoadmap(status.stage);
  const routeCoverage = computeRouteCoverage(
    siteMap,
    featureMap,
    testConditions,
    collectJourneys(journeysData),
  );
  const stageTimings = computeStageTimings(siteMap, featureMap, testConditions, journeysData);
  const preFlightNotice = computePreFlightNotice(status.stage, routeCoverage);

  process.stdout.write(
    JSON.stringify(
      Object.assign(
        {
          roadmap: roadmap,
          routeCoverage: routeCoverage,
          stageTimings: stageTimings,
          preFlightNotice: preFlightNotice,
          pendingReviewEdits: pendingReviewEdits(),
        },
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
