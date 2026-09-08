// Template for scripts/artifact-journal.mjs - incremental, crash-safe persistence for any stage
// that produces one artifact out of many units of work.
//
// The failure this exists to remove: a stage holds every unit in memory and serializes the whole
// artifact once, at the end. A /map-site crawl ran 31 minutes against a live site, captured 5507
// screenshots, and wrote no site-map.json at all, because the run aborted before reaching its
// single write. Nothing had failed - nothing had been written down yet.
//
// The shape that fixes it is an append-only journal plus a separate fold. Each finished unit is
// committed as one line before the next one starts, so an interrupted run keeps everything it
// already earned and can resume from the ids it already has, rather than restarting. The fold is a
// pure function of the journal, so assembling the artifact never depends on anything still being
// held in memory. It is deliberately generic - keyed by stage name, agnostic about what a unit is -
// because every stage that fans out over routes, features, conditions or test cases has the same
// problem, not only the crawl that surfaced it.
export function renderArtifactJournal(): string {
  return `#!/usr/bin/env node

/**
 * Append-only work journal for any stage that builds one artifact from many units of work. Commit
 * each unit as it completes; assemble the artifact from the journal at the end.
 *
 * Usage:
 *   node scripts/artifact-journal.mjs begin  --stage=<slug> [--reset]
 *   node scripts/artifact-journal.mjs record --stage=<slug> --id=<unit id> --file=<unit.json>
 *   node scripts/artifact-journal.mjs record --stage=<slug> --id=<unit id> --data='<json>'
 *   node scripts/artifact-journal.mjs status --stage=<slug>
 *   node scripts/artifact-journal.mjs ids    --stage=<slug>
 *   node scripts/artifact-journal.mjs fold   --stage=<slug> --into=<artifact.json> --key=<field> [--as=object|array]
 *   node scripts/artifact-journal.mjs discard --stage=<slug>
 *
 * Recording the same id twice is allowed and is how a unit gets corrected - the fold keeps the last
 * record for each id, so a re-visit supersedes an earlier partial result without rewriting history.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { debugLog } from './debug-log.mjs';

const CWD = process.cwd();
const JOURNAL_DIR = path.join(CWD, 'artifacts', '.journal');
const STAGE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function fail(message) {
  process.stdout.write(JSON.stringify({ error: message }, null, 2) + '\\n');
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) args[raw.slice(2)] = true;
    else args[raw.slice(2, eq)] = raw.slice(eq + 1);
  }
  return args;
}

function requireStage(args) {
  const stage = typeof args.stage === 'string' ? args.stage : '';
  if (!STAGE_RE.test(stage)) {
    fail('--stage is required and must be a lowercase slug (letters, digits, hyphens): ' + (stage || '(none)'));
  }
  return stage;
}

function journalPath(stage) {
  return path.join(JOURNAL_DIR, stage + '.ndjson');
}

// A line that will not parse is kept in the count and reported rather than dropped silently: a
// truncated final line is the normal signature of a process killed mid-write, and a human deciding
// whether to resume needs to know it happened.
function readJournal(stage) {
  const file = journalPath(stage);
  if (!fs.existsSync(file)) return { exists: false, records: [], malformed: 0 };
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    fail('cannot read ' + path.relative(CWD, file) + ': ' + err.message);
  }
  const records = [];
  let malformed = 0;
  for (const line of raw.split('\\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') records.push(parsed);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { exists: true, records, malformed };
}

// Last record per id wins, which is what makes re-recording a unit a correction rather than a
// duplicate. Insertion order follows first appearance so a fold is stable across runs.
function latestById(records) {
  const byId = new Map();
  for (const record of records) byId.set(record.id, record);
  return byId;
}

function cmdBegin(stage, args) {
  fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  const file = journalPath(stage);
  const existing = readJournal(stage);

  if (args.reset) {
    try {
      if (existing.exists) fs.unlinkSync(file);
    } catch (err) {
      fail('cannot reset ' + path.relative(CWD, file) + ': ' + err.message);
    }
    fs.writeFileSync(file, '', 'utf8');
    return { action: 'begin', stage, journal: path.relative(CWD, file), resumed: false, recorded: 0 };
  }

  if (!existing.exists) fs.writeFileSync(file, '', 'utf8');
  const recorded = latestById(existing.records).size;
  return {
    action: 'begin',
    stage,
    journal: path.relative(CWD, file),
    resumed: recorded > 0,
    recorded,
    malformedLines: existing.malformed,
    notice:
      recorded > 0
        ? recorded +
          ' unit(s) already recorded for this stage - skip those ids and continue, or pass --reset to start over.'
        : null,
  };
}

function cmdRecord(stage, args) {
  const id = typeof args.id === 'string' ? args.id : '';
  if (!id) fail('--id is required and identifies the unit of work being committed');

  let data;
  if (typeof args.file === 'string') {
    try {
      data = JSON.parse(fs.readFileSync(path.resolve(CWD, args.file), 'utf8'));
    } catch (err) {
      fail('cannot read --file ' + args.file + ' as JSON: ' + err.message);
    }
  } else if (typeof args.data === 'string') {
    try {
      data = JSON.parse(args.data);
    } catch (err) {
      fail('--data is not valid JSON: ' + err.message);
    }
  } else {
    fail('one of --file=<path to json> or --data=<json> is required');
  }

  fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  const record = { id, recordedAt: new Date().toISOString(), data };
  try {
    fs.appendFileSync(journalPath(stage), JSON.stringify(record) + '\\n', 'utf8');
  } catch (err) {
    fail('cannot append to ' + path.relative(CWD, journalPath(stage)) + ': ' + err.message);
  }

  const after = latestById(readJournal(stage).records);
  debugLog('artifact-journal', 'record', { stage, id, recorded: after.size });
  return { action: 'record', stage, id, recordedAt: record.recordedAt, recorded: after.size };
}

function cmdStatus(stage) {
  const journal = readJournal(stage);
  const byId = latestById(journal.records);
  const timestamps = journal.records
    .map((record) => record.recordedAt)
    .filter((value) => typeof value === 'string')
    .sort();
  return {
    action: 'status',
    stage,
    journal: path.relative(CWD, journalPath(stage)),
    exists: journal.exists,
    recorded: byId.size,
    appendedLines: journal.records.length,
    malformedLines: journal.malformed,
    firstRecordedAt: timestamps[0] || null,
    lastRecordedAt: timestamps[timestamps.length - 1] || null,
    resumable: byId.size > 0,
  };
}

function cmdIds(stage) {
  return { action: 'ids', stage, ids: [...latestById(readJournal(stage).records).keys()] };
}

// The journal owns the bulk collection and nothing else. Whatever else the artifact carries - its
// schemaVersion, timestamps, baseUrl, coverage - is written to the target file by the stage itself
// before folding, so this never has to know the shape of any particular artifact.
function cmdFold(stage, args) {
  const into = typeof args.into === 'string' ? args.into : '';
  const key = typeof args.key === 'string' ? args.key : '';
  const shape = args.as === 'array' ? 'array' : 'object';
  if (!into) fail('--into=<artifact path> is required');
  if (!key) fail('--key=<field to fill> is required');

  const target = path.resolve(CWD, into);
  if (!fs.existsSync(target)) {
    fail(
      'cannot fold into ' +
        into +
        ' because it does not exist - write the artifact envelope (its schemaVersion, timestamps and any ' +
        'top-level fields) first, then fold the recorded units into "' +
        key +
        '".',
    );
  }
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (err) {
    fail('cannot read ' + into + ' as JSON: ' + err.message);
  }
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    fail(into + ' must contain a JSON object to fold into.');
  }

  const byId = latestById(readJournal(stage).records);
  const ids = [...byId.keys()].sort();

  if (shape === 'array') {
    artifact[key] = ids.map((id) => byId.get(id).data);
  } else {
    const folded = {};
    for (const id of ids) folded[id] = byId.get(id).data;
    artifact[key] = folded;
  }

  try {
    fs.writeFileSync(target, JSON.stringify(artifact, null, 2) + '\\n', 'utf8');
  } catch (err) {
    fail('cannot write ' + into + ': ' + err.message);
  }

  debugLog('artifact-journal', 'fold', { stage, into, key, shape, folded: ids.length });
  return { action: 'fold', stage, into, key, as: shape, folded: ids.length };
}

// Deleting the journal is the deliberate end of a stage, once its artifact is written and validated.
// It is never implied by fold: a fold that produced a file the validator then rejects must still
// have its journal, or the run's whole record is gone for the sake of tidiness.
function cmdDiscard(stage) {
  const file = journalPath(stage);
  if (!fs.existsSync(file)) return { action: 'discard', stage, removed: false };
  try {
    fs.unlinkSync(file);
  } catch (err) {
    fail('cannot delete ' + path.relative(CWD, file) + ': ' + err.message);
  }
  return { action: 'discard', stage, removed: true };
}

function main() {
  const action = (process.argv[2] || '').toLowerCase();
  const args = parseArgs(process.argv.slice(3));

  let result;
  switch (action) {
    case 'begin':
      result = cmdBegin(requireStage(args), args);
      break;
    case 'record':
      result = cmdRecord(requireStage(args), args);
      break;
    case 'status':
      result = cmdStatus(requireStage(args));
      break;
    case 'ids':
      result = cmdIds(requireStage(args));
      break;
    case 'fold':
      result = cmdFold(requireStage(args), args);
      break;
    case 'discard':
      result = cmdDiscard(requireStage(args));
      break;
    default:
      fail('unknown action: ' + (action || '(none)') + ' - expected begin|record|status|ids|fold|discard');
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
