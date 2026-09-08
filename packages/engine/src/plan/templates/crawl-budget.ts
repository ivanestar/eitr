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
 *   node scripts/crawl-budget.mjs check --url=<url> --depth=<n> --visible=<true|false>
 *   node scripts/crawl-budget.mjs visited --url=<url> [--status=<n>] [--content-type=<mime>]
 *                                 [--content-hash=<hash>]
 *   node scripts/crawl-budget.mjs scroll --url=<url>
 *   node scripts/crawl-budget.mjs rejected [--reason=<reason>]
 *   node scripts/crawl-budget.mjs progress
 *   node scripts/crawl-budget.mjs report
 *
 * 'check' is a reservation, not a question: a 'visit' decision immediately consumes budget for that
 * URL. Ask once per candidate link, then either visit it or drop it.
 *
 * Pass --content-hash on every 'visited'. It is what lets the script notice a pagination chain or an
 * infinite feed on its third page rather than at the page ceiling: identical rendered structure
 * repeating under one route template is not a set of distinct pages. Any result can carry a
 * 'warning' string - show it to the human when it is not null.
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
// Identical rendered structure repeating under one canonical template is the earliest unambiguous
// signal that the frontier is walking a chain rather than discovering pages. Three is enough to
// establish it and cheap to be wrong about: every URL under one template collapses to the same
// single route entry anyway, so stopping early costs sample URLs, never a route. This is what
// catches the trap on the third page instead of the twentieth.
const DEFAULT_MAX_PER_CONTENT_HASH = 3;
// The escape hatch every per-template cap has: siblings that do not collapse into one template.
// /download/report.txt and /download/tmp8sk2.txt are separate templates by every id rule there is,
// so a file listing, a tag cloud or a user directory can still spend the whole page budget one
// distinct child at a time. Capping distinct children per parent path closes that without needing
// a cleverer - and more wrong - canonicalization rule. Live-observed: a listing page contributed 95
// of one crawl's 160 URLs, leaving 45 real routes out of 148 templates explored.
const DEFAULT_MAX_PER_PARENT = 12;
// The same structure appearing under SEVERAL different templates is a weaker signal - a generic
// empty state, or a canonicalization that did not collapse what it should have (/blog/page-2 and
// /blog/page-3 are separate templates on purpose, since collapsing every segment ending in a digit
// would merge real routes). Too ambiguous to stop the crawl on, so it warns and the human decides.
const DEFAULT_DUPLICATE_TEMPLATE_WARN_AT = 3;
// Warns while a template is still filling up, so a chain is visible before its hard cap lands.
const TEMPLATE_WARN_AT = 4;
// The anti-infinite-scroll ceiling, enforced rather than described. A page that appends content on
// scroll never changes its URL, so nothing else in this script ever sees it.
const DEFAULT_MAX_SCROLLS = 2;
const ANNOUNCE_EVERY_PAGES = 25;
const ANNOUNCE_EVERY_MS = 120000;
// Every refused link is kept, not just counted, so a human can scan the list and catch a route
// they recognise being thrown out by mistake. A count alone ("161 non-page assets") is a number
// nobody can check; the URLs are the evidence. Capped so a pathological site cannot grow the state
// file without bound - the overflow is reported rather than silently dropped.
const REJECTION_LOG_LIMIT = 1000;

