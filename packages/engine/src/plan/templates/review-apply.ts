// Template for scripts/apply-review.mjs - reads back what a person changed in a review file and
// applies it to the stage's JSON.
//
// A person reviewing a stage works in the file they are reading: they tick what they approve, answer
// a question on its own line, delete a test condition they do not want, correct a sentence. The JSON
// stays the only record, so those edits have to get back into it - exactly, and without anything a
// person wrote being lost or a stale file overwriting newer data.
//
// Three rules make that safe, each taken from tools that already edit generated files this way. An
// edit is only ever read against the exact rendering it was made on, kept beside it, and a JSON that
// changed since is refused rather than merged by guess (a stale Terraform plan is refused the same
// way). A line is found by the short label written on it - the rest of the line is for the person,
// the way git rebase reads only the command and the commit id from each line of its todo list. And
// nothing a person wrote is dropped: what cannot be applied exactly comes back to the assistant as a
// correction, and a refused file is kept under another name, as kubectl edit keeps an edit it could
// not apply.
export function renderReviewApply(): string {
  return `#!/usr/bin/env node

/**
 * Reads back what a person changed in a review file and applies it. Zero model involvement.
 *
 * Usage:
 *   node scripts/apply-review.mjs --kind=site-map
 *   node scripts/apply-review.mjs --kind=feature-map
 *   node scripts/apply-review.mjs --kind=test-conditions
 *   node scripts/apply-review.mjs --kind=site-map --verdict=D1:broken [--note=<what the person said>]
 *   node scripts/apply-review.mjs --kind=<kind> --done
 *
 * Compares artifacts/review/<kind>-review.md with the rendering it was made from
 * (artifacts/review/.base/<kind>-review.json). What it can apply exactly it writes to the JSON: a
 * ticked or cleared box, ALL, an answer, a deleted test-condition line (a cut), a ticked cut condition
 * (restored), a verdict on a disagreement, a deleted route or page (left out of every later stage), a
 * ticked left-out page (brought back), and the lines under "Your notes" (kept in app-profile.json).
 * Leaving a page out redraws the feature map and takes the page's test conditions and test cases
 * with it (followedLeftOut).
 * Everything else the person changed comes back in freeEdits, by the entry it belongs to, for the
 * assistant to apply as a correction; they wait in artifacts/review/.pending/<kind>.json until the
 * assistant confirms them with --done, and every rendering shows them until then.
 *
 * --verdict records a verdict the assistant got from the person in conversation, after this script
 * could not read the one written in the file (unreadVerdicts).
 *
 * status:
 *   APPLIED     - see applied, freeEdits, unreadVerdicts, approveAfterChange and next
 *   NO_CHANGES  - the file is exactly as it was rendered
 *   STALE       - the JSON changed after the file was rendered: nothing applied, the person's file is
 *                 kept as <kind>-review.unapplied.md, every edit is in freeEdits, and the view is fresh
 *   INVALID     - applying would break the stage's validator: nothing applied, the file is untouched
 *   NO_VIEW     - there is no rendered file to read
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { recordVerdict, syncJournal } from './corroboration.mjs';

const CWD = process.cwd();
const REVIEW_DIR = path.join(CWD, 'artifacts', 'review');
const PENDING_DIR = path.join(REVIEW_DIR, '.pending');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const APP_PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const TEST_CASES_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');
const VALIDATORS = {
  'site-map': 'validate-site-map.mjs',
  'feature-map': 'validate-feature-map.mjs',
  'test-conditions': 'validate-test-conditions.mjs',
};
const LABEL_LINE = /^(\\s*(?:[-*]\\s+)?)(?:\\[([ xX])\\]\\s+)?(ALL|[A-Z]\\d+)\\.((?:\\s.*)?)$/;
const ANSWER_LINE = /^\\s*Answer:(.*)$/;
const VERDICT_LINE = /^\\s*Verdict:(.*)$/;
const MISSING_PAGES_HEADING = '**Pages the crawl did not find**';
const NOTES_HEADING = '**Your notes**';
// Past this many cells the line comparison stops looking for the smallest change and reports the
// changed middle of the file as one edit - still nothing lost, only coarser.
const MAX_DIFF_CELLS = 25000000;

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function print(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, '').replace(/\\r\\n/g, '\\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function relative(filePath) {
  return path.relative(CWD, filePath).split(path.sep).join('/');
}

// The stamp line only says which JSON the file came from; the copy beside the file is what counts.
function body(text) {
  const lines = text.split('\\n');
  return /^<!--/.test(lines[0] || '') ? lines.slice(1) : lines;
}

function clean(line) {
  return line.replace(/\\s+$/, '');
}

function parseLabels(lines) {
  const found = new Map();
  lines.forEach(function (line, index) {
    const match = LABEL_LINE.exec(line);
    if (!match || found.has(match[3])) return;
    found.set(match[3], {
      index: index,
      box: match[2] === undefined ? null : match[2].toLowerCase() === 'x',
      // As typed: [x] and [X] are the same tick, and neither is an edit of the line.
      boxText: match[2],
      rest: match[4].trim().replace(/\\s+/g, ' '),
    });
  });
  return found;
}

// The Answer: or Verdict: line that belongs to a label: the first one below it, before the next
// label or section.
function windowOf(lines, at, pattern) {
  if (!at) return null;
  for (let i = at.index + 1; i < lines.length; i++) {
    if (LABEL_LINE.test(lines[i]) || /^\\*\\*/.test(lines[i])) return null;
    const match = pattern.exec(lines[i]);
    if (match) return { index: i, value: match[1].trim() };
  }
  return null;
}

function sectionRange(lines, heading) {
  const start = lines.findIndex(function (line) {
    return line.trim() === heading;
  });
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^\\*\\*/.test(lines[end])) end++;
  return { start: start, end: end };
}

function listedIn(lines, range) {
  if (!range) return [];
  const items = [];
  for (let i = range.start + 1; i < range.end; i++) {
    const match = /^\\s*[-*]\\s*(.*)$/.exec(lines[i]);
    if (match && match[1].trim()) items.push(match[1].trim());
  }
  return items;
}

// A verdict is read from the first words of the line, in English or Russian, and whatever follows is
// kept as the person's note. A live review wrote "broken - this is broken and not needed" and the
// whole line was set aside, because only a bare word counted. Anything this cannot read is not
// guessed at: it comes back in unreadVerdicts for the assistant to ask about.
const VERDICT_END = '(?=$|[\\\\s.,;:!?()\\\\-\\\\u2013\\\\u2014])';
const BROKEN_WORDS = new RegExp(
  '^(broken|dead|does not work|doesn\\'t work|not working|fails|failing|' +
    '\\u043d\\u0435 \\u0440\\u0430\\u0431\\u043e\\u0442\\u0430\\u0435\\u0442|\\u0441\\u043b\\u043e\\u043c\\u0430\\u043d\\\\S*|\\u0431\\u0438\\u0442\\\\S*|\\u043d\\u0435\\u0440\\u0430\\u0431\\u043e\\u0447\\\\S*)' +
    VERDICT_END,
);
const WORKS_WORDS = new RegExp(
  '^(works?|working|ok|okay|fine|real|' +
    '\\u0440\\u0430\\u0431\\u043e\\u0442\\u0430\\u0435\\u0442|\\u0440\\u0430\\u0431\\u043e\\u0447\\\\S*|\\u0432\\u0441\\u0435 \\u0445\\u043e\\u0440\\u043e\\u0448\\u043e|\\u043e\\u043a)' +
    VERDICT_END,
);

function parseVerdict(value) {
  const text = String(value || '').trim();
  const lower = text.toLowerCase().replace(/\\u0451/g, '\\u0435');
  for (const [pattern, verdict] of [
    [BROKEN_WORDS, 'broken'],
    [WORKS_WORDS, 'works'],
  ]) {
    const match = pattern.exec(lower);
    if (!match) continue;
    const note = text.slice(match[0].length).replace(/^[\\s.,;:!?\\-\\u2013\\u2014]+/, '').trim();
    return { verdict: verdict, note: note };
  }
  return null;
}

// Longest common subsequence over lines, after the common head and tail are set aside.
function diffLines(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const ops = [];
  for (let k = 0; k < start; k++) ops.push({ type: 'same', a: k, b: k });
  if ((A.length + 1) * (B.length + 1) > MAX_DIFF_CELLS) {
    for (let i = 0; i < A.length; i++) ops.push({ type: 'del', a: start + i });
    for (let j = 0; j < B.length; j++) ops.push({ type: 'add', b: start + j });
  } else {
    const width = B.length + 1;
    const table = new Uint32Array((A.length + 1) * width);
    for (let i = A.length - 1; i >= 0; i--) {
      for (let j = B.length - 1; j >= 0; j--) {
        table[i * width + j] =
          A[i] === B[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) {
        ops.push({ type: 'same', a: start + i, b: start + j });
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        ops.push({ type: 'del', a: start + i });
        i++;
      } else {
        ops.push({ type: 'add', b: start + j });
        j++;
      }
    }
    while (i < A.length) ops.push({ type: 'del', a: start + i++ });
    while (j < B.length) ops.push({ type: 'add', b: start + j++ });
  }
  for (let k = 0; endA + k < a.length; k++) ops.push({ type: 'same', a: endA + k, b: endB + k });
  return ops;
}

// Every changed line, grouped by the entry it sits in. A line a person added belongs to the entry
// above it; a change to blank lines alone is not an edit.
function freeEditsOf(expected, owners, user) {
  const ops = diffLines(expected.map(clean), user.map(clean));
  const byOwner = new Map();
  let lastOwner = null;
  const note = function (owner, kind, line) {
    const key = owner === null ? '' : owner;
    if (!byOwner.has(key)) byOwner.set(key, { label: owner, removed: [], added: [] });
    byOwner.get(key)[kind].push(line);
  };
  for (const op of ops) {
    if (op.type === 'same') {
      lastOwner = owners[op.a];
    } else if (op.type === 'del') {
      lastOwner = owners[op.a];
      if (expected[op.a].trim()) note(owners[op.a], 'removed', clean(expected[op.a]));
    } else if (user[op.b].trim()) {
      note(lastOwner, 'added', clean(user[op.b]));
    }
  }
  return Array.from(byOwner.values());
}

function runValidator(kind) {
  const script = VALIDATORS[kind];
  if (!script || !fs.existsSync(path.join(CWD, 'scripts', script))) return null;
  const result = spawnSync('node', [path.join('scripts', script)], { cwd: CWD, encoding: 'utf8' });
  let errors = [];
  try {
    const parsed = JSON.parse(result.stdout);
    errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  } catch {
    errors = result.status === 0 ? [] : [String(result.stdout || result.stderr || 'validator failed').trim()];
  }
  return { passed: result.status === 0, errors: errors };
}

function render(kind) {
  const result = spawnSync('node', [path.join('scripts', 'render-review-artifact.mjs'), '--kind=' + kind], { cwd: CWD, encoding: 'utf8' });
  return result.status === 0;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\\n', 'utf8');
}

// The site map is keyed by path; every label carries the routeId, which survives a URL restructure.
function routeEntry(siteMap, routeId) {
  const routes = siteMap && siteMap.routes && typeof siteMap.routes === 'object' ? siteMap.routes : {};
  for (const [routePath, route] of Object.entries(routes)) {
    if (route && route.routeId === routeId) return { path: routePath, route: route };
  }
  return null;
}

function loadProfile() {
  const profile = readJsonFile(APP_PROFILE_PATH);
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) return profile;
  return { schemaVersion: 1, generatedAt: new Date().toISOString() };
}

// Marks the exact text this script read, so render-review-artifact.mjs knows the person's edits are
// accounted for and may redraw the file. A file nobody read back is never redrawn over.
function markRead(basePath, userText) {
  const base = readJsonFile(basePath);
  if (!base) return;
  base.readBack = sha256(tidyText(userText));
  writeJsonFile(basePath, base);
}

function tidyText(text) {
  return String(text)
    .replace(/\\r\\n/g, '\\n')
    .split('\\n')
    .map(clean)
    .join('\\n')
    .trim();
}

// Corrections handed to the assistant wait here until it confirms them with --done. pipeline-status
// lists them, and every rendering of the review shows them, so a person's words cannot vanish when
// the file is redrawn before anyone acted on them.
function pendingPath(kind) {
  return path.join(PENDING_DIR, kind + '.json');
}

function savePending(kind, items) {
  if (items.freeEdits.length === 0 && items.missingPages.length === 0 && items.unreadVerdicts.length === 0) return;
  const previous = readJsonFile(pendingPath(kind));
  const merged = {
    kind: kind,
    since: previous && previous.since ? previous.since : new Date().toISOString(),
    freeEdits: (previous && Array.isArray(previous.freeEdits) ? previous.freeEdits : []).concat(items.freeEdits),
    missingPages: (previous && Array.isArray(previous.missingPages) ? previous.missingPages : []).concat(items.missingPages),
    unreadVerdicts: (previous && Array.isArray(previous.unreadVerdicts) ? previous.unreadVerdicts : []).concat(items.unreadVerdicts),
  };
  writeJsonFile(pendingPath(kind), merged);
}

// A left-out page is kept in app-profile.json, which outlives every re-crawl, and marked removed in
// the site map, which every later stage already skips.
function leaveOut(siteMap, profile, ref, note, now) {
  const found = routeEntry(siteMap, ref.routeId);
  const routePath = found ? found.path : ref.path;
  if (!routePath) return false;
  if (found) {
    found.route.status = 'removed';
    found.route.removedBy = 'human';
    found.route.removedAt = now;
    if (note) found.route.removedNote = note;
    else delete found.route.removedNote;
  }
  const list = Array.isArray(profile.leftOutRoutes) ? profile.leftOutRoutes : [];
  const existing = list.find(function (entry) {
    return entry && entry.path === routePath;
  });
  const record = { path: routePath, by: 'human', at: now };
  if (ref.routeId) record.routeId = ref.routeId;
  if (note) record.note = note;
  if (existing) Object.assign(existing, record);
  else list.push(record);
  profile.leftOutRoutes = list;
  return true;
}

function bringBack(siteMap, profile, ref) {
  const list = Array.isArray(profile.leftOutRoutes) ? profile.leftOutRoutes : [];
  profile.leftOutRoutes = list.filter(function (entry) {
    return !(entry && entry.path === ref.path);
  });
  if (profile.leftOutRoutes.length === 0) delete profile.leftOutRoutes;
  const found = ref.routeId ? routeEntry(siteMap, ref.routeId) : null;
  if (!found || found.route.removedBy !== 'human') return false;
  found.route.status = 'active';
  delete found.route.removedBy;
  delete found.route.removedAt;
  delete found.route.removedNote;
  return true;
}

// What a left-out page leaves in the later stages goes with it: its test conditions, its fields in
// the analysis of its feature, the analysis of a feature left with no page at all, and the test cases
// that walk no page still in. A test case that walks one still in is unticked instead - only a
// redraw can say what it becomes. None of it returns with the page; /define-test-conditions analyses
// a page brought back again.
function followLeftOut(routeIds, featureIds, outIds) {
  const result = { routes: [], features: [], frame: null, testCasesDropped: [], testCasesUnticked: [] };
  const conditionsDoc = readJsonFile(TEST_CONDITIONS_PATH);
  if (conditionsDoc && conditionsDoc.routes && typeof conditionsDoc.routes === 'object') {
    let changed = false;
    for (const routeId of routeIds) {
      if (!(routeId in conditionsDoc.routes)) continue;
      delete conditionsDoc.routes[routeId];
      result.routes.push(routeId);
      changed = true;
    }
    const analyses = conditionsDoc.features && typeof conditionsDoc.features === 'object' ? conditionsDoc.features : {};
    for (const featureId of featureIds) {
      if (!(featureId in analyses)) continue;
      delete analyses[featureId];
      result.features.push(featureId);
      changed = true;
    }
    for (const analysis of Object.values(analyses)) {
      if (!analysis || !Array.isArray(analysis.fields)) continue;
      const kept = analysis.fields.filter(function (field) {
        return !(field && routeIds.has(field.routeId));
      });
      if (kept.length === analysis.fields.length) continue;
      analysis.fields = kept;
      changed = true;
    }
    if (routeIds.has(conditionsDoc.frameRouteId)) {
      result.frame = conditionsDoc.frameRouteId;
      delete conditionsDoc.frameRouteId;
      changed = true;
    }
    if (changed) writeJsonFile(TEST_CONDITIONS_PATH, conditionsDoc);
  }
  const testCasesDoc = readJsonFile(TEST_CASES_PATH);
  if (testCasesDoc && testCasesDoc.journeys && typeof testCasesDoc.journeys === 'object') {
    let changed = false;
    for (const [journeyId, journey] of Object.entries(testCasesDoc.journeys)) {
      const walks = journey && Array.isArray(journey.routeIds) ? journey.routeIds : [];
      const through = walks.some(function (routeId) {
        return routeIds.has(routeId);
      });
      if (!through) continue;
      const onlyOut = walks.every(function (routeId) {
        return outIds.has(routeId);
      });
      if (onlyOut) {
        delete testCasesDoc.journeys[journeyId];
        result.testCasesDropped.push(journeyId);
      } else {
        journey.reviewed = false;
        delete journey.reviewedBy;
        result.testCasesUnticked.push(journeyId);
      }
      changed = true;
    }
    if (changed) writeJsonFile(TEST_CASES_PATH, testCasesDoc);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------

function findRecord(kind, data, ref) {
  if (!ref) return null;
  if (kind === 'site-map' && ref.type === 'route') {
    const found = routeEntry(data, ref.routeId);
    return found ? found.route : null;
  }
  if (kind === 'feature-map') {
    const table = ref.type === 'feature' ? data.features : ref.type === 'page' ? data.routes : ref.type === 'entity' ? data.entities : null;
    const key = ref.type === 'page' ? ref.routeId : ref.id;
    return table && typeof table === 'object' && key in table ? table[key] : null;
  }
  if (kind === 'test-conditions' && ref.type === 'condition') {
    const entry = data.routes && data.routes[ref.routeId];
    const list = entry && Array.isArray(entry.conditions) ? entry.conditions : [];
    return (
      list.find(function (condition) {
        return condition && condition.conditionId === ref.conditionId;
      }) || null
    );
  }
  return null;
}

// A test condition a person approved is no longer speculative, and one whose approval is withdrawn
// is again - the validator refuses the two flags disagreeing.
function setReviewed(record, approved) {
  if (approved) {
    record.reviewed = true;
    record.reviewedBy = 'human';
  } else {
    record.reviewed = false;
    delete record.reviewedBy;
  }
  if (typeof record.isSpeculative === 'boolean') record.isSpeculative = !approved;
}

function main() {
  const kind = argValue('kind');
  if (!(kind in VALIDATORS)) {
    print({ status: 'NO_VIEW', error: 'pass --kind=site-map, --kind=feature-map or --kind=test-conditions' });
    process.exit(1);
  }
  const viewPath = path.join(REVIEW_DIR, kind + '-review.md');
  const basePath = path.join(REVIEW_DIR, '.base', kind + '-review.json');

  // The assistant has applied the corrections it was handed: they stop waiting, and the file is
  // redrawn from the JSON that now holds them.
  if (process.argv.slice(2).indexOf('--done') !== -1) {
    const file = pendingPath(kind);
    const waiting = readJsonFile(file);
    if (waiting) fs.unlinkSync(file);
    const rendered = fs.existsSync(basePath) ? render(kind) : false;
    print({
      kind: kind,
      status: 'DONE',
      cleared: Boolean(waiting),
      next: waiting
        ? (rendered ? 'The corrections are marked applied and the review file shows the current state. ' : '') +
          'Tell the person what changed.'
        : 'Nothing was waiting.',
    });
    return;
  }

  if (!fs.existsSync(viewPath) || !fs.existsSync(basePath)) {
    print({
      kind: kind,
      status: 'NO_VIEW',
      next: 'There is no rendered review to read back - run node scripts/render-review-artifact.mjs --kind=' + kind + ' first.',
    });
    return;
  }
  const base = JSON.parse(readText(basePath));

  // A verdict the person gave in conversation, for a disagreement whose Verdict: line this script
  // could not read. Checked the same way as one read from the file: the label must be a
  // disagreement, and the answer must be works or broken.
  const verdictArg = argValue('verdict');
  if (verdictArg !== undefined) {
    const cut = verdictArg.indexOf(':');
    const label = cut === -1 ? verdictArg : verdictArg.slice(0, cut);
    const ref = base.labels[label];
    const parsed = parseVerdict(cut === -1 ? '' : verdictArg.slice(cut + 1));
    if (!ref || ref.type !== 'disagreement' || !parsed) {
      print({
        kind: kind,
        status: 'INVALID',
        errors: [
          !ref || ref.type !== 'disagreement'
            ? label + ' is not a disagreement in the current review file.'
            : 'pass the verdict as works or broken, e.g. --verdict=' + label + ':broken',
        ],
      });
      process.exit(1);
    }
    const note = argValue('note') || parsed.note || undefined;
    const written = recordVerdict(kind, ref.id, parsed.verdict, note);
    const waiting = readJsonFile(pendingPath(kind));
    if (waiting && Array.isArray(waiting.unreadVerdicts)) {
      waiting.unreadVerdicts = waiting.unreadVerdicts.filter(function (item) {
        return item.label !== label;
      });
      if (waiting.unreadVerdicts.length + (waiting.freeEdits || []).length + (waiting.missingPages || []).length === 0) {
        fs.unlinkSync(pendingPath(kind));
      } else writeJsonFile(pendingPath(kind), waiting);
    }
    const result = {
      kind: kind,
      status: 'APPLIED',
      applied: { verdicts: [label] },
      next:
        'Recorded ' +
        label +
        ' as ' +
        parsed.verdict +
        '. Run node scripts/render-review-artifact.mjs --kind=' +
        kind +
        ' so the file shows it. A verdict settles what the page is; to leave the page out of every later stage, the person deletes its route from the review.',
    };
    if (written && written.warning) result.warning = written.warning;
    print(result);
    return;
  }
  const baseLines = body(base.text.replace(/\\r\\n/g, '\\n'));
  const baseOwners = /^<!--/.test(base.text.split('\\n')[0] || '') ? base.owners.slice(1) : base.owners;
  const userText = readText(viewPath);
  const userLines = body(userText);
  const filePath = relative(viewPath);

  if (baseLines.map(clean).join('\\n').trim() === userLines.map(clean).join('\\n').trim()) {
    print({ kind: kind, status: 'NO_CHANGES', filePath: filePath, next: 'The file is exactly as it was rendered - nothing to apply.' });
    return;
  }

  // Read once already. Reading it again would add the same notes twice and hand over the same
  // corrections again; what is still waiting from that read is in the pending file.
  if (base.readBack && base.readBack === sha256(tidyText(userText))) {
    const waiting = readJsonFile(pendingPath(kind));
    print({
      kind: kind,
      status: 'ALREADY_READ',
      filePath: filePath,
      waiting: waiting,
      next: waiting
        ? 'These edits were read earlier and their corrections are still waiting: apply them, then run node scripts/apply-review.mjs --kind=' + kind + ' --done.'
        : 'These edits were read and applied earlier. Run node scripts/render-review-artifact.mjs --kind=' + kind + ' to show the current state.',
    });
    return;
  }

  const sourcePath = path.join(CWD, base.source);
  const rawSource = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : null;
  const sourceText = rawSource === null ? null : rawSource.replace(/^\\uFEFF/, '');
  const describeEdits = function (edits) {
    return edits.map(function (edit) {
      return { label: edit.label, entry: edit.label ? base.labels[edit.label] || null : null, removed: edit.removed, added: edit.added };
    });
  };

  // The JSON moved on after this file was rendered. Reading the edits onto it would pair a label with
  // whatever now sits at that position, so nothing is applied: the person's file is kept, and every
  // edit goes to the assistant to carry over onto the fresh view.
  if (rawSource === null || sha256(rawSource).slice(0, 16) !== base.sourceHash) {
    const keptPath = path.join(REVIEW_DIR, kind + '-review.unapplied.md');
    fs.writeFileSync(keptPath, userText, 'utf8');
    const edits = describeEdits(freeEditsOf(baseLines, baseOwners, userLines));
    markRead(basePath, userText);
    render(kind);
    print({
      kind: kind,
      status: 'STALE',
      filePath: filePath,
      unappliedFile: relative(keptPath),
      freeEdits: edits,
      next:
        base.source +
        ' changed after this file was rendered, so nothing was applied. The person\\'s file is kept at ' +
        relative(keptPath) +
        ' and the review now shows the current state. Carry every entry in freeEdits over onto the current JSON as a correction (a box they ticked is an approval), tell the person so, then render the file again.',
    });
    return;
  }

  const data = JSON.parse(sourceText);
  const baseLabels = parseLabels(baseLines);
  const userLabels = parseLabels(userLines);

  // What can be read exactly: boxes, answers, verdicts, deleted condition lines, deleted routes and
  // pages, the pages list, the notes.
  const toggles = new Map();
  const cuts = [];
  const restores = [];
  const answers = [];
  const verdicts = [];
  const unreadVerdicts = [];
  const leftOut = [];
  const broughtBack = [];
  let all = false;
  const expected = [];
  const expectedOwners = [];
  const missingBase = sectionRange(baseLines, MISSING_PAGES_HEADING);
  const missingUser = sectionRange(userLines, MISSING_PAGES_HEADING);
  const notesBase = sectionRange(baseLines, NOTES_HEADING);
  const notesUser = sectionRange(userLines, NOTES_HEADING);
  const windows = new Map();

  for (const [label, ref] of Object.entries(base.labels)) {
    const baseAt = baseLabels.get(label);
    const userAt = userLabels.get(label);
    if (!baseAt) continue;
    if (ref.type === 'question') {
      const baseWindow = windowOf(baseLines, baseAt, ANSWER_LINE);
      const userWindow = windowOf(userLines, userAt, ANSWER_LINE);
      if (baseWindow && userWindow) {
        windows.set(baseWindow.index, userLines[userWindow.index]);
        if (baseWindow.value !== userWindow.value) answers.push({ label: label, ref: ref, value: userWindow.value });
      }
      continue;
    }
    if (ref.type === 'disagreement') {
      const baseWindow = windowOf(baseLines, baseAt, VERDICT_LINE);
      const userWindow = windowOf(userLines, userAt, VERDICT_LINE);
      if (baseWindow && userWindow && baseWindow.value !== userWindow.value) {
        // The line is accounted for either way: read here, or handed to the assistant to ask about.
        windows.set(baseWindow.index, userLines[userWindow.index]);
        const parsed = parseVerdict(userWindow.value);
        if (parsed) verdicts.push({ label: label, ref: ref, verdict: parsed.verdict, note: parsed.note });
        else if (userWindow.value) unreadVerdicts.push({ label: label, path: ref.path, text: userWindow.value });
      }
      continue;
    }
    if (!userAt) {
      if (ref.type === 'condition') {
        if (ref.cut) continue;
        cuts.push({ label: label, ref: ref });
      } else if (ref.type === 'route' || ref.type === 'page') {
        // Deleting a route or a page leaves it out of every later stage - the same thing deleting a
        // line does in an interactive rebase, and the same thing it already does to a condition.
        leftOut.push({ label: label, ref: ref });
      }
      continue;
    }
    if (userAt.box === null || baseAt.box === null || userAt.box === baseAt.box) continue;
    if (ref.type === 'all') all = userAt.box === true;
    else if (ref.type === 'condition' && ref.cut) {
      if (userAt.box) restores.push({ label: label, ref: ref });
    } else if (ref.type === 'left-out') {
      if (userAt.box) broughtBack.push({ label: label, ref: ref });
    } else toggles.set(label, userAt.box);
  }

  // The rendering as it would read with only those changes made. Whatever else differs from the
  // person's file is theirs to say, and goes to the assistant.
  const droppedLines = new Set();
  for (const item of cuts) droppedLines.add(baseLabels.get(item.label).index);
  for (const [label, ref] of Object.entries(base.labels)) {
    if (ref.type === 'condition' && ref.cut && !userLabels.has(label) && baseLabels.has(label)) droppedLines.add(baseLabels.get(label).index);
  }
  // A route or page takes several lines; leaving it out removes its own block - the label line to the
  // blank line that closes it. Lines past that blank line can still count it as their owner (a
  // feature's own lines follow its last page) and are not the entry's to take with it: a live review
  // deleted one page and had its feature's lines handed back as corrections to the page before it.
  const leftOutLabels = new Set(
    leftOut.map(function (item) {
      return item.label;
    }),
  );
  for (const item of leftOut) {
    const at = baseLabels.get(item.label);
    if (!at) continue;
    droppedLines.add(at.index);
    for (let i = at.index + 1; i < baseLines.length; i++) {
      if (LABEL_LINE.test(baseLines[i]) || /^\\*\\*/.test(baseLines[i])) break;
      droppedLines.add(i);
      if (baseLines[i].trim() === '') break;
    }
  }
  for (let i = 0; i < baseLines.length; i++) {
    if (missingBase && missingUser && i === missingBase.start) {
      for (let k = missingUser.start; k < missingUser.end; k++) {
        expected.push(userLines[k]);
        expectedOwners.push(null);
      }
      i = missingBase.end - 1;
      continue;
    }
    if (notesBase && notesUser && i === notesBase.start) {
      for (let k = notesUser.start; k < notesUser.end; k++) {
        expected.push(userLines[k]);
        expectedOwners.push(null);
      }
      i = notesBase.end - 1;
      continue;
    }
    if (droppedLines.has(i)) continue;
    let line = baseLines[i];
    if (windows.has(i)) line = windows.get(i);
    const match = LABEL_LINE.exec(line);
    if (match && match[2] !== undefined && userLabels.has(match[3])) {
      const userAt = userLabels.get(match[3]);
      if (userAt.box !== null) line = line.replace(/\\[[ xX]\\]/, '[' + userAt.boxText + ']');
    }
    expected.push(line);
    expectedOwners.push(baseOwners[i] === undefined ? null : baseOwners[i]);
  }
  const edits = freeEditsOf(expected, expectedOwners, userLines);
  const edited = new Set(
    edits
      .map(function (edit) {
        return edit.label;
      })
      .filter(Boolean),
  );

  // An approval on an entry the person also changed waits until the change is made: it approves the
  // corrected entry, never the one it replaces.
  const approve = new Set();
  const revoke = new Set();
  const approveAfterChange = [];
  const cutLabels = new Set(
    cuts.map(function (item) {
      return item.label;
    }),
  );
  // A feature's box in the test conditions stands for its conditions, so it is expanded below
  // rather than applied to anything of its own.
  const bulkFeature = function (label) {
    return kind === 'test-conditions' && base.labels[label].type === 'feature';
  };
  for (const [label, to] of toggles) {
    if (bulkFeature(label)) continue;
    if (!to) revoke.add(label);
    else if (edited.has(label)) approveAfterChange.push(label);
    else approve.add(label);
  }
  if (kind === 'test-conditions') {
    for (const [label, to] of toggles) {
      if (!bulkFeature(label)) continue;
      const ref = base.labels[label];
      for (const member of ref.conditions || []) {
        if (cutLabels.has(member) || toggles.has(member)) continue;
        if (!to) revoke.add(member);
        else if (edited.has(label) || edited.has(member)) approveAfterChange.push(member);
        else approve.add(member);
      }
    }
  }
  if (all) {
    for (const [label, ref] of Object.entries(base.labels)) {
      const approvable =
        ref.type === 'page' ||
        ref.type === 'entity' ||
        (ref.type === 'route' && kind === 'site-map') ||
        (ref.type === 'feature' && kind === 'feature-map') ||
        (ref.type === 'condition' && !ref.cut);
      if (!approvable || cutLabels.has(label) || leftOutLabels.has(label) || revoke.has(label) || toggles.get(label) === false) continue;
      if (edited.has(label)) {
        if (approveAfterChange.indexOf(label) === -1) approveAfterChange.push(label);
      } else approve.add(label);
    }
  }

  // Applied to the JSON, and kept only if the stage's own validator is no worse for it.
  const applied = {
    approved: [],
    revoked: [],
    cut: [],
    restored: [],
    answered: [],
    verdicts: [],
    leftOut: [],
    broughtBack: [],
    notes: 0,
  };
  const missing = [];
  const now = new Date().toISOString();

  // What the person wrote under "Your notes": every new line is kept, in their words, with the other
  // knowledge a person volunteered about this application.
  const notes = [];
  if (notesUser) {
    const before = new Set(
      notesBase
        ? baseLines.slice(notesBase.start + 1, notesBase.end).map(function (line) {
            return line.trim();
          })
        : [],
    );
    for (let k = notesUser.start + 1; k < notesUser.end; k++) {
      const line = userLines[k].trim();
      if (!line || before.has(line)) continue;
      const text = line.replace(/^[-*]\\s*/, '').trim();
      if (text) notes.push(text);
    }
  }
  for (const label of approve) {
    const record = findRecord(kind, data, base.labels[label]);
    if (!record) {
      missing.push(label);
      continue;
    }
    if (record.reviewed === true && record.reviewedBy === 'human') continue;
    setReviewed(record, true);
    applied.approved.push(label);
  }
  for (const label of revoke) {
    const record = findRecord(kind, data, base.labels[label]);
    if (!record) {
      missing.push(label);
      continue;
    }
    if (record.reviewed !== true) continue;
    setReviewed(record, false);
    applied.revoked.push(label);
  }
  for (const item of cuts) {
    const record = findRecord(kind, data, item.ref);
    if (!record) {
      missing.push(item.label);
      continue;
    }
    record.cut = true;
    setReviewed(record, false);
    applied.cut.push(item.label);
  }
  for (const item of restores) {
    const record = findRecord(kind, data, item.ref);
    if (!record) {
      missing.push(item.label);
      continue;
    }
    delete record.cut;
    applied.restored.push(item.label);
  }
  for (const item of answers) {
    const analysis = data.features && data.features[item.ref.featureId];
    const question = analysis && Array.isArray(analysis.questions) ? analysis.questions[item.ref.index] : null;
    if (!question) {
      missing.push(item.label);
      continue;
    }
    if (item.value) question.answer = item.value;
    else delete question.answer;
    applied.answered.push(item.label);
  }

  // Leaving a page out and bringing one back touch the site map and app-profile.json, whichever
  // review the person did it in. For the site map review the site map is this file's own JSON.
  const siteMapDoc = kind === 'site-map' ? data : leftOut.length + broughtBack.length > 0 ? readJsonFile(SITE_MAP_PATH) : null;
  let profile = null;
  let siteMapTouched = false;
  const needsCrawl = [];
  const noteFor = function (routeId) {
    const read = verdicts.find(function (item) {
      return item.ref.routeId === routeId && item.note;
    });
    if (read) return read.note;
    const unread = unreadVerdicts.find(function (item) {
      const ref = base.labels[item.label];
      return ref && ref.routeId === routeId;
    });
    return unread ? unread.text : undefined;
  };
  if (leftOut.length > 0 || broughtBack.length > 0 || notes.length > 0) profile = loadProfile();
  for (const item of leftOut) {
    if (siteMapDoc && leaveOut(siteMapDoc, profile, item.ref, noteFor(item.ref.routeId), now)) {
      applied.leftOut.push(item.label);
      siteMapTouched = true;
    } else missing.push(item.label);
  }
  for (const item of broughtBack) {
    if (bringBack(siteMapDoc, profile, item.ref)) siteMapTouched = true;
    else needsCrawl.push(item.ref.path);
    applied.broughtBack.push(item.label);
  }
  for (const text of notes) {
    if (!Array.isArray(profile.domainNotes)) profile.domainNotes = [];
    profile.domainNotes.push({ note: text, statedDuring: kind + ' review', recordedAt: now });
    applied.notes += 1;
  }
  // A verdict on a page the person also left out needs no answer any more - leaving it out says more.
  const leftOutRouteIds = new Set(
    leftOut.map(function (item) {
      return item.ref.routeId;
    }),
  );
  const stillUnread = unreadVerdicts.filter(function (item) {
    const ref = base.labels[item.label];
    return !(ref && leftOutRouteIds.has(ref.routeId));
  });

  const changedJson =
    applied.approved.length +
      applied.revoked.length +
      applied.cut.length +
      applied.restored.length +
      applied.answered.length +
      (kind === 'site-map' && siteMapTouched ? 1 : 0) >
    0;
  let validation = null;
  if (changedJson) {
    const before = runValidator(kind);
    fs.writeFileSync(sourcePath, JSON.stringify(data, null, 2) + '\\n', 'utf8');
    const after = runValidator(kind);
    if (before && after && !after.passed) {
      const known = new Set(before.errors);
      const introduced = after.errors.filter(function (error) {
        return !known.has(error);
      });
      if (introduced.length > 0) {
        fs.writeFileSync(sourcePath, rawSource, 'utf8');
        print({
          kind: kind,
          status: 'INVALID',
          filePath: filePath,
          errors: introduced,
          next: 'Applying these edits would break the stage\\'s validator, so nothing was applied and the file is as the person left it. Tell them which entry is the problem and how to fix it.',
        });
        return;
      }
    }
    validation = after ? (after.passed ? 'PASSED' : 'FAILED as before') : 'no validator';
  }

  if (profile && (applied.leftOut.length + applied.broughtBack.length > 0 || applied.notes > 0)) {
    profile.lastUpdatedAt = now;
    writeJsonFile(APP_PROFILE_PATH, profile);
  }
  if (kind !== 'site-map' && siteMapTouched && siteMapDoc) writeJsonFile(SITE_MAP_PATH, siteMapDoc);

  const leftOutIds = new Set();
  for (const item of leftOut) {
    if (item.ref.routeId && applied.leftOut.indexOf(item.label) !== -1) leftOutIds.add(item.ref.routeId);
  }
  // A feature with no page left in the site map now that these are out. Matched by its pages rather
  // than by its id going missing: a feature a person renamed also gets a new id from the derivation.
  const emptiedFeatures = [];
  const mapBefore = leftOutIds.size > 0 ? readJsonFile(FEATURE_MAP_PATH) : null;
  const outIds = new Set();
  for (const route of Object.values((siteMapDoc && siteMapDoc.routes) || {})) {
    if (route && route.status === 'removed' && typeof route.routeId === 'string') outIds.add(route.routeId);
  }
  for (const [id, feature] of Object.entries((mapBefore && mapBefore.features) || {})) {
    const members = feature && Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : [];
    const emptied =
      members.some(function (routeId) {
        return leftOutIds.has(routeId);
      }) &&
      members.every(function (routeId) {
        return outIds.has(routeId);
      });
    if (emptied) emptiedFeatures.push({ id: id, name: feature.name });
  }

  // The feature map follows the site map: a page left out or brought back is regrouped at once, so
  // the next stage never reads a feature built on a page the person just removed.
  let featureMap = null;
  const approvalWithdrawn = [];
  let pagesWithoutIntent = 0;
  if (siteMapTouched && fs.existsSync(FEATURE_MAP_PATH) && fs.existsSync(path.join(CWD, 'scripts', 'derive-feature-map.mjs'))) {
    // What was approved going in. A feature whose pages change is not the feature a person approved,
    // so the derivation withdraws the approval - which the person has to hear, not discover.
    const before = readJsonFile(FEATURE_MAP_PATH) || {};
    const derived = spawnSync('node', [path.join('scripts', 'derive-feature-map.mjs')], { cwd: CWD, encoding: 'utf8' });
    try {
      const report = JSON.parse(derived.stdout);
      featureMap = report.status;
      pagesWithoutIntent = report.routesWithoutIntent || 0;
    } catch {
      featureMap = 'FAILED';
    }
    const after = readJsonFile(FEATURE_MAP_PATH) || {};
    for (const [id, feature] of Object.entries(before.features || {})) {
      if (!feature || feature.reviewed !== true) continue;
      const now = (after.features || {})[id];
      const emptied = emptiedFeatures.some(function (item) {
        return item.id === id;
      });
      if (!emptied && (!now || now.reviewed !== true)) approvalWithdrawn.push('feature "' + feature.name + '"');
    }
    for (const [id, entity] of Object.entries(before.entities || {})) {
      if (!entity || entity.reviewed !== true) continue;
      const now = (after.entities || {})[id];
      if (!now || now.reviewed !== true) approvalWithdrawn.push('entity "' + entity.name + '"');
    }
  }

  const followed =
    leftOutIds.size > 0
      ? followLeftOut(
          leftOutIds,
          new Set(
            emptiedFeatures.map(function (feature) {
              return feature.id;
            }),
          ),
          outIds,
        )
      : null;
  const followedAny =
    followed !== null &&
    (followed.frame !== null || followed.routes.length + followed.features.length + followed.testCasesDropped.length + followed.testCasesUnticked.length > 0);
  const pathOf = function (routeId) {
    const found = siteMapDoc ? routeEntry(siteMapDoc, routeId) : null;
    return found ? found.path : routeId;
  };
  // A page brought back that the test conditions no longer hold has to be analysed again.
  const conditionsNow = broughtBack.length > 0 ? readJsonFile(TEST_CONDITIONS_PATH) : null;
  const toAnalyse =
    conditionsNow && conditionsNow.routes
      ? broughtBack
          .filter(function (item) {
            return item.ref.routeId && needsCrawl.indexOf(item.ref.path) === -1 && !(item.ref.routeId in conditionsNow.routes);
          })
          .map(function (item) {
            return item.ref.path;
          })
      : [];
  // The other review files show what changed too. One holding edits nobody has read yet is left as
  // it is - the renderer refuses to draw over them, and reading them back later reports it stale.
  const redrawn = [];
  if (siteMapTouched) {
    for (const other of ['feature-map', 'test-conditions']) {
      if (other === kind || !fs.existsSync(path.join(REVIEW_DIR, other + '-review.md'))) continue;
      if (render(other)) redrawn.push(other);
    }
  }

  for (const item of verdicts) {
    recordVerdict(kind, item.ref.id, item.verdict, item.note || undefined);
    applied.verdicts.push(item.label);
  }
  const journal = kind === 'site-map' ? null : kind === 'feature-map' ? syncJournal(kind) : null;

  const missingPages = listedIn(userLines, missingUser).filter(function (item) {
    return listedIn(baseLines, missingBase).indexOf(item) === -1;
  });
  const freeEdits = describeEdits(edits);
  savePending(kind, { freeEdits: freeEdits, missingPages: missingPages, unreadVerdicts: stillUnread });
  markRead(basePath, userText);

  // Re-rendered only once nothing the person wrote is waiting on the assistant: a correction, a
  // held-back approval, a page they named or a verdict it could not read - none of which the JSON
  // holds yet, so the file keeps them until it does.
  const settled =
    freeEdits.length === 0 && approveAfterChange.length === 0 && missingPages.length === 0 && stillUnread.length === 0;
  if (settled) render(kind);

  const next = [];
  if (applied.leftOut.length > 0) {
    next.push(
      'Left out ' +
        Array.from(leftOutIds).map(pathOf).join(', ') +
        ': marked removed in the site map and kept in app-profile.json leftOutRoutes, so no later stage tests it and a fresh crawl will not map it again.' +
        (featureMap && emptiedFeatures.length > 0
          ? ' ' +
            emptiedFeatures
              .map(function (feature) {
                return 'Feature "' + feature.name + '"';
              })
              .join(', ') +
            ' had no other page, so the redrawn feature map no longer holds it.'
          : ''),
    );
  }
  if (followedAny) {
    const gone = followed.routes.map(pathOf).map(function (routePath) {
      return 'the test conditions of ' + routePath;
    });
    for (const id of followed.features) {
      const feature = emptiedFeatures.find(function (item) {
        return item.id === id;
      });
      gone.push('the analysis of feature "' + (feature ? feature.name : id) + '", which has no page left');
    }
    if (followed.testCasesDropped.length > 0) gone.push(followed.testCasesDropped.length + ' test case(s) that walk no page still in');
    const said = [];
    if (gone.length > 0) said.push('Dropped ' + gone.join(', ') + ', so no later stage tests them.');
    if (followed.frame) said.push(pathOf(followed.frame) + ' carried the fields of the site frame: name another page in frameRouteId of test-conditions.json.');
    if (followed.testCasesUnticked.length > 0) {
      said.push('Unticked test case(s) ' + followed.testCasesUnticked.join(', ') + ', which walk other pages as well: run /design-test-cases so they are redrawn without the page left out.');
    }
    next.push(said.join(' '));
  }
  if (needsCrawl.length > 0) next.push('Brought back ' + needsCrawl.join(', ') + ', which the site map no longer holds: run /map-site update to crawl it again.');
  if (applied.broughtBack.length > needsCrawl.length && pagesWithoutIntent > 0) {
    next.push(
      'The feature map now has ' +
        pagesWithoutIntent +
        ' page(s) with no intent - a page loses its own when it is left out: run /map-features so the per-page pass covers them before anything is grouped.',
    );
  }
  if (toAnalyse.length > 0) {
    next.push('Brought back ' + toAnalyse.join(', ') + ', whose test conditions went when it was left out: run /define-test-conditions so it is analysed again.');
  }
  if (approvalWithdrawn.length > 0) {
    next.push(
      'Leaving a page out or bringing one back changed ' +
        approvalWithdrawn.join(', ') +
        ', so the approval on each no longer holds and the redrawn feature map shows it unticked: tell the person, and ask them to look again.',
    );
  }
  if (stillUnread.length > 0) {
    next.push(
      stillUnread
        .map(function (item) {
          return 'Could not read the verdict on ' + item.label + ' (' + item.path + '): "' + item.text + '".';
        })
        .join(' ') +
        ' Ask the person whether each of those pages works or is broken, then record it with node scripts/apply-review.mjs --kind=' +
        kind +
        ' --verdict=<label>:<works|broken> --note="<what they said>".',
    );
  }
  if (freeEdits.length > 0) {
    next.push(
      'Apply every entry in freeEdits to ' +
        base.source +
        ' as a correction given in conversation would be - including the contradiction sweep over everything it affects. A line under an entry is a note about that entry. When they are applied, run node scripts/apply-review.mjs --kind=' +
        kind +
        ' --done.',
    );
  }
  if (applied.notes > 0) {
    next.push(
      'The person added ' +
        applied.notes +
        ' note(s), kept in app-profile.json domainNotes: read them in notes and apply whatever bears on this stage and the ones after it.',
    );
  }
  if (approveAfterChange.length > 0) next.push('Once those corrections are made, approve ' + approveAfterChange.join(', ') + ' (reviewed: true, reviewedBy: "human").');
  const moreToDo = !settled || applied.answered.length > 0;
  if (applied.answered.length > 0) next.push('Answers were recorded: apply each to every field meaning, constraint and condition it affects, then re-run the gates.');
  if (missingPages.length > 0) next.push('The person named pages the crawl did not find: crawl them (/map-site update), or say why they cannot be reached.');
  if (moreToDo) next.push('Then run node scripts/render-review-artifact.mjs --kind=' + kind + ' so the file shows the result, and tell the person what changed.');
  else next.push('Applied, and the file is re-rendered to show the result. Tell the person what was applied.');

  const result = {
    kind: kind,
    status: 'APPLIED',
    filePath: filePath,
    applied: applied,
    approveAfterChange: approveAfterChange,
    freeEdits: freeEdits,
    unreadVerdicts: stillUnread,
    missingPages: missingPages,
    notes: notes,
    validation: validation,
    next: next.join(' '),
  };
  if (featureMap) result.featureMap = featureMap;
  if (approvalWithdrawn.length > 0) result.approvalWithdrawn = approvalWithdrawn;
  if (followedAny) result.followedLeftOut = followed;
  if (redrawn.length > 0) result.redrawn = redrawn;
  if (missing.length > 0) result.notFound = missing;
  if (journal && journal.warning) result.warning = journal.warning;
  print(result);
}

main();
`;
}
