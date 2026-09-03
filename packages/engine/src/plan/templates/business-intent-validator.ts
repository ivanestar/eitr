// Template for generating scripts/validate-business-intent.mjs. create-if-absent.
// The mechanical gate ADR 0012 Decision item 2 requires at every stage boundary ("validates the
// artifact's shape and internal consistency... with zero model involvement before an LLM or a
// human ever reviews its content") for docs/analysis/business-intent.json (Stage 1). Zero
// dependencies, mirroring scripts/orchestrate-swarm.mjs's own style, rather than introducing ajv -
// this repo has never added a runtime schema-validation dependency (StackProfile/GenerationPlan
// use hand-written interfaces checked only by tsc; site-map.schema.json is documentation only).

export function renderBusinessIntentValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for docs/analysis/business-intent.json.
 * Zero model involvement - pure structural checks, run by /map-site's Step 6 before presenting
 * results at the Human Sign-Off Gateway.
 *
 * Usage:
 *   node scripts/validate-business-intent.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const REPORT_PATH = path.join(CWD, 'docs', 'analysis', 'business-intent.json');
const SITE_MAP_PATH = path.join(CWD, 'docs', 'site-map', 'site-map.json');

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const CRITICALITY_VALUES = new Set(['critical', 'high', 'medium', 'low']);
const SOURCE_VALUES = new Set([
  'route-path',
  'heading-text',
  'form-labels',
  'button-link-text',
  'aria-roles',
  'manual',
]);

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

function isField(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (!('value' in value)) errors.push(label + '.value is required.');
  if (!CONFIDENCE_VALUES.has(value.confidence)) {
    errors.push(label + '.confidence must be one of high|medium|low.');
  }
  if (!SOURCE_VALUES.has(value.source)) {
    errors.push(
      label +
        '.source must be one of route-path|heading-text|form-labels|button-link-text|aria-roles|manual.',
    );
  }
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
    errors.push(label + '.evidence must be a non-empty array - never emit a value with no evidence.');
  } else {
    value.evidence.forEach((ev, i) => {
      const evLabel = label + '.evidence[' + i + ']';
      if (!ev || typeof ev !== 'object') {
        errors.push(evLabel + ' must be an object.');
        return;
      }
      if (!SOURCE_VALUES.has(ev.signal)) {
        errors.push(evLabel + '.signal must be a known signal.');
      }
      if (typeof ev.excerpt !== 'string') {
        errors.push(evLabel + '.excerpt must be a string.');
      } else if (ev.excerpt.length > 100) {
        errors.push(evLabel + '.excerpt must be <=100 chars (PII/session-data guard).');
      }
    });
  }
}

function validate() {
  const errors = [];
  const report = loadJson(REPORT_PATH, 'docs/analysis/business-intent.json');
  if (report.error) {
    errors.push(report.error);
    return { status: 'FAILED', errors };
  }
  const data = report.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'docs/analysis/business-intent.json must contain a JSON object, found ' +
        JSON.stringify(data) +
        '.',
    );
    return { status: 'FAILED', errors };
  }

  if (data.schemaVersion !== 1) {
    errors.push(
      'schemaVersion must be exactly 1 (found ' +
        JSON.stringify(data.schemaVersion) +
        '). Treat as absent and re-run /map-site Step 6 rather than migrating in place.',
    );
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (!data.routes || typeof data.routes !== 'object' || Array.isArray(data.routes)) {
    errors.push('routes must be an object keyed by routeId.');
    return { status: 'FAILED', errors };
  }

  const siteMap = loadJson(SITE_MAP_PATH, 'docs/site-map/site-map.json');
  const knownRouteIds = new Set();
  if (!siteMap.error && siteMap.value && typeof siteMap.value.routes === 'object') {
    for (const route of Object.values(siteMap.value.routes)) {
      if (route && typeof route.routeId === 'string') knownRouteIds.add(route.routeId);
    }
  }

  for (const [key, entry] of Object.entries(data.routes)) {
    const label = 'routes["' + key + '"]';
    if (!entry || typeof entry !== 'object') {
      errors.push(label + ' must be an object.');
      continue;
    }
    if (entry.routeId !== key) {
      errors.push(label + '.routeId must equal its own key ("' + key + '").');
    }
    if (typeof entry.sourceContentHash !== 'string' || entry.sourceContentHash.length === 0) {
      errors.push(label + '.sourceContentHash must be a non-empty string.');
    }
    if (typeof entry.analyzedAt !== 'string' || entry.analyzedAt.length === 0) {
      errors.push(label + '.analyzedAt must be a non-empty string.');
    }
    if (typeof entry.reviewed !== 'boolean') {
      errors.push(label + '.reviewed must be a boolean.');
    }
    isField(entry.businessFeature, label + '.businessFeature', errors);
    isField(entry.criticalityTier, label + '.criticalityTier', errors);
    if (entry.businessFeature && typeof entry.businessFeature === 'object') {
      if (typeof entry.businessFeature.value !== 'string') {
        errors.push(label + '.businessFeature.value must be a string.');
      } else if (entry.businessFeature.value.length > 40) {
        errors.push(label + '.businessFeature.value must be <=40 characters.');
      }
    }
    if (
      entry.criticalityTier &&
      typeof entry.criticalityTier === 'object' &&
      !CRITICALITY_VALUES.has(entry.criticalityTier.value)
    ) {
      errors.push(label + '.criticalityTier.value must be one of critical|high|medium|low.');
    }
    if (!siteMap.error && !knownRouteIds.has(key)) {
      errors.push(
        label +
          ' has no matching routeId in docs/site-map/site-map.json - dangling reference. Re-run /map-site or remove this entry.',
      );
    }
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