// Which refusals are worth a human's eyes. The split is a judgment made once, here, instead of
// per run: a link refused for being on another origin or already claimed is never a surprise, while
// a link refused for being invisible, missing, or over a cap is exactly where a real route gets
// lost by mistake - and an over-eager extension list is how a route named /reports.xml would
// disappear without anyone noticing.
const REVIEW_WORTHY_REASONS = new Set([
  'not-visible',
  'not-found',
  'non-html-asset',
  'non-html-response',
  'max-per-parent',
  'max-per-template',
  'max-pages',
  'max-depth',
  'duplicate-content-template',
  'visibility-not-reported',
]);

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
  // Plain-text and markup files read as pages to a naive crawler and are not pages. Live-observed:
  // a file-listing page offered ~95 uploaded .txt files, and every one was admitted as its own
  // route because a filename collapses under none of the id rules below.
  'txt', 'md', 'markdown', 'log', 'xml', 'rss', 'atom', 'ics', 'vcf', 'srt', 'vtt',
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', '7z', 'iso', 'dmg', 'exe', 'msi', 'apk', 'deb', 'rpm',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif', 'ico', 'tif', 'tiff', 'psd',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm3u8',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'css', 'js', 'mjs', 'cjs', 'map', 'wasm',
  // Source files a site may serve for download. Live-observed: /download/get_ssh.py entered a crawl
  // as a route, because a script file is text and nothing had said it is not a page.
  'py', 'rb', 'pl', 'sh', 'bash', 'ps1', 'bat', 'cmd', 'jar', 'war', 'class', 'go', 'rs', 'java', 'php',
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
      maxPerContentHash: DEFAULT_MAX_PER_CONTENT_HASH,
      duplicateTemplateWarnAt: DEFAULT_DUPLICATE_TEMPLATE_WARN_AT,
      maxPerParent: DEFAULT_MAX_PER_PARENT,
      maxScrolls: DEFAULT_MAX_SCROLLS,
      allowInvisible: false,
    },
    pagesClaimed: 0,
    pagesVisited: 0,
    maxDepthSeen: 0,
    boundedBy: null,
    claimed: {},
    // Budget accounting: every template a URL was ever admitted for. Populated at check time, which
    // is before anything is known about what the server will actually return.
    perTemplate: {},
    // Reporting: templates that turned out to be real pages. A template is only added once a visit
    // to it came back as a page, so a 404 or a downloaded file never inflates the route count. The
    // two are separate on purpose - live-observed reporting 59 canonical routes for a site where 5
    // of them were four missing pages and a Python script.
    keptTemplates: {},
    perParent: {},
    skipped: {},
    droppedAfterVisit: 0,
    contentHashes: {},
    saturatedTemplates: {},
    scrolls: {},
    warnings: [],
    warningKeys: [],
    rejected: [],
    rejectedOverflow: 0,
    lastAnnounceAt: null,
    lastAnnounceCount: 0,
  };
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    // A leading byte order mark is not valid JSON, and on Windows it is what several ordinary ways
    // of writing a text file produce by default.
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8').replace(/^\\uFEFF/, ''));
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

function bumpSkip(state, reason, url, canonicalPath) {
  state.skipped[reason] = (state.skipped[reason] || 0) + 1;
  if (!url) return;
  if (state.rejected.length < REJECTION_LOG_LIMIT) {
    state.rejected.push({ url: url, reason: reason, canonicalPath: canonicalPath || null });
  } else {
    state.rejectedOverflow += 1;
  }
}

// Grouped by reason, each group flagged with whether it is worth reading. Sorted so the same crawl
// produces the same list twice, which is what makes two runs comparable by eye.
function rejectionsByReason(state, limitPerReason) {
  const groups = {};
  for (const entry of state.rejected) {
    const group =
      groups[entry.reason] ||
      (groups[entry.reason] = {
        reason: entry.reason,
        reviewWorthy: REVIEW_WORTHY_REASONS.has(entry.reason),
        count: 0,
        urls: [],
      });
    group.count += 1;
    if (limitPerReason === null || group.urls.length < limitPerReason) group.urls.push(entry.url);
  }
  for (const group of Object.values(groups)) {
    group.urls.sort();
    group.truncated = group.count > group.urls.length;
  }
  return Object.values(groups).sort(function (a, b) {
    if (a.reviewWorthy !== b.reviewWorthy) return a.reviewWorthy ? -1 : 1;
    return a.reason < b.reason ? -1 : 1;
  });
}

// "/a/b/c" -> "/a/b", "/a" -> "/", "/" -> "/". Purely lexical: the parent of a path, not of a page.
function parentPath(canonicalPath) {
  const cut = canonicalPath.lastIndexOf('/');
  if (cut <= 0) return '/';
  return canonicalPath.slice(0, cut);
}

