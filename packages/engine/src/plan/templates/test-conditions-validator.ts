// Template for generating scripts/validate-test-conditions.mjs. create-if-absent.
// The mechanical gate ADR 0012 Decision item 2 requires at every stage boundary for
// docs/analysis/test-conditions.json (Stage 2). Zero dependencies, same style as
// business-intent-validator.ts and site-map-validator.ts. Supports --stage=parameters to run only
// the pre-generation subset of checks (Gate 1 in /derive-test-conditions), or the full check set
// with no flag (Gate 2).

export function renderTestConditionsValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for docs/analysis/test-conditions.json.
 * Zero model involvement - pure structural checks, run by /derive-test-conditions before Gate 1
 * (parameters shape, via --stage=parameters) and again in full (Gate 2) before the Human Sign-Off
 * Gateway.
 *
 * Usage:
 *   node scripts/validate-test-conditions.mjs [--stage=parameters]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const REPORT_PATH = path.join(CWD, 'docs', 'analysis', 'test-conditions.json');
const SITE_MAP_PATH = path.join(CWD, 'docs', 'site-map', 'site-map.json');

const args = process.argv.slice(2);
const stageArg = args.find(function (a) {
  return a.indexOf('--stage=') === 0;
});
const PARAMETERS_ONLY = stageArg ? stageArg.slice('--stage='.length) === 'parameters' : false;

const PARAMETER_KIND_VALUES = new Set([
  'text',
  'number',
  'email',
  'date',
  'select',
  'checkbox',
  'radio',
  'password',
  'other',
]);
const SOURCE_VALUES = new Set([
  'form-label',
  'html5-constraint',
  'aria-relationship',
  'select-option-text',
  'manual',
]);
const PARTITION_KIND_VALUES = new Set(['valid', 'invalid']);
const BOUNDARY_VALUES = new Set(['min', 'max']);
const TECHNIQUE_VALUES = new Set(['combinatorial', 'boundary-value', 'equivalence-partition']);

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

function isEvidenceArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(label + ' must be a non-empty array - never emit a value with no evidence.');
    return;
  }
  value.forEach(function (ev, i) {
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

function isParameter(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.name !== 'string' || value.name.length === 0) {
    errors.push(label + '.name must be a non-empty string.');
  }
  if (!PARAMETER_KIND_VALUES.has(value.kind)) {
    errors.push(label + '.kind must be a known ParameterKind.');
  }
  if (!Array.isArray(value.partitions) || value.partitions.length === 0) {
    errors.push(label + '.partitions must be a non-empty array.');
  } else {
    let hasValid = false;
    value.partitions.forEach(function (p, i) {
      const pLabel = label + '.partitions[' + i + ']';
      if (!p || typeof p !== 'object') {
        errors.push(pLabel + ' must be an object.');
        return;
      }
      if (typeof p.id !== 'string' || p.id.length === 0) {
        errors.push(pLabel + '.id must be a non-empty string.');
      }
      if (!PARTITION_KIND_VALUES.has(p.kind)) {
        errors.push(pLabel + '.kind must be one of valid|invalid.');
      } else if (p.kind === 'valid') {
        hasValid = true;
      }
      if (
        !Array.isArray(p.sampleValues) ||
        !p.sampleValues.every(function (v) {
          return typeof v === 'string';
        })
      ) {
        errors.push(pLabel + '.sampleValues must be an array of strings.');
      }
    });
    // A boundary-bearing parameter with zero 'valid'-kind partitions would crash the generator's
    // boundary-value phase - reject at Gate 1, before generation ever runs.
    if (Array.isArray(value.boundaries) && value.boundaries.length > 0 && !hasValid) {
      errors.push(
        label + " has boundaries but no 'valid'-kind partition - cannot anchor boundary-value conditions.",
      );
    }
  }
  if (!Array.isArray(value.boundaries)) {
    errors.push(label + '.boundaries must be an array.');
  } else {
    value.boundaries.forEach(function (b, i) {
      const bLabel = label + '.boundaries[' + i + ']';
      if (!b || typeof b !== 'object') {
        errors.push(bLabel + ' must be an object.');
        return;
      }
      if (!BOUNDARY_VALUES.has(b.boundary)) {
        errors.push(bLabel + '.boundary must be one of min|max.');
      }
      if (
        !Array.isArray(b.values) ||
        b.values.length !== 3 ||
        !b.values.every(function (v) {
          return typeof v === 'string';
        })
      ) {
        errors.push(bLabel + '.values must be a 3-element array of strings.');
      }
    });
  }
  isEvidenceArray(value.evidence, label + '.evidence', errors);
}

function isConstraint(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  ['ifParam', 'ifPartition', 'thenParam', 'thenExcludesPartition'].forEach(function (field) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      errors.push(label + '.' + field + ' must be a non-empty string.');
    }
  });
}

