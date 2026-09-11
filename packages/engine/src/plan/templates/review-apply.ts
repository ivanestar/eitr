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
 *
 * Compares artifacts/review/<kind>-review.md with the rendering it was made from
 * (artifacts/review/.base/<kind>-review.json). What it can apply exactly it writes to the JSON: a
 * ticked or cleared box, ALL, an answer, a deleted test-condition line (a cut), a ticked cut condition
 * (restored), a verdict on a disagreement. Everything else the person changed comes back in
 * freeEdits, by the entry it belongs to, for the assistant to apply as a correction.
 *
 * status:
 *   APPLIED     - see applied, freeEdits, approveAfterChange and next
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
const VALIDATORS = {
  'site-map': null,
  'feature-map': 'validate-feature-map.mjs',
  'test-conditions': 'validate-test-conditions.mjs',
};
const LABEL_LINE = /^(\\s*(?:[-*]\\s+)?)(?:\\[([ xX])\\]\\s+)?(ALL|[A-Z]\\d+)\\.((?:\\s.*)?)$/;
const ANSWER_LINE = /^\\s*Answer:(.*)$/;
const VERDICT_LINE = /^\\s*Verdict:(.*)$/;
const MISSING_PAGES_HEADING = '**Pages the crawl did not find**';
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

function parseVerdict(value) {
  const v = value.toLowerCase().replace(/[.!]+$/, '').trim();
  if (/^(works?|ok|fine|real)$/.test(v)) return 'works';
  if (/^(broken|does not work|doesn't work|not working|dead)$/.test(v)) return 'broken';
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

// ---------------------------------------------------------------------------------------------

function findRecord(kind, data, ref) {
  if (!ref) return null;
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
  if (!fs.existsSync(viewPath) || !fs.existsSync(basePath)) {
    print({
      kind: kind,
      status: 'NO_VIEW',
      next: 'There is no rendered review to read back - run node scripts/render-review-artifact.mjs --kind=' + kind + ' first.',
    });
    return;
  }
  const base = JSON.parse(readText(basePath));
  const baseLines = body(base.text.replace(/\\r\\n/g, '\\n'));
  const baseOwners = /^<!--/.test(base.text.split('\\n')[0] || '') ? base.owners.slice(1) : base.owners;
  const userText = readText(viewPath);
  const userLines = body(userText);
  const filePath = relative(viewPath);

  if (baseLines.map(clean).join('\\n').trim() === userLines.map(clean).join('\\n').trim()) {
    print({ kind: kind, status: 'NO_CHANGES', filePath: filePath, next: 'The file is exactly as it was rendered - nothing to apply.' });
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

  // What can be read exactly: boxes, answers, verdicts, deleted condition lines, the pages list.
  const toggles = new Map();
  const cuts = [];
  const restores = [];
  const answers = [];
  const verdicts = [];
  let all = false;
  const expected = [];
  const expectedOwners = [];
  const missingBase = sectionRange(baseLines, MISSING_PAGES_HEADING);
  const missingUser = sectionRange(userLines, MISSING_PAGES_HEADING);
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
        const verdict = parseVerdict(userWindow.value);
        if (verdict) {
          windows.set(baseWindow.index, userLines[userWindow.index]);
          verdicts.push({ label: label, ref: ref, verdict: verdict });
        }
      }
      continue;
    }
    if (!userAt) {
      if (ref.type === 'condition') {
        if (ref.cut) continue;
        cuts.push({ label: label, ref: ref });
      }
      continue;
    }
    if (userAt.box === null || baseAt.box === null || userAt.box === baseAt.box) continue;
    if (ref.type === 'all') all = userAt.box === true;
    else if (ref.type === 'condition' && ref.cut) {
      if (userAt.box) restores.push({ label: label, ref: ref });
    } else toggles.set(label, userAt.box);
  }

  // The rendering as it would read with only those changes made. Whatever else differs from the
  // person's file is theirs to say, and goes to the assistant.
  const droppedLines = new Set();
  for (const item of cuts) droppedLines.add(baseLabels.get(item.label).index);
  for (const [label, ref] of Object.entries(base.labels)) {
    if (ref.type === 'condition' && ref.cut && !userLabels.has(label) && baseLabels.has(label)) droppedLines.add(baseLabels.get(label).index);
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
      const approvable = ref.type === 'page' || ref.type === 'entity' || (ref.type === 'feature' && kind === 'feature-map') || (ref.type === 'condition' && !ref.cut);
      if (!approvable || cutLabels.has(label) || revoke.has(label) || toggles.get(label) === false) continue;
      if (edited.has(label)) {
        if (approveAfterChange.indexOf(label) === -1) approveAfterChange.push(label);
      } else approve.add(label);
    }
  }

  // Applied to the JSON, and kept only if the stage's own validator is no worse for it.
  const applied = { approved: [], revoked: [], cut: [], restored: [], answered: [], verdicts: [] };
  const missing = [];
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

  const changedJson = applied.approved.length + applied.revoked.length + applied.cut.length + applied.restored.length + applied.answered.length > 0;
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

  for (const item of verdicts) {
    recordVerdict(kind, item.ref.id, item.verdict);
    applied.verdicts.push(item.label);
  }
  const journal = kind === 'site-map' ? null : kind === 'feature-map' ? syncJournal(kind) : null;

  const missingPages = listedIn(userLines, missingUser).filter(function (item) {
    return listedIn(baseLines, missingBase).indexOf(item) === -1;
  });
  const freeEdits = describeEdits(edits);

  // Re-rendered only once nothing the person wrote is waiting on the assistant: a correction, a
  // held-back approval, or a page they named - none of which the JSON holds yet, so the file keeps
  // them until it does.
  const settled = freeEdits.length === 0 && approveAfterChange.length === 0 && missingPages.length === 0;
  if (settled) render(kind);

  const next = [];
  if (freeEdits.length > 0) {
    next.push(
      'Apply every entry in freeEdits to ' +
        base.source +
        ' as a correction given in conversation would be - including the contradiction sweep over everything it affects. A line under an entry is a note about that entry.',
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
    missingPages: missingPages,
    validation: validation,
    next: next.join(' '),
  };
  if (missing.length > 0) result.notFound = missing;
  if (journal && journal.warning) result.warning = journal.warning;
  print(result);
}

main();
`;
}