// Warnings are the crawler saying "this looks wrong" while there is still time to act on it, which
// is the whole point of raising them early. Deduplicated by a stable KEY rather than by the message
// text: the cross-template message names how many templates share a hash, so the text changed on
// every occurrence and the same finding was emitted 40+ times in one live run, each line one number
// different from the last.
function addWarning(state, key, text) {
  if (state.warningKeys.includes(key)) return null;
  state.warningKeys.push(key);
  state.warnings.push(text);
  return text;
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
    Object.keys(state.keptTemplates).length +
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
    canonicalRoutes: Object.keys(state.keptTemplates).length,
    templatesClaimed: Object.keys(state.perTemplate).length,
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
    maxPerContentHash: positiveInt(args['max-per-content-hash'], DEFAULT_MAX_PER_CONTENT_HASH),
    duplicateTemplateWarnAt: positiveInt(
      args['duplicate-template-warn-at'],
      DEFAULT_DUPLICATE_TEMPLATE_WARN_AT,
    ),
    maxPerParent: positiveInt(args['max-per-parent'], DEFAULT_MAX_PER_PARENT),
    maxScrolls: positiveInt(args['max-scrolls'], DEFAULT_MAX_SCROLLS),
    // Opt-in, for the rare application whose real navigation genuinely is not visible markup (a
    // canvas-driven UI, a keyboard-only admin). Never on by default: the ordinary case is that an
    // invisible link is not a page a user can reach.
    allowInvisible: args['allow-invisible'] === true || String(args['allow-invisible']) === 'true',
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
    bumpSkip(state, reason, rawUrl, (extra && extra.canonicalPath) || null);
    saveState(state);
    return Object.assign(
      {
        action: 'check',
        decision: 'skip',
        reason,
        url: rawUrl,
        budget: budgetView(state),
        warning: null,
        announce: null,
      },
      extra || {},
    );
  };

  if (!rawUrl) return deny('unparseable-url');

  // Visibility is the crawler's own observation - this script never touches a page - but the policy
  // that acts on it lives here so it holds identically every run. A link that exists only in markup
  // and is never rendered is not something a user can reach, and following it manufactures routes
  // the application does not have: live-observed as /about, /contact-us, /portfolio and /gallery
  // entering a crawl of a site that has none of them. Passing --visible is mandatory rather than
  // defaulted, because a crawler that simply forgot to look would otherwise silently get the old
  // behaviour back.
  const visibleArg = args.visible;
  if (visibleArg === undefined) {
    return deny('visibility-not-reported', {
      hint: 'pass --visible=true or --visible=false - whether this link is actually rendered and interactable on a page you loaded, not merely present in the markup',
    });
  }
  if (String(visibleArg) !== 'true' && !state.limits.allowInvisible) {
    return deny('not-visible');
  }

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
  // Set by 'visited' once this template produced the same rendered structure maxPerContentHash
  // times. Refusing here rather than there is what stops the navigations themselves.
  if (state.saturatedTemplates[canonical.canonicalPath]) {
    state.boundedBy = state.boundedBy || 'duplicateContent';
    return deny('duplicate-content-template', { canonicalPath: canonical.canonicalPath });
  }
  const seenForTemplate = state.perTemplate[canonical.canonicalPath] || 0;
  if (seenForTemplate >= state.limits.maxPerTemplate) {
    state.boundedBy = state.boundedBy || 'maxPerTemplate';
    return deny('max-per-template', { canonicalPath: canonical.canonicalPath });
  }

  // Counted per distinct child template, not per URL: a parent legitimately serves many pages under
  // one templated child (/users/{id} is one child however many users exist), and only a parent whose
  // children refuse to collapse - a file listing, a tag index - accumulates them.
  //
  // The root is exempt, and that exemption is load-bearing rather than tidy: every top-level page a
  // site has shares "/" as its parent, so capping it would cap the site's own navigation. Caught by
  // a test whose 25 top-level pages were cut to 12 - the same shape as a real application with 30
  // sections, and as the sandbox this was built against, whose 45 routes are almost all top-level.
  // A listing that needs this guard always lives one segment deep or more.
  const parent = parentPath(canonical.canonicalPath);
  const childrenOfParent = state.perParent[parent] || [];
  const isNewChild = !childrenOfParent.includes(canonical.canonicalPath);
  if (parent !== '/' && isNewChild && childrenOfParent.length >= state.limits.maxPerParent) {
    state.boundedBy = state.boundedBy || 'maxPerParent';
    return deny('max-per-parent', {
      canonicalPath: canonical.canonicalPath,
      parentPath: parent,
      warning: addWarning(
        state,
        'per-parent:' + parent,
        'Stopping new pages under "' +
          parent +
          '": it already has ' +
          childrenOfParent.length +
          ' distinct child routes. That is a listing of items rather than a set of features - the ' +
          'ones already crawled are enough to know its shape.',
      ),
    });
  }

  state.claimed[canonical.normalizedUrl] = canonical.canonicalPath;
  state.perTemplate[canonical.canonicalPath] = seenForTemplate + 1;
  if (isNewChild) state.perParent[parent] = [...childrenOfParent, canonical.canonicalPath];
  state.pagesClaimed += 1;
  if (normalizedDepth > state.maxDepthSeen) state.maxDepthSeen = normalizedDepth;

  let warning = null;
  if (seenForTemplate + 1 === TEMPLATE_WARN_AT) {
    warning = addWarning(
      state,
      'template-filling:' + canonical.canonicalPath,
      'Template "' +
        canonical.canonicalPath +
        '" has now taken ' +
        TEMPLATE_WARN_AT +
        ' separate URLs. If these are pages of one list rather than distinct routes, this is a ' +
        'pagination chain - it will be cut off at ' +
        state.limits.maxPerTemplate +
        ' URLs, or sooner if their content turns out identical.',
    );
  }
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
    warning,
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
  const status = args.status === undefined ? null : Number.parseInt(String(args.status), 10);

  // Status is read BEFORE the content type, and the order is the whole point. An authentication
  // challenge is a real route - something exists behind it - and it frequently answers with no HTML
  // body at all, so a content-type test reached first discards it as "not a page". Live-observed:
  // /digest_auth vanished from a crawl that kept /basic_auth, purely because the two challenges
  // answer with different content types.
  if (status === 401 || status === 403) {
    state.pagesVisited += 1;
    if (canonical.ok) state.keptTemplates[canonical.canonicalPath] = true;
    const announceNow = maybeAnnounce(state);
    saveState(state);
    return {
      action: 'visited',
      keep: true,
      reason: null,
      status,
      canonicalPath: canonical.ok ? canonical.canonicalPath : null,
      trapDetected: false,
      budget: budgetView(state),
      warning: null,
      announce: announceNow,
    };
  }

  if (contentType && !HTML_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    state.droppedAfterVisit += 1;
    bumpSkip(state, 'non-html-response', rawUrl, canonical.ok ? canonical.canonicalPath : null);
    saveState(state);
    return {
      action: 'visited',
      keep: false,
      reason: 'non-html-response',
      contentType,
      canonicalPath: canonical.ok ? canonical.canonicalPath : null,
      budget: budgetView(state),
      warning: null,
      announce: null,
    };
  }

  // The server's own answer that this page does not exist. Unambiguous, and it was already being
  // passed in - live-observed keeping /about, /contact-us, /gallery and /portfolio as routes of a
  // site that returns 404 for all four, because only the content type was being read. Visibility
  // does not catch these: the links are rendered, they simply lead nowhere.
  //
  // 401 and 403 are deliberately NOT included. Those say the route exists and is protected, which is
  // the opposite of absent - /basic_auth and /download_secure are real pages behind a challenge, and
  // dropping them would delete the only evidence of an auth boundary the crawl can produce. Any
  // other 4xx/5xx is kept too: a route that exists and is erroring is a finding, not a non-route.
  if (status === 404 || status === 410) {
    state.droppedAfterVisit += 1;
    bumpSkip(state, 'not-found', rawUrl, canonical.ok ? canonical.canonicalPath : null);
    saveState(state);
    return {
      action: 'visited',
      keep: false,
      reason: 'not-found',
      status,
      canonicalPath: canonical.ok ? canonical.canonicalPath : null,
      budget: budgetView(state),
      warning: null,
      announce: null,
    };
  }

  state.pagesVisited += 1;
  if (canonical.ok) state.keptTemplates[canonical.canonicalPath] = true;

  // The repetition check. contentHash is this route's normalized structural signature (title plus
  // sorted regions plus sorted components) - the same value the site map records - so two pages
  // sharing one are rendering the same thing regardless of what their URLs look like.
  const contentHash = typeof args['content-hash'] === 'string' ? args['content-hash'] : null;
  const template = canonical.ok ? canonical.canonicalPath : null;
  let warning = null;
  let trapDetected = false;

  if (contentHash && template) {
    const entry = state.contentHashes[contentHash] || { count: 0, templates: {}, firstUrl: rawUrl };
    entry.count += 1;
    entry.templates[template] = (entry.templates[template] || 0) + 1;
    state.contentHashes[contentHash] = entry;

    if (entry.templates[template] >= state.limits.maxPerContentHash) {
      if (!state.saturatedTemplates[template]) {
        state.saturatedTemplates[template] = contentHash;
        state.boundedBy = state.boundedBy || 'duplicateContent';
        trapDetected = true;
        warning = addWarning(
          state,
          'saturated:' + template,
          'Stopping "' +
            template +
            '": ' +
            entry.templates[template] +
            ' pages under it rendered identical structure (first seen at ' +
            entry.firstUrl +
            '). That is a pagination chain, an infinite feed, or a generic shell - not distinct ' +
            'routes. No further URL under this template will be crawled; the route itself is kept.',
        );
      }
    } else if (Object.keys(entry.templates).length >= state.limits.duplicateTemplateWarnAt) {
      // Several DIFFERENT templates rendering the same thing. Real cases pull both ways - a generic
      // empty state, or a chain this script's own canonicalization deliberately did not collapse -
      // so this reports and lets a person judge rather than cutting the crawl off on a guess.
      warning = addWarning(
        state,
        // Keyed by the shared hash, so one generic shell reports once no matter how many templates
        // eventually land on it.
        'duplicate-across-templates:' + contentHash,
        Object.keys(entry.templates).length +
          ' different route templates are rendering identical structure (' +
          Object.keys(entry.templates).sort().slice(0, 5).join(', ') +
          '). Either the application shows one generic shell for all of them, or these are pages of ' +
          'one list that only look like separate routes. Worth a look before the crawl goes further.',
      );
    }
  }

  const announce = maybeAnnounce(state);
  saveState(state);

  return {
    action: 'visited',
    keep: true,
    reason: null,
    canonicalPath: template,
    status,
    trapDetected,
    budget: budgetView(state),
    warning,
    announce,
  };
}

