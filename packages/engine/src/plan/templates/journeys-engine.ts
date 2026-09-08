// Template for generating scripts/compose-journeys.mjs. create-if-absent.
// Deterministic bridge from artifacts/analysis/test-conditions.json to
// artifacts/test-cases/test-cases.json: decides how each reviewed condition should be driven, then
// groups conditions into journeys. Zero model involvement.
//
// It answers three separate questions that used to be one 'layer' field:
//   interface - 'ui' or 'api', how the test drives the system.
//   breadth   - 'targeted' or 'e2e'. 'e2e' is only ever a walk across a feature's own routes, never
//               a thorough test of a single screen.
//   level     - 'integration' or 'system', following from the other two.
//
// Interface rules, in priority order:
//   1. A boundary-value/checklist-based condition whose target parameter has html5-constraint
//      evidence -> 'ui': the browser blocks that value before it ever reaches the network, so an
//      API check of it is meaningless.
//   2. A combinatorial/equivalence-partition vector selecting an 'invalid'-kind partition for a
//      parameter with html5-constraint evidence -> 'ui', same reasoning. Keyed to the partition
//      actually selected, so the all-valid anchor can never be downgraded by this rule.
//   3. The route's one all-valid vector - its happy path - runs through the UI, because that is the
//      only interface that proves a person can actually complete it. Unless the route's feature is
//      low-impact and a real API contract exists for it, in which case the cheapest interface that
//      can check it wins: low impact changes what a test costs, never whether it exists.
//   4. Everything else -> 'api'.
//
// Feature-map impact is read here, unlike criticalityTier which this script has always refused. The
// difference is not the source but the gate: a feature's impact only counts once a human has
// approved that feature, and an unreviewed feature is ignored entirely.

