// Template for generating scripts/validate-journeys.mjs. create-if-absent.
// Mechanical shape gate for artifacts/test-cases/test-cases.json, zero dependencies, same style as
// test-conditions-validator.ts. Supports --stage=structural to run only the pre-drafting subset of
// checks (Gate 1, right after scripts/compose-journeys.mjs runs), or the full check set with no
// flag (Gate 2, after the /design-test-cases skill's LLM step drafts testCase).

export function renderJourneysValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/test-cases/test-cases.json.
 * Zero model involvement - pure structural checks, run by /design-test-cases before Gate 1
 * (--stage=structural) and again in full (Gate 2) after the test case is drafted.
 *
 * Usage:
 *   node scripts/validate-journeys.mjs [--stage=structural]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const JOURNEYS_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');

const args = process.argv.slice(2);
const stageArg = args.find(function (a) {
  return a.indexOf('--stage=') === 0;
});
const STRUCTURAL_ONLY = stageArg ? stageArg.slice('--stage='.length) === 'structural' : false;

const INTERFACE_VALUES = new Set(['ui', 'api']);
const BREADTH_VALUES = new Set(['targeted', 'e2e']);
const LEVEL_VALUES = new Set(['integration', 'system']);

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

function collectKnownConditionIds(testConditions) {
  const known = new Set();
  if (!testConditions || typeof testConditions.routes !== 'object') return known;
  for (const entry of Object.values(testConditions.routes)) {
    if (!entry || !Array.isArray(entry.conditions)) continue;
    for (const c of entry.conditions) {
      if (c && typeof c.conditionId === 'string') known.add(c.conditionId);
    }
  }
  return known;
}

function isConditionAssignment(value, label, errors, knownConditionIds, journeyRouteIds) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.conditionId !== 'string' || value.conditionId.length === 0) {
    errors.push(label + '.conditionId must be a non-empty string.');
  } else if (knownConditionIds && !knownConditionIds.has(value.conditionId)) {
    errors.push(
      label +
        '.conditionId "' +
        value.conditionId +
        '" does not exist in artifacts/analysis/test-conditions.json.',
    );
  }
  if (typeof value.routeId !== 'string' || value.routeId.length === 0) {
    errors.push(label + '.routeId must be a non-empty string.');
  } else if (journeyRouteIds && journeyRouteIds.indexOf(value.routeId) === -1) {
    errors.push(
      label + '.routeId "' + value.routeId + '" is not one of the routes this journey walks.',
    );
  }
  if (typeof value.reason !== 'string' || value.reason.length === 0) {
    errors.push(label + '.reason must be a non-empty string.');
  }
}

function isDraftTestCase(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.title !== 'string' || value.title.length === 0) {
    errors.push(label + '.title must be a non-empty string.');
  }
  if (
    !Array.isArray(value.preconditions) ||
    !value.preconditions.every(function (p) {
      return typeof p === 'string';
    })
  ) {
    errors.push(label + '.preconditions must be an array of strings.');
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    errors.push(label + '.steps must be a non-empty array.');
  } else {
    value.steps.forEach(function (s, i) {
      const sLabel = label + '.steps[' + i + ']';
      if (!s || typeof s !== 'object') {
        errors.push(sLabel + ' must be an object.');
        return;
      }
      if (typeof s.description !== 'string' || s.description.length === 0) {
        errors.push(sLabel + '.description must be a non-empty string.');
      }
      if (typeof s.expectedResult !== 'string' || s.expectedResult.length === 0) {
        errors.push(sLabel + '.expectedResult must be a non-empty string.');
      }
      if (s.api !== undefined) {
        isApiStepDetail(s.api, sLabel + '.api', errors);
      }
    });
  }
}

function isApiStepDetail(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.method !== 'string' || value.method.length === 0) {
    errors.push(label + '.method must be a non-empty string.');
  }
  if (typeof value.path !== 'string' || value.path.length === 0) {
    errors.push(label + '.path must be a non-empty string.');
  }
  if (typeof value.expectedStatus !== 'number') {
    errors.push(label + '.expectedStatus must be a number.');
  }
  if (typeof value.contractGrounded !== 'boolean') {
    errors.push(label + '.contractGrounded must be a boolean.');
  }
}

