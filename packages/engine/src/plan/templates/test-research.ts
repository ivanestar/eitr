// Template for scripts/test-research.mjs - the record of published practice behind a feature's test
// ideas, one per kind of feature. create-if-absent.
//
// Why this is a script. Research is cheap to skip and expensive to fake: a list of "sources" nobody
// can open, one blog restated five times, or a query that carried the application's own name to a
// search engine all look fine in prose. What makes research usable is mechanical - enough sources,
// from enough independent places, every finding pointing at the sources it came from, and nothing in
// the queries that identifies the application. This file checks exactly that, keeps the result per
// kind of feature so twenty converters are researched once, and says when a cached record is old.

export function renderTestResearch(): string {
  return `#!/usr/bin/env node

/**
 * Research records for /define-test-conditions - zero model involvement in this file.
 *
 * Usage:
 *   node scripts/test-research.mjs status --archetype="<kind of feature>"
 *   node scripts/test-research.mjs record --archetype="<kind of feature>" --file=<json>
 *
 * 'status' says whether this kind of feature was already researched (and how long ago), what file a
 * new record goes to, and which words a search query must not contain. 'record' checks a research
 * file and stores it under artifacts/analysis/research/<slug>.json.
 *
 * A research file: {
 *   queries: ["how to test a unit converter", ...],
 *   sources: [{ id: "s1", url, title, publisher, kind }],
 *   checks:  [{ id: "k1", statement, sourceIds: ["s1", "s3"] }]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const RESEARCH_DIR = path.join(CWD, 'artifacts', 'analysis', 'research');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

// At least this many sources, from at least this many different sites: five restatements of one
// article are one source.
const MIN_SOURCES = 5;
const MIN_HOSTS = 4;
const MAX_SOURCES = 20;
const MAX_CHECKS = 60;
// Past this age a cached record is still usable, and worth refreshing when there is time.
const STALE_AFTER_DAYS = 180;
const SOURCE_KINDS = ['standard', 'official-docs', 'paper', 'vendor', 'article', 'community'];
// Host labels too common to identify anything.
const GENERIC_LABELS = ['www', 'com', 'org', 'net', 'io', 'app', 'dev', 'localhost', 'local', 'test', 'example', 'http', 'https'];

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

function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\\n');
}

function fail(action, message, extra) {
  emit(Object.assign({ action: action, ok: false, error: message }, extra || {}));
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

function slugOf(archetype) {
  return String(archetype || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Words that would tell a search engine which application is being tested: the labels of its own
// address ("onlytests" in onlytests.io). A query carries the kind of feature, never the product.
function forbiddenTerms() {
  const siteMap = readJson(SITE_MAP_PATH);
  const terms = [];
  if (siteMap && typeof siteMap.baseUrl === 'string') {
    try {
      const host = new URL(siteMap.baseUrl).hostname.toLowerCase();
      if (!/^\\d+(\\.\\d+){3}$/.test(host)) {
        for (const label of host.split('.')) {
          if (label.length > 3 && GENERIC_LABELS.indexOf(label) === -1) terms.push(label);
        }
      }
      terms.push(host);
    } catch {
      // An unreadable base URL leaves nothing to forbid, which is safe to report as such.
    }
  }
  return Array.from(new Set(terms));
}

function status(args) {
  const archetype = typeof args.archetype === 'string' ? args.archetype.trim() : '';
  const slug = slugOf(archetype);
  if (!slug) fail('status', 'missing --archetype="<kind of feature, e.g. unit converter>"');
  const relative = 'artifacts/analysis/research/' + slug + '.json';
  const existing = readJson(path.join(RESEARCH_DIR, slug + '.json'));
  const forbidden = forbiddenTerms();
  if (existing && Array.isArray(existing.sources)) {
    const recordedAt = typeof existing.recordedAt === 'string' ? Date.parse(existing.recordedAt) : NaN;
    const ageDays = Number.isFinite(recordedAt) ? Math.floor((Date.now() - recordedAt) / 86400000) : null;
    return {
      action: 'status',
      archetype: archetype,
      cached: true,
      file: relative,
      sources: existing.sources.length,
      checks: Array.isArray(existing.checks) ? existing.checks.length : 0,
      ageDays: ageDays,
      stale: ageDays !== null && ageDays > STALE_AFTER_DAYS,
      summary: { status: 'cached', archetype: archetype, file: relative },
    };
  }
  return {
    action: 'status',
    archetype: archetype,
    cached: false,
    file: relative,
    minSources: MIN_SOURCES,
    minHosts: MIN_HOSTS,
    forbiddenTerms: forbidden,
    instruction:
      'Search for how this kind of feature is tested and where it typically breaks - standards, ' +
      'official documentation, papers and established practice before blog posts. Keep only concrete ' +
      'checks, each citing the sources it came from; drop generic advice ("test positive and negative ' +
      'cases"). Queries name the kind of feature only, never the application: none may contain ' +
      (forbidden.length > 0
        ? forbidden
            .map(function (term) {
              return '"' + term + '"';
            })
            .join(', ')
        : 'its name or address') +
      '. Record the result with "record".',
  };
}

function record(args) {
  const archetype = typeof args.archetype === 'string' ? args.archetype.trim() : '';
  const slug = slugOf(archetype);
  if (!slug) fail('record', 'missing --archetype');
  if (typeof args.file !== 'string') fail('record', 'missing --file=<research json>');
  const data = readJson(path.resolve(CWD, args.file));
  if (!data || typeof data !== 'object') fail('record', 'could not read --file as JSON');

  const errors = [];
  const forbidden = forbiddenTerms();
  const queries = Array.isArray(data.queries) ? data.queries : [];
  if (queries.length === 0) errors.push('queries must list what was searched for - a record nobody can repeat is not research.');
  queries.forEach(function (query, i) {
    if (typeof query !== 'string' || query.trim().length === 0) {
      errors.push('queries[' + i + '] must be a non-empty string.');
      return;
    }
    const lowered = query.toLowerCase();
    for (const term of forbidden) {
      if (lowered.indexOf(term) !== -1) {
        errors.push('queries[' + i + '] carries "' + term + '", which identifies the application - search for the kind of feature, never the product.');
      }
    }
  });

  const sources = Array.isArray(data.sources) ? data.sources.slice(0, MAX_SOURCES) : [];
  const ids = new Set();
  const hosts = new Set();
  sources.forEach(function (source, i) {
    const where = 'sources[' + i + ']';
    if (!source || typeof source !== 'object') return errors.push(where + ' must be an object.');
    if (typeof source.id !== 'string' || !/^s\\d+$/.test(source.id) || ids.has(source.id)) {
      errors.push(where + '.id must be a unique id like "s1".');
    } else {
      ids.add(source.id);
    }
    let url = null;
    try {
      url = new URL(String(source.url));
    } catch {
      url = null;
    }
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      errors.push(where + '.url must be the address the source was read at.');
    } else {
      hosts.add(url.hostname.replace(/^www\\./, ''));
    }
    ['title', 'publisher'].forEach(function (field) {
      if (typeof source[field] !== 'string' || source[field].trim().length === 0) errors.push(where + '.' + field + ' must be a non-empty string.');
    });
    if (SOURCE_KINDS.indexOf(source.kind) === -1) errors.push(where + '.kind must be one of ' + SOURCE_KINDS.join('|') + '.');
  });
  if (sources.length < MIN_SOURCES) errors.push('sources holds ' + sources.length + '; research rests on at least ' + MIN_SOURCES + '.');
  if (hosts.size < MIN_HOSTS) {
    errors.push('the sources come from ' + hosts.size + ' different site(s); at least ' + MIN_HOSTS + ' - five pages of one site are one opinion.');
  }

  const checks = Array.isArray(data.checks) ? data.checks.slice(0, MAX_CHECKS) : [];
  if (checks.length === 0) errors.push('checks must hold what the sources say to check for this kind of feature.');
  const checkIds = new Set();
  checks.forEach(function (check, i) {
    const where = 'checks[' + i + ']';
    if (!check || typeof check !== 'object') return errors.push(where + ' must be an object.');
    if (typeof check.id !== 'string' || !/^k\\d+$/.test(check.id) || checkIds.has(check.id)) {
      errors.push(where + '.id must be a unique id like "k1".');
    } else {
      checkIds.add(check.id);
    }
    if (typeof check.statement !== 'string' || check.statement.trim().length === 0 || check.statement.length > 300) {
      errors.push(where + '.statement must be one concrete check of at most 300 characters.');
    }
    const cited = Array.isArray(check.sourceIds) ? check.sourceIds : [];
    if (cited.length === 0) errors.push(where + '.sourceIds must name the sources this check came from.');
    cited.forEach(function (id) {
      if (!ids.has(id)) errors.push(where + ' cites "' + id + '", which sources does not list.');
    });
  });

  if (errors.length > 0) fail('record', 'the research record was not stored', { errors: errors });
  const stored = {
    schemaVersion: 1,
    archetype: archetype,
    recordedAt: new Date().toISOString(),
    queries: queries,
    sources: sources,
    checks: checks,
  };
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });
  const relative = 'artifacts/analysis/research/' + slug + '.json';
  fs.writeFileSync(path.join(CWD, relative), JSON.stringify(stored, null, 2) + '\\n', 'utf8');
  return {
    action: 'record',
    ok: true,
    file: relative,
    sources: sources.length,
    hosts: hosts.size,
    checks: checks.length,
    summary: { status: 'done', archetype: archetype, file: relative },
  };
}

function main() {
  const [action, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (action === 'status') return emit(status(args));
  if (action === 'record') return emit(record(args));
  fail(String(action), 'unknown action "' + action + '" (expected status or record)');
}

main();
`;
}