export function renderJourneysEngine(): string {
  return `#!/usr/bin/env node

/**
 * Deterministic journey composer for artifacts/test-cases/test-cases.json.
 * Zero model involvement - reads reviewed test conditions, decides how each should be driven, and
 * groups them into journeys.
 *
 * Usage:
 *   node scripts/compose-journeys.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const CWD = process.cwd();
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const API_CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');
const JOURNEYS_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return { value: null, error: label + ' not found at ' + path.relative(CWD, filePath) };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { value: null, error: 'failed to read ' + label + ': ' + err.message };
  }
  try {
    return { value: JSON.parse(raw), error: null };
  } catch (err) {
    return { value: null, error: label + ' is not valid JSON: ' + err.message };
  }
}

// Stable serialization: object keys sorted at every level so two logically-identical
// condition/reviewed pairs hash identically regardless of key-write order.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return (
      '{' +
      keys
        .map(function (k) {
          return JSON.stringify(k) + ':' + stableStringify(value[k]);
        })
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

function journeyId(scope, conditionIds) {
  const sorted = conditionIds.slice().sort();
  return crypto
    .createHash('sha256')
    .update(scope + '|' + JSON.stringify(sorted))
    .digest('hex')
    .slice(0, 16);
}

// Includes technique alongside conditionId/reviewed - conditionId alone hashes only routeId plus
// the parameter-vector content (see test-conditions-types.ts), so a future engine version that
// reclassifies the same vector onto a different technique would otherwise hash identically and be
// silently skipped, preserving a now-stale assignment from the old technique.
function computeSourceConditionsHash(conditions) {
  const triples = conditions
    .map(function (c) {
      return [c.conditionId, c.reviewed, c.technique];
    })
    .sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
  return crypto.createHash('sha256').update(stableStringify(triples)).digest('hex');
}

function paramByName(parameters, name) {
  return parameters.find(function (p) {
    return p.name === name;
  });
}

function hasHtml5ConstraintEvidence(param) {
  return (param.evidence || []).some(function (e) {
    return e && e.signal === 'html5-constraint';
  });
}

// True when every parameter in the vector resolves to a 'valid'-kind partition - the all-valid
// baseline a route's happy path is drawn from. Only meaningful for combinatorial/
// equivalence-partition, whose parameters[] values are always partitionIds.
function isAllValidVector(condition, parameters) {
  for (const [paramName, partitionId] of Object.entries(condition.parameters || {})) {
    const param = paramByName(parameters, paramName);
    if (!param) return false;
    const partition = (param.partitions || []).find(function (p) {
      return p.id === partitionId;
    });
    if (!partition || partition.kind !== 'valid') return false;
  }
  return true;
}

// The html5-constraint override for combinatorial/equivalence-partition: true only when some
// parameter's SELECTED partition is 'invalid'-kind and that parameter's evidence is
// html5-constraint. Never true for the all-valid anchor (it selects no 'invalid'-kind partition by
// construction), so an anchor is never downgraded by this check.
function hasInvalidHtml5ConstraintSelection(condition, parameters) {
  for (const [paramName, partitionId] of Object.entries(condition.parameters || {})) {
    const param = paramByName(parameters, paramName);
    if (!param) continue;
    const partition = (param.partitions || []).find(function (p) {
      return p.id === partitionId;
    });
    if (partition && partition.kind === 'invalid' && hasHtml5ConstraintEvidence(param)) {
      return true;
    }
  }
  return false;
}

// For boundary-value/checklist-based conditions, the target parameter's own entry holds a literal
// probe value instead of a partitionId (per test-conditions.types.ts's documented convention) -
// find it by locating the one parameter whose value does not match any of its own partition ids.
function findLiteralProbeTarget(condition, parameters) {
  for (const [paramName, value] of Object.entries(condition.parameters || {})) {
    const param = paramByName(parameters, paramName);
    if (!param) continue;
    const isPartitionId = (param.partitions || []).some(function (p) {
      return p.id === value;
    });
    if (!isPartitionId) return param;
  }
  return null;
}

function classify(condition, parameters, anchorConditionId, cheapestInterfaceIsApi) {
  // A main flow is only proven by walking it the way a person would.
  if (condition.technique === 'use-case') {
    return { testInterface: 'ui', reason: 'use-case-main-flow' };
  }
  // A transition is an operation on an entity, and an operation is cheapest to exercise where it
  // actually happens rather than through the screen that happens to trigger it.
  if (condition.technique === 'state-transition') {
    return { testInterface: 'api', reason: 'state-transition-default' };
  }
  if (condition.conditionId === anchorConditionId) {
    return cheapestInterfaceIsApi
      ? { testInterface: 'api', reason: 'low-impact-cheapest-interface' }
      : { testInterface: 'ui', reason: 'baseline-valid-vector' };
  }
  if (condition.technique === 'boundary-value' || condition.technique === 'checklist-based') {
    const target = findLiteralProbeTarget(condition, parameters);
    if (target && hasHtml5ConstraintEvidence(target)) {
      return { testInterface: 'ui', reason: 'html5-constraint-override' };
    }
    return {
      testInterface: 'api',
      reason:
        condition.technique === 'checklist-based' ? 'checklist-based-default' : 'boundary-value-default',
    };
  }
  // combinatorial / equivalence-partition, not the anchor
  if (hasInvalidHtml5ConstraintSelection(condition, parameters)) {
    return { testInterface: 'ui', reason: 'html5-constraint-override' };
  }
  return { testInterface: 'api', reason: 'non-baseline-vector' };
}

function findAnchorConditionId(reviewedConditions, parameters) {
  const candidates = reviewedConditions.filter(function (c) {
    return (
      (c.technique === 'combinatorial' || c.technique === 'equivalence-partition') &&
      isAllValidVector(c, parameters)
    );
  });
  if (candidates.length === 0) return null;
  // Deterministic tie-break when more than one all-valid vector exists.
  candidates.sort(function (a, b) {
    return a.conditionId < b.conditionId ? -1 : a.conditionId > b.conditionId ? 1 : 0;
  });
  return candidates[0].conditionId;
}

// A browser test necessarily exercises the assembled system; an API call at a single endpoint
// exercises a seam between components. A journey that walks a feature across routes is a system
// test whichever interface drives it.
function levelFor(testInterface, breadth) {
  if (breadth === 'e2e') return 'system';
  return testInterface === 'ui' ? 'system' : 'integration';
}

// ---------------------------------------------------------------------------
// Inputs beyond test conditions
// ---------------------------------------------------------------------------

// Only reviewed features count. An unreviewed feature map is a draft, and building the shape of a
// test suite on a draft is exactly what every other gate in this pipeline exists to prevent.
function loadReviewedFeatures() {
  const loaded = loadJson(FEATURE_MAP_PATH, 'artifacts/analysis/feature-map.json');
  const data = loaded.value;
  if (!data || typeof data.features !== 'object' || data.features === null) return [];
  return Object.values(data.features).filter(function (feature) {
    return feature && feature.reviewed === true && Array.isArray(feature.memberRouteIds);
  });
}

function loadRoutesWithApiContracts() {
  const loaded = loadJson(API_CONTRACTS_PATH, 'artifacts/site-map/api-contracts.json');
  const data = loaded.value;
  const routeIds = new Set();
  if (!data || !Array.isArray(data.contracts)) return routeIds;
  for (const contract of data.contracts) {
    if (!contract || !Array.isArray(contract.observedFromRouteIds)) continue;
    for (const routeId of contract.observedFromRouteIds) routeIds.add(routeId);
  }
  return routeIds;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function compose() {
  const loaded = loadJson(TEST_CONDITIONS_PATH, 'artifacts/analysis/test-conditions.json');
  if (loaded.error) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: [loaded.error] }, null, 2) + '\\n');
    process.exit(1);
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || !data.routes || typeof data.routes !== 'object') {
    process.stdout.write(
      JSON.stringify(
        { status: 'FAILED', errors: ['artifacts/analysis/test-conditions.json has no routes object.'] },
        null,
        2,
      ) + '\\n',
    );
    process.exit(1);
  }

  const features = loadReviewedFeatures();
  const routesWithApiContracts = loadRoutesWithApiContracts();

  // A route's impact comes from whichever reviewed feature claims it. A route in no feature has no
  // impact signal at all, which is treated as "not low" - never as low.
  const impactByRouteId = new Map();
  const featureByRouteId = new Map();
  for (const feature of features) {
    for (const routeId of feature.memberRouteIds) {
      impactByRouteId.set(routeId, feature.impact);
      featureByRouteId.set(routeId, feature);
    }
  }

  const perRoute = new Map();
  for (const [routeId, entry] of Object.entries(data.routes)) {
    if (!entry) continue;
    const reviewedConditions = (entry.conditions || []).filter(function (c) {
      return c && c.reviewed === true;
    });
    if (reviewedConditions.length === 0) continue;
    const parameters = entry.parameters || [];
    const anchorId = findAnchorConditionId(reviewedConditions, parameters);
    const cheapestInterfaceIsApi =
      impactByRouteId.get(routeId) === 'low' && routesWithApiContracts.has(routeId);
    const classified = reviewedConditions.map(function (condition) {
      const result = classify(condition, parameters, anchorId, cheapestInterfaceIsApi);
      return {
        condition: condition,
        testInterface: result.testInterface,
        reason: result.reason,
      };
    });
    perRoute.set(routeId, { anchorId: anchorId, classified: classified });
  }

  // Existing journeys are matched by what they cover, not by id: an id changes the moment a
  // condition is added, and matching on it would throw away a human's drafted test case every time
  // the underlying route gained one more condition.
  const existingLoaded = loadJson(JOURNEYS_PATH, 'artifacts/test-cases/test-cases.json');
  const existingByScope = new Map();
  const existingValue = existingLoaded.value;
  if (existingValue && typeof existingValue.journeys === 'object' && existingValue.journeys !== null) {
    for (const journey of Object.values(existingValue.journeys)) {
      if (!journey) continue;
      const scope = journey.featureId
        ? 'feature:' + journey.featureId
        : 'route:' + (journey.routeIds || [])[0] + ':' + journey.testInterface;
      existingByScope.set(scope, journey);
    }
  }

  const journeys = {};
  const consumedConditionIds = new Set();

  function push(scope, entry) {
    const existing = existingByScope.get(scope);
    if (existing && existing.sourceConditionsHash === entry.sourceConditionsHash) {
      journeys[existing.journeyId] = existing;
      return;
    }
    journeys[entry.journeyId] = entry;
  }

  // 1. Feature journeys. A feature's happy path is the one thing in this whole pipeline that has to
  // cross routes: creating something on one screen and finding it on another is the claim a
  // single-route test structurally cannot make. Low-impact features are excluded - the point of a
  // low impact is that it does not warrant the most expensive test shape, not that it warrants none.
  const orderedFeatures = features.slice().sort(function (a, b) {
    return String(a.featureId).localeCompare(String(b.featureId));
  });
  for (const feature of orderedFeatures) {
    if (feature.impact === 'low') continue;
    const steps = [];
    const routesReached = new Set();
    for (const routeId of feature.memberRouteIds) {
      const route = perRoute.get(routeId);
      if (!route) continue;
      // A use-case condition IS the feature's main flow written down - it leads the walk, ahead of
      // the individual route happy paths that make up its steps.
      for (const item of route.classified) {
        if (item.condition.technique !== 'use-case') continue;
        steps.push({ routeId: routeId, item: item });
        routesReached.add(routeId);
      }
      if (!route.anchorId) continue;
      const anchor = route.classified.find(function (item) {
        return item.condition.conditionId === route.anchorId;
      });
      if (!anchor) continue;
      steps.push({ routeId: routeId, item: anchor });
      routesReached.add(routeId);
    }
    // One route is not a journey across a feature - it is that route's own targeted test, and it
    // stays one, however much of a flow its conditions describe.
    if (routesReached.size < 2) continue;

    const conditions = steps.map(function (step) {
      return step.item.condition;
    });
    const conditionIds = conditions.map(function (c) {
      return c.conditionId;
    });
    for (const conditionId of conditionIds) consumedConditionIds.add(conditionId);

    // A feature walk is driven through the UI whenever any of its steps needs to be: a flow is only
    // proven end to end if a person could have walked it.
    const testInterface = steps.some(function (step) {
      return step.item.testInterface === 'ui';
    })
      ? 'ui'
      : 'api';
    push('feature:' + feature.featureId, {
      journeyId: journeyId('feature:' + feature.featureId, conditionIds),
      routeIds: Array.from(routesReached),
      featureId: feature.featureId,
      testInterface: testInterface,
      breadth: 'e2e',
      level: levelFor(testInterface, 'e2e'),
      conditionAssignments: steps.map(function (step) {
        return {
          conditionId: step.item.condition.conditionId,
          routeId: step.routeId,
          reason: 'feature-lifecycle-step',
        };
      }),
      reviewed: false,
      sourceConditionsHash: computeSourceConditionsHash(conditions),
      analyzedAt: new Date().toISOString(),
    });
  }

  // 2. Targeted journeys: everything a feature journey did not consume, grouped per route per
  // interface. A route with both UI and API conditions gets one journey for each, never one journey
  // silently absorbing both and only ever producing a single test case.
  const routeIds = Array.from(perRoute.keys()).sort();
  for (const routeId of routeIds) {
    const route = perRoute.get(routeId);
    for (const testInterface of ['ui', 'api']) {
      const items = route.classified.filter(function (item) {
        return (
          item.testInterface === testInterface && !consumedConditionIds.has(item.condition.conditionId)
        );
      });
      if (items.length === 0) continue;
      const conditions = items.map(function (item) {
        return item.condition;
      });
      const conditionIds = conditions.map(function (c) {
        return c.conditionId;
      });
      const scope = 'route:' + routeId + ':' + testInterface;
      push(scope, {
        journeyId: journeyId(scope, conditionIds),
        routeIds: [routeId],
        testInterface: testInterface,
        breadth: 'targeted',
        level: levelFor(testInterface, 'targeted'),
        conditionAssignments: items.map(function (item) {
          return {
            conditionId: item.condition.conditionId,
            routeId: routeId,
            reason: item.reason,
          };
        }),
        reviewed: false,
        sourceConditionsHash: computeSourceConditionsHash(conditions),
        analyzedAt: new Date().toISOString(),
      });
    }
  }

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    journeys: journeys,
  };
  fs.mkdirSync(path.dirname(JOURNEYS_PATH), { recursive: true });
  fs.writeFileSync(JOURNEYS_PATH, JSON.stringify(report, null, 2) + '\\n', 'utf8');

  const all = Object.values(journeys);
  process.stdout.write(
    JSON.stringify({
      status: 'COMPOSED',
      journeys: all.length,
      featureJourneys: all.filter(function (j) {
        return j.breadth === 'e2e';
      }).length,
      routes: routeIds.length,
    }) + '\\n',
  );
}

compose();
`;
}