// Makes the max-2-viewport-scrolls rule mechanical. A page that appends content as you scroll never
// changes its URL, so every other guard in this script is blind to it: check is never called again,
// no new template appears, no content hash is ever compared. Ask before each scroll.
function cmdScroll(args) {
  const state = requireState();
  const rawUrl = typeof args.url === 'string' ? args.url : '';
  const canonical = canonicalize(rawUrl, state);
  const key = canonical.ok ? canonical.normalizedUrl : rawUrl;
  const used = state.scrolls[key] || 0;

  if (used >= state.limits.maxScrolls) {
    bumpSkip(state, 'max-scrolls', key, null);
    const warning = addWarning(
      state,
      'scroll-ceiling:' + key,
      'Reached the ' +
        state.limits.maxScrolls +
        '-scroll ceiling on ' +
        key +
        '. If content is still loading, this is an infinite feed: record it as a collection of ' +
        'repeating items rather than trying to reach its end.',
    );
    saveState(state);
    return {
      action: 'scroll',
      allowed: false,
      reason: 'max-scrolls',
      scrolls: used,
      maxScrolls: state.limits.maxScrolls,
      warning,
    };
  }

  state.scrolls[key] = used + 1;
  saveState(state);
  return {
    action: 'scroll',
    allowed: true,
    reason: null,
    scrolls: used + 1,
    maxScrolls: state.limits.maxScrolls,
    warning: null,
  };
}