function isJourneyEntry(value, label, errors, knownConditionIds, expectedJourneyId) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.journeyId !== 'string' || value.journeyId.length === 0) {
    errors.push(label + '.journeyId must be a non-empty string.');
  } else if (value.journeyId !== expectedJourneyId) {
    errors.push(label + '.journeyId must equal its own key ("' + expectedJourneyId + '").');
  }
  if (!Array.isArray(value.routeIds) || value.routeIds.length === 0) {
    errors.push(label + '.routeIds must be a non-empty array - a journey walks at least one route.');
  }
  if (!INTERFACE_VALUES.has(value.testInterface)) {
    errors.push(label + ".testInterface must be 'ui' or 'api'.");
  }
  if (!BREADTH_VALUES.has(value.breadth)) {
    errors.push(label + ".breadth must be 'targeted' or 'e2e'.");
  }
  if (!LEVEL_VALUES.has(value.level)) {
    errors.push(label + ".level must be 'integration' or 'system'.");
  }
  // A browser-driven test exercises the assembled system, and so does any walk across a feature.
  // Only an API call at a single endpoint is an integration test, so that is the only combination
  // the level 'integration' can describe.
  if (
    value.level === 'integration' &&
    !(value.testInterface === 'api' && value.breadth === 'targeted')
  ) {
    errors.push(
      label +
        ".level 'integration' only describes a targeted API journey; a UI journey or a feature walk exercises the assembled system.",
    );
  }
  // 'e2e' means a walk across a feature, not a thorough test of one screen.
  if (value.breadth === 'e2e') {
    if (typeof value.featureId !== 'string' || value.featureId.length === 0) {
      errors.push(label + ".breadth 'e2e' requires a featureId naming the feature being walked.");
    }
    if (Array.isArray(value.routeIds) && value.routeIds.length < 2) {
      errors.push(
        label + ".breadth 'e2e' requires at least 2 routes - a single-route journey is targeted.",
      );
    }
  } else if (value.featureId !== undefined) {
    errors.push(label + '.featureId is only meaningful on a journey walking a feature.');
  }
  if (value.acceptanceCriterion !== undefined) {
    const criterion = value.acceptanceCriterion;
    if (!criterion || typeof criterion !== 'object') {
      errors.push(label + '.acceptanceCriterion must be an object when present.');
    } else {
      // Nothing in this pipeline can observe who signs a release off, so this field has exactly one
      // legitimate origin.
      if (criterion.statedBy !== 'human') {
        errors.push(label + ".acceptanceCriterion.statedBy must be 'human' - nothing else can decide it.");
      }
      if (typeof criterion.statedAt !== 'string' || criterion.statedAt.length === 0) {
        errors.push(label + '.acceptanceCriterion.statedAt must be a non-empty string.');
      }
    }
  }
  if (!Array.isArray(value.conditionAssignments) || value.conditionAssignments.length === 0) {
    errors.push(label + '.conditionAssignments must be a non-empty array.');
  } else {
    value.conditionAssignments.forEach(function (a, i) {
      isConditionAssignment(
        a,
        label + '.conditionAssignments[' + i + ']',
        errors,
        knownConditionIds,
        Array.isArray(value.routeIds) ? value.routeIds : null,
      );
    });
  }
  if (typeof value.sourceConditionsHash !== 'string' || value.sourceConditionsHash.length === 0) {
    errors.push(label + '.sourceConditionsHash must be a non-empty string.');
  }
  if (typeof value.analyzedAt !== 'string' || value.analyzedAt.length === 0) {
    errors.push(label + '.analyzedAt must be a non-empty string.');
  }
  if (typeof value.reviewed !== 'boolean') {
    errors.push(label + '.reviewed must be a boolean.');
  }
  if (value.reviewed === true && value.reviewedBy !== 'human' && value.reviewedBy !== 'auto-pilot') {
    errors.push(label + '.reviewedBy must be "human" or "auto-pilot" when reviewed is true.');
  }
  if (!STRUCTURAL_ONLY && value.testCase !== undefined) {
    isDraftTestCase(value.testCase, label + '.testCase', errors);
  }
}

function validate() {
  const errors = [];
  const loaded = loadJson(JOURNEYS_PATH, 'artifacts/test-cases/test-cases.json');
  if (loaded.error) {
    errors.push(loaded.error);
    return { status: 'FAILED', errors };
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'artifacts/test-cases/test-cases.json must contain a JSON object, found ' + JSON.stringify(data) + '.',
    );
    return { status: 'FAILED', errors };
  }
  if (data.schemaVersion !== 2) {
    errors.push('schemaVersion must be exactly 2 (found ' + JSON.stringify(data.schemaVersion) + ').');
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (!data.journeys || typeof data.journeys !== 'object' || Array.isArray(data.journeys)) {
    errors.push('journeys must be an object keyed by journeyId.');
    return { status: 'FAILED', errors };
  }

  const testConditionsLoaded = loadJson(TEST_CONDITIONS_PATH, 'artifacts/analysis/test-conditions.json');
  const knownConditionIds = testConditionsLoaded.error
    ? null
    : collectKnownConditionIds(testConditionsLoaded.value);

  // One condition belongs to exactly one journey. Two journeys covering the same condition means
  // the same check gets written twice as two separate tests, which nothing downstream would notice.
  const conditionOwner = new Map();
  for (const [key, entry] of Object.entries(data.journeys)) {
    isJourneyEntry(entry, 'journeys["' + key + '"]', errors, knownConditionIds, key);
    const assignments = entry && Array.isArray(entry.conditionAssignments) ? entry.conditionAssignments : [];
    for (const assignment of assignments) {
      if (!assignment || typeof assignment.conditionId !== 'string') continue;
      const owner = conditionOwner.get(assignment.conditionId);
      if (owner !== undefined && owner !== key) {
        errors.push(
          'condition "' +
            assignment.conditionId +
            '" is claimed by two journeys ("' +
            owner +
            '" and "' +
            key +
            '") - it would be tested twice.',
        );
      } else {
        conditionOwner.set(assignment.conditionId, key);
      }
    }
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