function isVerificationContract(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (value.network !== undefined) {
    if (!value.network || typeof value.network.status !== 'number') {
      errors.push(label + '.network.status must be a number when network is present.');
    }
  }
}

function isCondition(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.conditionId !== 'string' || value.conditionId.length === 0) {
    errors.push(label + '.conditionId must be a non-empty string.');
  }
  if (!value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters)) {
    errors.push(label + '.parameters must be an object.');
  }
  if (!TECHNIQUE_VALUES.has(value.technique)) {
    errors.push(label + '.technique must be one of combinatorial|boundary-value|equivalence-partition.');
  }
  isVerificationContract(value.verification, label + '.verification', errors);
  if (typeof value.isSpeculative !== 'boolean') {
    errors.push(label + '.isSpeculative must be a boolean.');
  }
  if (typeof value.reviewed !== 'boolean') {
    errors.push(label + '.reviewed must be a boolean.');
  }
  // Business rule: an unverified (isSpeculative) condition can never simultaneously be marked
  // reviewed - reviewed:true is a human's explicit sign-off, which a still-speculative
  // verification contract has not received.
  if (value.isSpeculative === true && value.reviewed === true) {
    errors.push(label + ' cannot have isSpeculative:true and reviewed:true at the same time.');
  }
}

function isUnsatisfiedPair(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  ['paramA', 'partitionA', 'paramB', 'partitionB', 'reason'].forEach(function (field) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      errors.push(label + '.' + field + ' must be a non-empty string.');
    }
  });
}

function validate() {
  const errors = [];
  const report = loadJson(REPORT_PATH, 'docs/analysis/test-conditions.json');
  if (report.error) {
    errors.push(report.error);
    return { status: 'FAILED', errors };
  }
  const data = report.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'docs/analysis/test-conditions.json must contain a JSON object, found ' +
        JSON.stringify(data) +
        '.',
    );
    return { status: 'FAILED', errors };
  }

  if (data.schemaVersion !== 1) {
    errors.push(
      'schemaVersion must be exactly 1 (found ' +
        JSON.stringify(data.schemaVersion) +
        '). Treat as absent and re-run /derive-test-conditions rather than migrating in place.',
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
    if (!Array.isArray(entry.parameters) || entry.parameters.length === 0) {
      errors.push(label + '.parameters must be a non-empty array.');
    } else {
      entry.parameters.forEach(function (p, i) {
        isParameter(p, label + '.parameters[' + i + ']', errors);
      });
    }
    if (!Array.isArray(entry.constraints)) {
      errors.push(label + '.constraints must be an array.');
    } else {
      entry.constraints.forEach(function (c, i) {
        isConstraint(c, label + '.constraints[' + i + ']', errors);
      });
    }
    if (!siteMap.error && !knownRouteIds.has(key)) {
      errors.push(
        label +
          ' has no matching routeId in docs/site-map/site-map.json - dangling reference. Re-run /map-site or remove this entry.',
      );
    }

    if (!PARAMETERS_ONLY) {
      if (!Array.isArray(entry.conditions)) {
        errors.push(label + '.conditions must be an array.');
      } else {
        const seenIds = new Set();
        entry.conditions.forEach(function (c, i) {
          isCondition(c, label + '.conditions[' + i + ']', errors);
          if (c && typeof c.conditionId === 'string') {
            if (seenIds.has(c.conditionId)) {
              errors.push(
                label +
                  '.conditions[' +
                  i +
                  '].conditionId "' +
                  c.conditionId +
                  '" is a duplicate within this route.',
              );
            }
            seenIds.add(c.conditionId);
          }
        });
      }
      if (!Array.isArray(entry.unsatisfiedPairs)) {
        errors.push(label + '.unsatisfiedPairs must be an array.');
      } else {
        entry.unsatisfiedPairs.forEach(function (u, i) {
          isUnsatisfiedPair(u, label + '.unsatisfiedPairs[' + i + ']', errors);
        });
      }
      if (typeof entry.sourceParamsHash !== 'string') {
        errors.push(label + '.sourceParamsHash must be a string.');
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
