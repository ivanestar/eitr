// Template for generating scripts/validate-site-map.mjs. create-if-absent.
// The same mechanical gate ADR 0012 Decision item 2 requires at every stage boundary ("validates
// the artifact's shape and internal consistency... with zero model involvement before an LLM or a
// human ever reviews its content"), applied to artifacts/site-map/site-map.json itself - the foundation
// every downstream consumer (shared-widget mining, scripts/orchestrate-swarm.mjs,
// artifacts/analysis/business-intent.json's Step 6, pom-engineer) keys off. Mirrors
// business-intent-validator.ts's style and zero-dependency constraint exactly; the two scripts are
// intentionally not shared code, matching every other renderXValidator template in this project.

export function renderSiteMapValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/site-map/site-map.json.
 * Zero model involvement - pure structural checks, run by /map-site's Step 3c immediately after
 * writing the file and before any downstream consumer (shared-widget mining, the swarm dispatcher,
 * business-intent analysis) reads it.
 *
 * Usage:
 *   node scripts/validate-site-map.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

const BOUNDED_BY_VALUES = new Set(['maxDepth', 'maxPages']);
const STATUS_VALUES = new Set(['active', 'removed']);

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

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validate() {
  const errors = [];
  const loaded = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json');
  if (loaded.error) {
    errors.push(loaded.error);
    return { status: 'FAILED', errors };
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'artifacts/site-map/site-map.json must contain a JSON object, found ' + JSON.stringify(data) + '.',
    );
    return { status: 'FAILED', errors };
  }

  if (data.schemaVersion !== 2) {
    errors.push(
      'schemaVersion must be exactly 2 (found ' +
        JSON.stringify(data.schemaVersion) +
        '). Treat as absent and re-run /map-site create rather than migrating in place.',
    );
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if ('lastUpdatedAt' in data && (typeof data.lastUpdatedAt !== 'string' || data.lastUpdatedAt.length === 0)) {
    errors.push('lastUpdatedAt, when present, must be a non-empty string.');
  }
  if ('baseUrl' in data && typeof data.baseUrl !== 'string') {
    errors.push('baseUrl, when present, must be a string.');
  }
  if ('coverage' in data) {
    const coverage = data.coverage;
    if (!coverage || typeof coverage !== 'object') {
      errors.push('coverage, when present, must be an object.');
    } else {
      if (!BOUNDED_BY_VALUES.has(coverage.boundedBy)) {
        errors.push('coverage.boundedBy must be one of maxDepth|maxPages.');
      }
      if (typeof coverage.pagesVisited !== 'number' || !Number.isInteger(coverage.pagesVisited)) {
        errors.push('coverage.pagesVisited must be an integer.');
      }
    }
  }
  if ('sharedWidgets' in data && !isStringArray(data.sharedWidgets)) {
    errors.push('sharedWidgets, when present, must be an array of strings.');
  }

  if (!data.routes || typeof data.routes !== 'object' || Array.isArray(data.routes)) {
    errors.push('routes must be an object keyed by canonical path template.');
    return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
  }

  const routeIdOwners = new Map();
  for (const [key, entry] of Object.entries(data.routes)) {
    const label = 'routes["' + key + '"]';
    if (!entry || typeof entry !== 'object') {
      errors.push(label + ' must be an object.');
      continue;
    }
    if (typeof entry.routeId !== 'string' || entry.routeId.length === 0) {
      errors.push(label + '.routeId must be a non-empty string.');
    } else {
      const owner = routeIdOwners.get(entry.routeId);
      if (owner) {
        errors.push(
          label + '.routeId "' + entry.routeId + '" is not unique - also used by ' + owner + '.',
        );
      } else {
        routeIdOwners.set(entry.routeId, label);
      }
    }
    if (!isStringArray(entry.sampleUrls) || entry.sampleUrls.length === 0) {
      errors.push(label + '.sampleUrls must be a non-empty array of strings.');
    }
    if ('title' in entry && typeof entry.title !== 'string') {
      errors.push(label + '.title, when present, must be a string.');
    }
    if ('regions' in entry && !isStringArray(entry.regions)) {
      errors.push(label + '.regions, when present, must be an array of strings.');
    }
    if ('components' in entry && !isStringArray(entry.components)) {
      errors.push(label + '.components, when present, must be an array of strings.');
    }
    if (typeof entry.discoveredAt !== 'string' || entry.discoveredAt.length === 0) {
      errors.push(label + '.discoveredAt must be a non-empty string.');
    }
    if (typeof entry.lastCheckedAt !== 'string' || entry.lastCheckedAt.length === 0) {
      errors.push(label + '.lastCheckedAt must be a non-empty string.');
    }
    if (typeof entry.contentHash !== 'string' || entry.contentHash.length === 0) {
      errors.push(label + '.contentHash must be a non-empty string.');
    }
    if (!STATUS_VALUES.has(entry.status)) {
      errors.push(label + '.status must be one of active|removed.');
    }
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
