// Template for scripts/page-inventory.mjs - the deterministic record of what every mapped page
// contains. create-if-absent.
//
// Why this is a script. The site map's `components` field used to be whatever the crawling model
// chose to write, and on a live 28-route run it wrote tag names: `a`, `button`, `select`. Nothing
// downstream could use that - shared-widget mining found nothing to compare although the same
// header sat on every page, and the next stage re-read each page by eye, recorded two parameters
// where there were seven, and mistook the header's language switcher for a form field on 13 routes.
// What a page contains is a fact about its DOM, so a script collects it: the model runs the probe
// and passes the result through, and every later stage reads the same record.
//
// Same division of labour as overlay-ledger.mjs and visual-copilot.mjs: 'probe' hands back
// browser-side source for page.evaluate, 'record' grades and stores what came back.

export function renderPageInventory(): string {
  return `#!/usr/bin/env node

/**
 * Page inventory for the /map-site crawl: every landmark region and every control on a page, with
 * role, accessible name, type, HTML5 constraints and option lists - zero model involvement in this
 * file.
 *
 * Usage:
 *   node scripts/page-inventory.mjs probe
 *   node scripts/page-inventory.mjs record --route=<canonicalPath> --route-id=<routeId> --observation=<file>
 *                                          [--status=<http status>] [--mitigated=<cf-mitigated header>]
 *   node scripts/page-inventory.mjs classify --route-id=<routeId> --answers=<file>
 *   node scripts/page-inventory.mjs shared
 *   node scripts/page-inventory.mjs prune
 *
 * 'probe' hands back browser-side source to run with page.evaluate once the page has settled and any
 * overlay is closed; write what it returns to a file and pass that file to 'record'. 'record' stores
 * artifacts/site-map/inventory/<routeId>.json and answers with the regions, components and
 * contentHash to put on the route's site-map entry, whether the page is the application at all
 * ('access'), and - when the page has elements only a reader can place - the questions for
 * 'classify'. 'shared' runs once the site map is written and names every header, navigation, footer
 * or sidebar that recurs across routes, marked up or not. 'prune' removes inventory files no route in
 * the site map refers to.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const INVENTORY_DIR = 'artifacts/site-map/inventory';
const SHARED_FILE = 'shared.json';

// A catalogue page can carry hundreds of links; past this many the record stops listing and says
// how many it left out, rather than growing without bound.
const MAX_CONTROLS = 400;
const MAX_OPTIONS = 100;
const MAX_COMPONENTS = 100;
const ROUTE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

// Regions that frame every page rather than belong to one. They are what 'shared' compares across
// routes, and a route's own components leave them out - a language switcher in the header is part
// of the frame, not a field of the page underneath it.
const FRAME_REGIONS = ['header', 'nav', 'footer', 'aside'];
const REGION_WORD = { header: 'Header', nav: 'Navigation', footer: 'Footer', aside: 'Sidebar' };

const LANDMARK_SELECTOR = [
  'header',
  'nav',
  'main',
  'footer',
  'aside',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="main"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
].join(',');

const CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  'summary',
].join(',');

const CONSTRAINT_ATTRIBUTES = [
  'required',
  'min',
  'max',
  'step',
  'minlength',
  'maxlength',
  'pattern',
  'multiple',
  'accept',
  'readonly',
];

// A control that hands the page's result to somewhere else - the clipboard, a file, a printer.
// Each is a channel a test has to check the content of, and none of them is a form field. The words
// are English; a label in any other language is put to 'classify' instead of being matched here.
const OUTPUT_PATTERN = '\\\\b(copy|export|download|print|share|save as)\\\\b';

// A link to one of these is a download, whatever its text says.
const FILE_EXTENSIONS = [
  'pdf', 'csv', 'tsv', 'xlsx', 'xls', 'ods', 'docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'txt',
  'json', 'xml', 'ics', 'zip', 'gz', 'tar', '7z', 'rar', 'epub',
];

// Embedded frames smaller than this are tracking pixels and spacer frames, not content.
const MAX_FRAMES = 20;
const MIN_FRAME_SIZE = 50;
const MAX_CANVASES = 10;
const MIN_CANVAS_SIZE = 200;
const MAX_BLOCKS = 40;

// Home-made controls: how many one page may hand over, and how many distinct ones one 'classify'
// round may ask about. A listing repeats the same element per item, so the question is asked per
// distinct element and the answer applied to every copy.
const MAX_CANDIDATES = 200;
const MAX_CLASSIFY_ITEMS = 40;
const CANDIDATE_SKIP_TAGS = [
  'html', 'head', 'body', 'main', 'header', 'footer', 'nav', 'aside', 'form', 'fieldset', 'script',
  'style', 'noscript', 'template', 'slot', 'iframe', 'frame', 'video', 'audio', 'option', 'optgroup',
];

// What 'classify' may say an element is. 'none' is decoration - a pointer cursor on a heading.
const CLASSIFY_ROLES = [
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'combobox', 'slider',
  'none',
];

// A page the server refused, answered with a bot check, or served identically at two addresses has
// little on it. Both numbers only corroborate a status code or a repeated page - on their own they
// decide nothing, because a real page can be sparse.
const THIN_CONTROLS = 5;
const THIN_TEXT = 1500;
const STUB_CONTROLS = 20;
const REFUSAL_STATUSES = [403, 429, 503];

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

// The same PII shapes scripts/generate-test-conditions.mjs masks, applied to every string the page
// handed over, since an option list or a button label can carry the signed-in user's own data: a
// run of six or more digits even when spaced or hyphenated ("4111 1111 1111 1111", "(555)
// 123-4567"), an 8+-character alphanumeric run that is mostly digits, and an email address. Runs
// are counted over letters and digits only, so a label stating a range - "(1-1000):" - survives.
const DIGIT_RUN = /\\d(?:[\\s\\-().]*\\d){5,}/g;
const MAJORITY_DIGIT_TOKEN = /[A-Za-z0-9]{8,}/g;
const EMAIL = /[\\w.+-]+@[\\w-]+\\.[\\w.-]+/g;

function isMajorityDigit(token) {
  const digits = token.replace(/[^0-9]/g, '').length;
  return digits > token.length / 2;
}

function redact(value, maxLength) {
  if (typeof value !== 'string') return '';
  const masked = value
    .replace(/\\s+/g, ' ')
    .trim()
    .replace(EMAIL, '[REDACTED]')
    .replace(DIGIT_RUN, '[REDACTED]')
    .replace(MAJORITY_DIGIT_TOKEN, function (token) {
      return isMajorityDigit(token) ? '[REDACTED]' : token;
    });
  return masked.slice(0, maxLength || 80);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Digits change between otherwise identical renders - a cart count, a page number, a date - so
// they never take part in a comparison.
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\\d+/g, '#')
    .replace(/\\s+/g, ' ')
    .trim();
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

function inventoryPathFor(routeId) {
  return INVENTORY_DIR + '/' + routeId + '.json';
}

// Runs in the page. Reads markup, labels, ARIA and option text only: never a field's value, checked
// or selected state, which can hold the signed-in user's own data.
//
// It walks open shadow roots and same-origin frames as well as the document. Playwright's CSS and
// role locators pierce open shadow roots, so a control inside one is a control a test can reach -
// and a page assembled from web components otherwise looks empty: live-observed on a government
// portal whose home page recorded zero controls while 118 sat inside shadow roots. A cross-origin
// frame cannot be read from here at all, so it is listed instead of silently missing.
function collectInventory(opts) {
  function clean(text, max) {
    return String(text || '').replace(/\\s+/g, ' ').trim().slice(0, max || 80);
  }

  function styleOf(el) {
    var view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    return view.getComputedStyle(el);
  }

  function visible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = styleOf(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  // The parent across a shadow boundary (the host) and across a same-origin frame (the frame
  // element), so "inside" means what it means on screen.
  function up(el) {
    if (el.parentElement) return el.parentElement;
    var parent = el.parentNode;
    if (parent && parent.host) return parent.host;
    if (parent && parent.nodeType === 9) {
      try {
        return (parent.defaultView && parent.defaultView.frameElement) || null;
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function closestUp(el, selector) {
    for (var node = el; node; node = up(node)) {
      if (node.nodeType === 1 && node.matches(selector)) return node;
    }
    return null;
  }

  function isInside(ancestor, el) {
    for (var node = el; node; node = up(node)) {
      if (node === ancestor) return true;
    }
    return false;
  }

  // Every element in document order, descending into an open shadow root where its host sits and
  // into a same-origin frame where the frame sits.
  var elements = [];
  var frames = [];
  var shadowRoots = 0;
  function walk(root, frameIndex, inShadow) {
    var doc = root.nodeType === 9 ? root : root.ownerDocument;
    var walker = doc.createTreeWalker(root, 1);
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      elements.push({ el: node, frame: frameIndex, shadow: inShadow });
      if (node.shadowRoot) {
        shadowRoots++;
        walk(node.shadowRoot, frameIndex, true);
      }
      var tagName = node.tagName;
      if ((tagName === 'IFRAME' || tagName === 'FRAME') && frames.length < opts.maxFrames) {
        var rect = node.getBoundingClientRect();
        if (rect.width < opts.minFrameSize || rect.height < opts.minFrameSize || !visible(node)) continue;
        var inner = null;
        try {
          inner = node.contentDocument;
        } catch (err) {
          inner = null;
        }
        var host = '';
        try {
          host = node.getAttribute('src') ? new URL(node.getAttribute('src'), doc.baseURI).hostname : '';
        } catch (err) {
          host = '';
        }
        var info = {
          index: frames.length,
          host: host,
          title: clean(node.getAttribute('title') || node.getAttribute('name'), 60),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          readable: Boolean(inner && inner.documentElement),
        };
        frames.push(info);
        if (info.readable) walk(inner, info.index, false);
      }
    }
  }
  walk(document, -1, false);

  function regionName(el) {
    var role = el.getAttribute('role');
    var map = {
      banner: 'header',
      navigation: 'nav',
      main: 'main',
      contentinfo: 'footer',
      complementary: 'aside',
      search: 'search',
    };
    if (role && map[role]) return map[role];
    return el.tagName.toLowerCase();
  }

  // aria-labelledby ids resolve inside the element's own tree - a shadow root has its own ids.
  function textOfIds(el, ids) {
    var root = el.getRootNode ? el.getRootNode() : document;
    var lookup = root && root.getElementById ? root : el.ownerDocument || document;
    return String(ids)
      .split(/\\s+/)
      .map(function (id) {
        var node = lookup.getElementById(id);
        return node ? node.textContent : '';
      })
      .join(' ');
  }

  // Close to the accessible name getByRole(..., { name }) and getByLabel match. An empty name is a
  // finding in itself: nothing but the placeholder or nearby text identifies that control.
  function accessibleName(el, tag, type) {
    var aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return clean(aria);
    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      var byIds = clean(textOfIds(el, labelledBy));
      if (byIds) return byIds;
    }
    if (el.labels && el.labels.length) {
      var labelText = clean(
        Array.prototype.map
          .call(el.labels, function (label) {
            return label.textContent;
          })
          .join(' '),
      );
      if (labelText) return labelText;
    }
    if (tag === 'input' && (type === 'submit' || type === 'button' || type === 'reset')) {
      return clean(el.getAttribute('value') || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''));
    }
    if (tag === 'input' && type === 'image') return clean(el.getAttribute('alt'));
    if (tag === 'a' || tag === 'button' || tag === 'summary' || el.getAttribute('role')) {
      var text = clean(el.textContent);
      if (text) return text;
      var img = el.querySelector('img[alt]');
      if (img) return clean(img.getAttribute('alt'));
      var svgTitle = el.querySelector('svg title');
      if (svgTitle) return clean(svgTitle.textContent);
    }
    return clean(el.getAttribute('title'));
  }

  // The text a person reads as a field's label when the markup does not say so: whatever sits just
  // before the field, or just before one of its first few wrappers - a label cell beside an input
  // cell, a caption above a wrapped input. It stops climbing once a wrapper holds a second field,
  // because past that point the text before it is a section heading, not this field's label.
  function nearbyText(el) {
    var fields = 'input, select, textarea';
    var node = el;
    for (var depth = 0; node && depth < 4; depth++) {
      var prev = node.previousElementSibling;
      if (prev && !prev.matches(fields) && !prev.querySelector(fields)) {
        var text = clean(prev.textContent, 60);
        if (text) return text;
      }
      if (depth === 0 && node.parentElement) {
        var candidate = node.parentElement.querySelector('label, legend');
        if (candidate && candidate !== el && !candidate.contains(el)) {
          var caption = clean(candidate.textContent, 60);
          if (caption) return caption;
        }
      }
      node = node.parentElement;
      if (node && node.querySelectorAll(fields).length > 1) break;
    }
    return '';
  }

  function roleOf(el, tag, type) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit.trim().split(/\\s+/)[0];
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      var byType = {
        button: 'button',
        submit: 'button',
        reset: 'button',
        image: 'button',
        checkbox: 'checkbox',
        radio: 'radio',
        range: 'slider',
        number: 'spinbutton',
        search: 'searchbox',
        email: 'textbox',
        tel: 'textbox',
        text: 'textbox',
        url: 'textbox',
        password: 'textbox',
      };
      return byType[type] || type;
    }
    if (el.isContentEditable) return 'textbox';
    return tag;
  }

  function linkTarget(el) {
    try {
      var url = new URL(el.getAttribute('href'), (el.ownerDocument || document).baseURI);
      if (url.origin === window.location.origin) return url.pathname;
      return 'external:' + url.hostname;
    } catch (err) {
      return '';
    }
  }

  // A link to a document, a spreadsheet or an archive on this site hands the page's content to a
  // file, whatever language the link text is in. One to another site is a link to someone else's
  // file - a news aggregator pointing at a paper - not something this page produced.
  function isFileLink(el) {
    try {
      var url = new URL(el.getAttribute('href'), (el.ownerDocument || document).baseURI);
      if (url.origin !== window.location.origin) return false;
      var pathname = url.pathname;
      var dot = pathname.lastIndexOf('.');
      if (dot === -1 || dot < pathname.lastIndexOf('/')) return false;
      return opts.fileExtensions.indexOf(pathname.slice(dot + 1).toLowerCase()) !== -1;
    } catch (err) {
      return false;
    }
  }

  // Landmarks come from the page itself, never from inside a frame: an embedded widget's own header
  // is not the site's header.
  var landmarkNodes = [];
  var controlItems = [];
  for (var e = 0; e < elements.length; e++) {
    if (elements[e].frame === -1 && elements[e].el.matches(opts.landmarkSelector)) landmarkNodes.push(elements[e].el);
    if (elements[e].el.matches(opts.controlSelector)) controlItems.push(elements[e]);
  }
  var topLevel = landmarkNodes.filter(function (el) {
    var parent = up(el);
    return !(parent && closestUp(parent, opts.landmarkSelector));
  });
  var landmarks = topLevel.map(function (el) {
    var name = el.getAttribute('aria-label') || '';
    if (!name && el.getAttribute('aria-labelledby')) name = textOfIds(el, el.getAttribute('aria-labelledby'));
    return { region: regionName(el), name: clean(name, 60) };
  });

  function landmarkOf(el) {
    for (var t = 0; t < topLevel.length; t++) {
      if (isInside(topLevel[t], el)) return t;
    }
    return -1;
  }

  // The page's top-level blocks: step down through wrappers that hold the whole page (a #root, an
  // .app) until a level has more than one child in normal flow, and take that level's children. A
  // site that marks up no header or footer still repeats its frame on every page, and 'shared'
  // recognises a block by that repetition alone - no markup, no words, no language involved.
  function rendered(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width * rect.height < 100) return false;
    if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
    var style = styleOf(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function childrenOf(el) {
    var list = el.shadowRoot && el.shadowRoot.children.length ? el.shadowRoot.children : el.children;
    return Array.prototype.filter.call(list, rendered);
  }
  var container = document.body;
  for (var depth = 0; container && depth < 12; depth++) {
    var inFlow = childrenOf(container).filter(function (child) {
      var position = styleOf(child).position;
      return position !== 'fixed' && position !== 'absolute';
    });
    if (inFlow.length !== 1) break;
    container = inFlow[0];
  }
  var blockNodes = container ? childrenOf(container).slice(0, opts.maxBlocks) : [];
  var blocks = blockNodes.map(function (el) {
    var rect = el.getBoundingClientRect();
    return {
      top: Math.round(rect.top + window.scrollY),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    };
  });
  function blockOf(el) {
    for (var b = 0; b < blockNodes.length; b++) {
      if (isInside(blockNodes[b], el)) return b;
    }
    return -1;
  }

  var outputPattern = new RegExp(opts.outputPattern, 'i');
  var controls = [];
  var recorded = [];
  var total = 0;
  for (var n = 0; n < controlItems.length; n++) {
    var item = controlItems[n];
    var el = item.el;
    var tag = el.tagName.toLowerCase();
    var type = tag === 'input' ? String(el.getAttribute('type') || 'text').toLowerCase() : '';
    if (type === 'hidden') continue;
    if (closestUp(el, '[aria-hidden="true"]')) continue;
    var isField = tag === 'input' || tag === 'select' || tag === 'textarea';
    // A button inside a link (or the reverse) is one control a person operates, not two.
    if (!isField && up(el) && closestUp(up(el), 'a[href], button, [role="button"], [role="link"]')) {
      continue;
    }
    recorded.push(el);
    total++;
    if (controls.length >= opts.maxControls) continue;

    var landmarkIndex = landmarkOf(el);
    var role = roleOf(el, tag, type);
    var name = accessibleName(el, tag, type);
    var entry = {
      landmark: landmarkIndex,
      region: landmarkIndex === -1 ? 'body' : landmarks[landmarkIndex].region,
      role: role,
      name: name,
      tag: tag,
    };
    if (type) entry.type = type;
    var blockIndex = blockOf(el);
    if (blockIndex !== -1) entry.block = blockIndex;
    if (item.shadow) entry.inShadow = true;
    if (item.frame !== -1) entry.frame = item.frame;
    if (!name) {
      var hint = nearbyText(el);
      if (hint) entry.hint = hint;
    }
    if (!visible(el)) entry.hidden = true;
    var testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
    if (testId) entry.testId = clean(testId, 60);
    if (isField) {
      var constraints = {};
      var hasConstraint = false;
      for (var a = 0; a < opts.constraintAttributes.length; a++) {
        var attr = opts.constraintAttributes[a];
        if (!el.hasAttribute(attr)) continue;
        var raw = el.getAttribute(attr);
        constraints[attr] = raw === '' ? true : clean(raw, 60);
        hasConstraint = true;
      }
      if (hasConstraint) entry.constraints = constraints;
      var placeholder = el.getAttribute('placeholder');
      if (placeholder) entry.placeholder = clean(placeholder, 60);
      if (el.disabled) entry.disabled = true;
      if ((type === 'radio' || type === 'checkbox') && el.getAttribute('name')) {
        entry.group = clean(el.getAttribute('name'), 60);
      }
    }
    if (tag === 'select') {
      var options = Array.prototype.slice.call(el.options);
      entry.optionCount = options.length;
      entry.options = options.slice(0, opts.maxOptions).map(function (option) {
        return clean(option.textContent, 60);
      });
    }
    if (tag === 'a') {
      entry.href = linkTarget(el);
      if (el.hasAttribute('download') || isFileLink(el)) entry.output = true;
    }
    // clipboard.js wiring and an inline print/clipboard handler name the channel in code, not in
    // the label, so they hold in any language.
    if (
      el.hasAttribute('data-clipboard-text') ||
      el.hasAttribute('data-clipboard-target') ||
      /print\\(|clipboard/i.test(el.getAttribute('onclick') || '')
    ) {
      entry.output = true;
    }
    if ((role === 'button' || role === 'link' || role === 'menuitem') && outputPattern.test(name)) {
      entry.output = true;
    }
    controls.push(entry);
  }

  // Elements that behave like controls - a pointer cursor, a click handler in the markup, a place in
  // the keyboard order - but are none of the controls above: a calculator's keys drawn as spans, a
  // tab strip made of divs. Only the outermost such element counts, since the cursor is inherited,
  // and never one that holds a recorded control or sits inside one - that control already stands for
  // it. What each one is gets decided by 'classify', never guessed here.
  var holdsControl = new Set();
  for (var h = 0; h < recorded.length; h++) {
    for (var ancestor = up(recorded[h]); ancestor && !holdsControl.has(ancestor); ancestor = up(ancestor)) {
      holdsControl.add(ancestor);
    }
  }
  var skip = opts.candidateSkipTags;
  var avoid = opts.controlSelector + ', label, [aria-hidden="true"]';
  var candidates = [];
  var candidateTotal = 0;
  var canvases = [];
  for (var k = 0; k < elements.length; k++) {
    var node = elements[k].el;
    var nodeTag = node.tagName.toLowerCase();
    if (nodeTag === 'canvas' && canvases.length < opts.maxCanvases) {
      var canvasRect = node.getBoundingClientRect();
      if (canvasRect.width >= opts.minCanvasSize && canvasRect.height >= opts.minCanvasSize && visible(node)) {
        canvases.push({
          width: Math.round(canvasRect.width),
          height: Math.round(canvasRect.height),
          label: clean(node.getAttribute('aria-label') || node.getAttribute('title'), 60),
        });
      }
      continue;
    }
    if (holdsControl.has(node) || skip.indexOf(nodeTag) !== -1) continue;
    if (node.namespaceURI === 'http://www.w3.org/2000/svg' && nodeTag !== 'svg') continue;
    var onclick = node.hasAttribute('onclick');
    var tabindex = node.getAttribute('tabindex');
    var focusable = tabindex !== null && tabindex !== '' && Number(tabindex) >= 0;
    var nodeStyle = styleOf(node);
    var pointer = nodeStyle.cursor === 'pointer';
    if (!pointer && !onclick && !focusable) continue;
    if (pointer && !onclick && !focusable) {
      var parentNode = up(node);
      if (parentNode && parentNode.nodeType === 1 && styleOf(parentNode).cursor === 'pointer') continue;
    }
    if (closestUp(node, avoid)) continue;
    var nodeRect = node.getBoundingClientRect();
    if (nodeRect.width < 8 || nodeRect.height < 8) continue;
    if (nodeStyle.visibility === 'hidden' || nodeStyle.display === 'none' || Number(nodeStyle.opacity) === 0) continue;
    candidateTotal++;
    if (candidates.length >= opts.maxCandidates) continue;
    var candidate = {
      tag: nodeTag,
      text: clean(node.textContent, 60),
      label: clean(node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('alt'), 60),
      classHint: clean(String(node.getAttribute('class') || '').split(/\\s+/).slice(0, 3).join(' '), 60),
      signals: [pointer ? 'pointer' : '', onclick ? 'onclick' : '', focusable ? 'tabindex' : '']
        .filter(Boolean)
        .join(' '),
      landmark: landmarkOf(node),
    };
    var candidateBlock = blockOf(node);
    if (candidateBlock !== -1) candidate.block = candidateBlock;
    if (elements[k].shadow) candidate.inShadow = true;
    if (elements[k].frame !== -1) candidate.frame = elements[k].frame;
    candidates.push(candidate);
  }

  return {
    title: clean(document.title, 200),
    path: window.location.pathname,
    lang: clean(document.documentElement.getAttribute('lang'), 20),
    landmarks: landmarks,
    controls: controls,
    totalControls: total,
    candidates: candidates,
    candidateTotal: candidateTotal,
    blocks: blocks,
    frames: frames,
    canvases: canvases,
    shadowRoots: shadowRoots,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    textLength: document.body ? String(document.body.innerText || '').length : 0,
  };
}

function cmdProbe() {
  return {
    action: 'probe',
    options: {
      landmarkSelector: LANDMARK_SELECTOR,
      controlSelector: CONTROL_SELECTOR,
      constraintAttributes: CONSTRAINT_ATTRIBUTES,
      maxControls: MAX_CONTROLS,
      maxOptions: MAX_OPTIONS,
      outputPattern: OUTPUT_PATTERN,
      fileExtensions: FILE_EXTENSIONS,
      maxFrames: MAX_FRAMES,
      minFrameSize: MIN_FRAME_SIZE,
      maxCanvases: MAX_CANVASES,
      minCanvasSize: MIN_CANVAS_SIZE,
      maxBlocks: MAX_BLOCKS,
      maxCandidates: MAX_CANDIDATES,
      candidateSkipTags: CANDIDATE_SKIP_TAGS,
    },
    source: collectInventory.toString(),
    usage:
      'Evaluate source with options in the page (page.evaluate) once the navigation has settled and ' +
      'any overlay is closed, write the result to a file, and pass it to "record" with the ' +
      'navigation status (--status) and the response cf-mitigated header when there is one ' +
      '(--mitigated). Take regions, components and contentHash for the route entry from what ' +
      '"record" (or, after it, "classify") returns - never compose them yourself.',
  };
}

function isLink(control) {
  return control.role === 'link';
}

// "<role> "<name>"" - the form a Page Object author reads and getByRole matches. A control with no
// accessible name says so and carries whatever text sits next to it. One 'classify' added has that
// role only in the inventory, not in the page's markup, so getByRole cannot find it - the label says
// so, since it is the one line a Page Object author is sure to read.
function componentLabel(control) {
  const suffix = control.classifiedBy === 'assistant' ? ' [no role in markup]' : '';
  if (control.name) return control.role + ' "' + control.name + '"' + suffix;
  return (
    control.role + ' (no accessible name' + (control.hint ? ', next to "' + control.hint + '"' : '') + ')' + suffix
  );
}

// Structure only, never names: the crawl budget stops a route template once three pages under it
// hash alike, which is how a pagination chain or an infinite feed gets caught early. Page two of a
// catalogue lists different product names from page one, so a hash over names would never repeat
// and the trap would run to the page ceiling.
function structuralHash(title, regions, controls) {
  const shape = controls
    .map(function (control) {
      return [control.region, control.role, control.type || '', control.hidden ? 'hidden' : ''].join('|');
    })
    .sort();
  return sha256([normalizeText(title), regions.join(','), shape.join('\\n')].join('\\n'));
}

// Names do count here: a region is shared when the same controls with the same labels sit in it,
// which is what makes it one widget rather than two regions that happen to hold links.
function regionFingerprint(region, controls) {
  const signatures = Array.from(
    new Set(
      controls.map(function (control) {
        return [control.role, control.type || '', normalizeText(control.name)].join('|');
      }),
    ),
  ).sort();
  return sha256(region + '\\n' + signatures.join('\\n')).slice(0, 16);
}

// Crawl-wide side files, next to the per-route inventories. Their names start with a dot so that
// 'prune', which removes files no route refers to, never mistakes them for a route.
const IDENTITY_FILE = '.identities.json';
const CLASSIFICATION_FILE = '.classifications.json';

// The tallest block holding controls is the page's own content and never part of the frame. A
// header sits before it and starts near the top, a footer comes after it, a sidebar is narrow and at
// least as tall as it is wide.
const TOP_BAND = 250;

// A block found only by repetition becomes part of the site frame once it recurs on this share of
// the compared routes (and on two at the least). A landmark says "I am the header" in markup; a
// block has only its recurrence to go on, so it has to recur widely - two product pages sharing a
// "related items" strip is not a footer.
const IMPLICIT_FRAME_SHARE = 0.3;

const FIELD_TAGS = ['input', 'select', 'textarea'];
const ASSISTANT_FIELD_ROLES = ['checkbox', 'radio', 'switch', 'combobox', 'slider'];

function sideFile(name) {
  return path.join(CWD, INVENTORY_DIR, name);
}

function writeSideFile(name, data) {
  fs.mkdirSync(path.join(CWD, INVENTORY_DIR), { recursive: true });
  fs.writeFileSync(sideFile(name), JSON.stringify(data, null, 2) + '\\n', 'utf8');
}

function writeInventory(relativePath, record) {
  fs.mkdirSync(path.join(CWD, INVENTORY_DIR), { recursive: true });
  fs.writeFileSync(path.join(CWD, relativePath), JSON.stringify(record, null, 2) + '\\n', 'utf8');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function whole(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : 0;
}

// Two addresses served the same document when title, every control with its label, and the amount
// of text all match. Names are in on purpose, unlike the structural hash: two pages of one listing
// share structure, but only a block page or a picker shown at every address shares every label.
function pageIdentity(title, controls, textLength) {
  const names = controls
    .map(function (control) {
      return [control.role, control.type || '', normalizeText(control.name)].join('|');
    })
    .sort();
  return sha256([title, String(textLength), names.join('\\n')].join('\\n')).slice(0, 24);
}

// Whether this page is the application at all. Each verdict rests on something the server or the
// page states, never on words in a language: a bot-check header, a refusal status on a page with
// next to nothing on it, or the identical page already recorded at another address.
function accessVerdict(input) {
  const visibleControls = input.controls.filter(function (control) {
    return !control.hidden;
  }).length;
  const thin = visibleControls <= THIN_CONTROLS && (input.textLength === null || input.textLength <= THIN_TEXT);
  // The header marks the response, not what the browser ended up showing: a check the browser
  // passes on its own reloads into the real page. Live-observed on Stack Overflow - challenged,
  // then 243 controls of the real site three seconds later.
  if (input.mitigated === 'challenge' && thin) {
    return {
      state: 'challenge',
      reason: 'The server answered with a bot check (cf-mitigated: challenge) and the page is still the check, not the application.',
    };
  }
  const refusal = input.status !== null && REFUSAL_STATUSES.indexOf(input.status) !== -1;
  const index = readJson(sideFile(IDENTITY_FILE)) || {};
  const other = index[input.identity];
  let verdict = { state: 'ok' };
  let stale = !other || typeof other.routeId !== 'string' || !ROUTE_ID_RE.test(other.routeId);
  if (!stale && other.routeId !== input.routeId) {
    const otherRecord = readJson(path.join(CWD, inventoryPathFor(other.routeId)));
    if (!otherRecord || otherRecord.identity !== input.identity) {
      stale = true;
    } else if (other.route !== input.routePath && visibleControls <= STUB_CONTROLS) {
      verdict = {
        state: 'stub',
        sameAs: other.route,
        reason:
          'Identical to ' +
          other.route +
          ' - same title, same controls, same labels, same amount of text. Either the site served one ' +
          'page at two different addresses (a block page, a country or language picker, a sign-in ' +
          'screen shown everywhere), or these two addresses really are one page.',
      };
      if (refusal) verdict.status = input.status;
    }
  }
  if (stale) {
    index[input.identity] = { routeId: input.routeId, route: input.routePath };
    writeSideFile(IDENTITY_FILE, index);
  }
  if (verdict.state === 'ok' && refusal && thin) {
    return {
      state: 'refused',
      status: input.status,
      reason:
        'The server answered ' +
        input.status +
        ' with a near-empty page (' +
        visibleControls +
        ' visible control(s)) - a refusal or block page, not the application.',
    };
  }
  return verdict;
}

// A block stands in for a header, footer or sidebar only where the page marks up none: on a page
// with a real <header>, the strip above it is a cookie banner or a promo bar, not a second header.
// Live-observed on GOV.UK, whose consent banner was otherwise named "Header" beside the real one.
const REGION_AT = { top: 'header', bottom: 'footer', side: 'aside' };

function describeBlocks(observation, controls, regions) {
  const raw = Array.isArray(observation.blocks) ? observation.blocks.slice(0, MAX_BLOCKS) : [];
  const viewportWidth =
    isObject(observation.viewport) && Number(observation.viewport.width) > 0 ? Number(observation.viewport.width) : 1280;
  const holding = [];
  raw.forEach(function (block, index) {
    if (
      controls.some(function (control) {
        return control.block === index;
      })
    ) {
      holding.push(index);
    }
  });
  let content = -1;
  for (const index of holding) {
    if (content === -1 || whole(raw[index] && raw[index].height) > whole(raw[content] && raw[content].height)) {
      content = index;
    }
  }
  return raw.map(function (block, index) {
    const top = whole(block && block.top);
    const height = whole(block && block.height);
    const width = whole(block && block.width);
    // Controls already inside a marked-up header, nav, footer or sidebar are left out, so a block and
    // a landmark never both claim the same header.
    const inside = controls.filter(function (control) {
      return control.block === index && FRAME_REGIONS.indexOf(control.region) === -1;
    });
    let position = 'middle';
    if (holding.length >= 2 && holding.indexOf(index) !== -1 && index !== content) {
      if (width <= viewportWidth * 0.35 && height >= width) position = 'side';
      else if (index < content && top <= TOP_BAND) position = 'top';
      else if (index > content) position = 'bottom';
    }
    return {
      position: position,
      candidate: Boolean(REGION_AT[position]) && regions.indexOf(REGION_AT[position]) === -1 && inside.length >= 2,
      top: top,
      height: height,
      width: width,
      controlCount: inside.length,
      fingerprint: inside.length > 0 ? regionFingerprint('block', inside) : null,
    };
  });
}

function readFrames(observation) {
  if (!Array.isArray(observation.frames)) return [];
  return observation.frames
    .filter(isObject)
    .slice(0, MAX_FRAMES)
    .map(function (frame, index) {
      return {
        index: Number.isInteger(frame.index) ? frame.index : index,
        host: redact(frame.host, 120),
        title: redact(frame.title, 60),
        width: whole(frame.width),
        height: whole(frame.height),
        readable: frame.readable === true,
      };
    });
}

function readCanvases(observation) {
  if (!Array.isArray(observation.canvases)) return [];
  return observation.canvases
    .filter(isObject)
    .slice(0, MAX_CANVASES)
    .map(function (canvas) {
      return { width: whole(canvas.width), height: whole(canvas.height), label: redact(canvas.label, 60) };
    });
}

function readCandidates(observation, landmarks) {
  if (!Array.isArray(observation.candidates)) return [];
  return observation.candidates
    .filter(isObject)
    .slice(0, MAX_CANDIDATES)
    .map(function (raw) {
      const landmarkIndex = Number.isInteger(raw.landmark) && landmarks[raw.landmark] ? raw.landmark : -1;
      const candidate = {
        tag: redact(raw.tag, 20) || 'element',
        text: redact(raw.text, 60),
        label: redact(raw.label, 60),
        classHint: redact(raw.classHint, 60),
        signals: redact(raw.signals, 40),
        landmark: landmarkIndex,
        region: landmarkIndex === -1 ? 'body' : landmarks[landmarkIndex].region,
      };
      if (Number.isInteger(raw.block) && raw.block >= 0) candidate.block = raw.block;
      if (raw.inShadow === true) candidate.inShadow = true;
      if (Number.isInteger(raw.frame) && raw.frame >= 0) candidate.frame = raw.frame;
      return candidate;
    });
}

// Copies of one element on a listing - every "Add" span, every calculator digit - are one question.
function candidateKey(candidate) {
  return [candidate.tag, normalizeText(candidate.text), normalizeText(candidate.label)].join('|');
}

function outputKey(control) {
  return control.role + '|' + normalizeText(control.name);
}

// The output words are English, so a page in any other language gets its labelled buttons asked
// about instead. A page that declares no language counts as non-English when a good share of its
// labels carry letters outside ASCII - one or two would be a language picker ("Español",
// "Deutsch") on an English page, live-observed on Craigslist.
const NON_ASCII_SHARE = 0.3;
const MAX_OUTPUT_ITEMS = 20;

function looksNonEnglish(lang, controls) {
  if (lang) return !/^en(-|$)/i.test(lang);
  const named = controls.filter(function (control) {
    return control.name;
  });
  if (named.length === 0) return false;
  const foreign = named.filter(function (control) {
    return /[^\\u0000-\\u007f]/.test(control.name);
  });
  return foreign.length / named.length >= NON_ASCII_SHARE;
}

function nextControlId(record) {
  let max = -1;
  for (const control of record.controls) {
    const number = Number.parseInt(String(control.id).slice(1), 10);
    if (Number.isFinite(number) && number > max) max = number;
  }
  return 'c' + (max + 1);
}

function controlFromCandidate(candidate, role, output, id) {
  const control = {
    id: id,
    landmark: candidate.landmark,
    region: candidate.region,
    role: role,
    name: candidate.label || candidate.text,
    tag: candidate.tag,
    classifiedBy: 'assistant',
  };
  if (!control.name && candidate.classHint) control.hint = candidate.classHint;
  if (Number.isInteger(candidate.block)) control.block = candidate.block;
  if (candidate.inShadow) control.inShadow = true;
  if (Number.isInteger(candidate.frame)) control.frame = candidate.frame;
  if (output) {
    control.output = true;
    control.outputBy = 'assistant';
  }
  return control;
}

// Builds this route's questions and applies every answer this crawl has already given - the same
// "Add to cart" span on forty routes is asked about once.
function buildClassification(record, cache) {
  const known = isObject(cache.controls) ? cache.controls : {};
  const knownOutputs = isObject(cache.outputs) ? cache.outputs : {};
  const items = [];
  let overflow = 0;
  const groups = new Map();
  record.candidates.forEach(function (candidate, index) {
    const key = candidateKey(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  let controlItems = 0;
  for (const [key, members] of groups) {
    const answer = Object.prototype.hasOwnProperty.call(known, key) ? known[key] : null;
    if (answer && CLASSIFY_ROLES.indexOf(answer.role) !== -1) {
      if (answer.role === 'none') continue;
      for (const member of members) {
        record.controls.push(
          controlFromCandidate(record.candidates[member], answer.role, answer.output === true, nextControlId(record)),
        );
      }
      continue;
    }
    if (items.length >= MAX_CLASSIFY_ITEMS) {
      overflow++;
      continue;
    }
    const first = record.candidates[members[0]];
    const examples = Array.from(
      new Set(
        members
          .map(function (member) {
            return record.candidates[member].label || record.candidates[member].text;
          })
          .filter(Boolean),
      ),
    ).slice(0, 5);
    items.push({
      id: 'k' + ++controlItems,
      kind: 'control',
      key: key,
      tag: first.tag,
      text: first.text,
      label: first.label,
      classHint: first.classHint,
      signals: first.signals,
      where: first.region,
      count: members.length,
      examples: examples,
      members: members,
    });
  }

  if (looksNonEnglish(record.lang, record.controls)) {
    const byName = new Map();
    for (const control of record.controls) {
      if (control.output || control.classifiedBy === 'assistant') continue;
      if ((control.role !== 'button' && control.role !== 'menuitem') || !control.name) continue;
      // The site frame's buttons are menus and switchers far more often than exports, and they
      // repeat on every route; the page's own buttons are where its result gets handed over.
      if (FRAME_REGIONS.indexOf(control.region) !== -1) continue;
      const key = outputKey(control);
      if (Object.prototype.hasOwnProperty.call(knownOutputs, key)) {
        if (knownOutputs[key] === true) {
          control.output = true;
          control.outputBy = 'assistant';
        }
        continue;
      }
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(control.id);
    }
    let outputItems = 0;
    for (const [key, members] of byName) {
      if (items.length >= MAX_CLASSIFY_ITEMS || outputItems >= MAX_OUTPUT_ITEMS) {
        overflow++;
        continue;
      }
      const control = record.controls.find(function (candidate) {
        return candidate.id === members[0];
      });
      items.push({
        id: 'o' + ++outputItems,
        kind: 'output',
        key: key,
        role: control.role,
        name: control.name,
        where: control.region,
        count: members.length,
        members: members,
      });
    }
  }
  return { items: items, overflow: overflow };
}

function classifyQuestion(record) {
  const pending = record.pendingClassification;
  if (!pending || !Array.isArray(pending.items) || pending.items.length === 0) return null;
  return {
    items: pending.items.map(function (item) {
      if (item.kind === 'control') {
        return {
          id: item.id,
          kind: item.kind,
          tag: item.tag,
          text: item.text,
          label: item.label,
          classHint: item.classHint,
          signals: item.signals,
          where: item.where,
          count: item.count,
          examples: item.examples,
        };
      }
      return { id: item.id, kind: item.kind, role: item.role, name: item.name, where: item.where, count: item.count };
    }),
    roles: CLASSIFY_ROLES,
    answerFormat: '{"k1": "button", "k2": "none", "k3": {"role": "button", "output": true}, "o1": true, "o2": false}',
    command: 'node scripts/page-inventory.mjs classify --route-id=' + record.routeId + ' --answers=<file>',
    instruction:
      'Answer every item in one JSON object, then run command. A "control" item reacts to the pointer ' +
      'or the keyboard but is marked up as none of the standard controls: from its text, label, tag, ' +
      'class hint and where it sits, say what it is to a person using the page - one of roles - or ' +
      '"none" for decoration (a pointer cursor on a heading, a card that leads nowhere). Add ' +
      '"output": true when pressing it copies, downloads, prints or shares what the page produced. An ' +
      '"output" item is a labelled control whose label is not English: answer true when pressing it ' +
      'copies, downloads, prints or shares what the page produced, false otherwise. Judge only from ' +
      'what the item shows, and when you cannot tell, answer "none" or false - a control left out is a ' +
      'gap the run summary reports, a control invented is a test of something that does not exist.',
    overflow: pending.overflow || 0,
  };
}

function isFieldControl(control) {
  if (FIELD_TAGS.indexOf(control.tag) !== -1) return true;
  return control.classifiedBy === 'assistant' && ASSISTANT_FIELD_ROLES.indexOf(control.role) !== -1;
}

// What the route entry and the run summary need, from whatever the inventory holds right now.
function summarize(record) {
  const controls = record.controls;
  const own = controls.filter(function (control) {
    return FRAME_REGIONS.indexOf(control.region) === -1 && !isLink(control);
  });
  const marked = controls.filter(function (control) {
    return control.classifiedBy !== 'assistant';
  });
  const counts = {
    controls: controls.length,
    fields: controls.filter(isFieldControl).length,
    buttons: controls.filter(function (control) {
      return control.role === 'button';
    }).length,
    links: controls.filter(isLink).length,
    outputs: controls.filter(function (control) {
      return control.output === true;
    }).length,
    unnamedFields: own.filter(function (control) {
      return !control.name && isFieldControl(control);
    }).length,
    byAssistant: controls.filter(function (control) {
      return control.classifiedBy === 'assistant' || control.outputBy === 'assistant';
    }).length,
    shadowControls: controls.filter(function (control) {
      return control.inShadow === true;
    }).length,
    frameControls: controls.filter(function (control) {
      return Number.isInteger(control.frame);
    }).length,
    candidates: record.candidateTotal || 0,
  };

  const warnings = [];
  if (record.access && record.access.state !== 'ok') warnings.push(record.access.reason);
  const totalControls = Number.isInteger(record.totalControls) ? record.totalControls : marked.length;
  if (totalControls > marked.length) {
    warnings.push(
      (totalControls - marked.length) +
        ' control(s) beyond the first ' +
        marked.length +
        ' were not recorded - this page is a listing, and its first ' +
        marked.length +
        ' controls are its shape.',
    );
  }
  if (own.length > MAX_COMPONENTS) {
    warnings.push(
      'components lists the first ' + MAX_COMPONENTS + ' of ' + own.length + ' controls; the inventory file has all of them.',
    );
  }
  if (counts.unnamedFields > 0) {
    warnings.push(
      counts.unnamedFields +
        ' form field(s) have no accessible name, so getByLabel cannot reach them and getByRole only without a name - worth knowing before Page Objects are written.',
    );
  }
  const unreadable = (record.frames || []).filter(function (frame) {
    return !frame.readable;
  });
  if (unreadable.length > 0) {
    warnings.push(
      unreadable.length +
        ' embedded frame(s) from another site (' +
        Array.from(
          new Set(
            unreadable.map(function (frame) {
              return frame.host || 'no address';
            }),
          ),
        )
          .slice(0, 5)
          .join(', ') +
        ') could not be read, so nothing inside them is in this inventory. A test reaches one through ' +
        'frameLocator; say in the run summary whether it is part of this application (a payment or ' +
        'sign-in form) or someone else (an ad, a map, a video).',
    );
  }
  if ((record.canvases || []).length > 0) {
    warnings.push(
      record.canvases.length +
        ' drawing surface(s) (canvas ' +
        record.canvases
          .map(function (canvas) {
            return canvas.width + 'x' + canvas.height;
          })
          .join(', ') +
        '): what is drawn there is pixels, not elements, so nothing inside is in this inventory and no ' +
        'locator can reach it - worth one line in the run summary.',
    );
  }
  const pending = record.pendingClassification;
  if (pending && Array.isArray(pending.items) && pending.items.length > 0) {
    warnings.push(
      pending.items.length +
        ' element(s) on this page need an answer before the route is committed - see "classify".',
    );
  }
  if (pending && pending.overflow > 0) {
    warnings.push(
      pending.overflow +
        ' further distinct element(s) were past this round and stay out of the inventory - the page ' +
        'has more home-made controls than one question should carry.',
    );
  }
  return {
    components: own.slice(0, MAX_COMPONENTS).map(componentLabel),
    counts: counts,
    warnings: warnings,
  };
}

function cmdRecord(args) {
  const routePath = typeof args.route === 'string' ? args.route : null;
  const routeId = typeof args['route-id'] === 'string' ? args['route-id'] : null;
  if (!routePath) fail('record', 'missing --route=<canonicalPath>');
  if (!routeId || !ROUTE_ID_RE.test(routeId)) {
    fail('record', 'missing or malformed --route-id - it must match ^[a-zA-Z0-9_-]+$ like every routeId');
  }
  if (typeof args.observation !== 'string') fail('record', 'missing --observation=<file>');
  const observation = readJson(path.resolve(CWD, args.observation));
  if (!observation || typeof observation !== 'object') {
    fail('record', 'could not read --observation as JSON - write exactly what the probe returned');
  }
  const status = args.status === undefined ? null : Number.parseInt(String(args.status), 10);
  const mitigated = typeof args.mitigated === 'string' ? args.mitigated.trim().toLowerCase() : '';
  if (!Array.isArray(observation.controls) || !Array.isArray(observation.landmarks)) {
    fail('record', 'the observation has no controls/landmarks arrays - it is not the probe result');
  }

  const landmarks = observation.landmarks.map(function (landmark) {
    return {
      region: redact(landmark && landmark.region, 20) || 'region',
      name: redact(landmark && landmark.name, 60),
    };
  });
  // The id is what a later stage cites a control by ("parameter count is c4"). It is the control's
  // position in this recording, so it holds exactly as long as the recording does - which is why a
  // stage citing it also records the contentHash it read.
  const controls = observation.controls.slice(0, MAX_CONTROLS).map(function (raw, index) {
    const landmarkIndex = Number.isInteger(raw.landmark) && landmarks[raw.landmark] ? raw.landmark : -1;
    const control = {
      id: 'c' + index,
      landmark: landmarkIndex,
      region: landmarkIndex === -1 ? 'body' : landmarks[landmarkIndex].region,
      role: redact(raw.role, 30) || 'unknown',
      name: redact(raw.name, 80),
      tag: redact(raw.tag, 20),
    };
    if (raw.type) control.type = redact(raw.type, 20);
    if (raw.hint) control.hint = redact(raw.hint, 60);
    if (raw.hidden === true) control.hidden = true;
    if (raw.testId) control.testId = redact(raw.testId, 60);
    if (raw.constraints && typeof raw.constraints === 'object') {
      const constraints = {};
      for (const key of CONSTRAINT_ATTRIBUTES) {
        if (!(key in raw.constraints)) continue;
        constraints[key] = raw.constraints[key] === true ? true : redact(String(raw.constraints[key]), 60);
      }
      if (Object.keys(constraints).length > 0) control.constraints = constraints;
    }
    if (raw.placeholder) control.placeholder = redact(raw.placeholder, 60);
    if (raw.disabled === true) control.disabled = true;
    if (raw.group) control.group = redact(raw.group, 60);
    if (Array.isArray(raw.options)) {
      control.options = raw.options.slice(0, MAX_OPTIONS).map(function (option) {
        return redact(option, 60);
      });
      control.optionCount = Number.isInteger(raw.optionCount) ? raw.optionCount : control.options.length;
    }
    if (raw.href) control.href = redact(raw.href, 120);
    if (raw.output === true) control.output = true;
    if (Number.isInteger(raw.block) && raw.block >= 0) control.block = raw.block;
    if (raw.inShadow === true) control.inShadow = true;
    if (Number.isInteger(raw.frame) && raw.frame >= 0) control.frame = raw.frame;
    return control;
  });

  const title = redact(observation.title, 200);
  const regions = Array.from(
    new Set(
      landmarks.map(function (landmark) {
        return landmark.region;
      }),
    ),
  ).sort();

  const landmarkRecords = landmarks.map(function (landmark, index) {
    const inside = controls.filter(function (control) {
      return control.landmark === index;
    });
    return {
      region: landmark.region,
      name: landmark.name,
      fingerprint: regionFingerprint(landmark.region, inside),
      controlCount: inside.length,
    };
  });

  // Both the hash and the identity are taken over what the page itself marks up, before any control
  // 'classify' adds: an answer given later in the crawl must not change what an earlier pass hashed.
  const contentHash = structuralHash(title, regions, controls);
  const totalControls = Number.isInteger(observation.totalControls) ? observation.totalControls : controls.length;
  const textLength = Number.isInteger(observation.textLength) ? observation.textLength : null;
  const identity = pageIdentity(title, controls, textLength);
  const access = accessVerdict({
    status: Number.isFinite(status) ? status : null,
    mitigated: mitigated,
    controls: controls,
    textLength: textLength,
    identity: identity,
    routeId: routeId,
    routePath: routePath,
  });

  const record = {
    schemaVersion: 1,
    routeId: routeId,
    route: routePath,
    title: title,
    lang: redact(observation.lang, 20),
    recordedAt: new Date().toISOString(),
    contentHash: contentHash,
    identity: identity,
    access: access,
    landmarks: landmarkRecords,
    blocks: describeBlocks(observation, controls, regions),
    controls: controls,
    totalControls: totalControls,
    frames: readFrames(observation),
    canvases: readCanvases(observation),
    shadowRoots: Number.isInteger(observation.shadowRoots) ? observation.shadowRoots : 0,
    candidates: readCandidates(observation, landmarks),
    candidateTotal: Number.isInteger(observation.candidateTotal) ? observation.candidateTotal : 0,
  };
  const cache = readJson(sideFile(CLASSIFICATION_FILE)) || { controls: {}, outputs: {} };
  const pending = buildClassification(record, cache);
  if (pending.items.length > 0) record.pendingClassification = pending;
  const relativePath = inventoryPathFor(routeId);
  writeInventory(relativePath, record);

  const summary = summarize(record);
  return {
    action: 'record',
    ok: true,
    routeId: routeId,
    title: title,
    regions: regions,
    components: summary.components,
    contentHash: contentHash,
    inventory: relativePath,
    access: access,
    counts: summary.counts,
    classify: classifyQuestion(record),
    warnings: summary.warnings,
  };
}

// Answers the questions 'record' put on a route: what each home-made control is, and whether a
// control in another language hands the page's result somewhere. Every answer is checked against
// the list that was asked - an id nobody asked about, a missing answer or a role outside the fixed
// list rejects the whole reply and changes nothing. The name of every control added is the
// element's own text or label, never words from the answer.
function cmdClassify(args) {
  const routeId = typeof args['route-id'] === 'string' ? args['route-id'] : null;
  if (!routeId || !ROUTE_ID_RE.test(routeId)) fail('classify', 'missing or malformed --route-id');
  if (typeof args.answers !== 'string') fail('classify', 'missing --answers=<file>');
  const relativePath = inventoryPathFor(routeId);
  const record = readJson(path.join(CWD, relativePath));
  if (!record || !Array.isArray(record.controls)) {
    fail('classify', 'no inventory for route-id ' + routeId + ' - run "record" first');
  }
  const pending = record.pendingClassification;
  if (!pending || !Array.isArray(pending.items) || pending.items.length === 0) {
    fail('classify', 'nothing on this route is waiting for an answer');
  }
  const answers = readJson(path.resolve(CWD, args.answers));
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    fail('classify', '--answers must be a JSON object keyed by item id, e.g. {"k1": "button", "o1": false}');
  }

  const ids = pending.items.map(function (item) {
    return item.id;
  });
  const errors = [];
  const decisions = [];
  for (const key of Object.keys(answers)) {
    if (ids.indexOf(key) === -1) errors.push('"' + key + '" was not asked about - the items are ' + ids.join(', '));
  }
  for (const item of pending.items) {
    const answer = answers[item.id];
    if (answer === undefined || answer === null) {
      errors.push(item.id + ' has no answer - every item needs one, "none" included');
      continue;
    }
    if (item.kind === 'control') {
      const role = typeof answer === 'string' ? answer : typeof answer === 'object' ? answer.role : null;
      const output = typeof answer === 'object' && answer.output === true;
      if (CLASSIFY_ROLES.indexOf(role) === -1) {
        errors.push(item.id + ': "' + role + '" is not one of ' + CLASSIFY_ROLES.join(', '));
        continue;
      }
      if (role === 'none' && output) {
        errors.push(item.id + ': decoration hands nothing over - give it a role, or drop "output"');
        continue;
      }
      decisions.push({ item: item, role: role, output: output });
    } else {
      const output =
        typeof answer === 'boolean'
          ? answer
          : typeof answer === 'object' && typeof answer.output === 'boolean'
            ? answer.output
            : null;
      if (output === null) {
        errors.push(item.id + ': answer true or false');
        continue;
      }
      decisions.push({ item: item, output: output });
    }
  }
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ action: 'classify', ok: false, errors: errors }, null, 2) + '\\n');
    process.exit(1);
  }

  const cache = readJson(sideFile(CLASSIFICATION_FILE)) || { controls: {}, outputs: {} };
  if (!cache.controls) cache.controls = {};
  if (!cache.outputs) cache.outputs = {};
  let added = 0;
  let marked = 0;
  for (const decision of decisions) {
    const item = decision.item;
    if (item.kind === 'control') {
      cache.controls[item.key] = decision.output ? { role: decision.role, output: true } : { role: decision.role };
      if (decision.role === 'none') continue;
      for (const member of item.members) {
        const candidate = record.candidates[member];
        if (!candidate) continue;
        record.controls.push(controlFromCandidate(candidate, decision.role, decision.output, nextControlId(record)));
        added++;
      }
    } else {
      cache.outputs[item.key] = decision.output;
      if (!decision.output) continue;
      for (const id of item.members) {
        const control = record.controls.find(function (candidate) {
          return candidate.id === id;
        });
        if (!control) continue;
        control.output = true;
        control.outputBy = 'assistant';
        marked++;
      }
    }
  }
  record.assistantDecisions = (record.assistantDecisions || []).concat(
    decisions.map(function (decision) {
      const entry = {
        kind: decision.item.kind,
        text: decision.item.kind === 'control' ? decision.item.label || decision.item.text : decision.item.name,
        count: decision.item.count,
      };
      if (decision.role) entry.role = decision.role;
      if (decision.output !== undefined) entry.output = decision.output;
      return entry;
    }),
  );
  delete record.pendingClassification;
  writeInventory(relativePath, record);
  writeSideFile(CLASSIFICATION_FILE, cache);

  const summary = summarize(record);
  return {
    action: 'classify',
    ok: true,
    routeId: routeId,
    added: added,
    outputsMarked: marked,
    components: summary.components,
    counts: summary.counts,
    warnings: summary.warnings,
  };
}

function pascalWords(text) {
  return String(text || '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

function widgetName(region, landmarkName, used) {
  const base = REGION_WORD[region] || 'Region';
  const prefix = pascalWords(landmarkName);
  let name = base;
  if (prefix && /^[A-Za-z]/.test(prefix)) name = prefix.endsWith(base) ? prefix : prefix + base;
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) candidate = name + n++;
  used.add(candidate);
  return candidate;
}

function cmdShared() {
  const siteMap = readJson(SITE_MAP_PATH);
  if (!siteMap || typeof siteMap.routes !== 'object' || siteMap.routes === null) {
    fail('shared', 'artifacts/site-map/site-map.json is missing or unreadable - write the site map first');
  }
  const landmarkGroups = [];
  const blockGroups = [];
  const withoutInventory = [];
  const compared = [];
  let activeRoutes = 0;
  for (const [routePath, route] of Object.entries(siteMap.routes)) {
    if (!route || route.status === 'removed' || typeof route.routeId !== 'string') continue;
    activeRoutes++;
    const file = typeof route.inventory === 'string' ? route.inventory : inventoryPathFor(route.routeId);
    const inventory = readJson(path.join(CWD, file));
    if (!inventory || !Array.isArray(inventory.landmarks) || !Array.isArray(inventory.controls)) {
      withoutInventory.push(routePath);
      continue;
    }
    const entry = { routePath: routePath, route: route, file: file, inventory: inventory, changed: false };
    compared.push(entry);
    // A page that marks up no header still repeats its frame. Blocks at the top, bottom or side
    // that hold the same controls under the same labels are grouped the way landmarks are, and
    // 'repeating' below decides which of them recur widely enough to be the frame.
    (Array.isArray(inventory.blocks) ? inventory.blocks : []).forEach(function (block, index) {
      if (!isObject(block) || !block.fingerprint) return;
      const candidate =
        typeof block.candidate === 'boolean'
          ? block.candidate
          : ['top', 'bottom', 'side'].indexOf(block.position) !== -1 && block.controlCount >= 2;
      if (!candidate) return;
      const inside = inventory.controls.filter(function (control) {
        return control.block === index && inFrameBlock(control);
      });
      const group = placeInGroup(blockGroups, 'block', inside, function () {
        return { fingerprint: block.fingerprint, positions: {}, members: [] };
      });
      group.positions[block.position] = (group.positions[block.position] || 0) + 1;
      if (group.routeIds.indexOf(route.routeId) !== -1) return;
      group.routeIds.push(route.routeId);
      group.routes.push(routePath);
      group.members.push({ entry: entry, block: index });
    });
    inventory.landmarks.forEach(function (landmark, index) {
      if (FRAME_REGIONS.indexOf(landmark.region) === -1 || !landmark.controlCount) return;
      const inside = inventory.controls.filter(function (control) {
        return control.landmark === index;
      });
      const group = placeInGroup(landmarkGroups, landmark.region, inside, function () {
        return { region: landmark.region, landmarkName: landmark.name || '', fingerprint: landmark.fingerprint };
      });
      if (group.routeIds.indexOf(route.routeId) === -1) {
        group.routeIds.push(route.routeId);
        group.routes.push(routePath);
      }
    });
  }

  const minimum = Math.max(2, Math.ceil(compared.length * IMPLICIT_FRAME_SHARE));
  const repeating = blockGroups
    .filter(function (group) {
      return group.routeIds.length >= minimum;
    })
    .map(function (group) {
      const position = Object.keys(group.positions).sort(function (a, b) {
        return group.positions[b] - group.positions[a] || (a < b ? -1 : 1);
      })[0];
      const region = position === 'top' ? 'header' : position === 'bottom' ? 'footer' : 'aside';
      // From here on these controls are the site frame on every route that carries the block: the
      // next stage tests them once, on one route, instead of once per page.
      for (const member of group.members) {
        for (const control of member.entry.inventory.controls) {
          if (control.block !== member.block || !inFrameBlock(control)) continue;
          if (control.region !== region || control.frameBy !== 'repetition') {
            control.region = region;
            control.frameBy = 'repetition';
            member.entry.changed = true;
          }
        }
      }
      return {
        region: region,
        landmarkName: '',
        fingerprint: group.fingerprint,
        routeIds: group.routeIds,
        routes: group.routes,
        controls: (group.controls || []).map(function (control) {
          return Object.assign({}, control, { region: region, frameBy: 'repetition' });
        }),
        foundBy: 'repetition',
      };
    });
  for (const entry of compared) {
    if (!entry.changed) continue;
    writeInventory(entry.file, entry.inventory);
    siteMap.routes[entry.routePath].components = summarize(entry.inventory).components;
  }

  const order = { header: 0, nav: 1, aside: 2, footer: 3 };
  const recurring = landmarkGroups
    .filter(function (group) {
      return group.routeIds.length >= 2;
    })
    .map(function (group) {
      return {
        region: group.region,
        landmarkName: group.landmarkName,
        fingerprint: group.fingerprint,
        routeIds: group.routeIds,
        routes: group.routes,
        controls: group.controls,
        foundBy: 'markup',
      };
    })
    .concat(repeating)
    .sort(function (a, b) {
      return (
        b.routeIds.length - a.routeIds.length ||
        order[a.region] - order[b.region] ||
        (a.fingerprint < b.fingerprint ? -1 : 1)
      );
    });
  // A marked-up region is named first, so the site's own <header> is "Header" and a block found by
  // repetition beside it takes the next free name, never the other way round.
  const used = new Set();
  const names = new Map();
  for (const pass of ['markup', 'repetition']) {
    for (const group of recurring) {
      if (group.foundBy === pass) names.set(group, widgetName(group.region, group.landmarkName, used));
    }
  }
  const widgets = recurring.map(function (group) {
    return Object.assign({ name: names.get(group) }, group, {
      routes: group.routes.slice().sort(),
    });
  });

  const sharedPath = INVENTORY_DIR + '/' + SHARED_FILE;
  fs.mkdirSync(path.join(CWD, INVENTORY_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(CWD, sharedPath),
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), widgets: widgets }, null, 2) + '\\n',
    'utf8',
  );
  if (widgets.length > 0) {
    siteMap.sharedWidgets = widgets
      .map(function (widget) {
        return widget.name;
      })
      .sort();
  } else {
    delete siteMap.sharedWidgets;
  }
  fs.writeFileSync(SITE_MAP_PATH, JSON.stringify(siteMap, null, 2) + '\\n', 'utf8');

  const warnings = [];
  if (withoutInventory.length > 0) {
    warnings.push(
      withoutInventory.length +
        ' active route(s) have no inventory and were left out of the comparison - re-visit them rather than read their absence as "nothing shared": ' +
        withoutInventory.slice(0, 20).join(', ') +
        (withoutInventory.length > 20 ? ', ...' : ''),
    );
  }
  const unanswered = compared.filter(function (entry) {
    const pending = entry.inventory.pendingClassification;
    return pending && Array.isArray(pending.items) && pending.items.length > 0;
  });
  if (unanswered.length > 0) {
    warnings.push(
      unanswered.length +
        ' route(s) still have unanswered "classify" questions, so their home-made controls are not in ' +
        'the inventory: ' +
        unanswered
          .slice(0, 20)
          .map(function (entry) {
            return entry.routePath;
          })
          .join(', '),
    );
  }

  // Everything an assistant decided rather than the markup stating it, counted for the run summary:
  // a person should be able to see how much of the inventory rests on judgment.
  const byAssistant = { controls: 0, outputs: 0, routes: 0 };
  for (const entry of compared) {
    let touched = false;
    for (const control of entry.inventory.controls) {
      if (control.classifiedBy === 'assistant') {
        byAssistant.controls++;
        touched = true;
      } else if (control.outputBy === 'assistant') {
        byAssistant.outputs++;
        touched = true;
      }
    }
    if (touched) byAssistant.routes++;
  }

  return {
    action: 'shared',
    ok: true,
    activeRoutes: activeRoutes,
    widgets: widgets.map(function (widget) {
      return {
        name: widget.name,
        region: widget.region,
        routeCount: widget.routeIds.length,
        controlCount: widget.controls.length,
        foundBy: widget.foundBy,
      };
    }),
    shared: sharedPath,
    byAssistant: byAssistant,
    warnings: warnings,
  };
}

// A control a block can hand to the frame: not already inside a marked-up header, nav, footer or
// sidebar - unless an earlier 'shared' pass put it in the frame by repetition, which this pass is
// about to decide again.
function inFrameBlock(control) {
  return FRAME_REGIONS.indexOf(control.region) === -1 || control.frameBy === 'repetition';
}

// Region instances are grouped by how much of their content they share, not by an exact match: a
// header that carries breadcrumbs or marks the current page differs in a few controls from route to
// route and is still one header. Live-observed on MDN, whose header held 119 controls on one page
// and 122 on the next and was never recognised while the comparison demanded identity.
const SIMILARITY = 0.8;

function signaturesOf(controls) {
  return new Set(
    controls.map(function (control) {
      return [control.role, control.type || '', normalizeText(control.name)].join('|');
    }),
  );
}

function similarity(a, b) {
  let common = 0;
  a.forEach(function (value) {
    if (b.has(value)) common++;
  });
  const union = a.size + b.size - common;
  return union === 0 ? 0 : common / union;
}

// The first group of this kind the instance resembles closely enough, or a new one seeded from it.
// The first instance also supplies the widget's control list, so the result depends only on the
// site map's own (sorted) route order.
function placeInGroup(groups, kind, controls, seed) {
  const signatures = signaturesOf(controls);
  let group = groups.find(function (candidate) {
    return candidate.kind === kind && similarity(candidate.signatures, signatures) >= SIMILARITY;
  });
  if (!group) {
    group = Object.assign(
      {
        kind: kind,
        signatures: signatures,
        routeIds: [],
        routes: [],
        controls: controls.map(function (control) {
          const copy = Object.assign({}, control);
          delete copy.landmark;
          return copy;
        }),
      },
      seed(),
    );
    groups.push(group);
  }
  return group;
}

// Inventory files are keyed by routeId and a create pass issues fresh ids, so each re-crawl would
// otherwise leave the previous pass's files behind. Deletes only files whose id no route in the
// site map carries, and nothing at all while the site map cannot be read.
function cmdPrune() {
  const siteMap = readJson(SITE_MAP_PATH);
  if (!siteMap || typeof siteMap.routes !== 'object' || siteMap.routes === null) {
    return {
      action: 'prune',
      ok: false,
      removed: 0,
      reason: 'artifacts/site-map/site-map.json is missing or unreadable, so nothing can be matched - nothing was deleted',
    };
  }
  const known = new Set();
  for (const route of Object.values(siteMap.routes)) {
    if (route && typeof route.routeId === 'string') known.add(route.routeId);
  }
  const dir = path.join(CWD, INVENTORY_DIR);
  if (!fs.existsSync(dir)) return { action: 'prune', ok: true, removed: 0, kept: 0 };
  let removed = 0;
  let kept = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === SHARED_FILE) continue;
    if (entry.name.startsWith('.')) continue;
    if (known.has(entry.name.slice(0, -'.json'.length))) {
      kept++;
      continue;
    }
    fs.unlinkSync(path.join(dir, entry.name));
    removed++;
  }
  // The identity index points at recordings; one whose route is gone would otherwise make a later
  // page look like a copy of a page that no longer exists.
  const identities = readJson(sideFile(IDENTITY_FILE));
  if (isObject(identities)) {
    let dropped = 0;
    for (const key of Object.keys(identities)) {
      if (!isObject(identities[key]) || !known.has(identities[key].routeId)) {
        delete identities[key];
        dropped++;
      }
    }
    if (dropped > 0) writeSideFile(IDENTITY_FILE, identities);
  }
  return { action: 'prune', ok: true, removed: removed, kept: kept };
}

function main() {
  const [action, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  let result;
  switch (action) {
    case 'probe':
      result = cmdProbe();
      break;
    case 'record':
      result = cmdRecord(args);
      break;
    case 'classify':
      result = cmdClassify(args);
      break;
    case 'shared':
      result = cmdShared();
      break;
    case 'prune':
      result = cmdPrune();
      break;
    default:
      fail(String(action), 'unknown action "' + action + '" (expected probe, record, classify, shared or prune)');
  }
  emit(result);
}

main();
`;
}
