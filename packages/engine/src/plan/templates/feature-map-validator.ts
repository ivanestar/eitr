// Template for generating scripts/validate-feature-map.mjs. create-if-absent.
// Mechanical shape gate for artifacts/analysis/feature-map.json - zero dependencies, same style as
// api-contracts-validator.ts / test-conditions-validator.ts.
//
// Beyond shape it enforces the two things a malformed feature map would break silently rather than
// loudly: referential integrity (a relation pointing at an entity that does not exist, a feature
// claiming a route the site map never had) and lifecycle coherence (a transition leaving from a
// state the entity does not have). Both would otherwise surface much later as a test case built on
// a link that was never there.

export function renderFeatureMapValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/analysis/feature-map.json.
 * Zero model involvement - pure structural checks plus a PII-redaction backstop.
 *
 * Usage:
 *   node scripts/validate-feature-map.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

const SOURCES = new Set([
  'api-resource',
  'api-payload-field',
  'api-response-nesting',
  'route-convention',
  'ui-form',
  'ui-navigation',
  'business-intent-label',
  'human',
]);
const OPERATION_KINDS = new Set(['create', 'read', 'list', 'update', 'delete']);
const RELATION_KINDS = new Set(['references', 'contains']);
const CONFIDENCES = new Set(['observed', 'inferred']);
const IMPACTS = new Set(['high', 'medium', 'low']);
const REVIEWERS = new Set(['human', 'auto-pilot']);
const MAX_EXCERPT = 100;

// Same digit-shaped threshold as every other evidence guard in this pipeline.
const DIGIT_RUN = /\\d{6,}/;

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function checkEvidence(list, label, errors) {
  if (!Array.isArray(list) || list.length === 0) {
    errors.push(label + '.evidence must be a non-empty array - a claim with no evidence is a guess.');
    return;
  }
  list.forEach(function (entry, i) {
    const entryLabel = label + '.evidence[' + i + ']';
    if (!entry || typeof entry !== 'object') {
      errors.push(entryLabel + ' must be an object.');
      return;
    }
    if (!SOURCES.has(entry.signal)) {
      errors.push(entryLabel + '.signal must be one of: ' + Array.from(SOURCES).join(', ') + '.');
    }
    if (typeof entry.excerpt !== 'string' || entry.excerpt.length === 0) {
      errors.push(entryLabel + '.excerpt must be a non-empty string.');
      return;
    }
    if (entry.excerpt.length > MAX_EXCERPT) {
      errors.push(entryLabel + '.excerpt must be at most ' + MAX_EXCERPT + ' characters.');
    }
    if (DIGIT_RUN.test(entry.excerpt)) {
      errors.push(
        entryLabel +
          '.excerpt contains an unredacted digit-shaped value (6+ consecutive digits) - mask it as [REDACTED].',
      );
    }
  });
}

function checkReviewFlags(record, label, errors) {
  if (typeof record.reviewed !== 'boolean') {
    errors.push(label + '.reviewed must be a boolean.');
    return;
  }
  if (record.reviewed === true && !REVIEWERS.has(record.reviewedBy)) {
    errors.push(label + '.reviewedBy must be "human" or "auto-pilot" once reviewed is true.');
  }
}

