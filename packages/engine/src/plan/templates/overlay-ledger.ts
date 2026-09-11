// Template for scripts/overlay-ledger.mjs - the deterministic half of /map-site's overlay handling.
// create-if-absent.
//
// Why this is a script rather than skill prose. A crawl that opens a modal and walks away leaves the
// page in a state where every later click lands on a backdrop, and nothing in the crawl notices:
// live-observed as a run that appeared to hang. Two separate mechanisms produce it. A native
// alert/confirm/prompt blocks the page outright until it is answered - Playwright dismisses these
// automatically ONLY while no page.on('dialog') listener exists, and a listener that neither accepts
// nor dismisses stalls the action that opened it, permanently. A DOM modal blocks nothing at the
// protocol level; it just covers everything, so the crawl keeps issuing clicks that silently reach
// the wrong element.
//
// Neither failure is something a model can be trusted to remember its way out of at step 300 of a
// long pass. What was opened, what closed it, what is still open, and how many attempts are left are
// facts about a counter - the same class of check that moved the crawl's own bounds into
// crawl-budget.mjs. This file owns them, so "did I close everything I opened" has an answer that
// does not depend on recall.
//
// The division of labour matches visual-copilot.mjs: this file hands back browser-side source for
// detection and grades what comes back, decides which dismissal method is permitted under the crawl
// boundary the human actually set, and refuses to let a route be finished with an overlay still open.
// The model reads a page and reports; it never decides whether the page is clean.

import { PII_MASK_SOURCE } from './pii-mask.js';

