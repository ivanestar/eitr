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

// Every editable review works the same way: a box to approve, deleting an entry to take it out, text
// changed in place or a line under an entry to correct it, and "Your notes" at the end for anything
// the file does not show. Only what an entry can be differs from one stage to the next.
const EDIT_HELP = {
  'site-map': [
    'You can review this file right here: edit it, save it, then tell the assistant you are done.',
    '',
    '- Approve a route by putting an x in its box: [x]. Tick ALL to approve every route you did not change.',
    '- Leave a route out of every later stage by deleting its lines. It moves to "Left out by you", where ticking it brings it back.',
    '- Settle a disagreement by writing works or broken after Verdict: - anything you add after that word is kept as your note.',
    '- Correct anything else by changing the text itself, or add a line under a route saying what is wrong.',
    '- Add a page the crawl missed under "Pages the crawl did not find", and anything else under "Your notes".',
    '- Leave the labels (R1, D1) as they are - they are how the assistant finds each entry.',
  ],
  'feature-map': [
    'You can review this file right here: edit it, save it, then tell the assistant you are done.',
    '',
    '- Approve an entry by putting an x in its box: [x]. Tick ALL to approve every entry you did not change.',
    '- Leave a page out of every later stage by deleting its lines (P). The features are regrouped without it.',
    '- Correct anything by changing the text itself, or add a line under the entry saying what is wrong. The assistant applies it and re-checks whatever depends on it.',
    '- Write anything else the assistant should know under "Your notes".',
    '- Leave the labels (F1, P3, E2) as they are - they are how the assistant finds each entry.',
  ],
  'test-conditions': [
    'You can review this file right here: edit it, save it, then tell the assistant you are done.',
    '',
    '- Approve a condition by putting an x in its box: [x]. A feature\\'s box approves all of its conditions; ALL approves every one you did not change.',
    '- Answer a question on its Answer: line.',
    '- Cut a condition by deleting its line. It moves to "Cut by you", where ticking it brings it back.',
    '- Correct anything else by changing the text itself, or add a line saying what is wrong. The assistant applies it and re-checks whatever depends on it.',
    '- "Regression only" marks a condition whose expected result was read off the page as it is today: it catches a change, not a defect already there.',
    '- Write anything else the assistant should know under "Your notes".',
    '- Leave the labels (F1, C12, Q3) as they are - they are how the assistant finds each entry.',
  ],
};

const NOTES_HEADING = '**Your notes**';
const PENDING_DIR = path.join(CWD, 'artifacts', 'review', '.pending');

// The last section of every editable review. Notes a person wrote in this review before are shown
// back, so a redrawn file never looks as if they vanished; the empty line below them takes a new one.
function notesSection(kind) {
  const profile = loadJson(APP_PROFILE_PATH);
  const kept = profile && Array.isArray(profile.domainNotes)
    ? profile.domainNotes.filter(function (entry) {
        return entry && entry.statedDuring === kind + ' review' && typeof entry.note === 'string';
      })
    : [];
  const lines = [
    NOTES_HEADING,
    '',
    'Anything the assistant should know that this file does not show - context, a rule of the business, a page to handle with care. One thought per line; it is kept with what this project knows about the application.',
    '',
  ];
  for (const entry of kept) lines.push('- ' + entry.note);
  lines.push('- ');
  return lines;
}

