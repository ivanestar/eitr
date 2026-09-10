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
 *   node scripts/page-inventory.mjs shared
 *   node scripts/page-inventory.mjs prune
 *
 * 'probe' hands back browser-side source to run with page.evaluate once the page has settled and any
 * overlay is closed; write what it returns to a file and pass that file to 'record'. 'record' stores
 * artifacts/site-map/inventory/<routeId>.json and answers with the regions, components and
 * contentHash to put on the route's site-map entry. 'shared' runs once the site map is written and
 * names every header, navigation, footer or sidebar that recurs on two or more routes. 'prune'
 * removes inventory files no route in the site map refers to.
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
// Each is a channel a test has to check the content of, and none of them is a form field.
const OUTPUT_PATTERN = '\\\\b(copy|export|download|print|share|save as)\\\\b';

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
function collectInventory(opts) {
  function clean(text, max) {
    return String(text || '').replace(/\\s+/g, ' ').trim().slice(0, max || 80);
  }

  function visible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

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

  function textOfIds(ids) {
    return String(ids)
      .split(/\\s+/)
      .map(function (id) {
        var node = document.getElementById(id);
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
      var byIds = clean(textOfIds(labelledBy));
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
    if (tag === 'a' || tag === 'button' || el.getAttribute('role')) {
      var text = clean(el.textContent);
      if (text) return text;
      var img = el.querySelector('img[alt]');
      if (img) return clean(img.getAttribute('alt'));
      var svgTitle = el.querySelector('svg title');
      if (svgTitle) return clean(svgTitle.textContent);
    }
    return clean(el.getAttribute('title'));
  }

  function nearbyText(el) {
    var prev = el.previousElementSibling;
    if (prev && clean(prev.textContent)) return clean(prev.textContent, 60);
    var parent = el.parentElement;
    if (parent) {
      var candidate = parent.querySelector('label, legend');
      if (candidate && candidate !== el && !candidate.contains(el)) return clean(candidate.textContent, 60);
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
      var url = new URL(el.getAttribute('href'), document.baseURI);
      if (url.origin === window.location.origin) return url.pathname;
      return 'external:' + url.hostname;
    } catch (err) {
      return '';
    }
  }

  var landmarkNodes = Array.prototype.slice.call(document.querySelectorAll(opts.landmarkSelector));
  var topLevel = landmarkNodes.filter(function (el) {
    var parent = el.parentElement;
    return !(parent && parent.closest(opts.landmarkSelector));
  });
  var landmarks = topLevel.map(function (el) {
    var name = el.getAttribute('aria-label') || '';
    if (!name && el.getAttribute('aria-labelledby')) name = textOfIds(el.getAttribute('aria-labelledby'));
    return { region: regionName(el), name: clean(name, 60) };
  });

  var outputPattern = new RegExp(opts.outputPattern, 'i');
  var nodes = Array.prototype.slice.call(document.querySelectorAll(opts.controlSelector));
  var controls = [];
  var total = 0;
  for (var n = 0; n < nodes.length; n++) {
    var el = nodes[n];
    var tag = el.tagName.toLowerCase();
    var type = tag === 'input' ? String(el.getAttribute('type') || 'text').toLowerCase() : '';
    if (type === 'hidden') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    var isField = tag === 'input' || tag === 'select' || tag === 'textarea';
    // A button inside a link (or the reverse) is one control a person operates, not two.
    if (!isField && el.parentElement && el.parentElement.closest('a[href], button, [role="button"], [role="link"]')) {
      continue;
    }
    total++;
    if (controls.length >= opts.maxControls) continue;

    var landmarkIndex = -1;
    for (var t = 0; t < topLevel.length; t++) {
      if (topLevel[t].contains(el)) {
        landmarkIndex = t;
        break;
      }
    }
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
      if (el.hasAttribute('download')) entry.output = true;
    }
    if ((role === 'button' || role === 'link' || role === 'menuitem') && outputPattern.test(name)) {
      entry.output = true;
    }
    controls.push(entry);
  }

  return {
    title: clean(document.title, 200),
    path: window.location.pathname,
    landmarks: landmarks,
    controls: controls,
    totalControls: total,
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
    },
    source: collectInventory.toString(),
    usage:
      'Evaluate source with options in the page (page.evaluate) once the navigation has settled and ' +
      'any overlay is closed, write the result to a file, and pass it to "record". Take regions, ' +
      'components and contentHash for the route entry from what "record" returns - never compose ' +
      'them yourself.',
  };
}

function isLink(control) {
  return control.role === 'link';
}

