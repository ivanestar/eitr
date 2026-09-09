// Template for scripts/coverage-status.mjs вЂ” the deterministic answer to "is this test suite done
// yet", computed entirely from artifacts that already exist.
//
// Every other stage in this pipeline can say what it produced; none of them could say whether what
// was produced is enough. That question was left to eyeballing counts, which is exactly how a run
// ends up "finished" with 80 drafted test cases never automated. The criteria here are the ISTQB
// notion of exit criteria made checkable: each one is a plain fact about the artifacts, so the
// answer is the same for everybody and costs nothing to recompute.
//
// It deliberately reports rather than gates. A team can legitimately decide to ship with a route
// uncovered; what they should not be able to do is not notice.
export function renderCoverageStatus(): string {
  return `#!/usr/bin/env node

/**
 * Reports how much of what this project set out to test is actually covered - zero model
 * involvement, safe to run at any time.
 *
 * Usage:
 *   node scripts/coverage-status.mjs
 *
 * Exit code is always 0: this is a report, not a gate. A criterion that is not met is a fact for a
 * human to act on or consciously accept, not a build failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const TEST_CASES_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');
const API_CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function routeEntries(siteMap) {
  if (!siteMap || !siteMap.routes || typeof siteMap.routes !== 'object') return [];
  return Object.entries(siteMap.routes)
    .filter(([, route]) => route && route.status === 'active')
    .map(([routePath, route]) => ({ path: routePath, routeId: route.routeId, route }));
}

function collectJourneys(journeysData) {
  if (!journeysData || typeof journeysData.journeys !== 'object' || journeysData.journeys === null) {
    return [];
  }
  return Object.values(journeysData.journeys).filter(Boolean);
}

// A criterion is a named question with a yes/no answer and, when the answer is no, the exact items
// that make it no - never just a count. "3 routes uncovered" sends someone hunting; naming them
// does not.
function criterion(id, question, gaps, checked) {
  return {
    id,
    question,
    checked,
    met: gaps.length === 0,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 25),
    gapsTruncated: Math.max(0, gaps.length - 25),
  };
}

function main() {
  const siteMap = loadJson(SITE_MAP_PATH);
  const testConditions = loadJson(TEST_CONDITIONS_PATH);
  const journeysData = loadJson(TEST_CASES_PATH);
  const apiContracts = loadJson(API_CONTRACTS_PATH);

  const routes = routeEntries(siteMap);
  const pathByRouteId = new Map(routes.map((r) => [r.routeId, r.path]));
  const journeys = collectJourneys(journeysData);

  // A journey can walk several routes, so route coverage is the union of what every journey
  // touches - counting only a journey's first route would leave every later step of a feature walk
  // reported as untested.
  function routeIdsCovered(predicate) {
    const covered = new Set();
    for (const journey of journeys) {
      if (!predicate(journey)) continue;
      for (const routeId of journey.routeIds || []) covered.add(routeId);
    }
    return covered;
  }
  const automatedRouteIds = routeIdsCovered((j) => j.testCase && j.reviewed === true);
  const draftedRouteIds = routeIdsCovered((j) => Boolean(j.testCase));

  const featureMap = loadJson(FEATURE_MAP_PATH);
  const intentRoutes = featureMap && typeof featureMap.routes === 'object' ? featureMap.routes : {};
  const tierByRouteId = new Map();
  for (const entry of Object.values(intentRoutes)) {
    if (entry && entry.routeId && entry.criticality) {
      tierByRouteId.set(entry.routeId, entry.criticality.value);
    }
  }

  const criteria = [];

  // 1. The one that matters most: an important route with no automated test at all.
  const importantUnautomated = routes
    .filter((r) => {
      const tier = tierByRouteId.get(r.routeId);
      return (tier === 'high' || tier === 'medium') && !automatedRouteIds.has(r.routeId);
    })
    .map((r) => r.path + ' (' + (tierByRouteId.get(r.routeId) || 'unknown') + ' impact)');
  criteria.push(
    criterion(
      'important-routes-automated',
      'Does every high- or medium-impact route have at least one automated test?',
      importantUnautomated,
      // Checkable as soon as routes have been classified. A missing test-cases.json is not a
      // missing input here - it is a definitive "nothing is automated yet", which is exactly the
      // answer this criterion should give mid-pipeline rather than staying silent until the end.
      featureMap !== null,
    ),
  );

  // 2. Work that was drafted and then quietly abandoned - the 12-of-92 failure mode.
  const draftedNotAutomated = journeys
    .filter((j) => j.testCase && j.reviewed !== true)
    .map(
      (j) =>
        (j.routeIds || []).map((routeId) => pathByRouteId.get(routeId) || routeId).join(' -> ') +
        ': ' +
        (j.testCase.title || 'untitled'),
    );
  criteria.push(
    criterion(
      'drafted-test-cases-automated',
      'Has every drafted test case actually been automated?',
      draftedNotAutomated,
      journeysData !== null,
    ),
  );

  // 3. A reviewed condition that never became a test case is analysis nobody acted on.
  const conditionRoutes =
    testConditions && typeof testConditions.routes === 'object' ? testConditions.routes : {};
  const reviewedConditionsNotDrafted = [];
  for (const entry of Object.values(conditionRoutes)) {
    if (!entry || !Array.isArray(entry.conditions)) continue;
    const hasReviewed = entry.conditions.some((c) => c && c.reviewed === true);
    if (hasReviewed && !draftedRouteIds.has(entry.routeId)) {
      reviewedConditionsNotDrafted.push(pathByRouteId.get(entry.routeId) || entry.routeId);
    }
  }
  criteria.push(
    criterion(
      'reviewed-conditions-designed',
      'Did every route with approved test conditions get a test case drafted from them?',
      reviewedConditionsNotDrafted,
      testConditions !== null && journeysData !== null,
    ),
  );

  // 4. An endpoint the crawl actually saw, that no test ever exercises, is free coverage left on
  // the floor - the contract is already recorded, so the test is cheap to write.
  const contracts = apiContracts && Array.isArray(apiContracts.contracts) ? apiContracts.contracts : [];
  const apiCoveredRouteIds = routeIdsCovered((j) => j.testCase && j.testInterface === 'api');
  const uncoveredContracts = contracts
    .filter((contract) => {
      const observedFrom = Array.isArray(contract.observedFromRouteIds)
        ? contract.observedFromRouteIds
        : [];
      // A contract observed from no route at all (the login call) has no route-level test to
      // attribute to it, so it is not counted as a gap here.
      return observedFrom.length > 0 && !observedFrom.some((id) => apiCoveredRouteIds.has(id));
    })
    .map((contract) => (contract.method || '?') + ' ' + (contract.pathTemplate || '?'));
  criteria.push(
    criterion(
      'observed-endpoints-tested',
      'Does every endpoint seen in real traffic have an API-level test?',
      uncoveredContracts,
      apiContracts !== null && journeysData !== null,
    ),
  );

  // 5. A feature spanning several routes with no test that walks them is the gap route-level
  // coverage is blind to by construction: every one of its routes can be individually green while
  // nothing checks that what one screen creates turns up on the next. Low-impact features are
  // excluded - they are deliberately not given the most expensive test shape.
  const featureEntries =
    featureMap && typeof featureMap.features === 'object' && featureMap.features !== null
      ? Object.values(featureMap.features)
      : [];
  const walkedFeatureIds = new Set(
    journeys.filter((j) => j.breadth === 'e2e' && j.featureId).map((j) => j.featureId),
  );
  const unwalkedFeatures = featureEntries
    .filter(
      (feature) =>
        feature &&
        feature.reviewed === true &&
        feature.impact !== 'low' &&
        Array.isArray(feature.memberRouteIds) &&
        feature.memberRouteIds.length >= 2 &&
        !walkedFeatureIds.has(feature.featureId),
    )
    .map((feature) => feature.name + ' (' + feature.memberRouteIds.length + ' routes)');
  criteria.push(
    criterion(
      'features-walked-end-to-end',
      'Does every multi-route feature have a test that walks it end to end?',
      unwalkedFeatures,
      featureMap !== null && journeysData !== null,
    ),
  );

  // 6. A route nobody classified cannot be prioritised, so it silently falls out of every count
  // above rather than showing up as uncovered.
  const unclassified = routes
    .filter((r) => !tierByRouteId.has(r.routeId))
    .map((r) => r.path);
  criteria.push(
    criterion(
      'routes-classified',
      'Has every active route been classified with an impact tier?',
      unclassified,
      siteMap !== null && featureMap !== null,
    ),
  );

  const checkable = criteria.filter((c) => c.checked);
  const met = checkable.filter((c) => c.met);
  const notYetCheckable = criteria.filter((c) => !c.checked).map((c) => c.id);

  const summary =
    checkable.length === 0
      ? 'Nothing to measure yet - run the analysis stages first.'
      : met.length +
        ' of ' +
        checkable.length +
        ' exit criteria met' +
        (notYetCheckable.length > 0
          ? ' (' + notYetCheckable.length + ' not measurable yet)'
          : '');

  process.stdout.write(
    JSON.stringify(
      {
        summary,
        // "Done" means every criterion that CAN be measured is met, and nothing is still
        // unmeasurable - a run that never reached a stage is not finished, it is unfinished in a
        // way this report cannot see.
        complete: checkable.length > 0 && met.length === checkable.length && notYetCheckable.length === 0,
        routeCount: routes.length,
        automatedRoutes: automatedRouteIds.size,
        criteria,
        notYetCheckable,
      },
      null,
      2,
    ) + '\\n',
  );
}

main();
`;
}