// Corrections from an earlier edit of this file that the assistant has not confirmed yet. Shown at
// the top of the redrawn file, so the person can see their words are still on their way.
function pendingSection(kind) {
  const waiting = loadJson(path.join(PENDING_DIR, kind + '.json'));
  if (!waiting) return [];
  const items = [];
  for (const edit of Array.isArray(waiting.freeEdits) ? waiting.freeEdits : []) {
    const where = edit.label ? edit.label + ': ' : '';
    for (const line of edit.added || []) items.push('- ' + where + 'you wrote "' + String(line).trim() + '"');
    if ((edit.added || []).length === 0) {
      for (const line of edit.removed || []) items.push('- ' + where + 'you removed "' + String(line).trim() + '"');
    }
  }
  for (const page of Array.isArray(waiting.missingPages) ? waiting.missingPages : []) items.push('- a page to crawl: ' + page);
  for (const verdict of Array.isArray(waiting.unreadVerdicts) ? waiting.unreadVerdicts : []) {
    items.push('- ' + verdict.label + ': a verdict the assistant could not read, "' + verdict.text + '"');
  }
  if (items.length === 0) return [];
  return ['**Waiting for the assistant**', '', 'From your last edit, not applied yet:', ''].concat(items, ['']);
}

function tidyText(text) {
  return String(text)
    .replace(/^\\uFEFF/, '')
    .replace(/\\r\\n/g, '\\n')
    .split('\\n')
    .map(function (line) {
      return line.replace(/\\s+$/, '');
    })
    .join('\\n')
    .trim();
}

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

// A value short enough to read in a list. A 1000-character probe printed in full once took a whole
// screen of a review nobody could scroll through.
function shortValue(value) {
  const text = String(value);
  if (text.length <= 40) return JSON.stringify(text);
  return JSON.stringify(text.slice(0, 24) + '\\u2026') + ' (' + text.length + ' characters)';
}

function lowerFirst(text) {
  if (text.length > 1 && /[A-Z]/.test(text[0]) && /[a-z]/.test(text[1])) return text[0].toLowerCase() + text.slice(1);
  return text;
}

// What one vector sets each parameter to, as the page would show it, and which of those values the
// condition is actually about: a probe or an invalid partition. The rest only keep the form valid.
function vectorOf(condition, entry) {
  const params = entry && Array.isArray(entry.parameters) ? entry.parameters : [];
  const vector = condition.parameters && typeof condition.parameters === 'object' ? condition.parameters : {};
  const values = [];
  for (const name of Object.keys(vector)) {
    const param = params.find(function (p) {
      return p && p.name === name;
    });
    const partition =
      param && Array.isArray(param.partitions)
        ? param.partitions.find(function (p) {
            return p && p.id === vector[name];
          })
        : null;
    const value =
      partition && Array.isArray(partition.sampleValues) && partition.sampleValues[0] !== undefined
        ? partition.sampleValues[0]
        : partition
          ? partition.id
          : vector[name];
    values.push({
      name: name,
      value: value,
      focus: !partition || partition.kind === 'invalid',
      outcome: partition && typeof partition.expectedOutcome === 'string' ? partition.expectedOutcome.replace(/\\.$/, '') : null,
    });
  }
  return values;
}

// Every condition reads as one "Verify ..." line. A condition the analysis wrote says it in its own
// words. A generated one names the values it is about and what should happen: for a probe or an
// invalid value, that value alone; for a valid combination, the values that differ from the page's
// other combinations - the ones they all share are said once, above them.
function verifyLine(condition, entry, shared) {
  if (condition.origin !== 'generated') {
    const text = String(condition.description || '(no description)').trim();
    return /^verify\\b/i.test(text) ? text : 'Verify ' + lowerFirst(text);
  }
  const values = vectorOf(condition, entry);
  const focus = values.filter(function (v) {
    return v.focus;
  });
  const outcome = String(condition.expectedOutcome || '').replace(/\\.$/, '');
  if (focus.length > 0) {
    return 'Verify ' + focus.map(function (v) {
      return v.name + ' = ' + shortValue(v.value);
    }).join(', ') + (outcome ? ': ' + outcome : '');
  }
  const own = values.filter(function (v) {
    return !shared.has(v.name);
  });
  const shown = own.length > 0 ? own : values;
  const outcomes = [];
  for (const v of shown) if (v.outcome && outcomes.indexOf(v.outcome) === -1) outcomes.push(v.outcome);
  return (
    'Verify ' +
    shown.map(function (v) {
      return v.name + ' = ' + shortValue(v.value);
    }).join(', ') +
    ': ' +
    (outcomes.length > 0 ? outcomes.join('; ') : outcome)
  );
}