// "<role> "<name>"" - the form a Page Object author reads and getByRole matches. A control with no
// accessible name says so and carries whatever text sits next to it.
function componentLabel(control) {
  if (control.name) return control.role + ' "' + control.name + '"';
  return control.role + ' (no accessible name' + (control.hint ? ', next to "' + control.hint + '"' : '') + ')';
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
  if (!Array.isArray(observation.controls) || !Array.isArray(observation.landmarks)) {
    fail('record', 'the observation has no controls/landmarks arrays - it is not the probe result');
  }

  const landmarks = observation.landmarks.map(function (landmark) {
    return {
      region: redact(landmark && landmark.region, 20) || 'region',
      name: redact(landmark && landmark.name, 60),
    };
  });
  const controls = observation.controls.slice(0, MAX_CONTROLS).map(function (raw) {
    const landmarkIndex = Number.isInteger(raw.landmark) && landmarks[raw.landmark] ? raw.landmark : -1;
    const control = {
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

  const own = controls.filter(function (control) {
    return FRAME_REGIONS.indexOf(control.region) === -1 && !isLink(control);
  });
  const components = own.slice(0, MAX_COMPONENTS).map(componentLabel);
  const contentHash = structuralHash(title, regions, controls);
  const totalControls = Number.isInteger(observation.totalControls) ? observation.totalControls : controls.length;

  const counts = {
    controls: controls.length,
    fields: controls.filter(function (control) {
      return ['input', 'select', 'textarea'].indexOf(control.tag) !== -1;
    }).length,
    buttons: controls.filter(function (control) {
      return control.role === 'button';
    }).length,
    links: controls.filter(isLink).length,
    outputs: controls.filter(function (control) {
      return control.output === true;
    }).length,
    unnamedFields: own.filter(function (control) {
      return !control.name && ['input', 'select', 'textarea'].indexOf(control.tag) !== -1;
    }).length,
  };

  const warnings = [];
  if (totalControls > controls.length) {
    warnings.push(
      (totalControls - controls.length) +
        ' control(s) beyond the first ' +
        controls.length +
        ' were not recorded - this page is a listing, and its first ' +
        controls.length +
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

  const record = {
    schemaVersion: 1,
    routeId: routeId,
    route: routePath,
    title: title,
    recordedAt: new Date().toISOString(),
    contentHash: contentHash,
    landmarks: landmarkRecords,
    controls: controls,
    totalControls: totalControls,
  };
  const relativePath = inventoryPathFor(routeId);
  fs.mkdirSync(path.join(CWD, INVENTORY_DIR), { recursive: true });
  fs.writeFileSync(path.join(CWD, relativePath), JSON.stringify(record, null, 2) + '\\n', 'utf8');

  return {
    action: 'record',
    ok: true,
    routeId: routeId,
    title: title,
    regions: regions,
    components: components,
    contentHash: contentHash,
    inventory: relativePath,
    counts: counts,
    warnings: warnings,
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
  const groups = new Map();
  const withoutInventory = [];
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
    inventory.landmarks.forEach(function (landmark, index) {
      if (FRAME_REGIONS.indexOf(landmark.region) === -1 || !landmark.controlCount) return;
      let group = groups.get(landmark.fingerprint);
      if (!group) {
        group = {
          region: landmark.region,
          landmarkName: landmark.name || '',
          fingerprint: landmark.fingerprint,
          routeIds: [],
          routes: [],
          controls: inventory.controls
            .filter(function (control) {
              return control.landmark === index;
            })
            .map(function (control) {
              const copy = Object.assign({}, control);
              delete copy.landmark;
              return copy;
            }),
        };
        groups.set(landmark.fingerprint, group);
      }
      if (group.routeIds.indexOf(route.routeId) === -1) {
        group.routeIds.push(route.routeId);
        group.routes.push(routePath);
      }
    });
  }

  const order = { header: 0, nav: 1, aside: 2, footer: 3 };
  const recurring = Array.from(groups.values())
    .filter(function (group) {
      return group.routeIds.length >= 2;
    })
    .sort(function (a, b) {
      return (
        b.routeIds.length - a.routeIds.length ||
        order[a.region] - order[b.region] ||
        (a.fingerprint < b.fingerprint ? -1 : 1)
      );
    });
  const used = new Set();
  const widgets = recurring.map(function (group) {
    return Object.assign({ name: widgetName(group.region, group.landmarkName, used) }, group, {
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
      };
    }),
    shared: sharedPath,
    warnings: warnings,
  };
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
    if (known.has(entry.name.slice(0, -'.json'.length))) {
      kept++;
      continue;
    }
    fs.unlinkSync(path.join(dir, entry.name));
    removed++;
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
    case 'shared':
      result = cmdShared();
      break;
    case 'prune':
      result = cmdPrune();
      break;
    default:
      fail(String(action), 'unknown action "' + action + '" (expected probe, record, shared or prune)');
  }
  emit(result);
}

main();
`;
}
