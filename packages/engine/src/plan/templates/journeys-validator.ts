// Template for generating scripts/validate-journeys.mjs. create-if-absent.
// Mechanical shape gate for docs/analysis/journeys.json, zero dependencies, same style as
// test-conditions-validator.ts. Supports --stage=structural to run only the pre-drafting subset of
// checks (Gate 1, right after scripts/compose-journeys.mjs runs), or the full check set with no
// flag (Gate 2, after the /design-test-cases skill's LLM step drafts testCase).

export function renderJourneysValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for docs/analysis/journeys.json.
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
const JOURNEYS_PATH = path.join(CWD, 'docs', 'analysis', 'journeys.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'docs', 'analysis', 'test-conditions.json');

const args = process.argv.slice(2);
const stageArg = args.find(function (a) {
  return a.indexOf('--stage=') === 0;
});
const STRUCTURAL_ONLY = stageArg ? stageArg.slice('--stage='.length) === 'structural' : false;

const TEST_LEVEL_VALUES = new Set(['e2e', 'api', 'ui-only']);

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

function isConditionAssignment(value, label, errors, knownConditionIds) {
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
        '" does not exist in docs/analysis/test-conditions.json.',
    );
  }
  if (!TEST_LEVEL_VALUES.has(value.testLevel)) {
    errors.push(label + ".testLevel must be one of 'e2e'|'api'|'ui-only'.");
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
    });
  }
}

function isJourneyEntry(value, label, errors, knownConditionIds, seenJourneyIds, expectedRouteId) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (value.routeId !== expectedRouteId) {
    errors.push(label + '.routeId must equal "' + expectedRouteId + '".');
  }
  if (typeof value.journeyId !== 'string' || value.journeyId.length === 0) {
    errors.push(label + '.journeyId must be a non-empty string.');
  } else if (seenJourneyIds.has(value.journeyId)) {
    errors.push(label + '.journeyId "' + value.journeyId + '" is a duplicate.');
  } else {
    seenJourneyIds.add(value.journeyId);
  }
  if (!Array.isArray(value.conditionAssignments) || value.conditionAssignments.length === 0) {
    errors.push(label + '.conditionAssignments must be a non-empty array.');
  } else {
    value.conditionAssignments.forEach(function (a, i) {
      isConditionAssignment(a, label + '.conditionAssignments[' + i + ']', errors, knownConditionIds);
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
  const loaded = loadJson(JOURNEYS_PATH, 'docs/analysis/journeys.json');
  if (loaded.error) {
    errors.push(loaded.error);
    return { status: 'FAILED', errors };
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'docs/analysis/journeys.json must contain a JSON object, found ' + JSON.stringify(data) + '.',
    );
    return { status: 'FAILED', errors };
  }
  if (data.schemaVersion !== 1) {
    errors.push('schemaVersion must be exactly 1 (found ' + JSON.stringify(data.schemaVersion) + ').');
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (!data.routes || typeof data.routes !== 'object' || Array.isArray(data.routes)) {
    errors.push('routes must be an object keyed by routeId.');
    return { status: 'FAILED', errors };
  }

  const testConditionsLoaded = loadJson(TEST_CONDITIONS_PATH, 'docs/analysis/test-conditions.json');
  const knownConditionIds = testConditionsLoaded.error
    ? null
    : collectKnownConditionIds(testConditionsLoaded.value);

  const seenJourneyIds = new Set();
  for (const [key, entry] of Object.entries(data.routes)) {
    const label = 'routes["' + key + '"]';
    if (!entry || typeof entry !== 'object') {
      errors.push(label + ' must be an object.');
      continue;
    }
    if (entry.routeId !== key) {
      errors.push(label + '.routeId must equal its own key ("' + key + '").');
    }
    if (!Array.isArray(entry.journeys)) {
      errors.push(label + '.journeys must be an array.');
      continue;
    }
    entry.journeys.forEach(function (j, i) {
      isJourneyEntry(j, label + '.journeys[' + i + ']', errors, knownConditionIds, seenJourneyIds, key);
    });
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
