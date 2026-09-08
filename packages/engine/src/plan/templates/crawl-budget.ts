// Template for scripts/crawl-budget.mjs - the frontier gatekeeper for /map-site's crawl.
//
// Why this is a script and not skill prose: the bounds it enforces (max pages, max depth, max
// concrete URLs per canonical template, asset/scheme denylist, URL canonicalization) were written
// as instructions in the skill and were live-observed being ignored. One run against
// the-internet.herokuapp.com followed a "next page" pagination chain out of /infinite_scroll 5441
// times over 31 minutes, wrote 657 MB of screenshots, blew straight past a documented 500-page
// ceiling, and never produced a site-map.json at all - every artifact of that run was garbage. The
// crawl itself is executed by a throwaway script the assistant writes in the moment, so a ceiling
// that only exists in prose is a ceiling that holds only when the model happens to reproduce it.
//
// Every decision here is a pure fact about a URL and a set of counters, which is exactly the class
// of check that belongs in code. What is deliberately NOT here: the crawl boundary's free-text
// off-limits areas ("the contact form", "billing"). Matching those mechanically would mean guessing
// which routes a human's phrase covers, and guessing wrong either skips a real area or crawls a
// forbidden one - that stays a judgment call in the skill.
//
// It doubles as the progress source. A crawl is one long silent stretch of tool calls, and a human
// watching it has no way to tell a working crawler from a hung one; the script emits a ready-made
// progress line on its own schedule, so the assistant reports progress by relaying a string rather
// than by remembering to count.
export function renderCrawlBudget(): string {
  return `#!/usr/bin/env node

/**
 * Frontier gatekeeper and progress meter for the /map-site crawl. Decides, per URL, whether it may
 * be visited and what its canonical path template is - zero model involvement.
 *
 * Usage:
 *   node scripts/crawl-budget.mjs start --base-url=<url> [--role=<slug>]
 *                                 [--max-pages=N] [--max-depth=N] [--max-per-template=N]
 *   node scripts/crawl-budget.mjs check --url=<url> --depth=<n>
 *   node scripts/crawl-budget.mjs visited --url=<url> [--status=<n>] [--content-type=<mime>]
 *   node scripts/crawl-budget.mjs progress
 *   node scripts/crawl-budget.mjs report
 *
 * 'check' is a reservation, not a question: a 'visit' decision immediately consumes budget for that
 * URL. Ask once per candidate link, then either visit it or drop it.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { debugLog } from './debug-log.mjs';

const CWD = process.cwd();
const STATE_DIR = path.join(CWD, 'artifacts', 'site-map');
const STATE_PATH = path.join(STATE_DIR, '.crawl-budget.json');

const DEFAULT_MAX_PAGES = 500;
const DEFAULT_MAX_DEPTH = 6;
// The single bound that would have stopped the live incident. A canonical template is one logical
// route; visiting a few concrete URLs under it is enough to know its shape, and any number beyond
// that is a pagination chain, a per-record listing, or a loop trap.
const DEFAULT_MAX_PER_TEMPLATE = 20;
const ANNOUNCE_EVERY_PAGES = 25;
const ANNOUNCE_EVERY_MS = 120000;

// Query parameters that change what a page shows without making it a different page. Stripping them
// is what collapses a feed into one route instead of one route per cursor position.
const VOLATILE_QUERY_PARAMS = new Set([
  'page', 'p', 'pagenum', 'page_num', 'pagenumber', 'page_number', 'pagetoken', 'page_token',
  'offset', 'start', 'skip', 'from', 'cursor', 'after', 'before', 'since', 'until',
  'limit', 'per_page', 'perpage', 'page_size', 'pagesize', 'count', 'rows',
  'continuation', 'continuationtoken', 'scroll_id', 'scrollid',
  'input', 'batch',
  '_', 'ts', 'timestamp', 'cachebust', 'cache_bust', 'v', 'rand', 'random',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid',
]);

// Anything whose response is not a document the crawler can read as a page. Navigating to one of
// these either aborts with "Download is starting" or burns a route slot on a binary file - both
// live-observed against /download/sample.docx, /download/menu.pdf, /download/menu.csv and friends.
const NON_HTML_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf',
  'csv', 'tsv', 'json', 'ndjson', 'yaml', 'yml', 'sql',
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', '7z', 'iso', 'dmg', 'exe', 'msi', 'apk', 'deb', 'rpm',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif', 'ico', 'tif', 'tiff', 'psd',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm3u8',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'css', 'js', 'mjs', 'cjs', 'map', 'wasm',
]);

// A response the crawler did reach but that turned out not to be a page. Catches the extensionless
// download endpoint (/download?id=3, /export, /report/generate) that no extension rule can see.
const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;
const ISO_DATE_RE = /^\\d{4}-\\d{2}-\\d{2}$/;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      args[raw.slice(2)] = true;
    } else {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return args;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyState() {
  return {
    schemaVersion: 1,
    baseUrl: null,
    origin: null,
    role: null,
    startedAt: null,
    limits: {
      maxPages: DEFAULT_MAX_PAGES,
      maxDepth: DEFAULT_MAX_DEPTH,
      maxPerTemplate: DEFAULT_MAX_PER_TEMPLATE,
    },
    pagesClaimed: 0,
    pagesVisited: 0,
    maxDepthSeen: 0,
    boundedBy: null,
    claimed: {},
    perTemplate: {},
    skipped: {},
    droppedAfterVisit: 0,
    lastAnnounceAt: null,
    lastAnnounceCount: 0,
  };
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (!data || typeof data !== 'object' || data.schemaVersion !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\\n', 'utf8');
}

// One path segment becomes {id} only on evidence nobody can read two ways: all digits, a UUID, a
// long hex blob (Mongo ObjectId, a content hash), or an ISO date. A cleverer rule - "collapse any
// segment ending in a number" - would merge /page-2 into /page-1's template and quietly lose a real
// route, so the per-template cap below is what backstops whatever this misses, not a looser regex.
function templateSegment(segment) {
  if (segment === '') return segment;
  if (/^\\d+$/.test(segment)) return '{id}';
  if (UUID_RE.test(segment)) return '{id}';
  if (LONG_HEX_RE.test(segment)) return '{id}';
  if (ISO_DATE_RE.test(segment)) return '{date}';
  return segment;
}

function canonicalize(rawUrl, state) {
  let parsed;
  try {
    parsed = new URL(rawUrl, state.baseUrl || undefined);
  } catch {
    return { ok: false, reason: 'unparseable-url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported-scheme' };
  }
  if (state.origin && parsed.origin !== state.origin) {
    return { ok: false, reason: 'cross-origin' };
  }

  parsed.hash = '';

  const kept = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    if (VOLATILE_QUERY_PARAMS.has(key.toLowerCase())) continue;
    kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  parsed.search = '';
  for (const [key, value] of kept) parsed.searchParams.append(key, value);

  const lastSegment = parsed.pathname.split('/').pop() || '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot > 0) {
    const ext = lastSegment.slice(dot + 1).toLowerCase();
    if (NON_HTML_EXTENSIONS.has(ext)) {
      return { ok: false, reason: 'non-html-asset' };
    }
  }

  const segments = parsed.pathname.split('/').map(templateSegment);
  let canonicalPath = segments.join('/');
  if (!canonicalPath.startsWith('/')) canonicalPath = '/' + canonicalPath;
  if (canonicalPath.length > 1 && canonicalPath.endsWith('/')) {
    canonicalPath = canonicalPath.slice(0, -1);
  }

  const normalizedPath =
    parsed.pathname.length > 1 ? parsed.pathname.replace(/\\/+$/, '') : '/';
  const normalizedUrl = parsed.origin + (normalizedPath || '/') + parsed.search;

  return { ok: true, canonicalPath, normalizedUrl };
}

function bumpSkip(state, reason) {
  state.skipped[reason] = (state.skipped[reason] || 0) + 1;
}

function elapsedMs(state) {
  if (!state.startedAt) return 0;
  return Date.now() - Date.parse(state.startedAt);
}

function humanDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? minutes + 'm ' + seconds + 's' : seconds + 's';
}

function progressLine(state) {
  const skippedTotal = Object.values(state.skipped).reduce((sum, n) => sum + n, 0);
  return (
    'Crawl progress' +
    (state.role ? ' [' + state.role + ']' : '') +
    ': ' +
    state.pagesVisited +
    '/' +
    state.limits.maxPages +
    ' pages visited, ' +
    Object.keys(state.perTemplate).length +
    ' canonical routes, depth ' +
    state.maxDepthSeen +
    '/' +
    state.limits.maxDepth +
    ', ' +
    humanDuration(elapsedMs(state)) +
    ' elapsed, ' +
    skippedTotal +
    ' links skipped.'
  );
}

// The assistant is told to relay this string when it is non-null rather than to decide when a
// progress update is due - a cadence held as an instruction degrades over a long run exactly when
// the human most needs to see the crawler is still alive.
function maybeAnnounce(state) {
  const now = Date.now();
  const sinceCount = state.pagesVisited - state.lastAnnounceCount;
  const sinceTime = state.lastAnnounceAt ? now - Date.parse(state.lastAnnounceAt) : Infinity;
  if (sinceCount < ANNOUNCE_EVERY_PAGES && sinceTime < ANNOUNCE_EVERY_MS) return null;
  if (state.pagesVisited === 0) return null;
  state.lastAnnounceAt = new Date(now).toISOString();
  state.lastAnnounceCount = state.pagesVisited;
  return progressLine(state);
}

function budgetView(state) {
  return {
    pagesVisited: state.pagesVisited,
    pagesClaimed: state.pagesClaimed,
    canonicalRoutes: Object.keys(state.perTemplate).length,
    maxDepthSeen: state.maxDepthSeen,
    limits: state.limits,
    boundedBy: state.boundedBy,
  };
}

function requireState() {
  const state = loadState();
  if (state === null) {
    process.stdout.write(
      JSON.stringify(
        {
          error: 'no active crawl budget - run "node scripts/crawl-budget.mjs start --base-url=<url>" first',
        },
        null,
        2,
      ) + '\\n',
    );
    process.exit(1);
  }
  return state;
}

function cmdStart(args) {
  const baseUrl = typeof args['base-url'] === 'string' ? args['base-url'] : null;
  if (!baseUrl) {
    process.stdout.write(JSON.stringify({ error: '--base-url is required' }, null, 2) + '\\n');
    process.exit(1);
  }
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    process.stdout.write(
      JSON.stringify({ error: '--base-url is not a valid absolute URL: ' + baseUrl }, null, 2) + '\\n',
    );
    process.exit(1);
  }

  const state = emptyState();
  state.baseUrl = baseUrl;
  state.origin = origin;
  state.role = typeof args.role === 'string' ? args.role : null;
  state.startedAt = new Date().toISOString();
  // The time-based announce measures from the start of the pass, not from "never announced" - left
  // null it reads as infinitely overdue and fires on the very first page, which turns the cadence
  // into noise right where the run has nothing to report yet.
  state.lastAnnounceAt = state.startedAt;
  state.limits = {
    maxPages: positiveInt(args['max-pages'], DEFAULT_MAX_PAGES),
    maxDepth: positiveInt(args['max-depth'], DEFAULT_MAX_DEPTH),
    maxPerTemplate: positiveInt(args['max-per-template'], DEFAULT_MAX_PER_TEMPLATE),
  };
  saveState(state);

  return {
    action: 'start',
    baseUrl: state.baseUrl,
    origin: state.origin,
    role: state.role,
    startedAt: state.startedAt,
    limits: state.limits,
  };
}

function cmdCheck(args) {
  const state = requireState();
  const rawUrl = typeof args.url === 'string' ? args.url : '';
  const rawDepth = Number.parseInt(String(args.depth === undefined ? '0' : args.depth), 10);
  const normalizedDepth = Number.isFinite(rawDepth) && rawDepth >= 0 ? rawDepth : 0;

  const deny = (reason, extra) => {
    bumpSkip(state, reason);
    saveState(state);
    return Object.assign(
      { action: 'check', decision: 'skip', reason, url: rawUrl, budget: budgetView(state), announce: null },
      extra || {},
    );
  };

  if (!rawUrl) return deny('unparseable-url');

  const canonical = canonicalize(rawUrl, state);
  if (!canonical.ok) return deny(canonical.reason);

  if (state.claimed[canonical.normalizedUrl]) {
    return deny('already-claimed', {
      canonicalPath: canonical.canonicalPath,
      normalizedUrl: canonical.normalizedUrl,
    });
  }
  if (normalizedDepth > state.limits.maxDepth) {
    state.boundedBy = state.boundedBy || 'maxDepth';
    return deny('max-depth', { canonicalPath: canonical.canonicalPath });
  }
  if (state.pagesClaimed >= state.limits.maxPages) {
    state.boundedBy = state.boundedBy || 'maxPages';
    return deny('max-pages', { canonicalPath: canonical.canonicalPath });
  }
  const seenForTemplate = state.perTemplate[canonical.canonicalPath] || 0;
  if (seenForTemplate >= state.limits.maxPerTemplate) {
    state.boundedBy = state.boundedBy || 'maxPerTemplate';
    return deny('max-per-template', { canonicalPath: canonical.canonicalPath });
  }

  state.claimed[canonical.normalizedUrl] = canonical.canonicalPath;
  state.perTemplate[canonical.canonicalPath] = seenForTemplate + 1;
  state.pagesClaimed += 1;
  if (normalizedDepth > state.maxDepthSeen) state.maxDepthSeen = normalizedDepth;
  saveState(state);

  return {
    action: 'check',
    decision: 'visit',
    reason: null,
    url: rawUrl,
    canonicalPath: canonical.canonicalPath,
    normalizedUrl: canonical.normalizedUrl,
    firstOfTemplate: seenForTemplate === 0,
    budget: budgetView(state),
    announce: null,
  };
}

function cmdVisited(args) {
  const state = requireState();
  const rawUrl = typeof args.url === 'string' ? args.url : '';
  const canonical = canonicalize(rawUrl, state);
  const contentType = typeof args['content-type'] === 'string' ? args['content-type'].toLowerCase() : null;

  // An extensionless endpoint that turned out to serve a file rather than a page. The route slot is
  // already spent, but the route itself must not enter the site map - a binary blob is not a page.
  if (contentType && !HTML_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    state.droppedAfterVisit += 1;
    bumpSkip(state, 'non-html-response');
    saveState(state);
    return {
      action: 'visited',
      keep: false,
      reason: 'non-html-response',
      contentType,
      canonicalPath: canonical.ok ? canonical.canonicalPath : null,
      budget: budgetView(state),
      announce: null,
    };
  }

  state.pagesVisited += 1;
  const announce = maybeAnnounce(state);
  saveState(state);

  return {
    action: 'visited',
    keep: true,
    reason: null,
    canonicalPath: canonical.ok ? canonical.canonicalPath : null,
    status: args.status === undefined ? null : Number.parseInt(String(args.status), 10),
    budget: budgetView(state),
    announce,
  };
}

function cmdProgress() {
  const state = requireState();
  return {
    action: 'progress',
    line: progressLine(state),
    elapsedMs: elapsedMs(state),
    skipped: state.skipped,
    budget: budgetView(state),
  };
}

// 'coverage' is shaped to be copied straight into site-map.json. Absence of the field there means
// the crawl was exhaustive, so this returns null rather than an object whenever no bound was hit -
// the script decides that, instead of the assistant judging whether the run "felt" complete.
function cmdReport() {
  const state = requireState();
  return {
    action: 'report',
    role: state.role,
    startedAt: state.startedAt,
    elapsedMs: elapsedMs(state),
    line: progressLine(state),
    skipped: state.skipped,
    droppedAfterVisit: state.droppedAfterVisit,
    canonicalRoutes: Object.keys(state.perTemplate).sort(),
    coverage: state.boundedBy
      ? { boundedBy: state.boundedBy, pagesVisited: state.pagesVisited }
      : null,
    budget: budgetView(state),
  };
}

function main() {
  const action = (process.argv[2] || '').toLowerCase();
  const args = parseArgs(process.argv.slice(3));

  let result;
  switch (action) {
    case 'start':
      result = cmdStart(args);
      break;
    case 'check':
      result = cmdCheck(args);
      break;
    case 'visited':
      result = cmdVisited(args);
      break;
    case 'progress':
      result = cmdProgress();
      break;
    case 'report':
      result = cmdReport();
      break;
    default:
      process.stdout.write(
        JSON.stringify(
          { error: 'unknown action: ' + (action || '(none)') + ' - expected start|check|visited|progress|report' },
          null,
          2,
        ) + '\\n',
      );
      process.exit(1);
  }

  // Every frontier decision, recorded when E2E_DEBUG=1 is set. A crawl that produced a wrong route
  // set is otherwise unexplainable after the fact: the skipped links leave no trace anywhere else,
  // and re-running to watch it happen costs another full pass against a live application.
  debugLog('crawl-budget', action, { args, result });

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
