// Template for scripts/field-probe.mjs - what a field does when a value is typed into it, recorded as
// an observation a test condition can cite. create-if-absent.
//
// Why this is a script. A limit the markup does not state is either enforced some other way (a
// script on blur, the server on submit) or not at all, and the two look identical in the markup.
// The only way to tell is to try a value and watch, which is an interaction with a live application
// - so whether it may happen at all is decided here, from the crawl boundary and the kind of
// application a person recorded, never by the model on the day. The browser half types, moves the
// focus away, reads what the page says, and puts the field back exactly as it was; this half grades
// the reading and stores it under an id a condition can point at.
//
// Same division of labour as page-inventory.mjs and overlay-ledger.mjs: 'probe' hands back
// browser-side source, 'record' judges what came back.

import { PII_MASK_SOURCE } from './pii-mask.js';

export function renderFieldProbe(): string {
  return `#!/usr/bin/env node

/**
 * Field probes for /define-test-conditions: what a field does with a value, observed rather than
 * guessed - zero model involvement in this file.
 *
 * Usage:
 *   node scripts/field-probe.mjs permissions
 *   node scripts/field-probe.mjs probe
 *   node scripts/field-probe.mjs record --route=<routeId> --control=<controlId> --value=<value>
 *                                      --via=<blur|submit> --observation=<file>
 *   node scripts/field-probe.mjs list [--route=<routeId>]
 *
 * 'permissions' says whether typing into fields is allowed at all, and whether a form may be
 * submitted, from artifacts/analysis/app-profile.json. 'probe' hands back source to run on one field
 * with locator.evaluate(source, options): it types the value, moves the focus away, waits, reads what
 * the page says, and restores the field - it never returns what the field held before. 'record'
 * stores the reading in artifacts/analysis/field-probes.json and answers with its id.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');
const PROBES_PATH = path.join(CWD, 'artifacts', 'analysis', 'field-probes.json');

// Typing into a field is an interaction; pressing submit creates, sends or changes something. The
// first needs a boundary that allows interaction at all, the second a boundary that allows any
// action AND an application a person said is not the real production one.
const FILL_BOUNDARIES = ['safe-interactions', 'full', 'full-except'];
const SUBMIT_BOUNDARIES = ['full', 'full-except'];
const MAX_PROBES = 2000;
const WAIT_MS = 400;

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

function fail(action, message) {
  emit({ action: action, ok: false, error: message });
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

${PII_MASK_SOURCE}

function redact(value, max) {
  if (typeof value !== 'string') return '';
  return maskPii(value.replace(/\\s+/g, ' ').trim()).slice(0, max || 160);
}

// The value typed is test data the probe chose. A number typed into a number or range field, or a
// date into a date field, is the value under test - a limit, a step - and is kept as typed, and so
// is the message the browser itself gives such a field, which only ever names its limits. Anything
// else goes through the masking rule, which leaves a phone or card number reserved for testing alone.
const PLAIN_NUMBER = /^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][-+]?\\d+)?$/;
const PLAIN_DATE = /^\\d{4}-\\d{2}(?:-\\d{2})?(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?)?$|^\\d{4}-W\\d{2}$|^\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?$/;
const NUMBER_TYPES = ['number', 'range'];
const DATE_TYPES = ['date', 'datetime-local', 'month', 'week', 'time'];

function measured(type) {
  return NUMBER_TYPES.indexOf(type) !== -1 || DATE_TYPES.indexOf(type) !== -1;
}

function probedValue(value, type) {
  const text = value.replace(/\\s+/g, ' ').trim();
  if (NUMBER_TYPES.indexOf(type) !== -1 && PLAIN_NUMBER.test(text)) return text.slice(0, 80);
  if (DATE_TYPES.indexOf(type) !== -1 && PLAIN_DATE.test(text)) return text.slice(0, 80);
  return maskPii(text, { keepTestData: true }).slice(0, 80);
}

function permissions() {
  const profile = readJson(PROFILE_PATH) || {};
  const boundary = profile.crawlBoundary ? profile.crawlBoundary.value : null;
  const kind = profile.applicationKind ? profile.applicationKind.value : null;
  const fill = FILL_BOUNDARIES.indexOf(boundary) !== -1;
  const submit = SUBMIT_BOUNDARIES.indexOf(boundary) !== -1 && typeof kind === 'string' && kind !== 'production' && kind !== 'unknown';
  let reason;
  if (!boundary) reason = 'No crawl boundary is recorded, so nothing may be typed into the application - run /map-site to set one.';
  else if (!fill) reason = 'The crawl boundary is read-only: typing into a field is an interaction.';
  else if (!submit && SUBMIT_BOUNDARIES.indexOf(boundary) !== -1) {
    reason =
      kind === 'production'
        ? 'Fields may be probed, but nothing may be submitted: this is the real production application.'
        : 'Fields may be probed, but nothing may be submitted until a person states what kind of application this is.';
  } else if (!submit) reason = 'Fields may be probed without submitting anything - the boundary allows safe interactions only.';
  else reason = 'Fields may be probed, and a form may be submitted to see what the server accepts - this is not production.';
  return {
    action: 'permissions',
    boundary: boundary,
    applicationKind: kind,
    offLimits: profile.crawlBoundary && Array.isArray(profile.crawlBoundary.offLimits) ? profile.crawlBoundary.offLimits : [],
    fill: fill,
    submit: submit,
    reason: reason,
  };
}

/**
 * Runs in the page, on one field: locator.evaluate(source, options). Types options.value the way a
 * person's keystrokes arrive (the native setter, then input and change events, so framework-bound
 * fields see it), moves the focus away, waits options.waitMs, reads every place a page reports a
 * rejected value, then puts the field back and fires the same events. What the field held before is
 * kept in this closure and never returned - it can be the signed-in user's own data.
 */
function probeField(el, opts) {
  function text(node) {
    return node ? String(node.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  }
  function describedText() {
    var ids = (el.getAttribute('aria-describedby') || '') + ' ' + (el.getAttribute('aria-errormessage') || '');
    var root = el.getRootNode && el.getRootNode().getElementById ? el.getRootNode() : document;
    return ids
      .split(/\\s+/)
      .filter(Boolean)
      .map(function (id) {
        return text(root.getElementById(id));
      })
      .filter(Boolean)
      .join(' ');
  }
  // Every piece of text visible around the field, element by element - so a message that appears
  // beside it after the value goes in can be told from what was already there. Element by element
  // rather than line by line, because a message often shares a line with the label; and visible
  // rather than present, because many pages keep the message in the markup and only reveal it.
  function scopeOfField() {
    var node = el.parentElement;
    for (var depth = 0; node && depth < 2; depth++) {
      if (node.querySelectorAll('input, select, textarea').length > 1) break;
      node = node.parentElement;
    }
    return node || el.parentElement;
  }
  function ownText(node) {
    var parts = [];
    for (var child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) parts.push(child.nodeValue);
    }
    return parts.join(' ').replace(/\\s+/g, ' ').trim();
  }
  function visibleTexts(scope) {
    var found = [];
    if (!scope) return found;
    var nodes = [scope].concat(Array.prototype.slice.call(scope.querySelectorAll('*')));
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node === el) continue;
      var own = ownText(node);
      if (!own) continue;
      var style = window.getComputedStyle(node);
      if (node.getClientRects().length === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      found.push(own);
    }
    return found;
  }
  function setValue(value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var tag = el.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') {
    return { ok: false, reason: 'only a text-entry field can be probed with a typed value (this is a ' + tag + ')' };
  }
  var original = el.value;
  var scope = scopeOfField();
  var before = visibleTexts(scope);
  el.focus();
  setValue(opts.value);
  el.blur();
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

  return new Promise(function (resolve) {
    setTimeout(function () {
      var validity = [];
      if (el.validity) {
        ['valueMissing', 'typeMismatch', 'patternMismatch', 'tooLong', 'tooShort', 'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'badInput'].forEach(function (flag) {
          if (el.validity[flag]) validity.push(flag);
        });
      }
      // The browser checks minlength and maxlength only on what a person typed, never on a value set
      // by script - live-observed passing five digits into a field of minlength 10. So the probe
      // applies them itself, exactly as the browser would to typing: too short is refused, and
      // typing past maxlength stops, keeping only the first characters.
      var length = String(opts.value).length;
      var byAttribute = [];
      if (el.hasAttribute('minlength') && length > 0 && length < Number(el.getAttribute('minlength'))) {
        if (validity.indexOf('tooShort') === -1) validity.push('tooShort');
        byAttribute.push('minlength=' + el.getAttribute('minlength'));
      }
      if (el.hasAttribute('maxlength') && length > Number(el.getAttribute('maxlength'))) {
        byAttribute.push('maxlength=' + el.getAttribute('maxlength'));
      }
      var after = visibleTexts(scope);
      var appeared = after.filter(function (line) {
        return before.indexOf(line) === -1 && line !== opts.value;
      });
      var reading = {
        ok: true,
        tag: tag,
        type: String(el.getAttribute('type') || ''),
        validity: validity,
        byAttribute: byAttribute,
        validationMessage: el.validationMessage || '',
        ariaInvalid: el.getAttribute('aria-invalid') === 'true',
        described: describedText(),
        appeared: appeared.slice(0, 5),
        // Only the probe's own value is ever compared: a field that rewrote it (a number field
        // emptying "abc", a mask adding separators) said something about what it takes.
        rewritten: el.value !== opts.value,
        valueAfter: el.value !== opts.value ? el.value : undefined,
      };
      setValue(original);
      resolve(reading);
    }, opts.waitMs);
  });
}

function probe() {
  return {
    action: 'probe',
    options: { waitMs: WAIT_MS },
    source: probeField.toString(),
    usage:
      'Only when "permissions" says fill: true. Build the function once - const fn = new ' +
      "Function('return ' + source)() - then for each value to try: locate the field and run " +
      'await locator.evaluate(fn, { ...options, value: "<a synthesized value>" }); write the result ' +
      'to a file and pass it to "record". Synthesized values only - never a real name, email or number.',
  };
}

// What the reading adds up to. Rejected: the page said no - a validity flag, aria-invalid, a
// message. Rewritten: it took the value but changed it. Accepted: no reaction at all, which for a
// value the field should refuse is the finding.
function verdictOf(reading) {
  if (!reading || reading.ok !== true) return { verdict: 'not-probed', message: reading && reading.reason ? String(reading.reason) : '' };
  const byAttribute = Array.isArray(reading.byAttribute) ? reading.byAttribute : [];
  const minRule = byAttribute.find(function (rule) {
    return rule.indexOf('minlength=') === 0;
  });
  const maxRule = byAttribute.find(function (rule) {
    return rule.indexOf('maxlength=') === 0;
  });
  if (minRule && !reading.validationMessage) {
    return { verdict: 'rejected', message: 'shorter than the field ' + minRule + ' - the browser refuses a typed value this short' };
  }
  if (maxRule) {
    return { verdict: 'rewritten', message: 'typing stops at the field ' + maxRule + ' - only the first characters are kept' };
  }
  const message = reading.validationMessage || reading.described || (Array.isArray(reading.appeared) ? reading.appeared[0] || '' : '');
  if ((Array.isArray(reading.validity) && reading.validity.length > 0) || reading.ariaInvalid || reading.validationMessage || reading.described) {
    return { verdict: 'rejected', message: message };
  }
  if (Array.isArray(reading.appeared) && reading.appeared.length > 0) return { verdict: 'rejected', message: message };
  if (reading.rewritten) return { verdict: 'rewritten', message: 'the field changed the value to "' + String(reading.valueAfter || '') + '"' };
  return { verdict: 'accepted', message: '' };
}

function record(args) {
  const routeId = typeof args.route === 'string' ? args.route : '';
  const control = typeof args.control === 'string' ? args.control : '';
  const value = typeof args.value === 'string' ? args.value : null;
  const via = typeof args.via === 'string' ? args.via : 'blur';
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(routeId)) fail('record', 'missing or malformed --route=<routeId>');
  if (!/^c\\d+$/.test(control)) fail('record', 'missing or malformed --control=<inventory control id, e.g. c4>');
  if (value === null) fail('record', 'missing --value=<the value that was typed>');
  if (via !== 'blur' && via !== 'submit') fail('record', '--via must be blur or submit');
  const allowed = permissions();
  if (!allowed.fill) fail('record', allowed.reason);
  if (via === 'submit' && !allowed.submit) fail('record', 'A submitted probe cannot be recorded: ' + allowed.reason);
  if (typeof args.observation !== 'string') fail('record', 'missing --observation=<file>');
  const reading = readJson(path.resolve(CWD, args.observation));
  if (!reading || typeof reading !== 'object') fail('record', 'could not read --observation as JSON');

  let judged;
  if (via === 'submit') {
    // A submit is pressed by the crawler, not by the probe source, so its outcome is what the person
    // at the keyboard - the crawler - saw: accepted or rejected, and the message it quotes.
    if (reading.outcome !== 'accepted' && reading.outcome !== 'rejected') {
      fail('record', 'a submit observation must say outcome: "accepted" or "rejected", and quote the message seen');
    }
    judged = { verdict: reading.outcome, message: typeof reading.message === 'string' ? reading.message : '' };
  } else {
    judged = verdictOf(reading);
  }

  const store = readJson(PROBES_PATH) || { schemaVersion: 1, probes: [] };
  if (!Array.isArray(store.probes)) store.probes = [];
  if (store.probes.length >= MAX_PROBES) fail('record', 'the probe log is full (' + MAX_PROBES + ') - this is not a crawl-wide fuzzing tool');
  const id = 'p' + (store.probes.length + 1);
  const type = typeof reading.type === 'string' ? reading.type.toLowerCase() : '';
  const browserSaid = via === 'blur' && Boolean(reading.validationMessage) && judged.message === reading.validationMessage;
  const entry = {
    id: id,
    routeId: routeId,
    control: control,
    value: probedValue(value, type),
    via: via,
    verdict: judged.verdict,
    message: browserSaid && measured(type) ? String(judged.message).replace(/\\s+/g, ' ').trim().slice(0, 160) : redact(judged.message, 160),
    recordedAt: new Date().toISOString(),
  };
  if (Array.isArray(reading.validity) && reading.validity.length > 0) entry.validity = reading.validity.slice(0, 9);
  store.probes.push(entry);
  fs.mkdirSync(path.dirname(PROBES_PATH), { recursive: true });
  fs.writeFileSync(PROBES_PATH, JSON.stringify(store, null, 2) + '\\n', 'utf8');
  return {
    action: 'record',
    ok: true,
    id: id,
    verdict: entry.verdict,
    message: entry.message,
    cite:
      'Cite it as an anchor { kind: "probe", ref: "' +
      id +
      '" }, or as a partition rule { signal: "field-probe", excerpt: "' +
      id +
      ': <what the page did>" }.',
  };
}

function list(args) {
  const store = readJson(PROBES_PATH) || { probes: [] };
  const routeId = typeof args.route === 'string' ? args.route : null;
  const probes = (Array.isArray(store.probes) ? store.probes : []).filter(function (entry) {
    return !routeId || entry.routeId === routeId;
  });
  return { action: 'list', count: probes.length, probes: probes };
}

function main() {
  const [action, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (action === 'permissions') return emit(permissions());
  if (action === 'probe') return emit(probe());
  if (action === 'record') return emit(record(args));
  if (action === 'list') return emit(list(args));
  fail(String(action), 'unknown action "' + action + '" (expected permissions, probe, record or list)');
}

main();
`;
}
