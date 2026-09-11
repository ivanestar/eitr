// Template for generating scripts/validate-api-contracts.mjs. create-if-absent.
// Mechanical shape gate for artifacts/site-map/api-contracts.json, zero dependencies, same style as
// site-map-validator.ts / test-conditions-validator.ts. Also mechanically re-checks the PII/
// session-data redaction backstop on every sampleRequestPayload value, the same way
// scripts/generate-test-conditions.mjs backstops evidence excerpts elsewhere in this pipeline.
//
// Beyond shape, it reports two non-fatal observation-quality warnings. Both exist because a crawl
// that recorded almost no API traffic looks exactly like a crawl of an application that has almost
// none, and the two were indistinguishable until something counted them: a live run produced one
// contract across 62 routes, and nothing anywhere said whether that was the application or the
// observer. A warning never fails the file - a static content site legitimately produces both.

import { PII_MASK_SOURCE } from './pii-mask.js';

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
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

// Statuses that carry no body by definition - a missing responseShape on one of these is correct,
// not an omission.
const BODILESS_STATUSES = new Set([204, 205, 304]);

// Below this share of active routes having contributed at least one observed call, the crawl's
// network observation is worth a second look. The threshold is deliberately low: it is meant to
// catch an observer that was not listening at all, not to push a real content site toward an API
// surface it does not have. Only applied once there are enough routes for the ratio to mean
// anything.
const OBSERVATION_FLOOR_RATIO = 0.1;
const OBSERVATION_MIN_ROUTES = 10;

const API_STYLES = new Set(['rest', 'graphql', 'rpc', 'opaque']);
const DOCUMENT_TYPES = new Set(['query', 'mutation', 'subscription']);
// Styles whose operation identity lives somewhere other than the path. Without a name, every call
// in the whole API collapses onto one contractId.
const NAMED_STYLES = new Set(['graphql', 'rpc']);

// The payload is recorded traffic, so it carries real input: every value is held to the same masking
// rule as every other artifact of this project.
${PII_MASK_SOURCE}

// A path is checked for ids only. Canonicalization should already have collapsed a concrete id into
// a {template} segment, while a version or a date in a path is ordinary.
const ID_IN_PATH = /\\d{6,}/;

// A raw HTTP request/response body (what sampleRequestPayload actually is) can carry a plaintext
// password or token whose VALUE has no recognizable shape at all - the rule above would never catch
// "password": "hunter2". This checks the FIELD NAME instead, unconditionally redacting the value
// regardless of its own shape - a broader net than the shape rule, and deliberately so:
// over-redacting a field that merely mentions "token" in its name is a far safer failure mode here
// than under-redacting a real credential.
const SENSITIVE_KEY = /password|secret|token|authorization|email|ssn|card.?number|cvv|pin\\b/i;

function redactValue(value, key) {
  if (key !== undefined && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  // A whole value is replaced rather than masked in place: a payload field is one datum, and a
  // half-masked one still tells a reader what was there. A number is read as its digits - an account
  // id or a phone number sent as a JSON number is the same datum as one sent as a string.
  if (typeof value === 'string') return hasPii(value) ? '[REDACTED]' : value;
  if (typeof value === 'number') return hasPii(String(value)) ? '[REDACTED]' : value;
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

function isApiContractEntry(value, label, errors, warnings, seenIds) {
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
  } else if (value.pathTemplate.indexOf('?') !== -1) {
    // A retained query string is where real input values reach this file. tRPC serialises a call's
    // whole input into an 'input' parameter, so an unstripped path is a payload in disguise - and
    // the redaction backstop below only ever looked at sampleRequestPayload.
    errors.push(
      label +
        '.pathTemplate still carries a query string ("' +
        value.pathTemplate +
        '") - strip it during canonicalization; a call\\'s own input can be encoded there.',
    );
  } else if (ID_IN_PATH.test(value.pathTemplate)) {
    // Only the digit-shaped check applies to a path. A resource genuinely called /password/reset or
    // /api/tokens is ordinary, so the sensitive-NAME check that guards payload fields would reject
    // correct paths here; a 6+ digit run, on the other hand, is a concrete id that canonicalization
    // should already have collapsed into a {template} segment.
    errors.push(
      label +
        '.pathTemplate contains a raw ' +
        'id-shaped value (6+ consecutive digits) - canonicalization should have collapsed it into a {template} segment.',
    );
  }
  if (value.operation !== undefined) {
    const operation = value.operation;
    const operationLabel = label + '.operation';
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      errors.push(operationLabel + ' must be an object when present.');
    } else {
      if (!API_STYLES.has(operation.style)) {
        errors.push(operationLabel + '.style must be one of: ' + Array.from(API_STYLES).join(', ') + '.');
      }
      if (operation.name !== undefined && (typeof operation.name !== 'string' || operation.name.length === 0)) {
        errors.push(operationLabel + '.name must be a non-empty string when present.');
      }
      if (NAMED_STYLES.has(operation.style) && typeof operation.name !== 'string') {
        errors.push(
          operationLabel +
            '.name is required for style "' +
            operation.style +
            '" - the whole API is served from one path under it, so a contract without an operation name would be the only one ever recorded.',
        );
      }
      // An unreadable call is a legitimate outcome, but only when it says what stopped the read -
      // otherwise it is indistinguishable from one nobody looked at.
      if (operation.style === 'opaque' && (typeof operation.reason !== 'string' || operation.reason.length === 0)) {
        errors.push(operationLabel + '.reason is required for style "opaque" - say what could not be read.');
      }
      if (operation.documentType !== undefined && !DOCUMENT_TYPES.has(operation.documentType)) {
        errors.push(operationLabel + '.documentType must be "query", "mutation", or "subscription".');
      }
      if (operation.documentType !== undefined && operation.style !== 'graphql') {
        errors.push(operationLabel + '.documentType only applies to style "graphql".');
      }
    }
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
          '.sampleRequestPayload contains an unredacted PII/session-data value - an email address, six or more digits (spaces, dashes, dots or brackets between them included), an 8+-char token that is mostly digits, or a field whose name itself is sensitive (password/secret/token/authorization/email/ssn/card number/cvv/pin) - replace the value with [REDACTED] before writing this file.',
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
      if (Object.keys(value.responseShape).length === 0) {
        warnings.push(
          label +
            ' (' +
            value.method +
            ' ' +
            value.pathTemplate +
            ') has an empty responseShape - an observed JSON body with no fields recorded reads the same as one never looked at.',
        );
      }
    }
  } else if (
    typeof value.responseStatus === 'number' &&
    value.responseStatus >= 200 &&
    value.responseStatus < 300 &&
    !BODILESS_STATUSES.has(value.responseStatus) &&
    String(value.method).toUpperCase() !== 'HEAD' &&
    // An opaque call already says its body could not be read; asking for its response shape would
    // be asking the same question twice and inviting someone to answer it with a guess.
    !(value.operation && value.operation.style === 'opaque')
  ) {
    warnings.push(
      label +
        ' (' +
        value.method +
        ' ' +
        value.pathTemplate +
        ') has no responseShape. Entity composition is derived from response body nesting, so a contract without one contributes nothing to it. Correct when the response was not JSON (HTML, an image, a redirect body); worth re-observing when it was.',
    );
  }
  if (typeof value.observedAt !== 'string' || value.observedAt.length === 0) {
    errors.push(label + '.observedAt must be a non-empty string.');
  }
}