function checkLifecycle(lifecycle, label, errors) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    errors.push(label + '.lifecycle must be an object.');
    return;
  }
  if (!Array.isArray(lifecycle.states)) {
    errors.push(label + '.lifecycle.states must be an array.');
    return;
  }
  if (!Array.isArray(lifecycle.transitions)) {
    errors.push(label + '.lifecycle.transitions must be an array.');
    return;
  }
  const stateNames = new Set();
  lifecycle.states.forEach(function (state, i) {
    const stateLabel = label + '.lifecycle.states[' + i + ']';
    if (!state || typeof state !== 'object') {
      errors.push(stateLabel + ' must be an object.');
      return;
    }
    if (typeof state.name !== 'string' || state.name.length === 0) {
      errors.push(stateLabel + '.name must be a non-empty string.');
      return;
    }
    if (stateNames.has(state.name)) {
      errors.push(stateLabel + '.name "' + state.name + '" is a duplicate.');
    }
    stateNames.add(state.name);
    if (typeof state.initial !== 'boolean') errors.push(stateLabel + '.initial must be a boolean.');
    if (typeof state.terminal !== 'boolean') errors.push(stateLabel + '.terminal must be a boolean.');
  });

  if (lifecycle.states.length > 0) {
    const initialCount = lifecycle.states.filter(function (s) {
      return s && s.initial === true;
    }).length;
    if (initialCount !== 1) {
      errors.push(
        label +
          '.lifecycle must have exactly one initial state (found ' +
          initialCount +
          ') - a lifecycle you cannot start from describes nothing.',
      );
    }
  }

  lifecycle.transitions.forEach(function (transition, i) {
    const transitionLabel = label + '.lifecycle.transitions[' + i + ']';
    if (!transition || typeof transition !== 'object') {
      errors.push(transitionLabel + ' must be an object.');
      return;
    }
    for (const end of ['from', 'to']) {
      if (typeof transition[end] !== 'string' || transition[end].length === 0) {
        errors.push(transitionLabel + '.' + end + ' must be a non-empty string.');
      } else if (!stateNames.has(transition[end])) {
        errors.push(
          transitionLabel + '.' + end + ' names "' + transition[end] + '", which is not one of this entity\\'s states.',
        );
      }
    }
    if (typeof transition.trigger !== 'string' || transition.trigger.length === 0) {
      errors.push(transitionLabel + '.trigger must be a non-empty string.');
    }
    if (!CONFIDENCES.has(transition.confidence)) {
      errors.push(transitionLabel + '.confidence must be "observed" or "inferred".');
    }
    checkEvidence(transition.evidence, transitionLabel, errors);
  });
}

function checkEntity(key, entity, errors, entityIds) {
  const label = 'entities["' + key + '"]';
  if (!entity || typeof entity !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof entity.entityId !== 'string' || entity.entityId.length === 0) {
    errors.push(label + '.entityId must be a non-empty string.');
  } else if (entity.entityId !== key) {
    errors.push(label + '.entityId must equal its own key (found "' + entity.entityId + '").');
  }
  if (typeof entity.name !== 'string' || entity.name.length === 0) {
    errors.push(label + '.name must be a non-empty string.');
  }
  if (!Array.isArray(entity.operations)) {
    errors.push(label + '.operations must be an array.');
  } else {
    entity.operations.forEach(function (op, i) {
      const opLabel = label + '.operations[' + i + ']';
      if (!op || typeof op !== 'object') {
        errors.push(opLabel + ' must be an object.');
        return;
      }
      if (!OPERATION_KINDS.has(op.kind)) {
        errors.push(opLabel + '.kind must be one of: ' + Array.from(OPERATION_KINDS).join(', ') + '.');
      }
      if (op.contractId !== undefined && typeof op.contractId !== 'string') {
        errors.push(opLabel + '.contractId must be a string when present.');
      }
      if (!Array.isArray(op.routeIds)) {
        errors.push(opLabel + '.routeIds must be an array.');
      }
      if (!CONFIDENCES.has(op.confidence)) {
        errors.push(opLabel + '.confidence must be "observed" or "inferred".');
      }
      // An operation claiming it was observed has to name what observed it.
      if (op.confidence === 'observed' && typeof op.contractId !== 'string') {
        errors.push(
          opLabel +
            '.confidence is "observed" but no contractId names the observation it rests on - an unattributed observation is an inference.',
        );
      }
      checkEvidence(op.evidence, opLabel, errors);
    });
  }
  if (!Array.isArray(entity.relations)) {
    errors.push(label + '.relations must be an array.');
  } else {
    entity.relations.forEach(function (relation, i) {
      const relationLabel = label + '.relations[' + i + ']';
      if (!relation || typeof relation !== 'object') {
        errors.push(relationLabel + ' must be an object.');
        return;
      }
      if (!RELATION_KINDS.has(relation.kind)) {
        errors.push(relationLabel + '.kind must be "references" or "contains".');
      }
      if (typeof relation.targetEntityId !== 'string' || !entityIds.has(relation.targetEntityId)) {
        errors.push(
          relationLabel + '.targetEntityId must name an entity present in this file (found ' + JSON.stringify(relation.targetEntityId) + ').',
        );
      } else if (relation.targetEntityId === entity.entityId) {
        errors.push(relationLabel + '.targetEntityId points at its own entity.');
      }
      if (typeof relation.viaField !== 'string' || relation.viaField.length === 0) {
        errors.push(relationLabel + '.viaField must be a non-empty string - the field carrying the link.');
      }
      if (!CONFIDENCES.has(relation.confidence)) {
        errors.push(relationLabel + '.confidence must be "observed" or "inferred".');
      }
      checkEvidence(relation.evidence, relationLabel, errors);
    });
  }
  checkLifecycle(entity.lifecycle, label, errors);
  checkEvidence(entity.evidence, label, errors);
  checkReviewFlags(entity, label, errors);
}