export function renderOverlayLedger(): string {
  return `#!/usr/bin/env node

/**
 * Overlay ledger for the /map-site crawl. Tracks every modal, drawer, banner, popover and native
 * dialog the crawl meets, decides how it may be dismissed under the crawl boundary in force, and
 * reports anything left open - zero model involvement in this file.
 *
 * Usage:
 *   node scripts/overlay-ledger.mjs begin [--reset] [--boundary=<read-only|safe-interactions|full|full-except>]
 *   node scripts/overlay-ledger.mjs probe
 *   node scripts/overlay-ledger.mjs open --route=<canonicalPath> --route-id=<routeId> --observation=<file> [--trigger=<label>]
 *   node scripts/overlay-ledger.mjs label --overlay=<overlayId> --answers=<file>
 *   node scripts/overlay-ledger.mjs attempt --overlay=<overlayId> --method=<method> --cleared=<true|false>
 *   node scripts/overlay-ledger.mjs authorize --overlay=<overlayId> --method=<method>
 *   node scripts/overlay-ledger.mjs pending [--route=<canonicalPath>]
 *   node scripts/overlay-ledger.mjs entries --route=<canonicalPath>
 *   node scripts/overlay-ledger.mjs report
 *
 * 'probe' hands back browser-side source to run with page.evaluate; write what it returns to a file
 * and pass that file to 'open'. 'open' answers with the dismissal plan to follow, in order, and the
 * control to press when that plan says close-control. When the overlay's labels are in a language
 * the ledger cannot read, 'open' also asks what each control does - answer with 'label' before
 * trying anything. Report each attempt back with 'attempt' - the ledger, not you, decides what to
 * try next and when a route has to be given up on.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const STATE_DIR = path.join(CWD, 'artifacts', 'site-map');
const STATE_PATH = path.join(STATE_DIR, '.overlay-ledger.json');
const PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');
const SCREENSHOT_DIR = 'artifacts/site-map/screenshots';

// One page can legitimately stack a consent banner over a modal over a toast. Past this many, the
// page is not showing overlays - something is spawning them, and recording each one is noise.
const MAX_OVERLAYS_PER_ROUTE = 8;

// How many distinct overlays get the full treatment (screenshot plus structure). The same modal on
// 40 routes is one thing to document, not 40 - identity is the signature, not the route it appeared
// on.
const MAX_INVESTIGATED_SIGNATURES = 30;

// A signature seen on this many routes is not a route-specific dialog, it is site-wide furniture
// (cookie consent, an announcement bar). Worth saying out loud once, because it changes what the
// screenshots of every route actually show.
const RECURRING_THRESHOLD = 3;

// Every dismissal method this ledger knows, ordered from least to most disruptive. 'native-dismiss'
// is dialog.dismiss() on a real browser dialog; 'reload' re-navigates, which loses nothing a crawl
// cares about and is a plain GET, so it stays available even under a read-only boundary.
const METHODS = ['native-dismiss', 'escape', 'close-control', 'backdrop', 'reload'];

// Stated by the script rather than left to the skill's prose, because getting it wrong is the
// difference between a crawl that runs and one that stops dead with no error.
const DIALOG_POLICY =
  "Register exactly one page.on('dialog') handler before the first navigation, and make it answer " +
  'every dialog it receives (dismiss(), or accept() for beforeunload). A native alert/confirm/prompt ' +
  'blocks the page until it is answered: Playwright auto-dismisses these only while NO listener ' +
  'exists, so a listener that inspects a dialog without answering it stalls the action that opened ' +
  "it forever. Record each one here with kind 'native-dialog' and method 'native-dismiss'.";

const OVERLAY_KINDS = [
  'native-dialog',
  'modal',
  'drawer',
  'popover',
  'banner',
  'toast',
  'unknown',
];

// Control labels that only ever close the thing they sit on. Matched as whole words against a
// lowercased accessible name, so 'close' matches 'Close' and 'Close dialog' but not 'Close account'
// (see DESTRUCTIVE_LABELS, which is checked first and wins).
const SAFE_LABELS = [
  'close',
  'dismiss',
  'cancel',
  'no thanks',
  'no, thanks',
  'not now',
  'maybe later',
  'later',
  'skip',
  'back',
];

// A label that commits to something. None of these is ever put in an automatic dismissal plan, at
// any boundary: 'accept' sets consent, 'delete' destroys data, and 'ok' is the same button in an
// informational dialog and in a confirm-before-deleting one. A crawler cannot tell those apart from
// the label, which is exactly why it does not get to press any of them on its own.
const DESTRUCTIVE_LABELS = [
  'accept',
  'agree',
  'allow',
  'confirm',
  'ok',
  'yes',
  'continue',
  'proceed',
  'submit',
  'save',
  'apply',
  'delete',
  'remove',
  'discard',
  'buy',
  'pay',
  'subscribe',
  'sign up',
  'reject',
  'decline',
];

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

function fail(action, message) {
  process.stdout.write(JSON.stringify({ action: action, ok: false, error: message }, null, 2) + '\\n');
  process.exit(1);
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\\n');
}

// Same slug rule the screenshot names and scripts/orchestrate-swarm.mjs already use, so an overlay
// image sits next to its route's own image in a directory listing.
function toSlug(routePath) {
  const cleaned = String(routePath).replace(/[{}]/g, '').replace(/^\\/+|\\/+$/g, '');
  const slug = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'root';
}

${PII_MASK_SOURCE}

// Applied here rather than asked for: a modal is the single most likely place in an application to
// render the signed-in user's own name, email or account number, and this text goes into a committed
// artifact.
function redact(value, maxLength) {
  if (typeof value !== 'string') return '';
  return maskPii(value.replace(/\\s+/g, ' ').trim()).slice(0, maxLength || 200);
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\\n', 'utf8');
}

function requireState(action) {
  const state = readState();
  if (!state) fail(action, 'no ledger open - run "node scripts/overlay-ledger.mjs begin" first');
  return state;
}

function emptyState(boundary) {
  return {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    boundary: boundary,
    signatures: {},
    routes: {},
    totals: {
      overlaysSeen: 0,
      investigated: 0,
      resolved: 0,
      gaveUp: 0,
      awaitingAuthorization: 0,
      labelledByAssistant: 0,
    },
    warnings: [],
  };
}

// The boundary the human actually set, read from the project's own record rather than re-asked or
// assumed. An explicit --boundary wins, because /map-site's preflight resolves one for the pass
// before app-profile.json has necessarily been written.
function resolveBoundary(explicit) {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  if (!fs.existsSync(PROFILE_PATH)) return null;
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8').replace(/^\\uFEFF/, ''));
    if (profile && profile.crawlBoundary && typeof profile.crawlBoundary.value === 'string') {
      return profile.crawlBoundary.value;
    }
  } catch {
    return null;
  }
  return null;
}

// Read-only means read-only: not a single keystroke or click, so the only move left is to re-request
// the page, which is a GET. Everything else may try the cheap non-committal moves first. An unknown
// or unrecorded boundary is treated as the strict one - a crawl that lost track of its own
// permission does not get to widen it by default.
function methodsForBoundary(boundary) {
  if (boundary === 'safe-interactions' || boundary === 'full' || boundary === 'full-except') {
    return ['escape', 'close-control', 'backdrop', 'reload'];
  }
  return ['reload'];
}

function isDestructiveLabel(label) {
  const text = String(label || '').toLowerCase().trim();
  if (text.length === 0) return true;
  for (const word of DESTRUCTIVE_LABELS) {
    if (text === word || text.indexOf(word + ' ') === 0 || text.indexOf(' ' + word) !== -1) {
      return true;
    }
  }
  return false;
}

// Whole words only. Matching a word's start let the single-letter entry "x" clear any label with a
// word beginning in x - live-observed calling a product link "... Huawei Pura XMax ..." a close
// control, and "Order Xbox" would have been one too. The destructive list keeps its looser match on
// purpose: there, matching too much only ever means pressing less.
function isSafeLabel(label) {
  const text = String(label || '').toLowerCase().trim().replace(/[^a-z0-9 ,]/g, '');
  if (text.length === 0) return false;
  if (isDestructiveLabel(text)) return false;
  for (const word of SAFE_LABELS) {
    if (new RegExp('(^|[^a-z0-9])' + word + '([^a-z0-9]|$)').test(text)) return true;
  }
  return false;
}

// A label that is nothing but a cross. It means "close" in every language, and it is the one
// label the English list above can never match, because it has no letters.
const CLOSE_GLYPHS = ['\\u00d7', '\\u2715', '\\u2716', '\\u2717', '\\u2573', '\\u2a2f', 'x'];
const CLOSE_CLASS_RE = /(^|[^a-z])(close|dismiss)([^a-z]|$)/;

// Why a control may close its overlay, or null. The English label list comes first; the rest reads
// what the markup says rather than what the visitor sees - a lone cross, a dismiss attribute, a
// "close" class on a control that shows no words at all. A class never outranks words: "Accept and
// close" carrying class="cookie-close" is still an accept button, which is why the class counts
// only on a control with no label, or a cross for one.
function closeEvidence(control) {
  const label = String((control && control.label) || '').trim();
  const lowered = label.toLowerCase();
  if (CLOSE_GLYPHS.indexOf(lowered) !== -1) return 'glyph';
  if (label.length > 0 && isSafeLabel(label)) return 'label';
  if (label.length > 0) return null;
  if (control && control.dismiss === true) return 'dismiss-attribute';
  if (control && CLOSE_CLASS_RE.test(String(control.classHint || ''))) return 'close-class';
  return null;
}

// A label the English lists neither clear nor forbid - "Закрыть", "닫기", "Akzeptieren". Only a
// reader can place it, which is what 'label' is for.
function isUnplacedLabel(label) {
  const text = String(label || '').trim();
  if (text.length === 0) return false;
  if (CLOSE_GLYPHS.indexOf(text.toLowerCase()) !== -1) return false;
  return !isSafeLabel(text) && !isDestructiveLabel(text);
}

const LABEL_ANSWERS = ['close', 'consent', 'other'];

// Runs in the page. Returns a description of whatever is currently covering it, or present:false.
// Deliberately reports only what it can see - which control is safe to press is decided by the
// ledger, not here, so this function never has to be trusted with a judgment call.
function detectOverlays(opts) {
  function accessibleName(el) {
    var label = el.getAttribute('aria-label');
    if (!label) {
      var labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        var target = document.getElementById(labelledBy);
        if (target) label = target.textContent;
      }
    }
    if (!label) label = el.textContent;
    return String(label || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  }

  function visible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    var style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (Number(style.opacity) === 0) return false;
    return true;
  }

  var viewportWidth = window.innerWidth;
  var viewportHeight = window.innerHeight;
  var found = [];
  var seen = [];

  var nodes = Array.prototype.slice.call(document.querySelectorAll(opts.selector));
  // A dialog opened with showModal() lives in the top layer, where z-index does not apply and a
  // plain stacking-order scan cannot find it. :modal matches exactly those, plus fullscreen
  // elements, in every current engine.
  try {
    var modals = Array.prototype.slice.call(document.querySelectorAll(':modal'));
    for (var mi = 0; mi < modals.length; mi++) {
      if (nodes.indexOf(modals[mi]) === -1) nodes.push(modals[mi]);
    }
  } catch (err) {
    /* older engine without :modal - the selector list above already covers the common cases */
  }

  for (var i = 0; i < nodes.length && found.length < opts.maxOverlays; i++) {
    var el = nodes[i];
    if (seen.indexOf(el) !== -1) continue;
    seen.push(el);
    if (!visible(el)) continue;

    var rect = el.getBoundingClientRect();
    var area = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0)) *
      Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    var coveragePct = Math.round((area / (viewportWidth * viewportHeight)) * 100);

    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute('role') || '';
    var ariaModal = el.getAttribute('aria-modal') === 'true';
    var kind = 'unknown';
    if (tag === 'dialog' || role === 'dialog' || role === 'alertdialog' || ariaModal) {
      kind = 'modal';
    } else if (role === 'status' || role === 'alert' || coveragePct < 8) {
      kind = 'toast';
    } else if (rect.height >= viewportHeight * 0.7 && rect.width <= viewportWidth * 0.6) {
      kind = 'drawer';
    } else if (rect.top >= viewportHeight * 0.6 || rect.bottom <= viewportHeight * 0.4) {
      kind = 'banner';
    } else {
      kind = 'popover';
    }

    var headingEl = el.querySelector('h1, h2, h3, [role="heading"]');
    var controls = [];
    var controlNodes = Array.prototype.slice.call(
      el.querySelectorAll('button, [role="button"], a[href], input[type="button"], input[type="submit"]'),
    );
    for (var c = 0; c < controlNodes.length && controls.length < 12; c++) {
      var controlNode = controlNodes[c];
      if (!visible(controlNode)) continue;
      // What the markup says the control does, in the developer's words rather than the visitor's
      // language: Bootstrap-style dismiss attributes, and the class and id it was given.
      controls.push({
        label: accessibleName(controlNode),
        tag: controlNode.tagName.toLowerCase(),
        role: controlNode.getAttribute('role') || '',
        dismiss:
          controlNode.hasAttribute('data-dismiss') ||
          controlNode.hasAttribute('data-bs-dismiss') ||
          controlNode.hasAttribute('data-close'),
        classHint: String((controlNode.id || '') + ' ' + (controlNode.getAttribute('class') || ''))
          .trim()
          .toLowerCase()
          .slice(0, 80),
      });
    }

    var components = [];
    var probes = ['form', 'input', 'select', 'textarea', 'table', 'iframe', 'video', 'img'];
    for (var p = 0; p < probes.length; p++) {
      if (el.querySelector(probes[p])) components.push(probes[p]);
    }

    found.push({
      kind: kind,
      title: accessibleName(el).slice(0, 120),
      headingText: headingEl ? String(headingEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120) : '',
      textExcerpt: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
      controls: controls,
      components: components,
      coveragePct: coveragePct,
      selectorHint: (tag + (el.id ? '#' + el.id : '') + (role ? '[role=' + role + ']' : '')).slice(0, 80),
    });
  }

  // What is actually under the pointer at the middle of the screen. A crawl clicking through an
  // invisible full-viewport backdrop produces no error and no effect, and this is the only signal
  // that says so.
  var centerEl = document.elementFromPoint(
    Math.floor(viewportWidth / 2),
    Math.floor(viewportHeight / 2),
  );
  var centerTag = centerEl ? centerEl.tagName.toLowerCase() : '';
  var bodyStyle = window.getComputedStyle(document.body);

  return {
    present: found.length > 0,
    overlays: found,
    blocksPointer: Boolean(
      centerEl && (centerEl.closest('[aria-modal="true"], dialog, [role="dialog"]') || centerTag === 'dialog'),
    ),
    centerElement: centerTag,
    bodyScrollLocked: bodyStyle.overflow === 'hidden' || bodyStyle.position === 'fixed',
    backgroundInert: Boolean(document.querySelector('[inert], main[aria-hidden="true"]')),
  };
}

const DETECT_SELECTOR = [
  'dialog[open]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '[data-testid*="modal" i]',
  '[class*="modal" i]',
  '[class*="overlay" i]',
  '[class*="popup" i]',
  '[class*="cookie" i]',
  '[class*="consent" i]',
  '[id*="cookie" i]',
  '[id*="consent" i]',
].join(',');

function cmdBegin(args) {
  const boundary = resolveBoundary(typeof args.boundary === 'string' ? args.boundary : null);
  const existing = readState();
  if (existing && !args.reset) {
    const open = countOpen(existing);
    return {
      action: 'begin',
      resumed: true,
      boundary: existing.boundary,
      openOverlays: open,
      notice:
        open > 0
          ? open +
            ' overlay(s) from an earlier pass are still recorded as open. Resolve or give up on them before crawling further.'
          : null,
      dialogPolicy: DIALOG_POLICY,
    };
  }
  const state = emptyState(boundary);
  writeState(state);
  return {
    action: 'begin',
    resumed: false,
    boundary: boundary,
    allowedMethods: methodsForBoundary(boundary),
    dialogPolicy: DIALOG_POLICY,
  };
}

function cmdProbe() {
  return {
    action: 'probe',
    options: {
      selector: DETECT_SELECTOR,
      maxOverlays: MAX_OVERLAYS_PER_ROUTE,
    },
    source: detectOverlays.toString(),
    usage:
      'Evaluate source with options in the page (page.evaluate) after every navigation and after ' +
      'every permitted interaction. Write the result to a file and pass it to "open" when present ' +
      'is true. A native alert/confirm/prompt never appears here - it is caught by the dialog ' +
      'handler instead, and recorded with --observation carrying kind "native-dialog".',
  };
}

function signatureOf(kind, title, controls) {
  const labels = (controls || [])
    .map(function (control) {
      return String(control.label || '').toLowerCase().trim();
    })
    .filter(Boolean)
    .sort()
    .join('|');
  return crypto
    .createHash('sha256')
    .update(kind + '|' + String(title || '').toLowerCase() + '|' + labels)
    .digest('hex')
    .slice(0, 16);
}

function countOpen(state) {
  let open = 0;
  for (const route of Object.values(state.routes)) {
    for (const overlay of route.overlays) {
      if (overlay.status === 'open' || overlay.status === 'awaiting-authorization') open += 1;
    }
  }
  return open;
}

function findOverlay(state, overlayId) {
  for (const [routePath, route] of Object.entries(state.routes)) {
    for (const overlay of route.overlays) {
      if (overlay.overlayId === overlayId) return { routePath: routePath, overlay: overlay };
    }
  }
  return null;
}

// The order to try, given the boundary, what already worked for this exact overlay elsewhere, and
// whether a human has authorized something wider for it. A method that closed this signature once
// goes first: the same modal closes the same way on every route, and re-deriving that per route
// wastes a reload each time.
function dismissPlanFor(state, kind, signature, graded) {
  if (kind === 'native-dialog') return ['native-dismiss'];
  const allowed = methodsForBoundary(state.boundary).slice();
  const record = state.signatures[signature];
  if (record && record.authorizedMethod && allowed.indexOf(record.authorizedMethod) === -1) {
    allowed.unshift(record.authorizedMethod);
  }
  const hasSafeControl = (graded || []).some(function (control) {
    return control.safe;
  });
  const plan = allowed.filter(function (method) {
    return method !== 'close-control' || hasSafeControl;
  });
  if (record && record.dismissedBy && plan.indexOf(record.dismissedBy) > 0) {
    return [record.dismissedBy].concat(
      plan.filter(function (method) {
        return method !== record.dismissedBy;
      }),
    );
  }
  return plan;
}

function cmdOpen(args) {
  const state = requireState('open');
  const routePath = typeof args.route === 'string' ? args.route.trim() : '';
  const routeId = typeof args['route-id'] === 'string' ? args['route-id'].trim() : '';
  if (!routePath) fail('open', 'missing --route');
  if (!routeId) fail('open', 'missing --route-id');
  if (typeof args.observation !== 'string') fail('open', 'missing --observation=<file>');

  let observation;
  try {
    observation = JSON.parse(fs.readFileSync(path.resolve(CWD, args.observation), 'utf8'));
  } catch (err) {
    fail('open', 'could not read --observation: ' + err.message);
  }

  const kind = OVERLAY_KINDS.indexOf(observation.kind) === -1 ? 'unknown' : observation.kind;
  const controls = Array.isArray(observation.controls) ? observation.controls.slice(0, 12) : [];
  const title = redact(observation.title || observation.headingText || observation.message, 120);
  const signature = signatureOf(kind, title, controls);

  const route = state.routes[routePath] || { routeId: routeId, overlays: [] };
  route.routeId = routeId;
  if (route.overlays.length >= MAX_OVERLAYS_PER_ROUTE) {
    state.routes[routePath] = route;
    writeState(state);
    return {
      action: 'open',
      recorded: false,
      reason: 'max-overlays-per-route',
      warning:
        'This route has already produced ' +
        MAX_OVERLAYS_PER_ROUTE +
        ' overlays. Something is spawning them rather than the page showing one - stop recording ' +
        'them here and note it in the run summary.',
    };
  }

  const known = Object.prototype.hasOwnProperty.call(state.signatures, signature);
  const record = known
    ? state.signatures[signature]
    : { signature: signature, kind: kind, title: title, seenCount: 0, routes: [], dismissedBy: null, authorizedMethod: null, investigated: false };
  record.seenCount += 1;
  if (record.routes.indexOf(routePath) === -1) record.routes.push(routePath);

  const investigate = !record.investigated && state.totals.investigated < MAX_INVESTIGATED_SIGNATURES;
  if (investigate) {
    record.investigated = true;
    state.totals.investigated += 1;
  }
  state.signatures[signature] = record;

  const index = route.overlays.length + 1;
  const overlayId = 'ov-' + signature.slice(0, 8) + '-' + index;
  const screenshot = investigate
    ? SCREENSHOT_DIR + '/' + toSlug(routePath) + '-overlay-' + index + '--' + routeId + '.jpg'
    : null;

  // Each control graded once, here: why it may close the overlay, or that it may not. A label an
  // assistant placed for this same overlay on an earlier route counts again without asking again.
  const assistantLabel = record.assistantClose ? record.assistantClose.label : null;
  const graded = controls.map(function (control) {
    const label = redact(control.label, 80);
    let how = closeEvidence(control);
    if (!how && assistantLabel !== null && label === assistantLabel && !isDestructiveLabel(label)) how = 'assistant';
    const entry = { label: label, safe: how !== null };
    if (how) entry.how = how;
    return entry;
  });
  const plan = dismissPlanFor(state, kind, signature, graded);
  const closeIndex = graded.findIndex(function (control) {
    return control.safe;
  });
  // Only a button can close an overlay; a link navigates away. An overlay whose unreadable labels
  // are all links - a product card, a weather widget - has nothing for a reader to place.
  const needsLabels =
    kind !== 'native-dialog' &&
    closeIndex === -1 &&
    controls.some(function (control) {
      return control.tag !== 'a' && isUnplacedLabel(control.label);
    });
  const overlay = {
    overlayId: overlayId,
    signature: signature,
    kind: kind,
    title: title,
    trigger: typeof args.trigger === 'string' ? redact(args.trigger, 80) : 'auto',
    textExcerpt: redact(observation.textExcerpt, 200),
    components: Array.isArray(observation.components) ? observation.components.slice(0, 10) : [],
    controls: graded,
    labelsRequested: needsLabels,
    coveragePct: Number.isFinite(observation.coveragePct) ? observation.coveragePct : null,
    screenshot: screenshot,
    plan: plan,
    attempts: [],
    status: plan.length === 0 ? 'awaiting-authorization' : 'open',
    observedAt: new Date().toISOString(),
  };
  route.overlays.push(overlay);
  state.routes[routePath] = route;
  state.totals.overlaysSeen += 1;
  if (overlay.status === 'awaiting-authorization') state.totals.awaitingAuthorization += 1;

  const warnings = [];
  if (record.seenCount === RECURRING_THRESHOLD) {
    warnings.push(
      'The same overlay ("' +
        (title || kind) +
        '") has now appeared on ' +
        RECURRING_THRESHOLD +
        ' routes. It is site-wide furniture, not a page feature - say so once in the run summary ' +
        'rather than reporting it per route.',
    );
  }
  if (kind !== 'native-dialog' && state.boundary !== 'safe-interactions' && state.boundary !== 'full' && state.boundary !== 'full-except') {
    warnings.push(
      'Read-only boundary: this overlay can only be cleared by reloading the page. If reloading ' +
        'brings it straight back, it needs one human decision - ask, do not press anything.',
    );
  }
  state.warnings = state.warnings.concat(warnings);
  writeState(state);

  return {
    action: 'open',
    recorded: true,
    overlayId: overlayId,
    signature: signature,
    known: known,
    seenCount: record.seenCount,
    investigate: investigate,
    screenshot: screenshot,
    dismissPlan: plan,
    nextMethod: plan.length > 0 ? plan[0] : null,
    closeControl:
      closeIndex === -1 ? null : { index: closeIndex, label: graded[closeIndex].label, how: graded[closeIndex].how },
    labelRequest: needsLabels ? labelRequestFor(overlayId, graded) : null,
    status: overlay.status,
    warnings: warnings,
    instruction: investigate
      ? 'Capture the overlay screenshot to the path above BEFORE dismissing it, then follow ' +
        'dismissPlan in order, reporting each attempt with "attempt".'
      : 'Already documented on another route - no screenshot needed. Follow dismissPlan in order, ' +
        'reporting each attempt with "attempt".',
  };
}

function cmdAttempt(args) {
  const state = requireState('attempt');
  const overlayId = typeof args.overlay === 'string' ? args.overlay.trim() : '';
  if (!overlayId) fail('attempt', 'missing --overlay');
  const hit = findOverlay(state, overlayId);
  if (!hit) fail('attempt', 'unknown overlay: ' + overlayId);

  const method = typeof args.method === 'string' ? args.method.trim() : '';
  if (METHODS.indexOf(method) === -1) {
    fail('attempt', 'unknown --method: ' + method + ' (expected one of ' + METHODS.join(', ') + ')');
  }
  const cleared = args.cleared === 'true' || args.cleared === true;
  const overlay = hit.overlay;

  overlay.attempts.push({ method: method, cleared: cleared, at: new Date().toISOString() });

  if (cleared) {
    overlay.status = 'resolved';
    overlay.dismissal = { method: method, verified: true };
    state.totals.resolved += 1;
    const record = state.signatures[overlay.signature];
    if (record) record.dismissedBy = method;
    writeState(state);
    return {
      action: 'attempt',
      overlayId: overlayId,
      resolved: true,
      dismissal: overlay.dismissal,
      instruction:
        'Re-run "probe" once to confirm nothing else is now covering the page, then carry on with ' +
        'this route.',
    };
  }

  const tried = overlay.attempts.map(function (attempt) {
    return attempt.method;
  });
  const remaining = overlay.plan.filter(function (candidate) {
    return tried.indexOf(candidate) === -1;
  });

  if (remaining.length > 0) {
    writeState(state);
    return {
      action: 'attempt',
      overlayId: overlayId,
      resolved: false,
      nextMethod: remaining[0],
      remaining: remaining,
    };
  }

  // Everything permitted has been tried and the page is still covered. Whether a human can unblock
  // it depends on whether a genuinely safe control exists that the boundary is what forbade.
  const safeControl = overlay.controls.find(function (control) {
    return control.safe;
  });
  if (safeControl && overlay.plan.indexOf('close-control') === -1) {
    overlay.status = 'awaiting-authorization';
    state.totals.awaitingAuthorization += 1;
    writeState(state);
    return {
      action: 'attempt',
      overlayId: overlayId,
      resolved: false,
      exhausted: true,
      escalate: 'ask-human',
      question:
        'A "' +
        (overlay.title || overlay.kind) +
        '" overlay is covering every page and reloading does not clear it. It has a "' +
        safeControl.label +
        '" control that would close it. The crawl boundary you set is read-only, so pressing it ' +
        'needs your say-so. Press it once for the rest of this crawl, or leave the affected pages ' +
        'recorded as blocked?',
      authorizeWith:
        'node scripts/overlay-ledger.mjs authorize --overlay=' + overlayId + ' --method=close-control',
      instruction:
        'Ask that question and wait. Never press the control without an answer, and never widen the ' +
        'boundary for anything other than this one overlay.',
    };
  }

  overlay.status = 'gave-up';
  overlay.dismissal = { method: 'gave-up', verified: false };
  state.totals.gaveUp += 1;
  writeState(state);
  return {
    action: 'attempt',
    overlayId: overlayId,
    resolved: false,
    exhausted: true,
    gaveUp: true,
    instruction:
      'Record this route with "blocked-by-overlay" in visualTriage.flags and move on - do not keep ' +
      'clicking into a covered page. Say in the run summary that this route was only partly ' +
      'explored and why.',
  };
}

function labelRequestFor(overlayId, graded) {
  return {
    controls: graded.map(function (control, index) {
      return { index: index, label: control.label };
    }),
    answers: LABEL_ANSWERS,
    answerFormat: '{"0": "close", "1": "consent", "2": "other"}',
    command: 'node scripts/overlay-ledger.mjs label --overlay=' + overlayId + ' --answers=<file>',
    instruction:
      'Answer this before trying any method. For every control of the overlay, say what pressing it ' +
      'does, reading its label in whatever language it is in: "close" when it only closes the overlay ' +
      'and agrees to nothing, "consent" when it accepts, agrees, allows, subscribes or confirms ' +
      'anything, "other" for the rest (settings, links, a second step). When a label could be either, ' +
      'answer "other" - a wrong "close" presses a button that commits to something.',
  };
}

// The assistant's reading of labels the English lists cannot place. The ledger still decides: the
// answer must cover every control, and a control named "close" whose label reads as committing to
// something in the list the ledger does know is refused. What it accepts becomes a close-control
// step in the plan only where the crawl boundary already allows pressing a close control.
function cmdLabel(args) {
  const state = requireState('label');
  const overlayId = typeof args.overlay === 'string' ? args.overlay.trim() : '';
  if (!overlayId) fail('label', 'missing --overlay');
  const hit = findOverlay(state, overlayId);
  if (!hit) fail('label', 'unknown overlay: ' + overlayId);
  const overlay = hit.overlay;
  if (overlay.status === 'resolved' || overlay.status === 'gave-up') {
    fail('label', 'this overlay is already ' + overlay.status + ' - there is nothing left to press');
  }
  if (typeof args.answers !== 'string') fail('label', 'missing --answers=<file>');
  let answers;
  try {
    answers = JSON.parse(fs.readFileSync(path.resolve(CWD, args.answers), 'utf8').replace(/^\\uFEFF/, ''));
  } catch (err) {
    fail('label', 'could not read --answers: ' + err.message);
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    fail('label', '--answers must be a JSON object keyed by control index, e.g. {"0": "close", "1": "consent"}');
  }

  const errors = [];
  for (const key of Object.keys(answers)) {
    const index = Number.parseInt(key, 10);
    if (String(index) !== key || index < 0 || index >= overlay.controls.length) {
      errors.push('"' + key + '" is not a control index of this overlay (0-' + (overlay.controls.length - 1) + ')');
    }
  }
  overlay.controls.forEach(function (control, index) {
    const answer = answers[String(index)];
    if (LABEL_ANSWERS.indexOf(answer) === -1) {
      errors.push(index + ' ("' + control.label + '"): answer one of ' + LABEL_ANSWERS.join(', '));
    }
  });
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ action: 'label', ok: false, errors: errors }, null, 2) + '\\n');
    process.exit(1);
  }

  const refused = [];
  let chosen = -1;
  overlay.controls.forEach(function (control, index) {
    if (answers[String(index)] !== 'close') return;
    if (isDestructiveLabel(control.label)) {
      refused.push(control.label || '(no label)');
      return;
    }
    if (chosen === -1) chosen = index;
  });
  overlay.labels = overlay.controls.map(function (control, index) {
    return { label: control.label, answer: answers[String(index)] };
  });
  state.totals.labelledByAssistant = (state.totals.labelledByAssistant || 0) + 1;

  if (chosen !== -1) {
    const control = overlay.controls[chosen];
    control.safe = true;
    control.how = 'assistant';
    const record = state.signatures[overlay.signature];
    if (record) record.assistantClose = { label: control.label };
    const allowed = methodsForBoundary(state.boundary);
    const authorized = record && record.authorizedMethod === 'close-control';
    if ((allowed.indexOf('close-control') !== -1 || authorized) && overlay.plan.indexOf('close-control') === -1) {
      const before = ['backdrop', 'reload'].map(function (method) {
        return overlay.plan.indexOf(method);
      }).filter(function (position) {
        return position !== -1;
      });
      const at = before.length > 0 ? Math.min.apply(null, before) : overlay.plan.length;
      overlay.plan.splice(at, 0, 'close-control');
      if (overlay.status === 'awaiting-authorization') {
        overlay.status = 'open';
        state.totals.awaitingAuthorization = Math.max(0, state.totals.awaitingAuthorization - 1);
      }
    }
  }
  writeState(state);

  const nextMethod =
    overlay.plan.find(function (method) {
      return !overlay.attempts.some(function (attempt) {
        return attempt.method === method;
      });
    }) || null;
  const warnings = [];
  if (refused.length > 0) {
    warnings.push(
      'Refused as a close control, because the label reads as committing to something: ' +
        refused.join(', ') +
        '. It stays out of the plan.',
    );
  }
  return {
    action: 'label',
    ok: true,
    overlayId: overlayId,
    closeControl: chosen === -1 ? null : { index: chosen, label: overlay.controls[chosen].label, how: 'assistant' },
    dismissPlan: overlay.plan,
    nextMethod: nextMethod,
    warnings: warnings,
    instruction:
      chosen === -1
        ? 'No control closes this overlay without committing to something, so the plan is unchanged - ' +
          'carry on with nextMethod.'
        : 'Carry on with the plan in order; "close-control" means pressing closeControl and nothing else.',
  };
}

function cmdAuthorize(args) {
  const state = requireState('authorize');
  const overlayId = typeof args.overlay === 'string' ? args.overlay.trim() : '';
  if (!overlayId) fail('authorize', 'missing --overlay');
  const hit = findOverlay(state, overlayId);
  if (!hit) fail('authorize', 'unknown overlay: ' + overlayId);
  const method = typeof args.method === 'string' ? args.method.trim() : '';
  if (METHODS.indexOf(method) === -1) {
    fail('authorize', 'unknown --method: ' + method);
  }

  const overlay = hit.overlay;
  const record = state.signatures[overlay.signature];
  if (record) record.authorizedMethod = method;
  if (overlay.status === 'awaiting-authorization') {
    state.totals.awaitingAuthorization = Math.max(0, state.totals.awaitingAuthorization - 1);
  }
  overlay.status = 'open';
  if (overlay.plan.indexOf(method) === -1) overlay.plan = [method].concat(overlay.plan);
  writeState(state);
  return {
    action: 'authorize',
    overlayId: overlayId,
    signature: overlay.signature,
    method: method,
    appliesTo:
      'every future appearance of this same overlay in this crawl (' +
      (record ? record.seenCount : 1) +
      ' seen so far) - a different overlay needs its own answer',
    nextMethod: method,
  };
}

function cmdPending(args) {
  const state = requireState('pending');
  const routePath = typeof args.route === 'string' ? args.route.trim() : null;
  const openOverlays = [];
  for (const [candidatePath, route] of Object.entries(state.routes)) {
    if (routePath && candidatePath !== routePath) continue;
    for (const overlay of route.overlays) {
      if (overlay.status !== 'open' && overlay.status !== 'awaiting-authorization') continue;
      openOverlays.push({
        overlayId: overlay.overlayId,
        route: candidatePath,
        kind: overlay.kind,
        title: overlay.title,
        status: overlay.status,
        nextMethod: overlay.plan.find(function (method) {
          return !overlay.attempts.some(function (attempt) {
            return attempt.method === method;
          });
        }) || null,
      });
    }
  }
  return {
    action: 'pending',
    route: routePath,
    open: openOverlays.length,
    mustResolve: openOverlays.length > 0,
    overlays: openOverlays,
    instruction:
      openOverlays.length > 0
        ? 'Do not leave this route or record it as finished while an overlay is still open - every ' +
          'later interaction on a covered page lands somewhere you did not intend.'
        : 'Nothing left open here.',
  };
}

// The exact array to put on this route's site-map entry. Built here so what is stored is what the
// ledger actually observed, never a re-description of it.
function cmdEntries(args) {
  const state = requireState('entries');
  const routePath = typeof args.route === 'string' ? args.route.trim() : '';
  if (!routePath) fail('entries', 'missing --route');
  const route = state.routes[routePath];
  if (!route) return { action: 'entries', route: routePath, overlays: [] };
  return {
    action: 'entries',
    route: routePath,
    overlays: route.overlays.map(function (overlay) {
      const entry = {
        overlayId: overlay.overlayId,
        kind: overlay.kind,
        trigger: overlay.trigger,
        title: overlay.title,
        components: overlay.components,
        dismissal: overlay.dismissal || { method: 'gave-up', verified: false },
      };
      if (overlay.screenshot) entry.screenshot = overlay.screenshot;
      if (overlay.textExcerpt) entry.textExcerpt = overlay.textExcerpt;
      return entry;
    }),
  };
}

function cmdReport() {
  const state = requireState('report');
  const recurring = Object.values(state.signatures)
    .filter(function (record) {
      return record.seenCount >= RECURRING_THRESHOLD;
    })
    .map(function (record) {
      return { title: record.title, kind: record.kind, routes: record.routes.length };
    });
  const unresolved = [];
  for (const [routePath, route] of Object.entries(state.routes)) {
    for (const overlay of route.overlays) {
      if (overlay.status === 'resolved') continue;
      unresolved.push({
        overlayId: overlay.overlayId,
        route: routePath,
        title: overlay.title,
        status: overlay.status,
      });
    }
  }
  // Every close control an assistant picked from labels the ledger could not read itself - listed so
  // a person can see which buttons the crawl pressed on someone's reading rather than on a rule.
  const assistantChoices = Object.values(state.signatures)
    .filter(function (record) {
      return record.assistantClose;
    })
    .map(function (record) {
      return { title: record.title, kind: record.kind, pressed: record.assistantClose.label, routes: record.routes.length };
    });
  return {
    action: 'report',
    boundary: state.boundary,
    totals: state.totals,
    uniqueOverlays: Object.keys(state.signatures).length,
    recurring: recurring,
    unresolved: unresolved,
    assistantChoices: assistantChoices,
    warnings: state.warnings,
    summary:
      state.totals.overlaysSeen +
      ' overlay(s) met, ' +
      Object.keys(state.signatures).length +
      ' distinct, ' +
      state.totals.resolved +
      ' closed, ' +
      state.totals.gaveUp +
      ' given up on.',
  };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case 'begin':
      emit(cmdBegin(args));
      break;
    case 'probe':
      emit(cmdProbe());
      break;
    case 'open':
      emit(cmdOpen(args));
      break;
    case 'attempt':
      emit(cmdAttempt(args));
      break;
    case 'label':
      emit(cmdLabel(args));
      break;
    case 'authorize':
      emit(cmdAuthorize(args));
      break;
    case 'pending':
      emit(cmdPending(args));
      break;
    case 'entries':
      emit(cmdEntries(args));
      break;
    case 'report':
      emit(cmdReport());
      break;
    default:
      fail(
        'usage',
        'unknown command: ' +
          String(command) +
          ' (expected begin, probe, open, label, attempt, authorize, pending, entries or report)',
      );
  }
}

main();
`;
}
