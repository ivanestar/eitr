// Template for generating scripts/validate-api-contracts.mjs. create-if-absent.
// Mechanical shape gate for artifacts/site-map/api-contracts.json, zero dependencies, same style as
// site-map-validator.ts / test-conditions-validator.ts. Also mechanically re-checks the PII/
// session-data redaction backstop on every sampleRequestPayload value, the same way
// scripts/generate-test-conditions.mjs backstops evidence excerpts elsewhere in this pipeline.

export function renderApiContractsValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/site-map/api-contracts.json.
 * Zero model involvement - pure structural checks plus a PII-redaction backstop.
 *
 * Usage:
 *   node scripts/validate-api-contracts.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');

// Same digit-shaped thresholds as every other PII/session-data guard in this pipeline (map-site
// Step 6, define-test-conditions Step 2): a run of 6+ consecutive digits, or an 8+-char token where
// digits are the majority, gets masked - never left as a literal value in a checked artifact.
const DIGIT_RUN = /\\d{6,}/;
function isMajorityDigitToken(token) {
  if (token.length < 8) return false;
  const digits = (token.match(/\\d/g) || []).length;
  return digits > token.length / 2;
}

// A raw HTTP request/response body (what sampleRequestPayload actually is) can carry a plaintext
// password, email, or token whose VALUE is not digit-shaped at all - the digit-run backstop above
// would never catch "password": "hunter2". This checks the FIELD NAME instead, unconditionally
// redacting the value regardless of its own shape - a broader net than the digit-shaped guard, and
// deliberately so: over-redacting a field that merely mentions "token" in its name is a far safer
// failure mode here than under-redacting a real credential.
const SENSITIVE_KEY = /password|secret|token|authorization|email|ssn|card.?number|cvv|pin\\b/i;

function redactValue(value, key) {
  if (key !== undefined && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    if (DIGIT_RUN.test(value) || isMajorityDigitToken(value)) return '[REDACTED]';
    return value;
  }
  if (Array.isArray(value)) return value.map(function (v) { return redactValue(v); });
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactValue(v, k);
    return out;
  }
  return value;
}

function needsRedaction(value) {
  return JSON.stringify(redactValue(value)) !== JSON.stringify(value);
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

function isApiContractEntry(value, label, errors, seenIds) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.contractId !== 'string' || value.contractId.length === 0) {
    errors.push(label + '.contractId must be a non-empty string.');
  } else if (seenIds.has(value.contractId)) {
    errors.push(label + '.contractId "' + value.contractId + '" is a duplicate.');
  } else {
    seenIds.add(value.contractId);
  }
  if (typeof value.method !== 'string' || value.method.length === 0) {
    errors.push(label + '.method must be a non-empty string.');
  }
  if (typeof value.pathTemplate !== 'string' || value.pathTemplate.length === 0) {
    errors.push(label + '.pathTemplate must be a non-empty string.');
  }
  if (!Array.isArray(value.observedFromRouteIds)) {
    errors.push(label + '.observedFromRouteIds must be an array (empty is fine for a login call).');
  }
  if (typeof value.responseStatus !== 'number') {
    errors.push(label + '.responseStatus must be a number.');
  }
  if (value.sampleRequestPayload !== undefined) {
    if (typeof value.sampleRequestPayload !== 'object' || value.sampleRequestPayload === null) {
      errors.push(label + '.sampleRequestPayload must be an object when present.');
    } else if (needsRedaction(value.sampleRequestPayload)) {
      errors.push(
        label +
          '.sampleRequestPayload contains an unredacted PII/session-data value - either digit-shaped (6+ digit run, or an 8+-char majority-digit token) or a field whose name itself is sensitive (password/secret/token/authorization/email/ssn/card number/cvv/pin) - mask it as [REDACTED] before writing this file.',
      );
    }
  }
  if (value.responseShape !== undefined) {
    if (typeof value.responseShape !== 'object' || value.responseShape === null) {
      errors.push(label + '.responseShape must be an object when present.');
    } else {
      for (const [k, v] of Object.entries(value.responseShape)) {
        if (typeof v !== 'string') {
          errors.push(label + '.responseShape["' + k + '"] must be a type-hint string, not a concrete value.');
        }
      }
    }
  }
  if (typeof value.observedAt !== 'string' || value.observedAt.length === 0) {
    errors.push(label + '.observedAt must be a non-empty string.');
  }
}

function validate() {
  const errors = [];
  const loaded = loadJson(CONTRACTS_PATH, 'artifacts/site-map/api-contracts.json');
  if (loaded.error) {
    // Absent entirely is fine - not every app has API traffic worth recording yet, and this file
    // is only ever consulted (never required) by later stages.
    return { status: 'PASSED', errors: [], note: 'No api-contracts.json found - skipped.' };
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('api-contracts.json must contain a JSON object.');
    return { status: 'FAILED', errors };
  }
  if (data.schemaVersion !== 1) {
    errors.push('schemaVersion must be exactly 1 (found ' + JSON.stringify(data.schemaVersion) + ').');
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (!Array.isArray(data.contracts)) {
    errors.push('contracts must be an array.');
    return { status: 'FAILED', errors };
  }
  const seenIds = new Set();
  data.contracts.forEach(function (c, i) {
    isApiContractEntry(c, 'contracts[' + i + ']', errors, seenIds);
  });
  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
