// Template for scripts/debug-log.mjs - opt-in execution logging for the project's own helper
// scripts.
//
// The pipeline's helper scripts make a lot of small decisions across a long run, and when a stage
// ends up with a wrong artifact the only evidence left is the artifact itself. Re-running to watch
// it happen is expensive when the run took half an hour and touched a live application. With
// E2E_DEBUG=1 set, each instrumented script appends one line per invocation - what it was asked,
// what it answered, how long it took - so a finished run can be read back afterwards.
//
// Off by default and silent about its own failures: a logger that can break the thing it observes
// is worse than no logger. Everything here is wrapped so a full disk or a read-only checkout
// degrades into "no logs" rather than into a failed crawl.
export function renderDebugLog(): string {
  return `#!/usr/bin/env node

/**
 * Opt-in debug logging, shared by this project's helper scripts.
 *
 * Enable by setting E2E_DEBUG=1 (or E2E_DEBUG=true) before running anything. Each instrumented
 * script then appends NDJSON records to artifacts/.debug/<source>.ndjson.
 *
 * As a module:
 *   import { debugLog, debugEnabled } from './debug-log.mjs';
 *   debugLog('crawl-budget', 'check', { url, decision });
 *
 * As a CLI:
 *   node scripts/debug-log.mjs status
 *   node scripts/debug-log.mjs tail [--source=<name>] [--lines=50]
 *   node scripts/debug-log.mjs clear
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEBUG_DIR = path.join(process.cwd(), 'artifacts', '.debug');

export function debugEnabled() {
  const flag = process.env.E2E_DEBUG;
  return flag === '1' || flag === 'true' || flag === 'yes';
}

// Never throws. A logging failure must not be able to fail the run it is only observing.
export function debugLog(source, event, payload) {
  if (!debugEnabled()) return false;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const record = {
      at: new Date().toISOString(),
      pid: process.pid,
      source,
      event,
      payload: payload === undefined ? null : payload,
    };
    fs.appendFileSync(path.join(DEBUG_DIR, source + '.ndjson'), JSON.stringify(record) + '\\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

// Wraps a script's whole run: logs the arguments it was called with and the result it produced,
// with the elapsed time. Returns the result untouched so it can wrap a call site directly.
export function debugRun(source, event, args, fn) {
  if (!debugEnabled()) return fn();
  const startedAt = Date.now();
  try {
    const result = fn();
    debugLog(source, event, { args, durationMs: Date.now() - startedAt, result });
    return result;
  } catch (err) {
    debugLog(source, event, {
      args,
      durationMs: Date.now() - startedAt,
      error: err && err.message ? err.message : String(err),
    });
    throw err;
  }
}

function listLogs() {
  if (!fs.existsSync(DEBUG_DIR)) return [];
  try {
    return fs
      .readdirSync(DEBUG_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ndjson'))
      .map((entry) => entry.name.replace(/\\.ndjson$/, ''));
  } catch {
    return [];
  }
}

function readLines(source) {
  try {
    return fs
      .readFileSync(path.join(DEBUG_DIR, source + '.ndjson'), 'utf8')
      .split('\\n')
      .filter((line) => line.trim() !== '');
  } catch {
    return [];
  }
}

function cmdStatus() {
  const sources = listLogs();
  return {
    action: 'status',
    enabled: debugEnabled(),
    hint: debugEnabled() ? null : 'set E2E_DEBUG=1 before a run to record one',
    directory: 'artifacts/.debug',
    sources: sources.map((source) => ({ source, records: readLines(source).length })),
  };
}

function cmdTail(args) {
  const requested = typeof args.source === 'string' ? [args.source] : listLogs();
  const limit = Number.parseInt(String(args.lines === undefined ? '50' : args.lines), 10);
  const lineCount = Number.isFinite(limit) && limit > 0 ? limit : 50;
  const out = {};
  for (const source of requested) {
    out[source] = readLines(source)
      .slice(-lineCount)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { unparseable: line };
        }
      });
  }
  return { action: 'tail', lines: lineCount, logs: out };
}

function cmdClear() {
  const sources = listLogs();
  let removed = 0;
  for (const source of sources) {
    try {
      fs.unlinkSync(path.join(DEBUG_DIR, source + '.ndjson'));
      removed += 1;
    } catch {
      // Leave anything that will not delete; this command is a convenience, not a guarantee.
    }
  }
  return { action: 'clear', removed };
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

function main() {
  const action = (process.argv[2] || 'status').toLowerCase();
  const args = parseArgs(process.argv.slice(3));
  let result;
  if (action === 'status') result = cmdStatus();
  else if (action === 'tail') result = cmdTail(args);
  else if (action === 'clear') result = cmdClear();
  else {
    process.stdout.write(
      JSON.stringify({ error: 'unknown action: ' + action + ' - expected status|tail|clear' }, null, 2) + '\\n',
    );
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

// Only acts as a CLI when run directly, so importing it from another script stays side-effect free.
if (process.argv[1] && process.argv[1].endsWith('debug-log.mjs')) {
  main();
}
`;
}
