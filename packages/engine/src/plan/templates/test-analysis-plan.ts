// Template for scripts/test-analysis-plan.mjs - where /define-test-conditions stands, feature by
// feature, and what runs next. create-if-absent.
//
// Why this is a script. The stage works feature by feature through five steps - understand the
// feature, research its kind, extract its fields, write the ideas only a reader can have, generate
// the rest - and on an application with twenty features the model's own recollection of which
// feature is at which step is the first thing to go. The position is a fact about files on disk, so
// it is computed here, the same way map-site-questions.mjs computes the next question.
//
// It also decides what the stage is working FROM. Today that is a crawled application; requirements,
// tickets, source code and documents are the other test basis the artifact is built to hold. Given
// both, it asks which to use rather than guessing; given only documents, it says plainly that
// deriving conditions from documents alone is not built yet.

export function renderTestAnalysisPlan(): string {
  return `#!/usr/bin/env node

/**
 * Where /define-test-conditions stands and what runs next - zero model involvement in this file.
 *
 * Usage:
 *   node scripts/test-analysis-plan.mjs [--from=<file|ticket|url>[,...]] [--routes=<id,id>]
 *                                       [--answers='{"basis":"mixed"}']
 *
 * Answers:
 *   { status: 'ASK',  question: {...} }  - which test basis to use; re-run with the answer added
 *   { status: 'STOP', reason, message }  - nothing to analyse, or a basis not built yet
 *   { status: 'PLAN', basis, permissions, features: [...], next }
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const REPORT_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const INVENTORY_DIR = 'artifacts/site-map/inventory';

const FRAME_REGIONS = ['header', 'nav', 'footer', 'aside'];
const FIELD_ROLES = ['textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton'];
const IMPACT_ORDER = { high: 0, medium: 1, low: 2 };
const GENERATED_TECHNIQUES = ['combinatorial', 'boundary-value', 'equivalence-partition', 'checklist-based', 'state-transition', 'use-case'];
const TICKET_KEY = /^[A-Z][A-Z0-9]+-\\d+$/;

const STEP_INSTRUCTIONS = {
  analyse:
    'Understand the feature before any condition: its purpose, how it serves what the application is for, its kind (archetype), what every field means and should obey - with where each constraint comes from - its dependencies, and the questions only a person can answer. Write it under features["<featureId>"].',
  research:
    'Research this kind of feature: node scripts/test-research.mjs status --archetype="<archetype>" first - reuse a cached record, otherwise search, record with "record", or mark the research skipped with the reason.',
  'extract-parameters':
    'Extract the parameters of every route of the feature from its inventory, each resting on the field meaning already written; probe a field the markup does not constrain when permissions allow.',
  'write-ideas':
    'Write the conditions only a reader can have: output properties and metamorphic relations, decision rules, the failures this kind of feature is known for (error-guessing, research findings cited by source), invariants and edge cases - each with its layer, oracle, anchors and risk.',
  generate: 'Run node scripts/generate-test-conditions.mjs - it builds the combinatorial, boundary and checklist conditions and ranks every condition.',
  done: 'Nothing left for this feature before the gates.',
};

function argValue(name) {
  const prefix = '--' + name + '=';
  for (const raw of process.argv.slice(2)) {
    if (raw.indexOf(prefix) === 0) return raw.slice(prefix.length);
  }
  return null;
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\\n');
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

function isField(control) {
  if (!control) return false;
  if (FIELD_ROLES.indexOf(control.role) !== -1) return true;
  if (control.tag === 'select' || control.tag === 'textarea') return true;
  return control.tag === 'input' && control.role !== 'button';
}

// What each --from item is: a file on disk, a ticket key, or an address. Anything else is not a
// basis anyone can read, and is reported rather than silently dropped.
function classifyDocuments(raw) {
  const items = raw
    ? raw
        .split(',')
        .map(function (item) {
          return item.trim();
        })
        .filter(Boolean)
    : [];
  const readable = [];
  const unreadable = [];
  for (const item of items) {
    if (TICKET_KEY.test(item)) readable.push({ ref: item, kind: 'ticket' });
    else if (/^https?:\\/\\//.test(item)) readable.push({ ref: item, kind: 'document' });
    else if (fs.existsSync(path.resolve(CWD, item))) {
      readable.push({ ref: item, kind: /\\.(ts|tsx|js|jsx|mjs|cs|java|py|go|rb|php|kt|swift)$/i.test(item) ? 'code' : 'requirement' });
    } else unreadable.push(item);
  }
  return { readable: readable, unreadable: unreadable };
}

function permissions() {
  try {
    const result = spawnSync('node', [path.join('scripts', 'field-probe.mjs'), 'permissions'], { cwd: CWD, encoding: 'utf8' });
    if (result.status === 0) return JSON.parse(result.stdout);
  } catch {
    // Absent probe script: nothing may be typed, which is the safe reading.
  }
  return { fill: false, submit: false, reason: 'scripts/field-probe.mjs is missing, so no field is probed.' };
}

function decideBasis(live, documents, answers, siteMap) {
  const sources = [];
  if (live && siteMap && typeof siteMap.baseUrl === 'string') sources.push(siteMap.baseUrl);
  const docs = documents.readable.map(function (doc) {
    return doc.ref;
  });
  if (!live && docs.length === 0) {
    return {
      stop: {
        reason: 'nothing-to-analyse',
        message:
          'There is nothing to derive test conditions from yet: no crawled application with a reviewed feature map, and no documents named. Run /map-site and /map-features first, or name requirements, tickets or code with --from.',
      },
    };
  }
  let mode = null;
  if (live && docs.length === 0) mode = 'live-app';
  else if (!live) mode = 'documents';
  else if (answers.basis) mode = answers.basis;
  else {
    return {
      ask: {
        id: 'basis',
        text: 'There is a crawled application and there are documents. What should the test conditions come from?',
        options: [
          { id: 'mixed', label: 'The application, with the documents as evidence for what is right', recommended: true },
          { id: 'live-app', label: 'The application only - leave the documents out this time' },
          { id: 'documents', label: 'The documents only' },
        ],
      },
    };
  }
  if (mode === 'documents') {
    return {
      stop: {
        reason: 'documents-basis-not-built',
        message:
          'Deriving test conditions from documents alone is not built yet. The artifact already records document, ticket, requirement and code anchors, so the documents can back the conditions of a crawled application now (the "mixed" basis); a documents-only run needs a crawled application for the time being.',
      },
    };
  }
  return { basis: { mode: mode, sources: sources.concat(mode === 'mixed' ? docs : []) } };
}

function main() {
  const errors = [];
  let answers = {};
  const rawAnswers = argValue('answers');
  if (rawAnswers !== null) {
    try {
      answers = JSON.parse(rawAnswers) || {};
    } catch (err) {
      errors.push('--answers is not valid JSON: ' + err.message);
    }
  }
  if (answers.basis !== undefined && ['mixed', 'live-app', 'documents'].indexOf(answers.basis) === -1) {
    errors.push('basis was answered "' + answers.basis + '", which is not one of mixed, live-app, documents.');
  }
  const documents = classifyDocuments(argValue('from'));
  if (documents.unreadable.length > 0) {
    errors.push('--from names what cannot be read: ' + documents.unreadable.join(', ') + ' - a file path, a ticket key or an address.');
  }
  if (errors.length > 0) {
    emit({ status: 'FAILED', errors: errors });
    process.exit(1);
  }

  const siteMap = readJson(SITE_MAP_PATH);
  const featureMap = readJson(FEATURE_MAP_PATH);
  const reviewedRoutes = new Set();
  if (featureMap && featureMap.routes && typeof featureMap.routes === 'object') {
    for (const [routeId, intent] of Object.entries(featureMap.routes)) {
      if (intent && intent.reviewed === true) reviewedRoutes.add(routeId);
    }
  }
  const live = siteMap !== null && reviewedRoutes.size > 0;
  const decided = decideBasis(live, documents, answers, siteMap);
  if (decided.stop) return emit(Object.assign({ status: 'STOP' }, decided.stop));
  if (decided.ask) return emit({ status: 'ASK', question: decided.ask });

  const onlyRoutes = argValue('routes');
  const wanted = onlyRoutes
    ? new Set(
        onlyRoutes
          .split(',')
          .map(function (id) {
            return id.trim();
          })
          .filter(Boolean),
      )
    : null;
  const report = readJson(REPORT_PATH);
  const analyses = report && report.features && typeof report.features === 'object' ? report.features : {};
  const entries = report && report.routes && typeof report.routes === 'object' ? report.routes : {};
  const inventoryOf = {};
  if (siteMap && siteMap.routes) {
    for (const route of Object.values(siteMap.routes)) {
      if (route && typeof route.routeId === 'string') {
        inventoryOf[route.routeId] = typeof route.inventory === 'string' ? route.inventory : INVENTORY_DIR + '/' + route.routeId + '.json';
      }
    }
  }

  const byFeature = new Map();
  for (const routeId of reviewedRoutes) {
    if (wanted && !wanted.has(routeId)) continue;
    const intent = featureMap.routes[routeId];
    const featureId = intent.featureId;
    if (!byFeature.has(featureId)) byFeature.set(featureId, []);
    byFeature.get(featureId).push(routeId);
  }

  const features = [];
  for (const [featureId, routeIds] of byFeature) {
    const feature = featureMap.features && featureMap.features[featureId] ? featureMap.features[featureId] : {};
    const analysis = analyses[featureId];
    // Fields of the feature's own routes, outside the site frame: every one needs a meaning.
    let fieldCount = 0;
    let explained = 0;
    for (const routeId of routeIds) {
      const inventory = inventoryOf[routeId] ? readJson(path.join(CWD, inventoryOf[routeId])) : null;
      const controls = inventory && Array.isArray(inventory.controls) ? inventory.controls : [];
      for (const control of controls) {
        if (!isField(control) || FRAME_REGIONS.indexOf(control.region) !== -1) continue;
        fieldCount++;
        const has =
          analysis &&
          Array.isArray(analysis.fields) &&
          analysis.fields.some(function (field) {
            return field && field.routeId === routeId && field.control === control.id;
          });
        if (has) explained++;
      }
    }
    const routeEntries = routeIds.map(function (routeId) {
      return entries[routeId];
    });
    const extracted = routeEntries.every(function (entry) {
      return entry && Array.isArray(entry.parameters);
    });
    const conditions = [];
    routeEntries.forEach(function (entry) {
      (entry && Array.isArray(entry.conditions) ? entry.conditions : []).forEach(function (condition) {
        if (condition && condition.featureId === featureId) conditions.push(condition);
      });
    });
    const authored = conditions.filter(function (condition) {
      return condition.origin ? condition.origin !== 'generated' : GENERATED_TECHNIQUES.indexOf(condition.technique) === -1;
    }).length;
    const generated =
      extracted &&
      routeEntries.every(function (entry) {
        return typeof entry.sourceParamsHash === 'string' && entry.sourceParamsHash.length > 0;
      }) &&
      conditions.every(function (condition) {
        return typeof condition.priority === 'string';
      });
    const research = analysis && analysis.research && analysis.research.status ? analysis.research.status : 'missing';

    let next = 'done';
    if (!analysis || explained < fieldCount) next = 'analyse';
    else if (research === 'missing') next = 'research';
    else if (!extracted) next = 'extract-parameters';
    else if (authored === 0) next = 'write-ideas';
    else if (!generated) next = 'generate';

    features.push({
      featureId: featureId,
      name: feature.name || featureId,
      impact: feature.impact || 'high',
      routeIds: routeIds.sort(),
      progress: {
        analysed: Boolean(analysis),
        fieldsExplained: explained + '/' + fieldCount,
        research: research,
        parametersExtracted: extracted,
        authoredConditions: authored,
        generated: generated,
        openQuestions:
          analysis && Array.isArray(analysis.questions)
            ? analysis.questions.filter(function (question) {
                return question && typeof question.answer !== 'string';
              }).length
            : 0,
      },
      next: next,
    });
  }
  // The riskiest feature first: when a run is cut short, what it finished is what mattered most.
  features.sort(function (a, b) {
    return (IMPACT_ORDER[a.impact] ?? 0) - (IMPACT_ORDER[b.impact] ?? 0) || String(a.name).localeCompare(String(b.name));
  });
  const pending = features.find(function (feature) {
    return feature.next !== 'done';
  });
  emit({
    status: 'PLAN',
    basis: decided.basis,
    permissions: permissions(),
    features: features,
    next: pending
      ? { featureId: pending.featureId, name: pending.name, step: pending.next, instruction: STEP_INSTRUCTIONS[pending.next] }
      : { step: 'gates', instruction: 'Every feature is through its steps: run the validators, then the review.' },
  });
}

main();
`;
}
