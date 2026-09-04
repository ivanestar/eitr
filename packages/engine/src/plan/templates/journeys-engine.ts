// Template for generating scripts/compose-journeys.mjs. create-if-absent.
// Deterministic bridge from Stage 2's test-conditions.json to artifacts/test-cases/test-cases.json: groups
// each route's reviewed conditions into one journey and classifies every condition onto a test
// level (e2e/api/ui-only). Zero model involvement, zero dependency on criticalityTier or any other
// LLM-derived signal - that judgment is too unstable to gate a structural decision on, even with
// fixed tier definitions, per the design correction this template implements.
//
// Classification rule (in priority order):
//   1. The one all-valid vector among a route's combinatorial/equivalence-partition conditions
//      (every parameter resolves to a 'valid'-kind partition) is the e2e anchor. None if no such
//      vector exists - never forced.
//   2. A boundary-value/checklist-based condition whose target parameter (the one holding a
//      literal probe value, not a partitionId) has html5-constraint evidence -> ui-only: the
//      browser blocks that value before it ever reaches the network, so an API-level check of it
//      is meaningless.
//   3. A combinatorial/equivalence-partition vector (not the anchor) selecting an 'invalid'-kind
//      partition for a parameter with html5-constraint evidence -> ui-only, same reasoning as (2).
//      Keyed to the specific partition actually selected, not merely to the parameter's evidence
//      in general - the all-valid anchor selects no 'invalid'-kind partition by construction, so it
//      can never be downgraded by this rule.
//   4. Everything else -> api (the bulk of coverage, per the Testing Trophy's own "sweet spot").

export function renderJourneysEngine(): string {
  return `#!/usr/bin/env node

/**
 * Deterministic test-level classifier for artifacts/test-cases/test-cases.json.
 * Zero model involvement - reads artifacts/analysis/test-conditions.json's reviewed conditions and
 * classifies each onto a test level, grouping them into one journey per route. Never reads
 * criticalityTier or any other LLM-derived signal.
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

function journeyId(routeId, conditionIds) {
  const sorted = conditionIds.slice().sort();
  return crypto
    .createHash('sha256')
    .update(routeId + '|' + JSON.stringify(sorted))
    .digest('hex')
    .slice(0, 16);
}

// Includes technique alongside conditionId/reviewed - conditionId alone hashes only routeId plus
// the parameter-vector content (see test-conditions-types.ts), so a future engine version that
// reclassifies the same vector onto a different technique would otherwise hash identically and be
// silently skipped, preserving a now-stale conditionAssignments/testLevel from the old technique.
function computeSourceConditionsHash(reviewedConditions) {
  const triples = reviewedConditions
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
// baseline a route's e2e anchor is drawn from. Only meaningful for combinatorial/
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

function classify(condition, parameters, anchorConditionId) {
  if (condition.conditionId === anchorConditionId) {
    return { testLevel: 'e2e', reason: 'baseline-valid-vector' };
  }
  if (condition.technique === 'boundary-value' || condition.technique === 'checklist-based') {
    const target = findLiteralProbeTarget(condition, parameters);
    if (target && hasHtml5ConstraintEvidence(target)) {
      return { testLevel: 'ui-only', reason: 'html5-constraint-override' };
    }
    return {
      testLevel: 'api',
      reason:
        condition.technique === 'checklist-based' ? 'checklist-based-default' : 'boundary-value-default',
    };
  }
  // combinatorial / equivalence-partition, not the anchor
  if (hasInvalidHtml5ConstraintSelection(condition, parameters)) {
    return { testLevel: 'ui-only', reason: 'html5-constraint-override' };
  }
  return { testLevel: 'api', reason: 'non-baseline-vector' };
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

function composeForRoute(routeId, entry, existingJourney) {
  const reviewedConditions = (entry.conditions || []).filter(function (c) {
    return c && c.reviewed === true;
  });
  if (reviewedConditions.length === 0) return null;

  const currentHash = computeSourceConditionsHash(reviewedConditions);
  if (existingJourney && existingJourney.sourceConditionsHash === currentHash) {
    return existingJourney;
  }

  const parameters = entry.parameters || [];
  const anchorId = findAnchorConditionId(reviewedConditions, parameters);
  const conditionAssignments = reviewedConditions.map(function (c) {
    const result = classify(c, parameters, anchorId);
    return { conditionId: c.conditionId, testLevel: result.testLevel, reason: result.reason };
  });
  const conditionIds = reviewedConditions.map(function (c) {
    return c.conditionId;
  });

  return {
    journeyId: journeyId(routeId, conditionIds),
    routeId: routeId,
    conditionAssignments: conditionAssignments,
    reviewed: false,
    sourceConditionsHash: currentHash,
    analyzedAt: new Date().toISOString(),
  };
}

function checkShape(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || !data.routes || typeof data.routes !== 'object') {
    errors.push('artifacts/analysis/test-conditions.json has no routes object.');
  }
  return errors;
}

function compose() {
  const loaded = loadJson(TEST_CONDITIONS_PATH, 'artifacts/analysis/test-conditions.json');
  if (loaded.error) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: [loaded.error] }, null, 2) + '\\n');
    process.exit(1);
  }
  const data = loaded.value;
  const shapeErrors = checkShape(data);
  if (shapeErrors.length > 0) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: shapeErrors }, null, 2) + '\\n');
    process.exit(1);
  }

  const existingLoaded = loadJson(JOURNEYS_PATH, 'artifacts/test-cases/test-cases.json');
  const existingRoutes =
    !existingLoaded.error && existingLoaded.value && typeof existingLoaded.value.routes === 'object'
      ? existingLoaded.value.routes
      : {};

  const routes = {};
  for (const [routeId, entry] of Object.entries(data.routes)) {
    const existingEntry = existingRoutes[routeId];
    const existingJourney =
      existingEntry && Array.isArray(existingEntry.journeys) ? existingEntry.journeys[0] : null;
    const journey = composeForRoute(routeId, entry, existingJourney);
    if (!journey) continue;
    routes[routeId] = { routeId: routeId, journeys: [journey] };
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    routes: routes,
  };
  fs.mkdirSync(path.dirname(JOURNEYS_PATH), { recursive: true });
  fs.writeFileSync(JOURNEYS_PATH, JSON.stringify(report, null, 2) + '\\n', 'utf8');
  process.stdout.write(JSON.stringify({ status: 'COMPOSED', routes: Object.keys(routes).length }) + '\\n');
}

compose();
`;
}
