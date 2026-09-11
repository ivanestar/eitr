// Template for scripts/render-review-artifact.mjs - renders a stage's review artifact from its own
// JSON, and decides deterministically whether it is small enough to print into the chat or big
// enough to belong in a file the human can actually read.
//
// Two problems this fixes, both live-observed. First, a 46-route run printed its review as one
// unbroken wall of text and the assistant "summarized" the tail as "(and similarly for the other 29
// exercises...)" - the human never saw 29 routes they were being asked to approve. Second, any
// summary an assistant composes from an artifact is a paraphrase, so what the human reviews and what
// the pipeline stored can silently disagree; rendering from the JSON in code makes that class of
// drift impossible.
//
// The threshold is a UX judgment, stated once here rather than left to per-run improvisation: a
// feature block is 5-6 terminal lines, so ~10 entries is where a review stops fitting on one
// screen and starts scrolling past the top of the window.
export function renderReviewArtifactRenderer(): string {
  return `#!/usr/bin/env node

/**
 * Renders a pipeline stage's review artifact deterministically from its own JSON - zero model
 * involvement, so what the human reviews is exactly what was stored.
 *
 * Usage:
 *   node scripts/render-review-artifact.mjs --kind=site-map
 *   node scripts/render-review-artifact.mjs --kind=feature-map
 *   node scripts/render-review-artifact.mjs --kind=test-conditions [--threshold=10]
 *   node scripts/render-review-artifact.mjs --kind=test-cases
 *
 * Prints JSON: { kind, entryCount, threshold, mode, filePath, editable, summary, markdown }.
 *   mode 'inline' - 'markdown' holds the whole artifact; print it as-is.
 *   mode 'file'   - the artifact is in 'filePath'; print 'summary' and that path instead.
 *
 * site-map, feature-map and test-conditions are always written to artifacts/review/<kind>-review.md,
 * whatever their size, because a person may review them by editing that file directly - ticking
 * what they approve, answering questions, correcting text. scripts/apply-review.mjs reads the edits
 * back. The file is never deleted: render again after any change and it shows the current state.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { conflictsFor, recordedVerdicts, syncJournal, SENSORS } from './corroboration.mjs';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
// The crawl's own state, read for the list of links it refused. Absent on a project whose map was
// written by something other than a crawl, which the renderer treats as "nothing to show" rather
// than an error.
const CRAWL_BUDGET_PATH = path.join(CWD, 'artifacts', 'site-map', '.crawl-budget.json');
const APP_PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const INVENTORY_DIR = path.join(CWD, 'artifacts', 'site-map', 'inventory');
const TEST_CASES_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');
const REVIEW_DIR = path.join(CWD, 'artifacts', 'review');
const DEFAULT_THRESHOLD = 10;

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function fail(message) {
  process.stderr.write('[render-review-artifact] ' + message + '\\n');
  process.exit(1);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Every artifact in this pipeline keys by routeId, and a raw routeId means nothing to a human -
// resolve it to the path/title the site map already records, exactly once, here.
function buildRouteLabels(siteMap) {
  const labels = new Map();
  if (!siteMap || !siteMap.routes || typeof siteMap.routes !== 'object') return labels;
  for (const [routePath, entry] of Object.entries(siteMap.routes)) {
    if (!entry || typeof entry.routeId !== 'string') continue;
    const title = typeof entry.title === 'string' && entry.title ? entry.title : null;
    labels.set(entry.routeId, {
      path: routePath,
      title,
      label: title ? routePath + ' - ' + title : routePath,
      flags:
        entry.visualTriage && Array.isArray(entry.visualTriage.flags) ? entry.visualTriage.flags : [],
    });
  }
  return labels;
}

function labelFor(labels, routeId) {
  const found = labels.get(routeId);
  return found ? found.label : '(route ' + routeId + ' is not in the site map)';
}

function fieldValue(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : undefined;
}

function dedupedEvidence(fields) {
  const seen = new Set();
  const excerpts = [];
  for (const field of fields) {
    const entries = field && Array.isArray(field.evidence) ? field.evidence : [];
    for (const item of entries) {
      if (!item || typeof item.excerpt !== 'string') continue;
      const key = (item.signal || '') + '\\u0000' + item.excerpt;
      if (seen.has(key)) continue;
      seen.add(key);
      excerpts.push(item.excerpt);
    }
  }
  return excerpts;
}

// A constraint stores partition ids, which are internal identifiers - a human reads the partition's
// own first sample value instead ('shippingMethod="Express"', not 'shippingMethod=part_3').
function sampleFor(entry, paramName, partitionId) {
  const parameters = Array.isArray(entry.parameters) ? entry.parameters : [];
  for (const parameter of parameters) {
    if (!parameter || parameter.name !== paramName) continue;
    const partitions = Array.isArray(parameter.partitions) ? parameter.partitions : [];
    for (const partition of partitions) {
      if (!partition || partition.id !== partitionId) continue;
      const samples = Array.isArray(partition.sampleValues) ? partition.sampleValues : [];
      if (samples.length > 0) return '"' + samples[0] + '"';
      return partitionId;
    }
  }
  return partitionId;
}

// How a person recognises a control the analysis cites by id: its role and label, or where it sits
// when it has no label.
function controlLabel(control) {
  if (!control) return '';
  if (control.name) return control.role + ' "' + control.name + '"';
  return control.role + (control.hint ? ' next to "' + control.hint + '"' : ' with no label');
}

// A review file is edited in place, as plain text: a box a person ticks, a short label (F2, P5, C14)
// by which scripts/apply-review.mjs finds the entry again. The label is the entry's position in this
// rendering, which holds exactly as long as the JSON it was rendered from - so the rendering keeps a
// copy of itself and of what each label stood for, and a changed JSON is detected rather than
// guessed at.
function box(approved) {
  return approved === true ? '[x]' : '[ ]';
}

const MISSING_PAGES_HEADING = '**Pages the crawl did not find**';

function conflictsOf(stage) {
  try {
    return conflictsFor(stage);
  } catch {
    return [];
  }
}

function conflictCount(byRoute) {
  let total = 0;
  for (const list of byRoute.values()) total += list.length;
  return total;
}

function sensorLabel(sensor) {
  return SENSORS[sensor] ? SENSORS[sensor].label : sensor;
}

function newRegistry() {
  const labels = {};
  return {
    labels: labels,
    add: function (label, ref) {
      labels[label] = ref;
    },
  };
}

// Which entry each line of a rendering belongs to: the nearest label above it, until a section
// heading. apply-review.mjs uses it to say which entry a person's edit was about.
const LABEL_LINE = /^\\s*(?:[-*]\\s+)?(?:\\[[ xX]\\]\\s+)?(ALL|[A-Z]\\d+)\\.(?:\\s|$)/;

function ownersOf(lines) {
  const owners = [];
  let owner = null;
  for (const line of lines) {
    const match = LABEL_LINE.exec(line);
    if (match) owner = match[1];
    else if (/^\\*\\*/.test(line)) owner = null;
    owners.push(owner);
  }
  return owners;
}

const EDIT_HELP = {
  'site-map': [
    'You can review this file right here: edit it, save it, then tell the assistant you are done.',
    '',
    '- Correct anything by changing the text itself, or add a line under a route saying what is wrong.',
    '- Settle a disagreement by writing works or broken after Verdict:.',
    '- Add a page the crawl missed under "Pages the crawl did not find".',
    '- Leave the labels (R1, D1) as they are - they are how the assistant finds each entry.',
  ],
  'feature-map': [
    'You can review this file right here: edit it, save it, then tell the assistant you are done.',
    '',
    '- Approve an entry by putting an x in its box: [x]. Tick ALL to approve every entry you did not change.',
    '- Correct anything by changing the text itself, or add a line under the entry saying what is wrong. The assistant applies it and re-checks whatever depends on it.',
    '- Leave the labels (F1, P3, E2) as they are - they are how the assistant finds each entry.',
  ],
  'test-conditions': [
    'You can review this file right here: edit it, save it, then tell the assistant you are done.',
    '',
    '- Approve a condition by putting an x in its box: [x]. A feature\\'s box approves all of its conditions; ALL approves every one you did not change.',
    '- Answer a question on its Answer: line.',
    '- Cut a condition by deleting its line. It moves to "Cut by you", where ticking it brings it back.',
    '- Correct anything else by changing the text itself, or add a line saying what is wrong. The assistant applies it and re-checks whatever depends on it.',
    '- Leave the labels (F1, C12, Q3) as they are - they are how the assistant finds each entry.',
  ],
};

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Where a condition's expected result comes from decides what it can catch: a result that is known to
// be right catches a defect already there; one read off the application as it stands only catches a
// change. The review says which, per condition.
const REGRESSION_ORACLES = ['observed', 'markup'];
const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2 };
const LAYER_ORDER = { behavior: 0, rule: 1, field: 2, frame: 3 };
const IMPACT_RANK = { high: 0, medium: 1, low: 2 };

function oracleTag(condition) {
  if (!condition.oracle) return '';
  return (REGRESSION_ORACLES.indexOf(condition.oracle) !== -1 ? 'regression: ' : 'correct: ') + condition.oracle;
}

function researchLine(research) {
  if (!research || typeof research !== 'object') return 'Research: not recorded';
  if (research.status === 'skipped') return 'Research: skipped - ' + (research.reason || 'no reason given');
  const record = typeof research.file === 'string' ? loadJson(path.join(CWD, research.file)) : null;
  const count = record && Array.isArray(record.sources) ? record.sources.length : 0;
  return (
    'Research: ' +
    (research.status === 'cached' ? 'reused, ' : '') +
    count +
    ' source(s) on "' +
    (research.archetype || '?') +
    '"' +
    (research.file ? ' (' + research.file + ')' : '')
  );
}

// One feature's block: what the analysis understood, what is still a question for the reader, and
// every condition in priority order - the list a person approves, cuts or reorders.
function renderFeatureBlock(lines, labels, feature, analysis, items, controlsByRoute, registry, counters) {
  counters.feature += 1;
  const allApproved =
    items.length > 0 &&
    items.every(function (item) {
      return item.condition.reviewed === true;
    });
  // The feature's box stands for its conditions, so its label carries their labels.
  const featureRef = { type: 'feature', id: feature.featureId || null, conditions: [] };
  registry.add('F' + counters.feature, featureRef);
  lines.push('- ' + box(allApproved) + ' F' + counters.feature + '. **' + feature.name + '** (impact ' + feature.impact + ')');
  if (analysis) {
    lines.push('What it is: ' + analysis.purpose + ' ' + (analysis.fitsApplication || ''));
    lines.push('Kind: ' + analysis.archetype + ' - ' + researchLine(analysis.research));
    const fields = Array.isArray(analysis.fields) ? analysis.fields : [];
    if (fields.length > 0) {
      lines.push('Fields:');
      fields.forEach(function (field) {
        const control = field.control && controlsByRoute[field.routeId] ? controlsByRoute[field.routeId][field.control] : null;
        const constraints = (Array.isArray(field.constraints) ? field.constraints : [])
          .map(function (constraint) {
            return constraint.statement + ' [' + constraint.source + (constraint.enforcement === 'not-enforced' ? ', NOT ENFORCED' : '') + ']';
          })
          .join('; ');
        lines.push(
          '- ' +
            (controlLabel(control) || field.parameter || field.control) +
            ': ' +
            field.meaning +
            (field.unit ? ' (' + field.unit + ')' : '') +
            (constraints ? ' - ' + constraints : ''),
        );
      });
    }
    // Every question, answered or not, each with the line its answer goes on - so an answer can be
    // written, or corrected, right here.
    const questions = Array.isArray(analysis.questions) ? analysis.questions : [];
    if (questions.length > 0) {
      lines.push('Questions for you:');
      questions.forEach(function (question, index) {
        if (!question) return;
        counters.question += 1;
        registry.add('Q' + counters.question, { type: 'question', featureId: analysis.featureId, index: index });
        lines.push('Q' + counters.question + '. ' + question.text);
        lines.push('    Answer: ' + (typeof question.answer === 'string' ? question.answer : ''));
      });
    }
  } else {
    lines.push('(no analysis recorded for this feature)');
  }
  const tiers = { P1: 0, P2: 0, P3: 0 };
  items.forEach(function (item) {
    if (tiers[item.condition.priority] !== undefined) tiers[item.condition.priority]++;
  });
  lines.push('Conditions - P1: ' + tiers.P1 + ', P2: ' + tiers.P2 + ', P3: ' + tiers.P3);
  items.forEach(function (item) {
    const condition = item.condition;
    const tags = [condition.priority || '?', condition.layer || '?', (condition.technique || '?') + (condition.relation ? '/' + condition.relation : '')];
    const oracle = oracleTag(condition);
    if (oracle) tags.push(oracle);
    counters.condition += 1;
    registry.add('C' + counters.condition, { type: 'condition', routeId: item.routeId, conditionId: condition.conditionId, cut: false });
    featureRef.conditions.push('C' + counters.condition);
    lines.push(
      '- ' +
        box(condition.reviewed) +
        ' C' +
        counters.condition +
        '. ' +
        (condition.description || '(no description)') +
        '  [' +
        tags.join(' | ') +
        ']' +
        (item.routeCount > 1 ? ' on ' + labelFor(labels, item.routeId) : '') +
        (condition.risk && condition.risk.reason && condition.origin !== 'generated' ? ' - why: ' + condition.risk.reason : '') +
        (condition.valueNote ? ' - note: ' + condition.valueNote : ''),
    );
  });
}

function renderTestConditions(labels, data, registry) {
  const routes = data && data.routes && typeof data.routes === 'object' ? data.routes : {};
  const entries = Object.values(routes).filter(Boolean);
  entries.sort(function (a, b) {
    return labelFor(labels, a.routeId).localeCompare(labelFor(labels, b.routeId));
  });
  const analyses = data && data.features && typeof data.features === 'object' ? data.features : {};
  const featureMap = loadJson(path.join(CWD, 'artifacts', 'analysis', 'feature-map.json'));
  const mapped = featureMap && featureMap.features && typeof featureMap.features === 'object' ? featureMap.features : {};

  const lines = [];
  lines.push(
    'Each condition says where its expected result comes from: "correct" (a requirement, a person, research, the meaning of the feature) can catch a defect that is already there; "regression" (what the page states or was seen doing) only catches a change.',
  );
  lines.push('');
  // The site frame's own fields are tested once, on the route named in frameRouteId, and left out of
  // every other page on purpose - so say where they went rather than let a reader conclude the
  // language switcher is simply untested, or tested nowhere without anyone having decided that.
  const shared = loadJson(path.join(INVENTORY_DIR, 'shared.json'));
  const frameFields = [];
  for (const widget of shared && Array.isArray(shared.widgets) ? shared.widgets : []) {
    for (const control of Array.isArray(widget.controls) ? widget.controls : []) {
      if (['input', 'select', 'textarea'].indexOf(control.tag) !== -1) {
        frameFields.push(widget.name + ': ' + controlLabel(control));
      }
    }
  }
  if (frameFields.length > 0) {
    const frameRouteId = data && typeof data.frameRouteId === 'string' ? data.frameRouteId : null;
    lines.push(
      (frameRouteId
        ? 'Site frame fields are tested once, on ' + labelFor(labels, frameRouteId) + ': '
        : 'Site frame fields are not part of any page below: ') + frameFields.join('; '),
    );
    lines.push('');
  }
  let conditionCount = 0;
  const techniqueCounts = {};
  const tierCounts = { P1: 0, P2: 0, P3: 0 };
  let unsatisfiedTotal = 0;

  // Conditions by the feature they serve, each feature's in priority order - then layer, so what a
  // feature does comes before what its fields let in. A condition a person cut is listed apart, where
  // it can be brought back, and counts nowhere else.
  const byFeature = new Map();
  const cutItems = [];
  const controlsByRoute = {};
  for (const entry of entries) {
    const inventory = loadJson(path.join(INVENTORY_DIR, entry.routeId + '.json'));
    const byId = {};
    for (const control of inventory && Array.isArray(inventory.controls) ? inventory.controls : []) byId[control.id] = control;
    controlsByRoute[entry.routeId] = byId;
    for (const condition of Array.isArray(entry.conditions) ? entry.conditions : []) {
      if (condition && condition.cut === true) {
        cutItems.push({ condition: condition, routeId: entry.routeId });
        continue;
      }
      const featureId = typeof condition.featureId === 'string' ? condition.featureId : '(none)';
      if (!byFeature.has(featureId)) byFeature.set(featureId, []);
      byFeature.get(featureId).push({ condition: condition, routeId: entry.routeId });
      conditionCount += 1;
      const technique = condition.technique || 'unspecified';
      techniqueCounts[technique] = (techniqueCounts[technique] || 0) + 1;
      if (tierCounts[condition.priority] !== undefined) tierCounts[condition.priority]++;
    }
  }
  for (const featureId of Object.keys(analyses)) if (!byFeature.has(featureId)) byFeature.set(featureId, []);
  const featureIds = Array.from(byFeature.keys()).sort(function (a, b) {
    const fa = mapped[a] || {};
    const fb = mapped[b] || {};
    return (IMPACT_RANK[fa.impact] ?? 3) - (IMPACT_RANK[fb.impact] ?? 3) || String(fa.name || a).localeCompare(String(fb.name || b));
  });
  const counters = { feature: 0, condition: 0, question: 0 };
  for (const featureId of featureIds) {
    const items = byFeature.get(featureId);
    const routeSet = new Set(
      items.map(function (item) {
        return item.routeId;
      }),
    );
    items.forEach(function (item) {
      item.routeCount = routeSet.size;
    });
    items.sort(function (a, b) {
      return (
        (PRIORITY_ORDER[a.condition.priority] ?? 3) - (PRIORITY_ORDER[b.condition.priority] ?? 3) ||
        (b.condition.riskScore || 0) - (a.condition.riskScore || 0) ||
        (LAYER_ORDER[a.condition.layer] ?? 4) - (LAYER_ORDER[b.condition.layer] ?? 4) ||
        String(a.condition.description).localeCompare(String(b.condition.description))
      );
    });
    const feature = mapped[featureId] || {
      featureId: featureId === '(none)' ? null : featureId,
      name: featureId === '(none)' ? 'Conditions with no feature' : featureId,
      impact: '?',
    };
    renderFeatureBlock(lines, labels, feature, analyses[featureId], items, controlsByRoute, registry, counters);
    lines.push('');
  }

  // What stays per route: the constraints a route's fields carry, pairs it could not cover, and the
  // fields it left out - each a decision a person should see.
  for (const entry of entries) {
    const constraints = Array.isArray(entry.constraints) ? entry.constraints : [];
    const unsatisfied = Array.isArray(entry.unsatisfiedPairs) ? entry.unsatisfiedPairs.length : 0;
    const excluded = Array.isArray(entry.excluded) ? entry.excluded : [];
    unsatisfiedTotal += unsatisfied;
    if (constraints.length === 0 && unsatisfied === 0 && excluded.length === 0) continue;
    lines.push('**' + labelFor(labels, entry.routeId) + '**');
    if (constraints.length > 0) {
      lines.push(
        'Constraints: ' +
          constraints
            .map(function (rule) {
              return (
                rule.ifParam +
                '=' +
                sampleFor(entry, rule.ifParam, rule.ifPartition) +
                ' excludes ' +
                rule.thenParam +
                '=' +
                sampleFor(entry, rule.thenParam, rule.thenExcludesPartition)
              );
            })
            .join('; '),
      );
    }
    if (unsatisfied > 0) lines.push('Unsatisfied pairs: ' + unsatisfied);
    // A field left out is a decision a person should see and be able to overturn.
    if (excluded.length > 0) {
      const byId = controlsByRoute[entry.routeId] || {};
      lines.push(
        'Fields left out: ' +
          excluded
            .map(function (item) {
              return (
                (controlLabel(byId[item.control]) || item.control) +
                ' - ' +
                item.reason +
                (item.note ? ' (' + item.note + ')' : '')
              );
            })
            .join('; '),
      );
    }
    lines.push('');
  }

  if (cutItems.length > 0) {
    lines.push('**Cut by you (' + cutItems.length + ')**');
    lines.push('');
    lines.push('Tick one to bring it back.');
    lines.push('');
    for (const item of cutItems) {
      counters.condition += 1;
      registry.add('C' + counters.condition, {
        type: 'condition',
        routeId: item.routeId,
        conditionId: item.condition.conditionId,
        cut: true,
      });
      lines.push('- [ ] C' + counters.condition + '. ' + (item.condition.description || '(no description)'));
    }
    lines.push('');
  }

  const techniqueSummary = Object.keys(techniqueCounts)
    .sort()
    .map(function (technique) {
      return techniqueCounts[technique] + ' ' + technique;
    })
    .join(', ');

  let openQuestions = 0;
  for (const analysis of Object.values(analyses)) {
    for (const question of analysis && Array.isArray(analysis.questions) ? analysis.questions : []) {
      if (question && typeof question.answer !== 'string') openQuestions++;
    }
  }

  return {
    entryCount: featureIds.length,
    markdown: lines.join('\\n').trimEnd(),
    summary:
      conditionCount +
      ' condition(s) across ' +
      featureIds.length +
      ' feature(s) and ' +
      entries.length +
      ' route(s) - P1: ' +
      tierCounts.P1 +
      ', P2: ' +
      tierCounts.P2 +
      ', P3: ' +
      tierCounts.P3 +
      (techniqueSummary ? ' (' + techniqueSummary + ')' : '') +
      (unsatisfiedTotal > 0 ? ', ' + unsatisfiedTotal + ' uncoverable parameter pair(s)' : '') +
      (openQuestions > 0 ? ', ' + openQuestions + ' question(s) for you' : '') +
      (cutItems.length > 0 ? ', ' + cutItems.length + ' cut by you' : ''),
  };
}


// Route ids joined the way a person reads a walk: in the order the journey visits them.
function journeyHeading(labels, journey) {
  const routeIds = Array.isArray(journey.routeIds) ? journey.routeIds : [];
  const routes = routeIds
    .map(function (routeId) {
      return labelFor(labels, routeId);
    })
    .join(' -> ');
  // What drives the test and how far it reaches are the two things a reviewer needs before reading
  // the steps - an API check and a browser walk are not corrected the same way.
  const shape =
    journey.breadth === 'e2e'
      ? 'end-to-end via ' + journey.testInterface
      : 'targeted via ' + journey.testInterface;
  return '**' + (routes || '(no route)') + '** [' + shape + ']';
}

function renderTestCases(labels, data) {
  const all =
    data && typeof data.journeys === 'object' && data.journeys !== null
      ? Object.values(data.journeys)
      : [];
  const journeys = all.filter(function (journey) {
    return journey && journey.testCase;
  });
  // Feature walks first: they are the ones a reviewer most needs to see, and they explain the
  // targeted journeys underneath them.
  journeys.sort(function (a, b) {
    if (a.breadth !== b.breadth) return a.breadth === 'e2e' ? -1 : 1;
    return journeyHeading(labels, a).localeCompare(journeyHeading(labels, b));
  });

  const lines = [];
  let stepCount = 0;
  let ungroundedSteps = 0;
  let automated = 0;

  for (const journey of journeys) {
    if (journey.reviewed === true) automated += 1;
    lines.push(journeyHeading(labels, journey));
    const testCase = journey.testCase || {};
    lines.push('Title: ' + (testCase.title || '(untitled)'));
    const preconditions = Array.isArray(testCase.preconditions) ? testCase.preconditions : [];
    if (preconditions.length > 0) lines.push('Preconditions: ' + preconditions.join(', '));
    const steps = Array.isArray(testCase.steps) ? testCase.steps : [];
    steps.forEach(function (step, index) {
      stepCount += 1;
      const ungrounded = step.api && step.api.contractGrounded === false;
      if (ungrounded) ungroundedSteps += 1;
      lines.push(
        '' +
          (index + 1) +
          '. ' +
          (step.description || '(no description)') +
          ' -> ' +
          (step.expectedResult || '(no expected result)') +
          (ungrounded ? ' [NO OBSERVED API CONTRACT]' : ''),
      );
    });
    lines.push('');
  }

  return {
    entryCount: journeys.length,
    markdown: lines.join('\\n').trimEnd(),
    summary:
      journeys.length +
      ' drafted test case(s), ' +
      stepCount +
      ' step(s) total, ' +
      automated +
      ' already automated, ' +
      (journeys.length - automated) +
      ' awaiting automation' +
      (ungroundedSteps > 0 ? ', ' + ungroundedSteps + ' step(s) with no observed API contract' : ''),
  };
}

const OPERATION_PHRASE = {
  create: 'created',
  read: 'read',
  list: 'listed',
  update: 'updated',
  delete: 'deleted',
};

// Entities are rendered as their own numbered section rather than nested under each feature: a
// relation is the one claim in this artifact a wrong answer is expensive on, and burying the same
// entity under three features would ask a person to approve it three times while showing them a
// third of its links each time.
function renderFeatureMap(labels, data, registry) {
  const features = data && data.features && typeof data.features === 'object' ? Object.values(data.features) : [];
  const entities = data && data.entities && typeof data.entities === 'object' ? Object.values(data.entities) : [];
  const entityNameById = new Map();
  for (const entity of entities) entityNameById.set(entity.entityId, entity.name);

  features.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });
  entities.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });

  const routeIntents = data && data.routes && typeof data.routes === 'object' ? data.routes : {};

  const lines = [];

  // The application-level facts a reviewer needs in front of them while judging impact live in
  // app-profile.json - the confirmed purpose, and what each crawled role turned out to reach. They
  // are read from there rather than copied into this artifact: one fact, one home.
  const profile = loadJson(APP_PROFILE_PATH);
  const selectedPurpose = profile && profile.corePurpose ? fieldValue(profile.corePurpose.selected) : undefined;
  if (selectedPurpose) {
    lines.push('Confirmed core purpose: ' + selectedPurpose);
    lines.push('');
  }
  const roles = profile && profile.roles && typeof profile.roles === 'object' ? Object.values(profile.roles) : [];
  // Every entry below that spans more than one line - a role, a feature, a page inside a feature, an
  // entity - is followed by a blank line, so where one ends and the next begins is visible at a
  // glance in the raw file and in any markdown preview alike.
  if (roles.length > 0) {
    lines.push('**Roles crawled**');
    lines.push('');
    for (const role of roles) {
      const purpose = fieldValue(role.purpose);
      lines.push('- ' + role.name + ': ' + (purpose === undefined ? '(no purpose recorded)' : purpose));
      const exclusive = Array.isArray(role.exclusiveRoutes) ? role.exclusiveRoutes : [];
      lines.push(
        '  Reaches on its own: ' +
          (exclusive.length > 0 ? exclusive.join(', ') : 'nothing the other crawled roles could not'),
      );
      lines.push('');
    }
  }

  // Where the independent records disagree with a page's rating or with the evidence quoted for it -
  // shown under the page, since that is where the person decides.
  const conflictsByRoute = new Map();
  for (const conflict of conflictsOf('feature-map')) {
    const routeId = conflict.subject.routeId;
    if (!conflictsByRoute.has(routeId)) conflictsByRoute.set(routeId, []);
    conflictsByRoute.get(routeId).push(conflict);
  }
  let pageNumber = 0;
  function pageLines(routeId, indent) {
    const intent = routeIntents[routeId];
    const tier = intent && intent.criticality ? String(intent.criticality.value).toUpperCase() : null;
    const phantom = labels.get(routeId);
    const flagged = phantom && phantom.flags.indexOf('likely-phantom-route') !== -1;
    // Only a page with a rating has anything to approve, so only such a page gets a box and a label.
    let head = indent + '- ';
    if (intent) {
      pageNumber += 1;
      registry.add('P' + pageNumber, { type: 'page', routeId: routeId });
      head += box(intent.reviewed) + ' P' + pageNumber + '. ';
    }
    lines.push(
      head +
        labelFor(labels, routeId) +
        (tier ? ' - **' + tier + '**' : ' - no criticality recorded') +
        (flagged ? ' [possibly not a real route]' : ''),
    );
    const reasoning = intent && intent.criticality ? intent.criticality.reasoning : undefined;
    if (reasoning) lines.push(indent + '  ' + reasoning);
    const excerpts = dedupedEvidence([intent && intent.criticality]);
    if (excerpts.length > 0) {
      lines.push(
        indent +
          '  Evidences: ' +
          excerpts
            .map(function (e) {
              return '"' + e + '"';
            })
            .join(', '),
      );
    }
    const keptByPerson = intent && intent.reviewed === true && intent.reviewedBy === 'human';
    for (const conflict of conflictsByRoute.get(routeId) || []) {
      lines.push(indent + '  ' + (keptByPerson ? '[CONFLICT - approved as it is] ' : '[CONFLICT] ') + conflict.message);
    }
    lines.push('');
  }

  lines.push('**Features**');
  lines.push('');
  features.forEach(function (feature, i) {
    registry.add('F' + (i + 1), { type: 'feature', id: feature.featureId });
    lines.push(
      '- ' +
        box(feature.reviewed) +
        ' F' +
        (i + 1) +
        '. ' +
        feature.name +
        ' - **' +
        String(feature.impact).toUpperCase() +
        ' IMPACT**',
    );
    const routes = Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : [];
    if (routes.length === 0) {
      lines.push('   Pages: (none)');
    } else {
      // Each page with its own criticality and the sentence justifying it, rather than a bare list
      // of paths: the tier is the thing a reviewer is actually being asked to check, and checking it
      // means reading it against the page it was given for.
      lines.push('   Pages:');
      lines.push('');
      const sorted = routes.slice().sort(function (a, b) {
        return labelFor(labels, a).localeCompare(labelFor(labels, b));
      });
      for (const routeId of sorted) pageLines(routeId, '   ');
    }
    const names = (Array.isArray(feature.entityIds) ? feature.entityIds : [])
      .map(function (entityId) {
        return entityNameById.get(entityId) || entityId;
      })
      .sort();
    lines.push('   Works with: ' + (names.length > 0 ? names.join(', ') : 'nothing this pass could tie to it'));
    if (feature.impactSourceRouteId) {
      lines.push('   Impact comes from: ' + labelFor(labels, feature.impactSourceRouteId));
    } else {
      lines.push(
        '   Impact comes from: no page carried a criticality to draw it from, so it is assumed important until you say otherwise.',
      );
    }
    lines.push('');
  });

  // A page the site map has and no feature claims will never be tested by anything downstream, and
  // nothing else in this artifact would say so.
  const claimed = new Set();
  for (const feature of features) {
    for (const routeId of Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : []) {
      claimed.add(routeId);
    }
  }
  const unclaimed = Array.from(labels.keys()).filter(function (routeId) {
    return !claimed.has(routeId);
  });
  if (unclaimed.length > 0) {
    lines.push('**Pages no feature claims**');
    lines.push('');
    lines.push('Nothing downstream will test these until they belong somewhere:');
    lines.push('');
    for (const routeId of unclaimed.sort(function (a, b) {
      return labelFor(labels, a).localeCompare(labelFor(labels, b));
    })) {
      pageLines(routeId, '');
    }
  }

  if (entities.length > 0) {
    lines.push('**Things this application works with**');
    lines.push('');
    entities.forEach(function (entity, i) {
      registry.add('E' + (i + 1), { type: 'entity', id: entity.entityId });
      lines.push('- ' + box(entity.reviewed) + ' E' + (i + 1) + '. ' + entity.name);
      const operations = Array.isArray(entity.operations) ? entity.operations : [];
      const phrases = Array.from(
        new Set(
          operations.map(function (op) {
            return OPERATION_PHRASE[op.kind] || op.kind;
          }),
        ),
      );
      const anyObserved = operations.some(function (op) {
        return op.confidence === 'observed';
      });
      lines.push(
        '   Can be: ' +
          (phrases.length > 0 ? phrases.join(', ') : 'nothing was observed happening to it') +
          (phrases.length > 0
            ? anyObserved
              ? ' (seen in real traffic)'
              : ' (guessed from page addresses, not seen happening)'
            : ''),
      );
      const transitions = entity.lifecycle && Array.isArray(entity.lifecycle.transitions)
        ? entity.lifecycle.transitions
        : [];
      if (transitions.length > 0) {
        lines.push(
          '   Lifecycle: ' +
            transitions
              .map(function (t) {
                return t.from + ' -> ' + t.to + ' (' + t.trigger + ')';
              })
              .join('; '),
        );
      }
      const relations = Array.isArray(entity.relations) ? entity.relations : [];
      for (const relation of relations) {
        const target = entityNameById.get(relation.targetEntityId) || relation.targetEntityId;
        const claim =
          relation.kind === 'references'
            ? 'Needs a ' + target + ' to already exist'
            : 'Holds ' + target + ' inside it';
        lines.push(
          '   ' +
            claim +
            ' - via the field "' +
            relation.viaField +
            '"' +
            (relation.confidence === 'observed' ? '.' : ', guessed from that name alone.'),
        );
      }
      if (relations.length === 0) {
        lines.push('   Nothing links it to anything else.');
      }
      const excerpts = dedupedEvidence([entity].concat(relations));
      if (excerpts.length > 0) {
        lines.push('   Evidences: ' + excerpts.join('; '));
      }
      lines.push('');
    });
  }

  const unreviewedRelations = entities.reduce(function (total, entity) {
    return total + (Array.isArray(entity.relations) ? entity.relations.length : 0);
  }, 0);

  const intents = Object.values(routeIntents).filter(Boolean);
  const tierCounts = {};
  for (const intent of intents) {
    const tier = intent.criticality ? String(intent.criticality.value) : 'unknown';
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  }
  const tierSummary = ['high', 'medium', 'low', 'unknown']
    .filter(function (tier) {
      return tierCounts[tier];
    })
    .map(function (tier) {
      return tierCounts[tier] + ' ' + tier;
    })
    .join(', ');

  // A reasoning sentence repeated verbatim across routes is a category label, not an explanation of
  // any one of them - and the tier it justifies is therefore unaudited. Surfaced rather than
  // rejected: two genuinely static pages can legitimately share one honest sentence, so this is a
  // prompt for a person to look, not a gate that blocks on a guess.
  const reasoningCounts = new Map();
  for (const intent of intents) {
    const reasoning = intent.criticality ? intent.criticality.reasoning : undefined;
    if (typeof reasoning !== 'string' || reasoning.length === 0) continue;
    reasoningCounts.set(reasoning, (reasoningCounts.get(reasoning) || 0) + 1);
  }
  const routesSharingReasoning = Array.from(reasoningCounts.values())
    .filter(function (count) {
      return count > 1;
    })
    .reduce(function (sum, count) {
      return sum + count;
    }, 0);

  return {
    entryCount: features.length + entities.length + intents.length,
    markdown: lines.join('\\n').trimEnd(),
    summary:
      features.length +
      ' feature(s) over ' +
      intents.length +
      ' page(s)' +
      (tierSummary ? ' (' + tierSummary + ')' : '') +
      ', ' +
      entities.length +
      ' thing(s), ' +
      unreviewedRelations +
      ' link(s) between them to confirm' +
      (unclaimed.length > 0 ? ', ' + unclaimed.length + ' page(s) no feature claims' : '') +
      (conflictCount(conflictsByRoute) > 0
        ? ', ' + conflictCount(conflictsByRoute) + ' disagreement(s) between the records to settle'
        : '') +
      (routesSharingReasoning > 0
        ? ' - heads up: ' +
          routesSharingReasoning +
          ' page(s) share a reasoning sentence with another, worth checking those were actually judged per page'
        : ''),
  };
}

// The stage whose whole deliverable is a route list had no review artifact of its own, so the one
// thing a human is meant to approve at the end of a crawl was the only thing never rendered for
// them. Two halves, and the second is the point: what was kept, each with the path to its own
// screenshot, and what was refused, so a route someone recognises can be caught before every later
// stage is built on a map missing it.
function renderSiteMap(labels, data, registry) {
  const routes =
    data && data.routes && typeof data.routes === 'object' ? Object.entries(data.routes) : [];
  routes.sort(function (a, b) {
    return String(a[0]).localeCompare(String(b[0]));
  });

  const lines = [];
  const active = routes.filter(function (entry) {
    return !entry[1] || entry[1].status !== 'removed';
  });

  // The records about a page that do not agree - the server's status, the page's own markup, the
  // screenshot, the page's calls - come first: each is either a real problem with the page or a
  // wrong reading, and only a person who knows the application can say which.
  const conflicts = conflictsOf('site-map');
  const verdicts = conflicts.length > 0 ? recordedVerdicts('site-map') : new Map();
  if (conflicts.length > 0) {
    lines.push('**The records disagree about these pages (' + conflicts.length + ')**');
    lines.push('');
    lines.push('Write what is true after Verdict: works, or broken.');
    lines.push('');
    conflicts.forEach(function (conflict, i) {
      registry.add('D' + (i + 1), { type: 'disagreement', id: conflict.id, routeId: conflict.subject.routeId, path: conflict.subject.path });
      lines.push('- D' + (i + 1) + '. \`' + conflict.subject.path + '\`');
      for (const reading of conflict.readings) {
        lines.push('  ' + sensorLabel(reading.sensor) + ': ' + reading.detail + ' (' + reading.says + ')');
      }
      lines.push('  Verdict: ' + (verdicts.get(conflict.id) || ''));
      lines.push('');
    });
  }

  lines.push('**Routes found (' + active.length + ')**');
  lines.push('');
  active.forEach(function (entry, i) {
    const routePath = entry[0];
    const route = entry[1] || {};
    const status = route.httpStatus ? ' [' + route.httpStatus + ']' : '';
    registry.add('R' + (i + 1), { type: 'route', routeId: route.routeId, path: routePath });
    lines.push('R' + (i + 1) + '. \`' + routePath + '\`' + status + (route.title ? ' - ' + route.title : ''));
    if (route.screenshot) {
      // A relative link, so it opens straight from the artifact in any editor or file browser.
      lines.push('   Screenshot: [' + route.screenshot + '](../../' + route.screenshot + ')');
    } else {
      lines.push('   Screenshot: none captured');
    }
    const triage = route.visualTriage || {};
    if (triage.state && triage.state !== 'ready') {
      lines.push('   Looked like: ' + triage.state.split('_').join(' '));
    }
    if (route.access && typeof route.access === 'object') {
      const perRole = Object.entries(route.access).map(function (pair) {
        return pair[0] + ': ' + (pair[1] && pair[1].outcome ? pair[1].outcome.split('_').join(' ') : '?');
      });
      if (perRole.length > 0) lines.push('   Per role: ' + perRole.join('; '));
    }
    lines.push('');
  });

  const removed = routes.filter(function (entry) {
    return entry[1] && entry[1].status === 'removed';
  });
  if (removed.length > 0) {
    lines.push('**No longer resolving (' + removed.length + ')** - kept so the removal is visible');
    for (const entry of removed) lines.push('- \`' + entry[0] + '\`');
    lines.push('');
  }

  // Read straight from the crawl's own state file rather than recomputed, so what a human reviews
  // is what the crawl actually decided.
  const budget = loadJson(CRAWL_BUDGET_PATH);
  const crawled = new Set(
    active.map(function (entry) {
      return entry[0];
    }),
  );
  const groups =
    budget && Array.isArray(budget.rejected) ? groupRejections(budget.rejected, crawled) : [];
  const worthReading = groups.filter(function (group) {
    return group.reviewWorthy;
  });
  if (worthReading.length > 0) {
    lines.push('**Links the crawl refused**');
    lines.push('');
    lines.push(
      'Scan these for anything you recognise. A route you know is real appearing here means a limit ' +
        'was too strict, and the crawl should be run again with it raised.',
    );
    lines.push('');
    for (const group of worthReading) {
      lines.push('- **' + group.reason + '** (' + group.count + ')');
      for (const url of group.urls.slice(0, 25)) lines.push('  - ' + url);
      if (group.count > 25) {
        lines.push(
          '  - ...and ' +
            (group.count - 25) +
            ' more - \`node scripts/crawl-budget.mjs rejected --reason=' +
            group.reason +
            '\`',
        );
      }
      lines.push('');
    }
  }

  if (data && data.coverage) {
    lines.push(
      '**This crawl stopped early** - bounded by \`' +
        data.coverage.boundedBy +
        '\` after ' +
        data.coverage.pagesVisited +
        ' pages. The route list may be incomplete.',
    );
    lines.push('');
  }

  // Where a person names a page they know exists - the one input the crawl cannot produce itself.
  lines.push(MISSING_PAGES_HEADING);
  lines.push('');
  lines.push('Write any page you know exists and do not see above, one per line:');
  lines.push('');
  lines.push('- ');

  return {
    markdown: lines.join('\\n').trimEnd(),
    entryCount: active.length,
    summary:
      active.length +
      ' route(s) found' +
      (worthReading.length > 0
        ? ', ' +
          worthReading.reduce(function (sum, group) {
            return sum + group.count;
          }, 0) +
          ' refused link(s) to scan'
        : '') +
      (conflicts.length > 0 ? ', ' + conflicts.length + ' page(s) where the records disagree' : ''),
  };
}

// Same ordering rule the crawl budget itself uses: the refusals where a real route can hide come
// first. Duplicated deliberately rather than imported - these generated scripts share no runtime.
// Two filters, both about not wasting the reader's attention on links that were never lost.
//
// A URL is dropped from this list when its canonical route ended up in the map anyway: the same
// link is commonly invisible in a collapsed mobile menu on one page and perfectly visible in the
// desktop nav on another, so it gets refused several times and crawled once. Reporting it as
// "refused" is not just noise, it is wrong. Live-observed at 818 entries on a 28-route application,
// with one route listed seven times while sitting in the map.
//
// And each remaining URL appears once, however many pages linked to it.
function groupRejections(rejected, crawledPaths) {
  const inMap = crawledPaths || new Set();
  const reviewWorthy = [
    'not-visible',
    'not-found',
    'non-html-asset',
    'non-html-response',
    'max-per-parent',
    'max-per-template',
    'max-per-query-base',
    'max-pages',
    'max-depth',
    'duplicate-content-template',
    'visibility-not-reported',
  ];
  const groups = {};
  const seen = new Set();
  for (const entry of rejected) {
    if (!entry || typeof entry.reason !== 'string') continue;
    if (entry.canonicalPath && inMap.has(entry.canonicalPath)) continue;
    const key = entry.reason + '\\u0000' + entry.url;
    if (seen.has(key)) continue;
    seen.add(key);
    const group =
      groups[entry.reason] ||
      (groups[entry.reason] = {
        reason: entry.reason,
        reviewWorthy: reviewWorthy.indexOf(entry.reason) !== -1,
        count: 0,
        urls: [],
      });
    group.count += 1;
    group.urls.push(entry.url);
  }
  for (const group of Object.values(groups)) group.urls.sort();
  return Object.values(groups).sort(function (a, b) {
    if (a.reviewWorthy !== b.reviewWorthy) return a.reviewWorthy ? -1 : 1;
    return a.reason < b.reason ? -1 : 1;
  });
}

// The JSON stays the only record; the review file is a view of it that a person may also edit.
// Two things keep the two from drifting apart. The view is rewritten from the JSON after every
// change, so it never shows an older state for long - the failure that once had it deleted after
// sign-off, when it showed "criticality (draft)" for 45 entries a person had already confirmed. And
// a person's edits are only ever read back against the exact rendering they were made on.
const KINDS = {
  'site-map': { source: SITE_MAP_PATH, render: renderSiteMap, editable: true, journal: true },
  'feature-map': { source: FEATURE_MAP_PATH, render: renderFeatureMap, editable: true, journal: true },
  'test-conditions': { source: TEST_CONDITIONS_PATH, render: renderTestConditions, editable: true, journal: false },
  'test-cases': { source: TEST_CASES_PATH, render: renderTestCases, editable: false, journal: false },
};

function relative(filePath) {
  return path.relative(CWD, filePath).split(path.sep).join('/');
}

// The file a person edits, and beside it the rendering exactly as written, the hash of the JSON it
// was rendered from, and what each label stood for - everything apply-review.mjs compares an edited
// file against.
function writeEditable(kind, config, rendered, registry) {
  const sourceHash = sha256(fs.readFileSync(config.source, 'utf8')).slice(0, 16);
  const head = [
    '<!-- review of ' + relative(config.source) + ' @ ' + sourceHash + ' - leave this line as it is -->',
    '# Review: ' + kind,
    '',
    rendered.summary,
    '',
  ].concat(EDIT_HELP[kind]);
  if (registry.labels.ALL) head.push('', '- [ ] ALL. Approve every entry I did not change');
  const text = head.concat(['', rendered.markdown, '']).join('\\n');
  const target = path.join(REVIEW_DIR, kind + '-review.md');
  const baseDir = path.join(REVIEW_DIR, '.base');
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, kind + '-review.json'),
    JSON.stringify(
      {
        kind: kind,
        source: relative(config.source),
        sourceHash: sourceHash,
        renderedAt: new Date().toISOString(),
        labels: registry.labels,
        owners: ownersOf(text.split('\\n')),
        text: text,
      },
      null,
      2,
    ) + '\\n',
    'utf8',
  );
  fs.writeFileSync(target, text, 'utf8');
  return relative(target);
}

function main() {
  const kind = argValue('kind');
  if (!kind || !KINDS[kind]) {
    fail('missing or unknown --kind. Use one of: ' + Object.keys(KINDS).join(', '));
  }

  const thresholdArg = argValue('threshold');
  const threshold =
    thresholdArg !== undefined && Number.isFinite(Number(thresholdArg))
      ? Number(thresholdArg)
      : DEFAULT_THRESHOLD;

  const config = KINDS[kind];
  const data = loadJson(config.source);
  if (data === null) {
    fail('cannot read ' + path.relative(CWD, config.source) + ' - run the stage that writes it first');
  }

  const labels = buildRouteLabels(loadJson(SITE_MAP_PATH));
  const registry = newRegistry();
  if (kind === 'feature-map' || kind === 'test-conditions') registry.add('ALL', { type: 'all' });
  const rendered = config.render(labels, data, registry);
  const useFile = rendered.entryCount > threshold;

  let filePath = null;
  let journal = null;
  if (config.editable) {
    filePath = writeEditable(kind, config, rendered, registry);
    // Every rendering brings the disagreement journal up to date, so it reflects what the person was
    // actually shown. It never stops the rendering.
    if (config.journal) journal = syncJournal(kind);
  } else if (useFile) {
    fs.mkdirSync(REVIEW_DIR, { recursive: true });
    const target = path.join(REVIEW_DIR, kind + '-review.md');
    const heading = '# Review: ' + kind + '\\n\\n' + rendered.summary + '\\n\\n';
    fs.writeFileSync(target, heading + rendered.markdown + '\\n', 'utf8');
    filePath = relative(target);
  }

  const output = {
    kind,
    entryCount: rendered.entryCount,
    threshold,
    mode: useFile ? 'file' : 'inline',
    filePath,
    editable: config.editable,
    summary: rendered.summary,
    markdown: useFile ? '' : rendered.markdown,
  };
  if (journal && journal.warning) output.warning = journal.warning;
  process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
}

main();
`;
}
