// Template for scripts/visual-copilot.mjs - the deterministic half of /map-site's in-loop visual
// pass. create-if-absent.
//
// Why this is a script rather than skill prose. The crawler walks `<a href>`, so navigation that
// lives on a button, an image menu, or a canvas is not merely missed - it is invisible to every
// guard the crawl has. A model looking at the rendered page can see it. What a model must never do
// is decide what happens next: an element it names has to exist, a URL it proposes has to go through
// the frontier gatekeeper like any other link, and a request to wait and re-shoot has to run out.
// All three are pure facts about a manifest and a set of counters, which is the class of check that
// belongs in code - the same reasoning that moved the crawl's own bounds into crawl-budget.mjs after
// a run followed one pagination chain 5441 times.
//
// The division of labour is therefore: this file marks the page and grades the answer, the model
// only reads a picture. A mark the manifest does not contain is dropped rather than trusted, a
// proposed route reaches the map only after a real navigation, and a page that says "still loading"
// gets a bounded number of retakes rather than an argument.
export function renderVisualCopilot(): string {
  return `#!/usr/bin/env node

/**
 * Visual co-pilot for the /map-site crawl. Marks a page's navigation candidates with numbered
 * overlays, then grades the verdict a vision worker returns about them - zero model involvement in
 * this file.
 *
 * Usage:
 *   node scripts/visual-copilot.mjs begin [--reset]
 *   node scripts/visual-copilot.mjs overlay
 *   node scripts/visual-copilot.mjs retake --route=<canonicalPath> --reason=<loading|blank>
 *   node scripts/visual-copilot.mjs record --route=<canonicalPath> --verdict=<file> --manifest=<file>
 *   node scripts/visual-copilot.mjs pending-clicks
 *   node scripts/visual-copilot.mjs report
 *
 * 'overlay' hands back browser-side source to run with page.evaluate. It returns the manifest of
 * what it marked; keep that manifest - 'record' needs it to check the worker's answer against the
 * elements that actually existed, and a mark absent from it is dropped rather than believed.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const STATE_DIR = path.join(CWD, 'artifacts', 'site-map');
const STATE_PATH = path.join(STATE_DIR, '.visual-copilot.json');

// A page with 300 clickable things produces an unreadable picture and an unusable answer. The cap
// is on what gets marked, not on what exists - 'truncated' in the manifest says the page had more.
const MAX_MARKS = 120;

// How many times one route may be re-shot because the worker said it was still rendering. Two is
// enough for a slow paint and short enough that a permanently-spinning page cannot hold the crawl.
const MAX_RETAKES = 2;
const RETAKE_WAIT_MS = [800, 2000];

// A per-route ceiling on proposals. A worker that starts inventing navigation cannot flood the
// frontier faster than the frontier's own gatekeeper can reject it, but there is no reason to make
// it try.
const MAX_CANDIDATES_PER_ROUTE = 12;
const MAX_UNMARKED_REGIONS = 5;

// The human's authorization list is meant to be read in one sitting. Past this, the answer is not a
// longer list - it is that this crawl found something structural worth saying out loud.
const MAX_PENDING_CLICKS = 50;

const RENDER_STATES = new Set(['ok', 'loading', 'blocked', 'blank', 'error-shell']);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const RETAKE_REASONS = new Set(['loading', 'blank']);
const FLAG_TOKEN_RE = /^[a-z0-9_-]+$/;

// site-map.schema.json owns this flag and validate-site-map.mjs enforces the evidence behind it:
// either the server answered 404/410, or the cross-route content-hash heuristic matched on a route
// nothing ever navigated to. Neither is something a picture can establish, so it is stripped here
// rather than left to be caught two steps later by a gate that would fail the whole file.
const RESERVED_FLAGS = new Set(['likely-phantom-route']);

// Elements a person could plausibly navigate with. Anchors are included even though the crawl
// already walks them: the worker is told which marks are already queued, and "the thing I mean is
// number 9, which you already have" is a far cheaper answer to check than a described element.
const CANDIDATE_SELECTOR = [
  'a[href]',
  'a:not([href])',
  'button',
  '[role="link"]',
  '[role="button"]',
  '[onclick]',
  '[data-href]',
  '[data-to]',
  '[routerlink]',
  'summary',
].join(',');

const URL_ATTRS = ['href', 'data-href', 'data-to', 'routerlink', 'to'];

const OVERLAY_ID = 'eitr-visual-marks';

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

function emptyState() {
  return {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    routes: {},
    pendingClicks: [],
    pendingClicksOverflow: 0,
    totals: {
      routesRecorded: 0,
      retakesGranted: 0,
      candidatesProposed: 0,
      candidatesResolvedToUrl: 0,
      candidatesNeedingClick: 0,
      candidatesDropped: 0,
      unmarkedRegions: 0,
    },
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

function requireState() {
  const state = loadState();
  if (state) return state;
  const fresh = emptyState();
  saveState(fresh);
  return fresh;
}

function routeSlot(state, route) {
  if (!state.routes[route]) {
    state.routes[route] = { retakes: 0, recorded: false, renderState: null };
  }
  return state.routes[route];
}

function readJsonFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { value: null, error: 'missing --' + label };
  }
  const resolved = path.resolve(CWD, filePath);
  if (!fs.existsSync(resolved)) {
    return { value: null, error: label + ' file not found: ' + filePath };
  }
  try {
    return {
      value: JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\\uFEFF/, '')),
      error: null,
    };
  } catch (err) {
    return { value: null, error: label + ' is not valid JSON: ' + err.message };
  }
}

function cleanToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (token.length === 0 || token.length > 50 || !FLAG_TOKEN_RE.test(token)) return null;
  return token;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\\s+/g, ' ').trim();
  if (text.length === 0) return null;
  return text.slice(0, maxLength);
}

// A URL attribute that does not actually address anything. These are exactly the shapes that mean
// "this element navigates by script", which is the case that needs a click rather than a fetch.
function usableUrl(raw) {
  const value = cleanText(raw, 2048);
  if (value === null) return null;
  if (value === '#') return null;
  const lowered = value.toLowerCase();
  if (lowered.startsWith('javascript:')) return null;
  if (lowered.startsWith('void(')) return null;
  return value;
}

/**
 * Runs in the page, not here. Kept as a real function so it can be read and linted like code
 * instead of maintained as an escaped string, and emitted with toString() - which is why it takes
 * everything through opts and closes over nothing.
 */
function collectAndMark(opts) {
  var previous = document.getElementById(opts.overlayId);
  if (previous) previous.remove();

  var nodes = Array.prototype.slice.call(document.querySelectorAll(opts.selector));
  var viewportWidth = window.innerWidth;
  var viewportHeight = window.innerHeight;
  var marks = [];
  var truncated = false;

  for (var i = 0; i < nodes.length; i++) {
    if (marks.length >= opts.maxMarks) {
      truncated = true;
      break;
    }
    var el = nodes[i];
    var rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;
    if (rect.right <= 0 || rect.left >= viewportWidth) continue;
    var style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) === 0) continue;

    var url = '';
    for (var a = 0; a < opts.urlAttrs.length; a++) {
      var attr = el.getAttribute(opts.urlAttrs[a]);
      if (attr) {
        url = attr;
        break;
      }
    }
    var label = el.getAttribute('aria-label') || el.textContent || '';
    marks.push({
      n: marks.length + 1,
      tag: el.tagName.toLowerCase(),
      accName: label.replace(/\\s+/g, ' ').trim().slice(0, 80),
      urlAttr: url,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    });
  }

  var layer = document.createElement('div');
  layer.id = opts.overlayId;
  layer.setAttribute(
    'style',
    'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;',
  );
  for (var m = 0; m < marks.length; m++) {
    var mark = marks[m];
    var box = document.createElement('div');
    box.setAttribute(
      'style',
      'position:absolute;left:' +
        mark.rect.x +
        'px;top:' +
        mark.rect.y +
        'px;width:' +
        mark.rect.w +
        'px;height:' +
        mark.rect.h +
        'px;outline:2px solid #ff007f;',
    );
    var badge = document.createElement('div');
    badge.textContent = String(mark.n);
    badge.setAttribute(
      'style',
      'position:absolute;left:' +
        mark.rect.x +
        'px;top:' +
        Math.max(0, mark.rect.y - 14) +
        'px;background:#ff007f;color:#ffffff;font:bold 11px/14px monospace;padding:0 3px;',
    );
    layer.appendChild(box);
    layer.appendChild(badge);
  }
  document.body.appendChild(layer);

  return { overlayId: opts.overlayId, marks: marks, truncated: truncated, total: nodes.length };
}

function cmdOverlay() {
  return {
    action: 'overlay',
    overlayId: OVERLAY_ID,
    options: {
      overlayId: OVERLAY_ID,
      selector: CANDIDATE_SELECTOR,
      urlAttrs: URL_ATTRS,
      maxMarks: MAX_MARKS,
    },
    source: collectAndMark.toString(),
    teardownSource:
      'function () { var el = document.getElementById("' +
      OVERLAY_ID +
      '"); if (el) el.remove(); }',
    usage:
      'Capture the clean screenshot FIRST (that one is the route entry\\'s saved baseline), then ' +
      'evaluate source with options to draw the marks, capture a second image for the vision ' +
      'worker only, then evaluate teardownSource. Keep the returned manifest for record.',
  };
}

function cmdRetake(args) {
  const state = requireState();
  const route = cleanText(args.route, 400);
  if (route === null) {
    return { action: 'retake', allowed: false, reason: 'missing --route' };
  }
  const reason = typeof args.reason === 'string' ? args.reason.trim().toLowerCase() : '';
  const slot = routeSlot(state, route);

  // Only a page that says it is mid-render earns another shot. A cookie wall or a modal is not
  // going to resolve itself, and granting a wait for one would burn the budget on a page whose
  // problem is that something has to be dismissed, not that something has to finish.
  if (!RETAKE_REASONS.has(reason)) {
    saveState(state);
    return {
      action: 'retake',
      route,
      allowed: false,
      attempt: slot.retakes,
      maxAttempts: MAX_RETAKES,
      waitMs: 0,
      reason:
        'a retake is only granted for reason=loading or reason=blank; "' +
        reason +
        '" describes a page that will look the same however long you wait.',
    };
  }

  if (slot.retakes >= MAX_RETAKES) {
    saveState(state);
    return {
      action: 'retake',
      route,
      allowed: false,
      attempt: slot.retakes,
      maxAttempts: MAX_RETAKES,
      waitMs: 0,
      reason:
        'already re-shot this route ' +
        slot.retakes +
        ' time(s). Record what is on screen now and let the flags say it never finished rendering.',
    };
  }

  const waitMs = RETAKE_WAIT_MS[slot.retakes] || RETAKE_WAIT_MS[RETAKE_WAIT_MS.length - 1];
  slot.retakes += 1;
  state.totals.retakesGranted += 1;
  saveState(state);
  return {
    action: 'retake',
    route,
    allowed: true,
    attempt: slot.retakes,
    maxAttempts: MAX_RETAKES,
    waitMs,
    reason: null,
  };
}

function validateVerdict(verdict) {
  const errors = [];
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) {
    return { errors: ['verdict must be a JSON object.'], value: null };
  }
  if (!RENDER_STATES.has(verdict.renderState)) {
    errors.push('renderState must be one of ' + [...RENDER_STATES].join('|') + '.');
  }
  if ('confidence' in verdict && !CONFIDENCE_VALUES.has(verdict.confidence)) {
    errors.push('confidence, when present, must be one of high|medium|low.');
  }
  for (const key of ['missedNavigation', 'unmarkedRegions', 'anomalies']) {
    if (key in verdict && !Array.isArray(verdict[key])) {
      errors.push(key + ', when present, must be an array.');
    }
  }
  if (errors.length > 0) return { errors, value: null };
  return { errors, value: verdict };
}

function buildManifestIndex(manifest) {
  const index = new Map();
  const marks = manifest && Array.isArray(manifest.marks) ? manifest.marks : [];
  for (const mark of marks) {
    if (mark && Number.isInteger(mark.n)) index.set(mark.n, mark);
  }
  return index;
}

// The anti-invention rule, enforced in code rather than asked for in a prompt. A mark number the
// page never had cannot become a route, a pending click, or a flag - it is dropped and counted, and
// a run that drops a lot of them is itself a finding worth printing.
function resolveCandidates(verdict, index, route, state, warnings) {
  const followUps = [];
  const needsClick = [];
  const proposals = Array.isArray(verdict.missedNavigation) ? verdict.missedNavigation : [];

  if (proposals.length > MAX_CANDIDATES_PER_ROUTE) {
    warnings.push(
      'route ' +
        route +
        ' proposed ' +
        proposals.length +
        ' navigation candidates; only the first ' +
        MAX_CANDIDATES_PER_ROUTE +
        ' were considered.',
    );
  }

  for (const proposal of proposals.slice(0, MAX_CANDIDATES_PER_ROUTE)) {
    state.totals.candidatesProposed += 1;
    const markNumber = proposal && Number.isInteger(proposal.mark) ? proposal.mark : null;
    const mark = markNumber === null ? undefined : index.get(markNumber);
    if (!mark) {
      state.totals.candidatesDropped += 1;
      warnings.push(
        'route ' +
          route +
          ': mark ' +
          JSON.stringify(proposal && proposal.mark) +
          ' is not in this route\\'s manifest - dropped. Nothing on the page carried that number.',
      );
      continue;
    }
    const label = cleanText(proposal.label, 80) || mark.accName || null;
    const why = cleanText(proposal.why, 200);
    const url = usableUrl(mark.urlAttr);
    if (url !== null) {
      state.totals.candidatesResolvedToUrl += 1;
      followUps.push({ mark: mark.n, url, label, why, tag: mark.tag });
    } else {
      state.totals.candidatesNeedingClick += 1;
      needsClick.push({ route, mark: mark.n, label, why, tag: mark.tag, rect: mark.rect });
    }
  }

  return { followUps, needsClick };
}

function buildTriagePatch(verdict, warnings) {
  const flags = [];
  const anomalies = Array.isArray(verdict.anomalies) ? verdict.anomalies : [];
  for (const raw of anomalies) {
    const token = cleanToken(raw);
    if (token === null) continue;
    if (RESERVED_FLAGS.has(token)) {
      warnings.push(
        'dropped the "' +
          token +
          '" flag: that one states a route is not real, and site-map.json only accepts it with a ' +
          'recorded 404/410 or the cross-route content-hash match behind it. A screenshot is not ' +
          'that evidence.',
      );
      continue;
    }
    if (!flags.includes(token)) flags.push(token);
  }

  const patch = {};
  if (verdict.renderState === 'error-shell') patch.state = 'error_page';
  else if (verdict.renderState === 'blank') patch.state = 'empty_state';
  else if (verdict.renderState === 'loading') {
    patch.state = 'empty_state';
    if (!flags.includes('still-rendering-at-capture')) flags.unshift('still-rendering-at-capture');
  } else patch.state = 'ready';

  if (verdict.renderState === 'blocked') {
    patch.blockingOverlay = true;
    const blockedBy = cleanToken(verdict.blockedBy);
    const token = blockedBy === null ? 'blocked-view' : 'blocked-by-' + blockedBy;
    if (!flags.includes(token)) flags.unshift(token);
  }

  if (CONFIDENCE_VALUES.has(verdict.confidence)) patch.confidence = verdict.confidence;
  if (flags.length > 10) {
    warnings.push('kept the first 10 of ' + flags.length + ' visual flags.');
  }
  if (flags.length > 0) patch.flags = flags.slice(0, 10);
  return patch;
}

function cmdRecord(args) {
  const state = requireState();
  const route = cleanText(args.route, 400);
  if (route === null) {
    return { action: 'record', status: 'FAILED', errors: ['missing --route'] };
  }
  const verdictLoaded = readJsonFile(args.verdict, 'verdict');
  if (verdictLoaded.error) {
    return { action: 'record', route, status: 'FAILED', errors: [verdictLoaded.error] };
  }
  const manifestLoaded = readJsonFile(args.manifest, 'manifest');
  if (manifestLoaded.error) {
    return { action: 'record', route, status: 'FAILED', errors: [manifestLoaded.error] };
  }
  const checked = validateVerdict(verdictLoaded.value);
  if (checked.value === null) {
    return { action: 'record', route, status: 'FAILED', errors: checked.errors };
  }

  const verdict = checked.value;
  const warnings = [];
  const index = buildManifestIndex(manifestLoaded.value);
  const resolved = resolveCandidates(verdict, index, route, state, warnings);
  const triagePatch = buildTriagePatch(verdict, warnings);

  const regions = (Array.isArray(verdict.unmarkedRegions) ? verdict.unmarkedRegions : [])
    .slice(0, MAX_UNMARKED_REGIONS)
    .map((region) => ({
      where: cleanText(region && region.where, 80),
      why: cleanText(region && region.why, 200),
    }))
    .filter((region) => region.where !== null);
  state.totals.unmarkedRegions += regions.length;

  for (const pending of resolved.needsClick) {
    if (state.pendingClicks.length >= MAX_PENDING_CLICKS) {
      state.pendingClicksOverflow += 1;
      continue;
    }
    state.pendingClicks.push(pending);
  }

  const slot = routeSlot(state, route);
  slot.recorded = true;
  slot.renderState = verdict.renderState;
  state.totals.routesRecorded += 1;
  saveState(state);

  return {
    action: 'record',
    route,
    status: 'PASSED',
    renderState: verdict.renderState,
    triagePatch,
    followUps: resolved.followUps,
    needsClick: resolved.needsClick,
    unmarkedRegions: regions,
    markedTotal: index.size,
    manifestTruncated: Boolean(manifestLoaded.value && manifestLoaded.value.truncated),
    warnings,
  };
}

function cmdPendingClicks() {
  const state = requireState();
  return {
    action: 'pending-clicks',
    count: state.pendingClicks.length,
    overflow: state.pendingClicksOverflow,
    items: state.pendingClicks,
    // Live-observed on the-internet.herokuapp.com: a jQuery UI menu item hid a real route behind
    // it, the visual pass named it correctly, and pressing it revealed nothing at all - the menu
    // opens on hover. Clicking first is both the wrong gesture for a whole common class of
    // navigation and the only one of the two that can change state, so the order is fixed here
    // rather than left to be remembered.
    resolutionOrder: ['hover', 'click'],
    resolutionNote:
      'Hover the element first and look for links that became visible; only press it if hovering ' +
      'revealed nothing. Hovering mutates nothing, so it needs no permission - the human answer ' +
      'you collected is for the press.',
    note:
      state.pendingClicks.length === 0
        ? 'Nothing needs a click - every candidate this pass found already carried a URL.'
        : 'Each of these looks like navigation but carries no URL to fetch, so the only way to ' +
          'learn where it goes is to reach it directly. Ask once, for the whole list, before ' +
          'pressing anything.',
  };
}

function cmdReport() {
  const state = requireState();
  const warnings = [];
  const dropped = state.totals.candidatesDropped;
  const proposed = state.totals.candidatesProposed;
  if (dropped > 0 && proposed > 0 && dropped / proposed > 0.25) {
    warnings.push(
      dropped +
        ' of ' +
        proposed +
        ' visual candidates named a mark the page did not have. Treat this pass\\'s visual findings ' +
        'as low-confidence and say so.',
    );
  }
  if (state.pendingClicksOverflow > 0) {
    warnings.push(
      state.pendingClicksOverflow +
        ' further click candidates were not listed (the list caps at ' +
        MAX_PENDING_CLICKS +
        '). An application with this many script-driven links is worth mentioning as a finding of ' +
        'its own.',
    );
  }
  return {
    action: 'report',
    startedAt: state.startedAt,
    totals: state.totals,
    pendingClicks: state.pendingClicks.length,
    routes: Object.keys(state.routes).length,
    warnings,
  };
}

function cmdBegin(args) {
  const existing = loadState();
  if (existing && !args.reset) {
    return {
      action: 'begin',
      resumed: true,
      startedAt: existing.startedAt,
      routesRecorded: existing.totals.routesRecorded,
      pendingClicks: existing.pendingClicks.length,
      notice:
        'A previous visual pass left state behind. Continuing it - re-run with --reset to start ' +
        'the visual record over.',
    };
  }
  const fresh = emptyState();
  saveState(fresh);
  return { action: 'begin', resumed: false, startedAt: fresh.startedAt, notice: null };
}

function main() {
  const action = (process.argv[2] || '').toLowerCase();
  const args = parseArgs(process.argv.slice(3));
  let result;
  switch (action) {
    case 'begin':
      result = cmdBegin(args);
      break;
    case 'overlay':
      result = cmdOverlay();
      break;
    case 'retake':
      result = cmdRetake(args);
      break;
    case 'record':
      result = cmdRecord(args);
      break;
    case 'pending-clicks':
      result = cmdPendingClicks();
      break;
    case 'report':
      result = cmdReport();
      break;
    default:
      result = {
        action: 'usage',
        error: 'unknown action "' + action + '"',
        actions: ['begin', 'overlay', 'retake', 'record', 'pending-clicks', 'report'],
      };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
  if (result.status === 'FAILED' || result.action === 'usage') process.exit(1);
}

main();
`;
}
