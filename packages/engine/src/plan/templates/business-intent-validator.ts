// Template for generating scripts/validate-business-intent.mjs. create-if-absent.
// The mechanical gate ADR 0012 Decision item 2 requires at every stage boundary ("validates the
// artifact's shape and internal consistency... with zero model involvement before an LLM or a
// human ever reviews its content") for artifacts/analysis/business-intent.json (Stage 1). Zero
// dependencies, mirroring scripts/orchestrate-swarm.mjs's own style, rather than introducing ajv -
// this repo has never added a runtime schema-validation dependency (StackProfile/GenerationPlan
// use hand-written interfaces checked only by tsc; site-map.schema.json is documentation only).

export function renderBusinessIntentValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/analysis/business-intent.json.
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
const REPORT_PATH = path.join(CWD, 'artifacts', 'analysis', 'business-intent.json');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

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
const STRONG_SIGNALS = new Set(['heading-text', 'aria-roles', 'manual']);
const MEDIUM_SIGNALS = new Set(['form-labels', 'button-link-text']);

// Confidence is computed from evidence signal strength, never chosen freely by the model - this
// mirrors the rule /map-site Step 6's own prose spells out, so the model can compute the same
// value itself; this function exists to mechanically catch drift, not to silently rewrite it.
function expectedConfidence(evidence) {
  if (!Array.isArray(evidence)) return null;
  if (evidence.some((e) => e && STRONG_SIGNALS.has(e.signal))) return 'high';
  if (evidence.some((e) => e && MEDIUM_SIGNALS.has(e.signal))) return 'medium';
  return 'low';
}

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

function checkEvidenceArray(evidenceArr, label, errors) {
  if (!Array.isArray(evidenceArr) || evidenceArr.length === 0) {
    errors.push(label + ' must be a non-empty array - never emit a value with no evidence.');
    return;
  }
  evidenceArr.forEach((ev, i) => {
    const evLabel = label + '[' + i + ']';
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
  if (typeof value.reasoning !== 'string' || value.reasoning.length === 0) {
    errors.push(
      label + '.reasoning must be a non-empty string naming the matched checklist criterion.',
    );
  }
  checkEvidenceArray(value.evidence, label + '.evidence', errors);
  if (Array.isArray(value.evidence)) {
    value.evidence.forEach((ev, i) => {
      if (
        ev &&
        typeof value.reasoning === 'string' &&
        typeof ev.excerpt === 'string' &&
        value.reasoning === ev.excerpt
      ) {
        errors.push(
          label + '.reasoning must not simply restate evidence[' + i + '].excerpt verbatim.',
        );
      }
    });
    const expected = expectedConfidence(value.evidence);
    if (expected && CONFIDENCE_VALUES.has(value.confidence) && value.confidence !== expected) {
      errors.push(
        label +
          '.confidence is "' +
          value.confidence +
          '" but its evidence signals imply "' +
          expected +
          '" (heading-text/aria-roles/manual -> high, form-labels/button-link-text -> medium, route-path only -> low).',
      );
    }
  }
}

// Optional, app-level - see CorePurpose's own doc comment in business-intent.types.ts. Only
// validated when present at all; an older report predating this feature has none, which is valid.
function checkCorePurpose(corePurpose, errors) {
  if (corePurpose === undefined) return;
  const label = 'corePurpose';
  if (!corePurpose || typeof corePurpose !== 'object') {
    errors.push(label + ' must be an object when present.');
    return;
  }
  if (!Array.isArray(corePurpose.candidates) || corePurpose.candidates.length === 0) {
    errors.push(label + '.candidates must be a non-empty array.');
  } else {
    corePurpose.candidates.forEach((c, i) => {
      const cLabel = label + '.candidates[' + i + ']';
      if (!c || typeof c !== 'object') {
        errors.push(cLabel + ' must be an object.');
        return;
      }
      if (typeof c.value !== 'string' || c.value.length === 0) {
        errors.push(cLabel + '.value must be a non-empty string.');
      }
      checkEvidenceArray(c.evidence, cLabel + '.evidence', errors);
    });
    if (
      !Number.isInteger(corePurpose.mostLikelyIndex) ||
      corePurpose.mostLikelyIndex < 0 ||
      corePurpose.mostLikelyIndex >= corePurpose.candidates.length
    ) {
      errors.push(
        label + '.mostLikelyIndex must be a valid index into candidates (found ' +
          JSON.stringify(corePurpose.mostLikelyIndex) + ').',
      );
    }
  }
  if (typeof corePurpose.reviewed !== 'boolean') {
    errors.push(label + '.reviewed must be a boolean.');
  }
  if (
    corePurpose.reviewed === true &&
    corePurpose.reviewedBy !== 'human' &&
    corePurpose.reviewedBy !== 'auto-pilot'
  ) {
    errors.push(label + '.reviewedBy must be "human" or "auto-pilot" when reviewed is true.');
  }
  if ('selected' in corePurpose && corePurpose.selected !== undefined) {
    isField(corePurpose.selected, label + '.selected', errors);
  }
  if (corePurpose.reviewed === true && corePurpose.selected === undefined) {
    errors.push(label + '.selected is required once reviewed is true.');
  }
}

function validate() {
  const errors = [];
  const report = loadJson(REPORT_PATH, 'artifacts/analysis/business-intent.json');
  if (report.error) {
    errors.push(report.error);
    return { status: 'FAILED', errors };
  }
  const data = report.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'artifacts/analysis/business-intent.json must contain a JSON object, found ' +
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

  checkCorePurpose(data.corePurpose, errors);

  const siteMap = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json');
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
    if (entry.reviewed === true && entry.reviewedBy !== 'human' && entry.reviewedBy !== 'auto-pilot') {
      errors.push(label + '.reviewedBy must be "human" or "auto-pilot" when reviewed is true.');
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
          ' has no matching routeId in artifacts/site-map/site-map.json - dangling reference. Re-run /map-site or remove this entry.',
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