// How many active routes contributed at least one observed call. Reported as a plain pair of
// numbers so a human can judge it directly; the warning below only fires when the ratio is low
// enough that the observer itself is the likelier explanation.
function computeObservationCoverage(contracts) {
  const siteMap = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json').value;
  if (!siteMap || !siteMap.routes || typeof siteMap.routes !== 'object') return null;
  const activeRouteIds = new Set();
  for (const route of Object.values(siteMap.routes)) {
    if (route && route.status === 'active' && typeof route.routeId === 'string') {
      activeRouteIds.add(route.routeId);
    }
  }
  const observed = new Set();
  for (const contract of contracts) {
    if (!contract || !Array.isArray(contract.observedFromRouteIds)) continue;
    for (const routeId of contract.observedFromRouteIds) {
      if (activeRouteIds.has(routeId)) observed.add(routeId);
    }
  }
  return { activeRoutes: activeRouteIds.size, routesWithObservedCalls: observed.size };
}

function validate() {
  const errors = [];
  const warnings = [];
  const loaded = loadJson(CONTRACTS_PATH, 'artifacts/site-map/api-contracts.json');
  if (loaded.error) {
    // Absent entirely is fine - not every app has API traffic worth recording yet, and this file
    // is only ever consulted (never required) by later stages.
    return { status: 'PASSED', errors: [], warnings: [], note: 'No api-contracts.json found - skipped.' };
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('api-contracts.json must contain a JSON object.');
    return { status: 'FAILED', errors, warnings };
  }
  if (data.schemaVersion !== 1) {
    errors.push('schemaVersion must be exactly 1 (found ' + JSON.stringify(data.schemaVersion) + ').');
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (!Array.isArray(data.contracts)) {
    errors.push('contracts must be an array.');
    return { status: 'FAILED', errors, warnings };
  }
  const seenIds = new Set();
  data.contracts.forEach(function (c, i) {
    isApiContractEntry(c, 'contracts[' + i + ']', errors, warnings, seenIds);
  });

  // An unreadable call is a fact worth stating once, plainly, rather than a defect to fix. The
  // count belongs in front of a human because it is the honest ceiling on what any later stage can
  // know about this application's API.
  const opaque = data.contracts.filter(function (contract) {
    return contract && contract.operation && contract.operation.style === 'opaque';
  });
  if (opaque.length > 0) {
    const reasons = Array.from(
      new Set(
        opaque.map(function (contract) {
          return contract.operation.reason;
        }),
      ),
    ).filter(Boolean);
    warnings.push(
      opaque.length +
        ' of ' +
        data.contracts.length +
        ' observed call(s) could not be decoded, so they name no operation and contribute no entity: ' +
        reasons.join('; ') +
        '. This is a limit of what is visible from the browser, not something to fill in by guessing.',
    );
  }

  const observationCoverage = computeObservationCoverage(data.contracts);
  if (
    observationCoverage &&
    observationCoverage.activeRoutes >= OBSERVATION_MIN_ROUTES &&
    observationCoverage.routesWithObservedCalls <
      observationCoverage.activeRoutes * OBSERVATION_FLOOR_RATIO
  ) {
    warnings.push(
      'Only ' +
        observationCoverage.routesWithObservedCalls +
        ' of ' +
        observationCoverage.activeRoutes +
        ' active routes contributed an observed API call. A server-rendered or static application genuinely looks like this; so does a crawl that never listened for network traffic. Worth confirming which one this is before later stages treat the API surface as fully mapped.',
    );
  }

  return {
    status: errors.length === 0 ? 'PASSED' : 'FAILED',
    errors,
    warnings,
    observationCoverage: observationCoverage,
  };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
