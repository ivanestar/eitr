// Template for generating scripts/derive-feature-map.mjs. create-if-absent.
// Deterministic draft of artifacts/analysis/feature-map.json from artifacts already on disk:
// api-contracts.json (observed traffic), site-map.json (route shapes), business-intent.json
// (per-route labels and criticality). Zero model involvement, zero network access, zero new
// interaction with the application - it only reads what earlier stages already recorded.
//
// Everything it produces is a hypothesis about the domain, and the script says so: a REST resource
// is not a domain entity, and a path that looks like one proves nothing on its own. That is why
// every derived claim carries confidence 'inferred' unless it was literally observed in traffic,
// and why nothing here is usable downstream until /map-features' Human Sign-Off Gateway has run.

export function renderFeatureMapEngine(): string {
  return `#!/usr/bin/env node

/**
 * Drafts artifacts/analysis/feature-map.json from artifacts that already exist.
 * Zero model involvement - pure structural derivation, safe to re-run at any time.
 *
 * Usage:
 *   node scripts/derive-feature-map.mjs
 *   node scripts/derive-feature-map.mjs --force   (redraft even when inputs are unchanged)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const API_CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');
const BUSINESS_INTENT_PATH = path.join(CWD, 'artifacts', 'analysis', 'business-intent.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');

// Path segments that are transport scaffolding rather than anything to do with the domain.
const TRANSPORT_SEGMENTS = /^(api|rest|graphql|v\\d+)$/i;
// Trailing segments that name an intent rather than a thing: /orders/new is still the orders
// entity, not an entity called "new".
const INTENT_SEGMENTS = /^(new|create|edit|update|delete|remove|add)$/i;
// A route-shaped name only becomes an entity on its own evidence when the shape recurs. Without
// this floor every one-off static page ("/about", "/terms") would be promoted to a domain entity.
const MIN_ROUTES_FOR_ENTITY = 2;

const DIGIT_RUN = /\\d{6,}/;
function maskExcerpt(text) {
  const trimmed = String(text).slice(0, 100);
  return DIGIT_RUN.test(trimmed) ? trimmed.replace(new RegExp(DIGIT_RUN.source, 'g'), '[REDACTED]') : trimmed;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(function (k) {
          return JSON.stringify(k) + ':' + stableStringify(value[k]);
        })
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

function shortHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function evidence(signal, excerpt) {
  return { signal: signal, excerpt: maskExcerpt(excerpt) };
}

// ---------------------------------------------------------------------------
// Path shape
// ---------------------------------------------------------------------------

function segmentsOf(pathTemplate) {
  return String(pathTemplate || '')
    .split('/')
    .filter(function (s) {
      return s.length > 0;
    });
}

function isParamSegment(segment) {
  return segment.startsWith('{') && segment.endsWith('}');
}

function domainSegments(pathTemplate) {
  return segmentsOf(pathTemplate).filter(function (s) {
    return !TRANSPORT_SEGMENTS.test(s);
  });
}

// The last non-parameter segment names what the path is about; whether the path ENDS in a parameter
// says whether the call addresses one of them or the collection. /orders/{id}/items is a collection
// of items, not an action on an order - which is why the last non-parameter segment wins rather than
// the first.
function resourceOf(pathTemplate) {
  const segs = domainSegments(pathTemplate);
  if (segs.length === 0) return null;
  let name = null;
  for (const seg of segs) {
    if (!isParamSegment(seg) && !INTENT_SEGMENTS.test(seg)) name = seg;
  }
  if (!name) return null;
  return { name: name.toLowerCase(), addressesOne: isParamSegment(segs[segs.length - 1]) };
}

// Deliberately loose: two names match when they agree once case and a trailing plural 's' are
// ignored. Anything cleverer would be inventing morphology the application never stated.
function normalizeName(name) {
  const lower = String(name).toLowerCase();
  return lower.endsWith('s') ? lower.slice(0, -1) : lower;
}

function operationKind(method, addressesOne) {
  const verb = String(method || '').toUpperCase();
  if (verb === 'DELETE') return 'delete';
  if (verb === 'PUT' || verb === 'PATCH') return 'update';
  if (verb === 'POST') return addressesOne ? 'update' : 'create';
  if (verb === 'GET' || verb === 'HEAD') return addressesOne ? 'read' : 'list';
  return null;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

function entityRecord(name) {
  return {
    entityId: shortHash(name),
    name: name,
    operations: [],
    relations: [],
    lifecycle: { states: [], transitions: [] },
    evidence: [],
    reviewed: false,
  };
}

function upsertEntity(entities, name) {
  const key = normalizeName(name);
  if (!entities[key]) entities[key] = entityRecord(name);
  return entities[key];
}

function addEvidenceOnce(target, entry) {
  const exists = target.evidence.some(function (e) {
    return e.signal === entry.signal && e.excerpt === entry.excerpt;
  });
  if (!exists) target.evidence.push(entry);
}

function entitiesFromContracts(contracts, entities) {
  for (const contract of contracts) {
    if (!contract || typeof contract.pathTemplate !== 'string') continue;
    const resource = resourceOf(contract.pathTemplate);
    if (!resource) continue;
    const kind = operationKind(contract.method, resource.addressesOne);
    if (!kind) continue;
    const entity = upsertEntity(entities, resource.name);
    const routeIds = Array.isArray(contract.observedFromRouteIds)
      ? contract.observedFromRouteIds.slice()
      : [];
    const signature = contract.method + ' ' + contract.pathTemplate;
    addEvidenceOnce(entity, evidence('api-resource', signature));
    const existing = entity.operations.find(function (op) {
      return op.kind === kind && op.contractId === contract.contractId;
    });
    if (existing) continue;
    entity.operations.push({
      kind: kind,
      contractId: contract.contractId,
      routeIds: routeIds,
      // An operation seen in real traffic is the one thing in this whole file that was actually
      // observed rather than worked out.
      confidence: 'observed',
      evidence: [evidence('api-resource', signature)],
    });
  }
}

function entitiesFromRoutes(siteMapRoutes, entities) {
  const byName = {};
  for (const [routePath, route] of Object.entries(siteMapRoutes)) {
    if (!route || route.status !== 'active' || typeof route.routeId !== 'string') continue;
    const resource = resourceOf(routePath);
    if (!resource) continue;
    const key = normalizeName(resource.name);
    if (!byName[key]) byName[key] = { name: resource.name, routes: [] };
    byName[key].routes.push({ routeId: route.routeId, path: routePath, addressesOne: resource.addressesOne });
  }
  for (const [key, group] of Object.entries(byName)) {
    const alreadyKnown = Boolean(entities[key]);
    if (!alreadyKnown && group.routes.length < MIN_ROUTES_FOR_ENTITY) continue;
    const entity = upsertEntity(entities, group.name);
    for (const route of group.routes) {
      addEvidenceOnce(entity, evidence('route-convention', route.path));
      const kind = route.addressesOne ? 'read' : 'list';
      const covered = entity.operations.some(function (op) {
        return op.kind === kind && op.routeIds.indexOf(route.routeId) !== -1;
      });
      if (covered) continue;
      const sameKindObserved = entity.operations.find(function (op) {
        return op.kind === kind && op.confidence === 'observed';
      });
      if (sameKindObserved) {
        if (sameKindObserved.routeIds.indexOf(route.routeId) === -1) {
          sameKindObserved.routeIds.push(route.routeId);
        }
        continue;
      }
      entity.operations.push({
        kind: kind,
        routeIds: [route.routeId],
        // A path shaped like a collection is a convention, not a contract.
        confidence: 'inferred',
        evidence: [evidence('route-convention', route.path)],
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

const ID_FIELD = /^(.+?)(?:_id|_ids|Id|Ids|ID|IDs)$/;

function relationTargetFor(fieldName, entities, selfKey) {
  const match = ID_FIELD.exec(String(fieldName));
  if (!match) return null;
  const base = normalizeName(match[1]);
  if (!base || base === selfKey) return null;
  return entities[base] || null;
}

function addRelationOnce(entity, relation) {
  const exists = entity.relations.some(function (r) {
    return r.kind === relation.kind && r.targetEntityId === relation.targetEntityId && r.viaField === relation.viaField;
  });
  if (!exists) entity.relations.push(relation);
}

function relationsFromContracts(contracts, entities) {
  for (const contract of contracts) {
    if (!contract || typeof contract.pathTemplate !== 'string') continue;
    const resource = resourceOf(contract.pathTemplate);
    if (!resource) continue;
    const selfKey = normalizeName(resource.name);
    const entity = entities[selfKey];
    if (!entity) continue;

    // A foreign key in either direction of the call means this entity cannot stand alone - which is
    // what makes it a precondition for anything that creates one.
    const payload = contract.sampleRequestPayload;
    if (payload && typeof payload === 'object') {
      for (const fieldName of Object.keys(payload)) {
        const target = relationTargetFor(fieldName, entities, selfKey);
        if (!target) continue;
        addRelationOnce(entity, {
          kind: 'references',
          targetEntityId: target.entityId,
          viaField: fieldName,
          confidence: 'inferred',
          evidence: [evidence('api-payload-field', contract.pathTemplate + ' request field "' + fieldName + '"')],
        });
      }
    }

    const shape = contract.responseShape;
    if (shape && typeof shape === 'object') {
      for (const [fieldName, hint] of Object.entries(shape)) {
        const target = relationTargetFor(fieldName, entities, selfKey);
        if (target) {
          addRelationOnce(entity, {
            kind: 'references',
            targetEntityId: target.entityId,
            viaField: fieldName,
            confidence: 'inferred',
            evidence: [
              evidence('api-payload-field', contract.pathTemplate + ' response field "' + fieldName + '"'),
            ],
          });
          continue;
        }
        // Nesting is what containment actually looks like on the wire: a field whose type hint is
        // an object or an array of objects, named after another entity.
        const nested = typeof hint === 'string' && (hint.indexOf('{') !== -1 || hint.indexOf('[') !== -1);
        if (!nested) continue;
        const contained = entities[normalizeName(fieldName)];
        if (!contained || contained.entityId === entity.entityId) continue;
        addRelationOnce(entity, {
          kind: 'contains',
          targetEntityId: contained.entityId,
          viaField: fieldName,
          confidence: 'inferred',
          evidence: [
            evidence(
              'api-response-nesting',
              contract.pathTemplate + ' response field "' + fieldName + '": ' + hint,
            ),
          ],
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// States and transitions are read straight off which operations exist. An entity with no observed
// way to create one starts life already existing, and one with no observed way to delete one has no
// terminal state - both are facts about what the crawl saw, not gaps to fill in with a plausible
// default.
function deriveLifecycle(entity) {
  const kinds = new Set(
    entity.operations.map(function (op) {
      return op.kind;
    }),
  );
  const hasCreate = kinds.has('create');
  const hasUpdate = kinds.has('update');
  const hasDelete = kinds.has('delete');

  const transitions = [];
  if (hasCreate) {
    transitions.push({
      from: 'absent',
      to: 'exists',
      trigger: 'create',
      confidence: 'inferred',
      evidence: [evidence('api-resource', 'a create operation was recorded for ' + entity.name)],
    });
  }
  if (hasUpdate) {
    transitions.push({
      from: 'exists',
      to: 'exists',
      trigger: 'update',
      confidence: 'inferred',
      evidence: [evidence('api-resource', 'an update operation was recorded for ' + entity.name)],
    });
  }
  if (hasDelete) {
    transitions.push({
      from: 'exists',
      to: 'removed',
      trigger: 'delete',
      confidence: 'inferred',
      evidence: [evidence('api-resource', 'a delete operation was recorded for ' + entity.name)],
    });
  }

  const stateNames = [];
  if (hasCreate) stateNames.push('absent');
  stateNames.push('exists');
  if (hasDelete) stateNames.push('removed');

  const states = stateNames.map(function (name) {
    const hasOutgoing = transitions.some(function (t) {
      return t.from === name && t.to !== name;
    });
    return {
      name: name,
      initial: hasCreate ? name === 'absent' : name === 'exists',
      terminal: !hasOutgoing,
    };
  });

  return { states: states, transitions: transitions };
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const IMPACT_ORDER = { low: 0, medium: 1, high: 2 };

function featureRecord(name) {
  return {
    featureId: shortHash(name),
    name: name,
    memberRouteIds: [],
    entityIds: [],
    impact: 'high',
    evidence: [],
    reviewed: false,
  };
}

// The label a route already carries in business-intent.json is the seed: it is a per-page guess at
// what the page is for, and routes sharing one are the closest thing to a feature the earlier
// stages can offer. Grouping them is where a page-shaped model first becomes a feature-shaped one.
function deriveFeatures(businessIntentRoutes, siteMapRoutes) {
  const routeIdToPath = {};
  for (const [routePath, route] of Object.entries(siteMapRoutes)) {
    if (route && typeof route.routeId === 'string') routeIdToPath[route.routeId] = routePath;
  }

  const features = {};
  for (const [routeId, entry] of Object.entries(businessIntentRoutes)) {
    if (!entry) continue;
    const label =
      entry.businessFeature && typeof entry.businessFeature.value === 'string'
        ? entry.businessFeature.value.trim()
        : '';
    if (label.length === 0) continue;
    const key = label.toLowerCase();
    if (!features[key]) features[key] = featureRecord(label);
    const feature = features[key];
    if (feature.memberRouteIds.indexOf(routeId) === -1) feature.memberRouteIds.push(routeId);
    addEvidenceOnce(
      feature,
      evidence('business-intent-label', (routeIdToPath[routeId] || routeId) + ' -> "' + label + '"'),
    );

    // Impact is aggregated from reviewed entries only. An unreviewed criticalityTier is a draft
    // nobody has confirmed, and letting one set a feature's impact would launder a guess into a
    // fact one level up - the same reason the test-conditions engine ignores unreviewed tiers.
    if (entry.reviewed !== true) continue;
    const tier =
      entry.criticalityTier && typeof entry.criticalityTier.value === 'string'
        ? entry.criticalityTier.value
        : null;
    if (!tier || !(tier in IMPACT_ORDER)) continue;
    if (feature.impactSourceRouteId === undefined || IMPACT_ORDER[tier] > IMPACT_ORDER[feature.impact]) {
      feature.impact = tier;
      feature.impactSourceRouteId = routeId;
    }
  }

  // A feature with no reviewed member route keeps the 'high' default it was created with:
  // under-testing something that turns out to matter is the worse of the two mistakes.
  return features;
}

function attachEntitiesToFeatures(features, entities) {
  for (const feature of Object.values(features)) {
    const memberSet = new Set(feature.memberRouteIds);
    for (const entity of Object.values(entities)) {
      const touches = entity.operations.some(function (op) {
        return (op.routeIds || []).some(function (routeId) {
          return memberSet.has(routeId);
        });
      });
      if (touches && feature.entityIds.indexOf(entity.entityId) === -1) {
        feature.entityIds.push(entity.entityId);
      }
    }
    feature.entityIds.sort();
  }
}

// ---------------------------------------------------------------------------
// Review-state preservation
// ---------------------------------------------------------------------------

// Human review is preserved only while the reviewed thing is still the same thing. A relation that
// appeared, changed, or vanished since sign-off invalidates the approval that covered it - carrying
// reviewed:true across that would silently present unreviewed derivation as confirmed.
function payloadOf(record) {
  const copy = Object.assign({}, record);
  delete copy.reviewed;
  delete copy.reviewedBy;
  return stableStringify(copy);
}

function preserveReview(fresh, existingById) {
  for (const record of Object.values(fresh)) {
    const previous = existingById[record.entityId] || existingById[record.featureId];
    if (!previous || previous.reviewed !== true) continue;
    if (payloadOf(previous) !== payloadOf(record)) continue;
    record.reviewed = true;
    if (previous.reviewedBy) record.reviewedBy = previous.reviewedBy;
  }
}

function byId(collection, idField) {
  const out = {};
  for (const record of Object.values(collection || {})) {
    if (record && typeof record[idField] === 'string') out[record[idField]] = record;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function derive() {
  const siteMap = loadJson(SITE_MAP_PATH);
  if (!siteMap || typeof siteMap.routes !== 'object' || siteMap.routes === null) {
    return {
      status: 'FAILED',
      errors: ['artifacts/site-map/site-map.json is missing or has no routes object - run /map-site first.'],
    };
  }
  const businessIntent = loadJson(BUSINESS_INTENT_PATH);
  if (!businessIntent || typeof businessIntent.routes !== 'object' || businessIntent.routes === null) {
    return {
      status: 'FAILED',
      errors: [
        'artifacts/analysis/business-intent.json is missing or has no routes object - it is where feature labels come from.',
      ],
    };
  }
  const apiContracts = loadJson(API_CONTRACTS_PATH);
  const contracts = apiContracts && Array.isArray(apiContracts.contracts) ? apiContracts.contracts : [];

  const sourceHash = crypto
    .createHash('sha256')
    .update(
      stableStringify({
        routes: siteMap.routes,
        contracts: contracts,
        intent: Object.entries(businessIntent.routes).map(function (pair) {
          const entry = pair[1] || {};
          return [
            pair[0],
            entry.reviewed === true,
            entry.businessFeature ? entry.businessFeature.value : null,
            entry.criticalityTier ? entry.criticalityTier.value : null,
          ];
        }),
      }),
    )
    .digest('hex');

  const existing = loadJson(FEATURE_MAP_PATH);
  const force = process.argv.indexOf('--force') !== -1;
  if (!force && existing && existing.sourceHash === sourceHash) {
    return {
      status: 'UNCHANGED',
      features: Object.keys(existing.features || {}).length,
      entities: Object.keys(existing.entities || {}).length,
      note: 'Inputs have not changed since the last draft - existing review state kept as is.',
    };
  }

  const entities = {};
  entitiesFromContracts(contracts, entities);
  entitiesFromRoutes(siteMap.routes, entities);
  relationsFromContracts(contracts, entities);
  for (const entity of Object.values(entities)) {
    entity.operations.sort(function (a, b) {
      return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
    });
    entity.relations.sort(function (a, b) {
      return a.viaField < b.viaField ? -1 : a.viaField > b.viaField ? 1 : 0;
    });
    entity.lifecycle = deriveLifecycle(entity);
  }

  const features = deriveFeatures(businessIntent.routes, siteMap.routes);
  attachEntitiesToFeatures(features, entities);

  preserveReview(entities, byId(existing && existing.entities, 'entityId'));
  preserveReview(features, byId(existing && existing.features, 'featureId'));

  const featuresById = {};
  for (const feature of Object.values(features)) featuresById[feature.featureId] = feature;
  const entitiesById = {};
  for (const entity of Object.values(entities)) entitiesById[entity.entityId] = entity;

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    features: featuresById,
    entities: entitiesById,
    sourceHash: sourceHash,
  };
  fs.mkdirSync(path.dirname(FEATURE_MAP_PATH), { recursive: true });
  fs.writeFileSync(FEATURE_MAP_PATH, JSON.stringify(report, null, 2) + '\\n', 'utf8');

  const unreviewedRelations = Object.values(entitiesById).reduce(function (total, entity) {
    return total + (entity.reviewed ? 0 : entity.relations.length);
  }, 0);

  // An entity nothing reached from a mapped route - typically a call made outside any route's own
  // page (a login endpoint) or a resource the UI never links to. Reported rather than dropped: it
  // is either a real part of the system the crawl never surfaced, or a path that only looked like a
  // resource, and only a person can say which.
  const claimedEntityIds = new Set();
  for (const feature of Object.values(featuresById)) {
    for (const entityId of feature.entityIds) claimedEntityIds.add(entityId);
  }
  const orphanEntities = Object.values(entitiesById)
    .filter(function (entity) {
      return !claimedEntityIds.has(entity.entityId);
    })
    .map(function (entity) {
      return entity.name;
    });

  return {
    status: 'DRAFTED',
    features: Object.keys(featuresById).length,
    entities: Object.keys(entitiesById).length,
    unreviewedRelations: unreviewedRelations,
    orphanEntities: orphanEntities,
  };
}

const result = derive();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status === 'FAILED') process.exit(1);
`;
}