// The values every valid generated combination on a page shares - said once for the page.
function sharedValues(items, entry) {
  const combos = items
    .filter(function (item) {
      return item.condition.origin === 'generated' && item.condition.scenario === 'positive';
    })
    .map(function (item) {
      return vectorOf(item.condition, entry);
    })
    .filter(function (values) {
      return values.length > 0 && values.every(function (v) {
        return !v.focus;
      });
    });
  const shared = new Map();
  if (combos.length < 2) return shared;
  for (const v of combos[0]) {
    const same = combos.every(function (values) {
      const match = values.find(function (w) {
        return w.name === v.name;
      });
      return match && String(match.value) === String(v.value);
    });
    if (same) shared.set(v.name, v.value);
  }
  return shared;
}

// One feature: its questions, then each of its pages with the conditions exercised there, in
// priority order - the list a person approves, cuts or answers. What the analysis understood about
// the feature and its fields stays in the JSON; the review is for deciding what gets tested.
function renderFeatureBlock(lines, labels, feature, analysis, items, pageIds, entriesById, controlsByRoute, registry, counters) {
  counters.feature += 1;
  const allApproved =
    items.length > 0 &&
    items.every(function (item) {
      return item.condition.reviewed === true;
    });
  // The feature's box stands for its conditions, so its label carries their labels.
  const featureRef = { type: 'feature', id: feature.featureId || null, conditions: [] };
  registry.add('F' + counters.feature, featureRef);
  const tiers = { P1: 0, P2: 0, P3: 0 };
  items.forEach(function (item) {
    if (tiers[item.condition.priority] !== undefined) tiers[item.condition.priority]++;
  });
  lines.push(
    '- ' +
      box(allApproved) +
      ' F' +
      counters.feature +
      '. **' +
      feature.name +
      '** - ' +
      feature.impact +
      ' impact, ' +
      items.length +
      ' condition(s): P1 ' +
      tiers.P1 +
      ', P2 ' +
      tiers.P2 +
      ', P3 ' +
      tiers.P3,
  );
  // Every question, answered or not, each with the line its answer goes on - so an answer can be
  // written, or corrected, right here.
  const questions = analysis && Array.isArray(analysis.questions) ? analysis.questions : [];
  if (questions.length > 0) {
    lines.push('   Questions for you:');
    questions.forEach(function (question, index) {
      if (!question) return;
      counters.question += 1;
      registry.add('Q' + counters.question, { type: 'question', featureId: analysis.featureId, index: index });
      lines.push('   Q' + counters.question + '. ' + question.text);
      lines.push('       Answer: ' + (typeof question.answer === 'string' ? question.answer : ''));
    });
  }
  for (const routeId of pageIds) {
    const pageItems = items.filter(function (item) {
      return item.routeId === routeId;
    });
    const entry = entriesById[routeId] || null;
    lines.push('');
    lines.push('   Page: ' + labelFor(labels, routeId));
    const excluded = entry && Array.isArray(entry.excluded) ? entry.excluded : [];
    if (excluded.length > 0) {
      const byId = controlsByRoute[routeId] || {};
      lines.push(
        '   Not tested here: ' +
          excluded
            .map(function (item) {
              return (controlLabel(byId[item.control]) || item.control) + ' (' + item.reason + (item.note ? ' - ' + item.note : '') + ')';
            })
            .join('; '),
      );
    }
    if (pageItems.length === 0) {
      lines.push('   No conditions on this page.');
      continue;
    }
    const shared = sharedValues(pageItems, entry);
    if (shared.size > 0) {
      lines.push(
        '   Same in every combination below: ' +
          Array.from(shared.entries())
            .map(function (pair) {
              return pair[0] + ' = ' + shortValue(pair[1]);
            })
            .join(', '),
      );
    }
    for (const item of pageItems) {
      const condition = item.condition;
      counters.condition += 1;
      registry.add('C' + counters.condition, { type: 'condition', routeId: item.routeId, conditionId: condition.conditionId, cut: false });
      featureRef.conditions.push('C' + counters.condition);
      const regression = REGRESSION_ORACLES.indexOf(condition.oracle) !== -1;
      lines.push(
        '   - ' +
          box(condition.reviewed) +
          ' C' +
          counters.condition +
          '. ' +
          verifyLine(condition, entry, shared) +
          ' (' +
          (condition.priority || '?') +
          (regression ? ', regression only' : '') +
          ')' +
          (condition.valueNote ? ' - note: ' + condition.valueNote : ''),
      );
    }
  }
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
  const tierCounts = { P1: 0, P2: 0, P3: 0 };
  let unsatisfiedTotal = 0;

  // Conditions by the feature they serve, each feature's in priority order - then layer, so what a
  // feature does comes before what its fields let in. A condition a person cut is listed apart, where
  // it can be brought back, and counts nowhere else.
  const byFeature = new Map();
  const cutItems = [];
  const controlsByRoute = {};
  const entriesById = {};
  for (const entry of entries) {
    entriesById[entry.routeId] = entry;
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
  const shownPages = new Set();
  for (const featureId of featureIds) {
    const items = byFeature.get(featureId);
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
    // A feature's pages: those its conditions are exercised on, and every other page of the feature
    // this stage analysed - a page with nothing to test is a decision worth seeing too.
    const pageIds = new Set(
      items.map(function (item) {
        return item.routeId;
      }),
    );
    for (const routeId of Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : []) {
      if (entriesById[routeId]) pageIds.add(routeId);
    }
    const orderedPages = Array.from(pageIds).sort(function (a, b) {
      return labelFor(labels, a).localeCompare(labelFor(labels, b));
    });
    for (const routeId of orderedPages) shownPages.add(routeId);
    renderFeatureBlock(lines, labels, feature, analyses[featureId], items, orderedPages, entriesById, controlsByRoute, registry, counters);
    lines.push('');
  }

  for (const entry of entries) {
    unsatisfiedTotal += Array.isArray(entry.unsatisfiedPairs) ? entry.unsatisfiedPairs.length : 0;
  }
  // A field left out is a decision a person should see and be able to overturn, even on a page no
  // feature above covers.
  const unshown = entries.filter(function (entry) {
    return !shownPages.has(entry.routeId) && Array.isArray(entry.excluded) && entry.excluded.length > 0;
  });
  if (unshown.length > 0) {
    lines.push('**Other pages**');
    for (const entry of unshown) {
      const byId = controlsByRoute[entry.routeId] || {};
      lines.push('');
      lines.push('   Page: ' + labelFor(labels, entry.routeId));
      lines.push(
        '   Not tested here: ' +
          entry.excluded
            .map(function (item) {
              return (controlLabel(byId[item.control]) || item.control) + ' (' + item.reason + (item.note ? ' - ' + item.note : '') + ')';
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
      lines.push('- [ ] C' + counters.condition + '. ' + verifyLine(item.condition, entriesById[item.routeId], new Map()));
    }
    lines.push('');
  }

  let openQuestions = 0;
  for (const analysis of Object.values(analyses)) {
    for (const question of analysis && Array.isArray(analysis.questions) ? analysis.questions : []) {
      if (question && typeof question.answer !== 'string') openQuestions++;
    }
  }

  // The stage's own report, printed before the review: what it produced and what is worth a look,
  // counted from the file rather than recalled.
  let written = 0;
  let regressionOnly = 0;
  let notTested = 0;
  let researched = 0;
  const skipped = [];
  let candidateDefects = 0;
  for (const list of byFeature.values()) {
    for (const item of list) {
      if (item.condition.origin !== 'generated') written += 1;
      if (REGRESSION_ORACLES.indexOf(item.condition.oracle) !== -1) regressionOnly += 1;
    }
  }
  for (const entry of entries) notTested += Array.isArray(entry.excluded) ? entry.excluded.length : 0;
  for (const analysis of Object.values(analyses)) {
    if (!analysis) continue;
    const research = analysis.research;
    if (research && research.status === 'skipped') skipped.push(research.reason || 'no reason given');
    else if (research) researched += 1;
    for (const field of Array.isArray(analysis.fields) ? analysis.fields : []) {
      for (const constraint of Array.isArray(field.constraints) ? field.constraints : []) {
        if (constraint && constraint.enforcement === 'not-enforced') candidateDefects += 1;
      }
    }
  }
  const report = [
    'Stage report - test conditions',
    '- ' + conditionCount + ' condition(s) for ' + featureIds.length + ' feature(s) on ' + entries.length + ' page(s): P1 ' + tierCounts.P1 + ', P2 ' + tierCounts.P2 + ', P3 ' + tierCounts.P3,
    '- ' + written + ' written from what each feature is for, ' + (conditionCount - written) + ' built by the generator (combinations, limits, malformed values)',
    '- ' + regressionOnly + ' only guard against a change: their expected result was read off the page as it is today',
    '- Questions for you: ' + openQuestions,
    '- Fields not tested, with the reason on their page: ' + notTested,
    '- Research: ' + researched + ' feature(s) researched' + (skipped.length > 0 ? ', ' + skipped.length + ' skipped (' + Array.from(new Set(skipped)).join('; ') + ')' : ''),
    '- Candidate defects - a rule the field should obey that the page does not enforce: ' + candidateDefects,
  ];
  if (unsatisfiedTotal > 0) report.push('- Value pairs the page rules out, so no test combines them: ' + unsatisfiedTotal);
  if (cutItems.length > 0) report.push('- Cut by you: ' + cutItems.length);

  return {
    entryCount: featureIds.length,
    markdown: lines.join('\\n').trimEnd(),
    report: report.join('\\n'),
    summary:
      conditionCount +
      ' condition(s) across ' +
      featureIds.length +
      ' feature(s) and ' +
      entries.length +
      ' page(s) - P1: ' +
      tierCounts.P1 +
      ', P2: ' +
      tierCounts.P2 +
      ', P3: ' +
      tierCounts.P3 +
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
  } else {
    // A missing section would read as nothing to review. What an empty one costs later stages is
    // worth saying: without an entity there is no lifecycle, and the flow-based techniques need one.
    lines.push('**Things this application works with**');
    lines.push('');
    lines.push(
      'None found: the recorded traffic named no resource, and no name recurred across page addresses ' +
        '(as /orders and /orders/{id} would). With nothing that is created, changed or deleted, no ' +
        'state-transition or use-case test ' +
        "conditions will be drafted; the conditions rest on each page's fields and behavior. If the " +
        'application does keep records (orders, accounts, documents), write which ones under this line.',
    );
    lines.push('');
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

  const report = [
    'Stage report - feature map',
    '- ' + features.length + ' feature(s) over ' + intents.length + ' page(s)' + (tierSummary ? '; criticality ' + tierSummary : ''),
    '- ' + entities.length + ' thing(s) the application works with, ' + unreviewedRelations + ' link(s) between them to confirm',
    '- Pages no feature claims: ' + unclaimed.length,
    '- Records disagree about: ' + conflictCount(conflictsByRoute) + ' - each is shown where it applies',
  ];
  if (routesSharingReasoning > 0) report.push('- Pages sharing one reasoning sentence with another: ' + routesSharingReasoning);

  return {
    entryCount: features.length + entities.length + intents.length,
    markdown: lines.join('\\n').trimEnd(),
    report: report.join('\\n'),
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

  // One label per route, fixed before anything is written, so a disagreement and its route can name
  // each other. The same page used to appear twice with nothing linking the two: a person settled
  // the disagreement, and the route went on to the next stage untouched.
  const routeLabel = new Map();
  active.forEach(function (entry, i) {
    if (entry[1] && entry[1].routeId) routeLabel.set(entry[1].routeId, 'R' + (i + 1));
  });

  // The records about a page that do not agree - the server's status, the page's own markup, the
  // screenshot, the page's calls - come first: each is either a real problem with the page or a
  // wrong reading, and only a person who knows the application can say which.
  const conflicts = conflictsOf('site-map');
  const verdicts = conflicts.length > 0 ? recordedVerdicts('site-map') : new Map();
  const disagreementLabel = new Map();
  if (conflicts.length > 0) {
    lines.push('**The records disagree about these pages (' + conflicts.length + ')**');
    lines.push('');
    lines.push(
      'Write what is true after Verdict: works, or broken. A verdict says what the page is; to stop ' +
        'testing a page, delete its route below.',
    );
    lines.push('');
    conflicts.forEach(function (conflict, i) {
      const label = 'D' + (i + 1);
      disagreementLabel.set(conflict.subject.routeId, label);
      registry.add(label, { type: 'disagreement', id: conflict.id, routeId: conflict.subject.routeId, path: conflict.subject.path });
      const own = routeLabel.get(conflict.subject.routeId);
      lines.push('- ' + label + '. \`' + conflict.subject.path + '\`' + (own ? ' - route ' + own + ' below' : ''));
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
    lines.push(
      '- ' + box(route.reviewed) + ' R' + (i + 1) + '. \`' + routePath + '\`' + status + (route.title ? ' - ' + route.title : ''),
    );
    const disputed = disagreementLabel.get(route.routeId);
    if (disputed) lines.push('   The records disagree about this page - see ' + disputed + ' above.');
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

  // Pages a person took out: from the site map while it still holds them, and from app-profile.json
  // once a fresh crawl no longer does - the decision outlives the map either way.
  const profile = loadJson(APP_PROFILE_PATH);
  const leftOut = new Map();
  for (const entry of routes) {
    const route = entry[1];
    if (route && route.status === 'removed' && route.removedBy === 'human') {
      leftOut.set(entry[0], { path: entry[0], routeId: route.routeId, note: route.removedNote });
    }
  }
  for (const entry of profile && Array.isArray(profile.leftOutRoutes) ? profile.leftOutRoutes : []) {
    if (entry && typeof entry.path === 'string' && !leftOut.has(entry.path)) {
      leftOut.set(entry.path, { path: entry.path, routeId: entry.routeId, note: entry.note });
    }
  }
  if (leftOut.size > 0) {
    lines.push('**Left out by you (' + leftOut.size + ')**');
    lines.push('');
    lines.push('No later stage tests these, and a new crawl will not map them again. Tick one to bring it back.');
    lines.push('');
    let n = 0;
    for (const item of leftOut.values()) {
      n += 1;
      registry.add('L' + n, { type: 'left-out', routeId: item.routeId, path: item.path });
      lines.push('- [ ] L' + n + '. \`' + item.path + '\`' + (item.note ? ' - ' + item.note : ''));
    }
    lines.push('');
  }

  const removed = routes.filter(function (entry) {
    return entry[1] && entry[1].status === 'removed' && entry[1].removedBy !== 'human';
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

  const approvedCount = active.filter(function (entry) {
    return entry[1] && entry[1].reviewed === true;
  }).length;
  const refusedCount = worthReading.reduce(function (sum, group) {
    return sum + group.count;
  }, 0);
  const report = [
    'Stage report - site map',
    '- Routes found: ' + active.length + ' (' + approvedCount + ' approved)' + (leftOut.size > 0 ? '; left out by you: ' + leftOut.size : ''),
    '- Records disagree about: ' + conflicts.length + ' page(s) - settle them at the top of the file',
    '- Refused links worth a look: ' + refusedCount,
    '- The crawl: ' +
      (data && data.coverage
        ? 'stopped early - bounded by ' + data.coverage.boundedBy + ' after ' + data.coverage.pagesVisited + ' pages'
        : 'reached everything it was allowed to'),
  ];
  return {
    markdown: lines.join('\\n').trimEnd(),
    entryCount: active.length,
    report: report.join('\\n'),
    summary:
      active.length +
      ' route(s) found' +
      (approvedCount > 0 ? ' (' + approvedCount + ' approved)' : '') +
      (leftOut.size > 0 ? ', ' + leftOut.size + ' left out by you' : '') +
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
// A file the person edited is redrawn only once apply-review.mjs has read those edits: it marks the
// exact text it read as readBack. Redrawing earlier erases their approvals, verdicts and corrections
// without anything having applied them - live-observed as a verdict and a deleted route vanishing
// between one stage and the next. --discard-edits redraws anyway and keeps their file beside it.
function unreadEdits(kind, target, basePath) {
  if (!fs.existsSync(target)) return false;
  const previous = loadJson(basePath);
  if (!previous || typeof previous.text !== 'string') return false;
  const current = tidyText(fs.readFileSync(target, 'utf8'));
  if (current === tidyText(previous.text)) return false;
  return previous.readBack !== sha256(current);
}

function writeEditable(kind, config, rendered, registry, discardEdits) {
  const sourceHash = sha256(fs.readFileSync(config.source, 'utf8')).slice(0, 16);
  const target = path.join(REVIEW_DIR, kind + '-review.md');
  const baseDir = path.join(REVIEW_DIR, '.base');
  const basePath = path.join(baseDir, kind + '-review.json');
  let keptEdits = null;
  if (unreadEdits(kind, target, basePath)) {
    if (!discardEdits) return { refused: true, filePath: relative(target) };
    keptEdits = path.join(REVIEW_DIR, kind + '-review.unapplied.md');
    fs.copyFileSync(target, keptEdits);
  }
  const head = [
    '<!-- review of ' + relative(config.source) + ' @ ' + sourceHash + ' - leave this line as it is -->',
    '# Review: ' + kind,
    '',
    rendered.summary,
    '',
  ].concat(EDIT_HELP[kind]);
  if (registry.labels.ALL) head.push('', '- [ ] ALL. Approve every entry I did not change');
  const text = head
    .concat([''], pendingSection(kind), [rendered.markdown, ''], notesSection(kind), [''])
    .join('\\n');
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
  return { filePath: relative(target), keptEdits: keptEdits ? relative(keptEdits) : null };
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
  if (config.editable) registry.add('ALL', { type: 'all' });
  const rendered = config.render(labels, data, registry);
  const useFile = rendered.entryCount > threshold;

  let filePath = null;
  let journal = null;
  let keptEdits = null;
  if (config.editable) {
    const written = writeEditable(kind, config, rendered, registry, process.argv.slice(2).indexOf('--discard-edits') !== -1);
    if (written.refused) {
      process.stdout.write(
        JSON.stringify(
          {
            kind,
            status: 'EDITS_UNREAD',
            filePath: written.filePath,
            next:
              'The person edited ' +
              written.filePath +
              ' and nothing has read it back yet - redrawing it now would erase their edits. Run node scripts/apply-review.mjs --kind=' +
              kind +
              ' first, and act on what it returns.',
          },
          null,
          2,
        ) + '\\n',
      );
      process.exit(1);
    }
    filePath = written.filePath;
    keptEdits = written.keptEdits;
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
    report: rendered.report || null,
    markdown: useFile ? '' : rendered.markdown,
  };
  if (keptEdits) output.keptEdits = keptEdits;
  if (journal && journal.warning) output.warning = journal.warning;
  process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
}

main();
`;
}