function checkFeature(key, feature, errors, entityIds, knownRouteIds) {
  const label = 'features["' + key + '"]';
  if (!feature || typeof feature !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof feature.featureId !== 'string' || feature.featureId.length === 0) {
    errors.push(label + '.featureId must be a non-empty string.');
  } else if (feature.featureId !== key) {
    errors.push(label + '.featureId must equal its own key (found "' + feature.featureId + '").');
  }
  if (typeof feature.name !== 'string' || feature.name.length === 0) {
    errors.push(label + '.name must be a non-empty string.');
  }
  if (!Array.isArray(feature.memberRouteIds) || feature.memberRouteIds.length === 0) {
    errors.push(label + '.memberRouteIds must be a non-empty array - a feature reachable from nowhere is not one.');
  } else if (knownRouteIds) {
    for (const routeId of feature.memberRouteIds) {
      if (!knownRouteIds.has(routeId)) {
        errors.push(label + '.memberRouteIds names "' + routeId + '", which is not a route in the site map.');
      }
    }
  }
  if (!Array.isArray(feature.entityIds)) {
    errors.push(label + '.entityIds must be an array.');
  } else {
    for (const entityId of feature.entityIds) {
      if (!entityIds.has(entityId)) {
        errors.push(label + '.entityIds names "' + entityId + '", which is not an entity in this file.');
      }
    }
  }
  if (!IMPACTS.has(feature.impact)) {
    errors.push(label + '.impact must be "high", "medium", or "low".');
  }
  if (feature.impactSourceRouteId !== undefined) {
    if (typeof feature.impactSourceRouteId !== 'string') {
      errors.push(label + '.impactSourceRouteId must be a string when present.');
    } else if (
      Array.isArray(feature.memberRouteIds) &&
      feature.memberRouteIds.indexOf(feature.impactSourceRouteId) === -1
    ) {
      errors.push(
        label +
          '.impactSourceRouteId names a route that is not one of this feature\\'s own members - the impact would be unverifiable against it.',
      );
    }
  }
  checkEvidence(feature.evidence, label, errors);
  checkReviewFlags(feature, label, errors);
}

function validate() {
  const errors = [];
  const data = loadJson(FEATURE_MAP_PATH);
  if (data === null) {
    return {
      status: 'FAILED',
      errors: ['artifacts/analysis/feature-map.json is missing or is not valid JSON.'],
    };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'FAILED', errors: ['feature-map.json must contain a JSON object.'] };
  }
  if (data.schemaVersion !== 1) {
    errors.push('schemaVersion must be exactly 1 (found ' + JSON.stringify(data.schemaVersion) + ').');
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (typeof data.sourceHash !== 'string' || data.sourceHash.length === 0) {
    errors.push('sourceHash must be a non-empty string.');
  }
  if (!data.entities || typeof data.entities !== 'object' || Array.isArray(data.entities)) {
    errors.push('entities must be an object keyed by entityId.');
    return { status: 'FAILED', errors };
  }
  if (!data.features || typeof data.features !== 'object' || Array.isArray(data.features)) {
    errors.push('features must be an object keyed by featureId.');
    return { status: 'FAILED', errors };
  }

  const entityIds = new Set(Object.keys(data.entities));
  for (const [key, entity] of Object.entries(data.entities)) {
    checkEntity(key, entity, errors, entityIds);
  }

  const siteMap = loadJson(SITE_MAP_PATH);
  let knownRouteIds = null;
  if (siteMap && siteMap.routes && typeof siteMap.routes === 'object') {
    knownRouteIds = new Set();
    for (const route of Object.values(siteMap.routes)) {
      if (route && typeof route.routeId === 'string') knownRouteIds.add(route.routeId);
    }
  }
  for (const [key, feature] of Object.entries(data.features)) {
    checkFeature(key, feature, errors, entityIds, knownRouteIds);
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