// Every link the crawl refused, in full, so a human can scan for one they recognise. This is the
// only view that can answer "did it throw away something real" - a count cannot.
function cmdRejected(args) {
  const state = requireState();
  const only = typeof args.reason === 'string' ? args.reason : null;
  const groups = rejectionsByReason(state, null).filter(function (group) {
    return only === null || group.reason === only;
  });
  return {
    action: 'rejected',
    reason: only,
    groups: groups,
    totalLogged: state.rejected.length,
    notLogged: state.rejectedOverflow,
  };
}

function cmdProgress() {
  const state = requireState();
  return {
    action: 'progress',
    line: progressLine(state),
    elapsedMs: elapsedMs(state),
    skipped: state.skipped,
    warnings: state.warnings,
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
    // Up to five URLs per reason here, so a run summary stays readable; "rejected" returns the
    // complete list for anything that looks wrong.
    rejections: rejectionsByReason(state, 5),
    rejectedLogged: state.rejected.length,
    rejectedOverflow: state.rejectedOverflow,
    warnings: state.warnings,
    stoppedTemplates: Object.keys(state.saturatedTemplates).sort(),
    canonicalRoutes: Object.keys(state.keptTemplates).sort(),
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
    case 'scroll':
      result = cmdScroll(args);
      break;
    case 'rejected':
      result = cmdRejected(args);
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
          {
            error:
              'unknown action: ' +
              (action || '(none)') +
              ' - expected start|check|visited|scroll|progress|report',
          },
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
