// Template for generating scripts/validate-test-conditions.mjs. create-if-absent.
// The mechanical gate ADR 0012 Decision item 2 requires at every stage boundary for
// artifacts/analysis/test-conditions.json (Stage 2). Zero dependencies, same style as
// feature-map-validator.ts and site-map-validator.ts. Supports --stage=parameters to run only
// the pre-generation subset of checks (Gate 1 in /define-test-conditions), or the full check set
// with no flag (Gate 2).

export function renderTestConditionsValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/analysis/test-conditions.json.
 * Zero model involvement - pure structural checks, run by /define-test-conditions before Gate 1
 * (parameters shape, via --stage=parameters) and again in full (Gate 2) before the Human Sign-Off
 * Gateway.
 *
 * Usage:
 *   node scripts/validate-test-conditions.mjs [--stage=parameters]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const REPORT_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const API_CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');
const INVENTORY_DIR = 'artifacts/site-map/inventory';

// Regions shared by every page. Their fields - a language switcher, a theme toggle - belong to the
// site frame, not to the route underneath, so they are never a route's parameter.
const FRAME_REGIONS = new Set(['header', 'nav', 'footer', 'aside']);
const FIELD_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
]);
const EXCLUSION_REASONS = new Set(['result-output', 'duplicate', 'disabled', 'needs-button', 'off-limits']);
// HTML's "valid floating-point number". Anything else in an input[type=number] is replaced with an
// empty string by the browser's own value sanitization, so it can never be the value under test.
const VALID_FLOAT = /^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][-+]?\\d+)?$/;

const args = process.argv.slice(2);
const stageArg = args.find(function (a) {
  return a.indexOf('--stage=') === 0;
});
const PARAMETERS_ONLY = stageArg ? stageArg.slice('--stage='.length) === 'parameters' : false;

const PARAMETER_KIND_VALUES = new Set([
  'text',
  'number',
  'email',
  'date',
  'select',
  'checkbox',
  'radio',
  'password',
  'other',
]);
const SOURCE_VALUES = new Set([
  'form-label',
  'html5-constraint',
  'aria-relationship',
  'select-option-text',
  'field-probe',
  'manual',
]);
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const PROBES_PATH = path.join(CWD, 'artifacts', 'analysis', 'field-probes.json');
const RESEARCH_DIR = 'artifacts/analysis/research';
// Research below this many sources is one opinion restated, not a picture of practice.
const MIN_RESEARCH_SOURCES = 5;
const BASIS_MODES = new Set(['live-app', 'documents', 'mixed']);
const ORACLE_VALUES = new Set(['requirement', 'human', 'research', 'domain', 'observed', 'markup']);
const LAYER_VALUES = new Set(['field', 'rule', 'behavior', 'frame']);
const ORIGIN_VALUES = new Set(['generated', 'model', 'research', 'human']);
const LEVEL_VALUES = new Set(['high', 'medium', 'low']);
const ANCHOR_KINDS = new Set([
  'control',
  'probe',
  'research',
  'constraint',
  'feature',
  'entity',
  'human',
  'requirement',
  'ticket',
  'code',
  'document',
]);
// An anchor whose ref says where but not what: the words relied on travel with it.
const QUOTED_ANCHORS = new Set(['human', 'requirement', 'ticket', 'code', 'document']);
const BASIS_ANCHORS = new Set(['requirement', 'ticket', 'code', 'document']);
const FIELD_ROLE_VALUES = new Set([
  'quantity',
  'money',
  'date-time',
  'identifier',
  'credential',
  'free-text',
  'choice',
  'toggle',
  'search-filter',
  'file',
  'setting',
  'other',
]);
const ENFORCEMENT_VALUES = new Set(['markup', 'observed', 'not-enforced', 'unknown']);
const RESEARCH_STATUSES = new Set(['done', 'cached', 'skipped']);
const DEPENDENCY_KINDS = new Set(['feature', 'entity', 'external']);
// Only scripts/generate-test-conditions.mjs builds these, and it rebuilds them on every run.
const GENERATED_TECHNIQUES = new Set([
  'combinatorial',
  'boundary-value',
  'equivalence-partition',
  'checklist-based',
  'state-transition',
  'use-case',
]);
const WEIGHT = { high: 3, medium: 2, low: 1 };
const PARTITION_KIND_VALUES = new Set(['valid', 'invalid']);
const BOUNDARY_VALUES = new Set(['min', 'max']);
const TECHNIQUE_VALUES = new Set([
  'combinatorial',
  'boundary-value',
  'equivalence-partition',
  'checklist-based',
  'state-transition',
  'use-case',
  'architectural-invariant',
  'property',
  'metamorphic',
  'decision-table',
  'error-guessing',
]);
const PROPERTY_RELATIONS = new Set([
  'count-matches-request',
  'all-unique',
  'format-conformance',
  'covers-all-pairs',
  'output-matches-display',
  'persists-across-navigation',
]);
const METAMORPHIC_RELATIONS = new Set(['round-trip', 'idempotence', 'symmetry', 'permutation-invariance']);
const NEGATIVE_CATEGORY_VALUES = new Set([
  'invalid_input',
  'boundary',
  'missing_precondition',
  'concurrent_conflict',
  'state_violation',
  'permission_denied',
  'external_failure',
  'data_integrity',
  'error_path',
]);
const SCENARIO_VALUES = new Set(['positive', 'negative']);
const EXECUTION_LEVEL_VALUES = new Set(['ui', 'dom', 'api']);
const CONDITION_EXECUTION_LEVEL_VALUES = new Set(['dom', 'api']);
// Kinds whose control only ever produces one of the values it offers - an invalid value for one of
// these cannot be entered through the page at all.
const CLOSED_CHOICE_KINDS = new Set(['select', 'radio', 'checkbox']);
const OPTION_LIST_KINDS = new Set(['select', 'radio']);

// Phrases that claim an outcome without naming one. Closed list: each is only ever a stand-in for
// the observable result a test would have to assert, and a condition carrying one cannot be turned
// into a test case without someone guessing what "correct" meant.
const PLACEHOLDER_PATTERNS = [
  /\\bcorrectly handles?\\b/i,
  /\\bhandles? (?:it |this |them |the (?:input|value|request) )?(?:correctly|properly|appropriately|gracefully)\\b/i,
  /\\bhandled (?:correctly|properly|appropriately|gracefully)\\b/i,
  /\\b(?:works?|behaves?|functions?|responds?) (?:as expected|correctly|properly|appropriately)\\b/i,
  /\\bas expected\\b/i,
  // "Field X accepts entered string": true of every field, so it names nothing a test could check.
  /\\baccepts? (?:the |an? )?(?:entered|typed|given|input) (?:string|value|text|data|input)\\b/i,
];

// A placeholder shows an example of what to type, never a limit: "e.g. 20" invites 20, it does not
// forbid 21. Live-observed turning into an invented max boundary, and a condition rejecting a value
// the application accepts.
const EXAMPLE_PREFIX = /^\\s*(?:e\\.\\s?g\\.|for example\\b|example\\s*:)/i;

function placeholderIn(text) {
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// The length ceiling applies to text a model writes by hand. A generated condition's outcome joins
// every outcome its values promise, so a positive vector over six parameters legitimately runs
// long - live-observed failing Gate 2 on the generator's own output when the ceiling applied there.
function checkOutcome(value, label, errors, capped) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(
      label +
        ' must be a non-empty string naming what a person sees - a message and where it appears, a value, a count, a disabled control.',
    );
    return;
  }
  if (capped !== false && value.length > 200) {
    errors.push(label + ' must be <=200 chars - one observable result, not a paragraph.');
  }
  const phrase = placeholderIn(value);
  if (phrase) {
    errors.push(
      label +
        ' says "' +
        phrase +
        '" instead of what a person would see - name the message, value or state a test can check.',
    );
  }
}

function normalizeOption(text) {
  return String(text).trim().toLowerCase();
}

// The evidence that makes a value invalid or a limit real. An option list only ever proves what a
// select or radio group offers, so it can ground "this value is not offered" and nothing else.
function checkRule(rule, label, kind, errors) {
  if (!rule || typeof rule !== 'object') {
    errors.push(
      label +
        ' is required - quote where the page states this rule (an HTML5 constraint, a label, the offered options, or a person).',
    );
    return;
  }
  if (!SOURCE_VALUES.has(rule.signal)) {
    errors.push(label + '.signal must be a known signal.');
  } else if (rule.signal === 'select-option-text' && !OPTION_LIST_KINDS.has(kind)) {
    errors.push(label + ".signal 'select-option-text' can only ground a rule on a select or radio parameter.");
  }
  if (typeof rule.excerpt !== 'string' || rule.excerpt.trim().length === 0) {
    errors.push(label + '.excerpt must be a non-empty string.');
    return;
  }
  if (rule.excerpt.length > 100) {
    errors.push(label + '.excerpt must be <=100 chars (PII/session-data guard).');
  }
  if (EXAMPLE_PREFIX.test(rule.excerpt)) {
    errors.push(
      label +
        '.excerpt "' +
        rule.excerpt +
        '" is an example value, not a rule - a placeholder shows what to type and forbids nothing.',
    );
  }
}

function isField(control) {
  if (!control) return false;
  if (FIELD_ROLES.has(control.role)) return true;
  if (control.tag === 'select' || control.tag === 'textarea') return true;
  return control.tag === 'input' && control.role !== 'button';
}

function describeControl(control) {
  if (control.name) return control.id + ' ' + control.role + ' "' + control.name + '"';
  return (
    control.id +
    ' ' +
    control.role +
    ' (no accessible name' +
    (control.hint ? ', next to "' + control.hint + '"' : '') +
    ')'
  );
}

// A radio group is one parameter but one control per option; citing any member accounts for all.
function radioGroupOf(control, inventory) {
  if (!control || control.role !== 'radio' || !control.group) return control ? [control] : [];
  return inventory.controls.filter(function (other) {
    return other.role === 'radio' && other.group === control.group;
  });
}

function expectedKind(control) {
  if (control.tag === 'select') return 'select';
  if (control.type === 'checkbox' || control.role === 'checkbox') return 'checkbox';
  if (control.type === 'radio' || control.role === 'radio') return 'radio';
  if (control.type === 'number' || control.type === 'range' || control.role === 'spinbutton' || control.role === 'slider') {
    return 'number';
  }
  if (control.type === 'email') return 'email';
  if (control.type === 'password') return 'password';
  if (control.type === 'date') return 'date';
  return null;
}

// A field a person types free text into. Anything else - a box, an option, a slider, a date - holds
// one of the values it offers, so it can never be free text.
function takesFreeText(control) {
  if (control.tag === 'select') return false;
  if (control.tag === 'textarea' || control.role === 'textbox' || control.role === 'searchbox') return true;
  if (control.tag !== 'input') return control.role === 'combobox';
  return ['', 'text', 'search', 'email', 'url', 'tel', 'password'].indexOf(control.type || '') !== -1;
}

// An inventory id ("c43") inside a name or a meaning: the words were built from the control's place
// in one recording, not from what the field is for. Live-observed across a whole run: every parameter
// named "param_c43_enter_data_for_barco" and every meaning "Input control c50 representing ...".
function citesControlId(text, controlId) {
  if (typeof text !== 'string' || typeof controlId !== 'string' || !/^c\\d+$/.test(controlId)) return false;
  return new RegExp('(?:^|[^a-z0-9])' + controlId + '(?:[^0-9]|$)', 'i').test(text);
}

// The words a template wraps around a field's label: live-observed as "input_field_1", "Input value
// representing enter data for barcode", "Configuration value for field on <page title>", "Free-text
// string value adhering to field length and format requirements", "Empty text is rejected with
// validation error" - each filled in for every field of a run, and none of them about any field. A
// name, a meaning, a constraint or an outcome made of nothing but these and the field's own label
// says nothing about the field. A number, a quoted value or any word of substance is enough to pass.
const TEMPLATE_WORDS = new Set(
  (
    'a an the of for on in to by with from at as and or this that these it its is are be been was were ' +
    'field fields input inputs value values entered enter entry text string data content information info ' +
    'control controls element elements parameter param params option options select selected selection ' +
    'choice dropdown checkbox check box radio button textbox textarea area item items representing ' +
    'represents represent configuration setting settings used using use page test utility tool form user ' +
    'provided specified given free accepted accepts accept rejected rejects reject validation valid invalid ' +
    'error errors message messages empty unlisted unoffered state adhering adhere adheres requirements ' +
    'requirement format length must should any appropriate proper properly correct correctly expected ' +
    'successfully number numeric integer'
  ).split(' '),
);

function wordsOf(text) {
  return String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/)
    .filter(Boolean);
}

// True when the text, once the words it may borrow ("own": the field's label, its page, its values)
// are taken out, has nothing left but template words.
function saysNothingOwn(text, own, extra) {
  if (typeof text !== 'string' || text.trim().length === 0) return false;
  const borrowed = new Set();
  for (const item of own) for (const word of wordsOf(item)) borrowed.add(word);
  return wordsOf(text).every(function (word) {
    return borrowed.has(word) || TEMPLATE_WORDS.has(word) || Boolean(extra && extra.has(word));
  });
}

// The words a condition written for any page wraps around the page's title: live-observed as "Verify
// <page title> renders valid UI components and functional controls" with the outcome "Page renders
// intended quality assurance utility layout with responsive controls", and the input "Navigate to /
// and execute default operation" - the same three sentences on 26 pages, none of them about a page.
const CONDITION_WORDS = new Set(
  (
    'verify verifies verified check checks checked ensure ensures confirm confirms test tests tested ' +
    'render renders rendered rendering display displays displayed show shows shown appear appears visible ' +
    'load loads loaded loading ui ux component components layout layouts responsive functional functionality ' +
    'intended work works working operate operates operation operations default execute executes executed ' +
    'navigate navigates navigating run runs perform performs performed behave behaves behavior behaviour ' +
    'page pages screen screens view views interface interfaces feature features application app site website ' +
    'web present presents presented available'
  ).split(' '),
);

function labelOf(control) {
  return control ? [control.name, control.hint, control.placeholder].filter(Boolean) : [];
}

// A name is a template when, counters aside, it is made only of template words the page does not
// use for this field: "input_field_1" is; "value" on a field the page labels "Value" is not.
function isTemplateName(name, control) {
  const words = wordsOf(name).filter(function (word) {
    return !/^\\d+$/.test(word);
  });
  if (words.length === 0) return true;
  const own = new Set(wordsOf(labelOf(control).join(' ')));
  return words.every(function (word) {
    return TEMPLATE_WORDS.has(word) && !own.has(word);
  });
}

// An empty value is invalid only where something says the field must be filled in.
const REQUIRED_WORDS = /required|mandatory|obligatory|must be (?:filled|provided|entered)|cannot be (?:empty|blank)|\\*|обязательн/i;

function rulesRequiredness(rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.signal === 'field-probe' || rule.signal === 'manual') return true;
  const excerpt = typeof rule.excerpt === 'string' ? rule.excerpt : '';
  if (rule.signal === 'html5-constraint') return /\\brequired\\b/i.test(excerpt);
  if (rule.signal === 'aria-relationship') return /aria-required/i.test(excerpt) || REQUIRED_WORDS.test(excerpt);
  if (rule.signal === 'form-label') return REQUIRED_WORDS.test(excerpt);
  return false;
}

// "Title:" quoted as the rule for a Title field: the label names the field and states no rule.
function quotesOnlyLabel(rule, control) {
  if (!rule || rule.signal !== 'form-label' || typeof rule.excerpt !== 'string' || !control) return false;
  if (REQUIRED_WORDS.test(rule.excerpt)) return false;
  const tidy = function (text) {
    return String(text).trim().replace(/[:*\\s]+$/, '').toLowerCase();
  };
  const excerpt = tidy(rule.excerpt);
  return excerpt.length > 0 && labelOf(control).some(function (text) {
    return tidy(text) === excerpt;
  });
}

// An html5-constraint rule has to be an attribute the crawl actually saw on this field. Live-observed:
// a converter got a minimum of 0 its input never declared, and every condition built on it rejected
// negative temperatures.
function checkRuleAgainstControl(rule, label, control, errors, warnings) {
  if (!rule || typeof rule.excerpt !== 'string') return;
  if (rule.signal === 'html5-constraint') {
    const constraints = control.constraints || {};
    const found = rule.excerpt.match(/\\b(min|max|step|minlength|maxlength|pattern|required)\\b(?:\\s*=\\s*"?([^"\\s,;]+)"?)?/gi) || [];
    if (found.length === 0) {
      errors.push(label + '.excerpt names no HTML5 attribute - quote it as the page carries it, e.g. max=10.');
      return;
    }
    for (const token of found) {
      const parts = token.split('=');
      const attr = parts[0].trim().toLowerCase();
      const quoted = parts.length > 1 ? parts.slice(1).join('=').replace(/"/g, '').trim() : null;
      if (!(attr in constraints)) {
        errors.push(
          label + ' quotes ' + attr + ', but the crawl recorded no ' + attr + ' on ' + describeControl(control) + '.',
        );
      } else if (quoted !== null && constraints[attr] !== true && String(constraints[attr]) !== quoted) {
        errors.push(
          label +
            ' quotes ' +
            attr +
            '=' +
            quoted +
            ', but ' +
            describeControl(control) +
            ' carries ' +
            attr +
            '=' +
            constraints[attr] +
            '.',
        );
      }
    }
  } else if (rule.signal === 'form-label') {
    // Text near a field is not all captured, so this is a prompt to look, not a verdict.
    const nearby = [control.name, control.hint, control.placeholder]
      .filter(Boolean)
      .map(normalizeOption)
      .join(' | ');
    if (nearby && nearby.indexOf(normalizeOption(rule.excerpt)) === -1) {
      warnings.push(
        label +
          ' quotes "' +
          rule.excerpt +
          '", which is not the label or nearby text the crawl recorded for ' +
          describeControl(control) +
          ' - check it is really stated on the page.',
      );
    }
  }
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return { value: null, error: label + ' not found at ' + path.relative(CWD, filePath) };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { value: null, error: 'failed to read ' + label + ': ' + err.message };
  }
  try {
    return { value: JSON.parse(raw), error: null };
  } catch (err) {
    return { value: null, error: label + ' is not valid JSON: ' + err.message };
  }
}

function isEvidenceArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(label + ' must be a non-empty array - never emit a value with no evidence.');
    return;
  }
  value.forEach(function (ev, i) {
    const evLabel = label + '[' + i + ']';
    if (!ev || typeof ev !== 'object') {
      errors.push(evLabel + ' must be an object.');
      return;
    }
    if (!SOURCE_VALUES.has(ev.signal)) {
      errors.push(evLabel + '.signal must be a known signal.');
    }
    if (typeof ev.excerpt !== 'string') {
      errors.push(evLabel + '.excerpt must be a string.');
    } else if (ev.excerpt.length > 100) {
      errors.push(evLabel + '.excerpt must be <=100 chars (PII/session-data guard).');
    }
  });
}

function isParameter(value, label, context, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.name !== 'string' || value.name.length === 0) {
    errors.push(label + '.name must be a non-empty string.');
  }
  if (!PARAMETER_KIND_VALUES.has(value.kind)) {
    errors.push(label + '.kind must be a known ParameterKind.');
  }

  // The inventory field this parameter cites, when the route has an inventory and the id resolves.
  const control = context.control || null;
  const warnings = context.warnings || [];
  if (control) {
    const kind = expectedKind(control);
    if (kind && value.kind !== kind) {
      errors.push(
        label + '.kind is ' + value.kind + ', but ' + describeControl(control) + ' is a ' + kind + ' field on the page.',
      );
    }
    if (citesControlId(value.name, control.id)) {
      errors.push(
        label +
          '.name "' +
          value.name +
          '" is built from the control id ' +
          control.id +
          ' - name the parameter after what the field holds, the way the page or a person would say it.',
      );
    } else if (typeof value.name === 'string' && isTemplateName(value.name, control)) {
      errors.push(
        label +
          '.name "' +
          value.name +
          '" says what kind of control it is, not what it holds - name the parameter after the value, the way the page or a person would say it.',
      );
    }
  }
  // What a parameter's text may borrow and still say something: its name, its field's label, its
  // own sample values.
  const own = [value.name].concat(labelOf(control));
  for (const p of Array.isArray(value.partitions) ? value.partitions : []) {
    if (p && Array.isArray(p.sampleValues)) own.push.apply(own, p.sampleValues.filter((v) => typeof v === 'string'));
  }

  // What the page offers, read off the live page when there is an inventory - it wins over anything
  // written here. A list the crawl cut short still proves what IS offered, never what is not.
  let options = null;
  let optionsComplete = true;
  const liveOptions = !control
    ? null
    : control.role === 'radio' && control.group
      ? radioGroupOf(control, context.inventory).map(function (radio) {
          return radio.name;
        })
      : Array.isArray(control.options) && control.options.length > 0
        ? control.options
        : null;
  if (OPTION_LIST_KINDS.has(value.kind) && liveOptions) {
    options = new Set(liveOptions.map(normalizeOption));
    optionsComplete = !(Number.isInteger(control.optionCount) && control.optionCount > liveOptions.length);
  } else if (OPTION_LIST_KINDS.has(value.kind)) {
    if (
      !Array.isArray(value.options) ||
      value.options.length === 0 ||
      !value.options.every(function (o) {
        return typeof o === 'string';
      })
    ) {
      errors.push(
        label +
          '.options must list the option labels this ' +
          value.kind +
          ' offers - without them nothing can tell an offered value from an invented one.',
      );
    } else {
      options = new Set(value.options.map(normalizeOption));
    }
  }

  if (!Array.isArray(value.partitions) || value.partitions.length === 0) {
    errors.push(label + '.partitions must be a non-empty array.');
  } else {
    let hasValid = false;
    value.partitions.forEach(function (p, i) {
      const pLabel = label + '.partitions[' + i + ']';
      if (!p || typeof p !== 'object') {
        errors.push(pLabel + ' must be an object.');
        return;
      }
      if (typeof p.id !== 'string' || p.id.length === 0) {
        errors.push(pLabel + '.id must be a non-empty string.');
      }
      if (!PARTITION_KIND_VALUES.has(p.kind)) {
        errors.push(pLabel + '.kind must be one of valid|invalid.');
      } else if (p.kind === 'valid') {
        hasValid = true;
      }
      const samplesOk =
        Array.isArray(p.sampleValues) &&
        p.sampleValues.every(function (v) {
          return typeof v === 'string';
        });
      if (!samplesOk) {
        errors.push(pLabel + '.sampleValues must be an array of strings.');
      } else {
        if (control && expectedKind(control) === 'number') {
          p.sampleValues.forEach(function (sample) {
            if (sample !== '' && !VALID_FLOAT.test(sample.trim())) {
              errors.push(
                pLabel +
                  ' sample "' +
                  sample +
                  '" cannot be the value of a number field - the browser does not keep anything that is not a number in a number or range field. Use "" for an empty entry, or a number.',
              );
            }
          });
        }
        // Masked by the personal-data rule, so a test would type "[REDACTED]".
        if (
          p.sampleValues.some(function (sample) {
            return sample.indexOf('[REDACTED]') !== -1;
          })
        ) {
          errors.push(
            pLabel +
              '.sampleValues hold a value the personal-data masking hid, so no test can type it. Make one up instead: a phone number reserved for fiction (+1 202-555-0143, +44 7700 900123), a test card (4242 4242 4242 4242), an address at example.com, a shorter number in free text. A long number that is itself the value under test - an amount, a timestamp - is kept when its parameter is of kind number and its field\\'s role says quantity, money, date-time or setting.',
          );
        }
      }
      checkOutcome(p.expectedOutcome, pLabel + '.expectedOutcome', errors);
      if (saysNothingOwn(p.expectedOutcome, own)) {
        errors.push(
          pLabel +
            '.expectedOutcome "' +
            p.expectedOutcome +
            '" is true of any field - name what a person sees for this value: the message and where it appears, the result it produces, the state the page is left in.',
        );
      }

      if (p.executionLevel !== undefined && !EXECUTION_LEVEL_VALUES.has(p.executionLevel)) {
        errors.push(pLabel + '.executionLevel must be one of ui|dom|api.');
      }
      const offLevel = p.executionLevel === 'dom' || p.executionLevel === 'api';
      if (p.kind === 'valid' && offLevel) {
        errors.push(
          pLabel +
            ".executionLevel can only be dom or api on an 'invalid' partition - a valid value is one a person can enter.",
        );
      }
      if (p.kind === 'invalid') {
        checkRule(p.rule, pLabel + '.rule', value.kind, errors);
        if (control) checkRuleAgainstControl(p.rule, pLabel + '.rule', control, errors, warnings);
        const empty =
          samplesOk &&
          p.sampleValues.some(function (sample) {
            return sample.trim() === '';
          });
        if (empty && !rulesRequiredness(p.rule)) {
          errors.push(
            pLabel +
              ' calls an empty value invalid, but its rule does not say the field is required - quote the required attribute, aria-required or the page\\'s own words ("required", "*"), cite a probe that saw the page refuse it empty, or drop the partition: an optional field accepts empty.',
          );
        } else if (quotesOnlyLabel(p.rule, control)) {
          errors.push(
            pLabel +
              '.rule quotes only the field\\'s label "' +
              p.rule.excerpt +
              '", which names the field and states no rule - quote where the page states what makes the value invalid.',
          );
        }
        if (CLOSED_CHOICE_KINDS.has(value.kind) && !offLevel) {
          errors.push(
            pLabel +
              ' is an invalid value for a ' +
              value.kind +
              ', which the control itself can never produce - set executionLevel to dom (set by script, past the control) or api.',
          );
        } else if (control && (control.type === 'range' || control.role === 'slider') && !offLevel) {
          // A slider only ever holds a value inside its range: dragged or typed, it stops at the ends.
          errors.push(
            pLabel +
              ' is a value outside the range of a slider, which no person can set - set executionLevel to dom (set by script: the browser clamps it, which is what to check) or api.',
          );
        }
        if (p.executionLevel === 'api' && !context.routesWithObservedCalls.has(context.routeId)) {
          errors.push(
            pLabel +
              ".executionLevel is api, but no API call was observed on this route in artifacts/site-map/api-contracts.json - use dom, or re-crawl the route so the call it makes is recorded.",
          );
        }
      }

      if (options && samplesOk) {
        p.sampleValues.forEach(function (sample) {
          const offered = options.has(normalizeOption(sample));
          if (p.kind === 'valid' && !offered && optionsComplete) {
            errors.push(
              pLabel +
                ' sample "' +
                sample +
                '" is not one of the options this ' +
                value.kind +
                ' offers - a valid sample has to be a value a person can pick.',
            );
          }
          if (p.kind === 'invalid' && offered) {
            errors.push(
              pLabel +
                ' sample "' +
                sample +
                '" is one of the options this ' +
                value.kind +
                ' offers, so it cannot be invalid - move it to a valid partition.',
            );
          }
        });
      }
    });
    // An invalid value is only ever combined with valid values of the other parameters, and a
    // boundary probe holds everything else at a valid value, so every parameter needs one.
    if (!hasValid) {
      errors.push(
        label +
          " has no 'valid'-kind partition - a parameter with no acceptable value cannot anchor the others. Either a partition is mislabelled or this is not an input.",
      );
    }
  }
  if (!Array.isArray(value.boundaries)) {
    errors.push(label + '.boundaries must be an array.');
  } else {
    value.boundaries.forEach(function (b, i) {
      const bLabel = label + '.boundaries[' + i + ']';
      if (!b || typeof b !== 'object') {
        errors.push(bLabel + ' must be an object.');
        return;
      }
      if (!BOUNDARY_VALUES.has(b.boundary)) {
        errors.push(bLabel + '.boundary must be one of min|max.');
      }
      if (
        !Array.isArray(b.values) ||
        b.values.length !== 3 ||
        !b.values.every(function (v) {
          return typeof v === 'string';
        })
      ) {
        errors.push(bLabel + '.values must be a 3-element array of strings.');
      }
      checkRule(b.rule, bLabel + '.rule', value.kind, errors);
      if (control) checkRuleAgainstControl(b.rule, bLabel + '.rule', control, errors, warnings);
      checkOutcome(b.acceptedOutcome, bLabel + '.acceptedOutcome', errors);
      checkOutcome(b.rejectedOutcome, bLabel + '.rejectedOutcome', errors);
      const values = Array.isArray(b.values) ? b.values : [];
      for (const which of ['acceptedOutcome', 'rejectedOutcome']) {
        if (saysNothingOwn(b[which], own.concat(values))) {
          errors.push(bLabel + '.' + which + ' "' + b[which] + '" is true of any field - name what a person sees at this limit.');
        }
      }
    });
    // A limit the markup declares is one a test can hit. Live-observed: 26 of them on 14 fields of a
    // run, a GUID count of min=1 max=1000 among them, and not one boundary recorded.
    const constraints = control && control.constraints && typeof control.constraints === 'object' ? control.constraints : {};
    const SIDE_OF_LIMIT = { min: 'min', minlength: 'min', max: 'max', maxlength: 'max' };
    for (const attr of Object.keys(SIDE_OF_LIMIT)) {
      if (!(attr in constraints)) continue;
      const side = SIDE_OF_LIMIT[attr];
      const recorded = value.boundaries.some(function (b) {
        return b && b.boundary === side;
      });
      if (!recorded) {
        errors.push(
          label +
            ' is a field the page limits with ' +
            attr +
            '=' +
            constraints[attr] +
            ', and no ' +
            side +
            ' boundary records it - add one to boundaries: one step inside, the limit, one step past, and what a person sees at each. A probe that cannot apply here (a slider stops at its end) is cut in the assistant\\'s check, with the reason.',
        );
      }
    }
  }
  isEvidenceArray(value.evidence, label + '.evidence', errors);
}

// How many values in a condition's vector come from an 'invalid' partition. Boundary and checklist
// probes carry their fault as a literal, so for them every partition-id value has to be valid.
function invalidPartitionCount(condition, parameters) {
  let count = 0;
  for (const [name, value] of Object.entries(condition.parameters || {})) {
    const param = parameters.find(function (p) {
      return p && p.name === name;
    });
    if (!param || !Array.isArray(param.partitions)) continue;
    const partition = param.partitions.find(function (p) {
      return p && p.id === value;
    });
    if (partition && partition.kind === 'invalid') count++;
  }
  return count;
}

function isConstraint(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  ['ifParam', 'ifPartition', 'thenParam', 'thenExcludesPartition'].forEach(function (field) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      errors.push(label + '.' + field + ' must be a non-empty string.');
    }
  });
}

function isVerificationContract(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (value.network !== undefined) {
    if (!value.network || typeof value.network.status !== 'number') {
      errors.push(label + '.network.status must be a number when network is present.');
    } else if (value.network.status >= 500) {
      errors.push(
        label +
          '.network.status must not assert unhandled crash (status >= 500) under Defensive Oracle Polarity.',
      );
    }
  }
}

function isCondition(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (typeof value.conditionId !== 'string' || value.conditionId.length === 0) {
    errors.push(label + '.conditionId must be a non-empty string.');
  }
  if (!value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters)) {
    errors.push(label + '.parameters must be an object.');
  }
  if (!TECHNIQUE_VALUES.has(value.technique)) {
    errors.push(
      label +
        '.technique must be one of ' + Array.from(TECHNIQUE_VALUES).join('|') + '.',
    );
  }
  if (typeof value.description !== 'string' || value.description.length === 0) {
    errors.push(
      label + '.description must be a non-empty string - what a human actually reviews at sign-off.',
    );
  } else {
    const phrase = placeholderIn(value.description);
    if (phrase) {
      errors.push(
        label +
          '.description says "' +
          phrase +
          '" instead of what a person would see - name the message, value or state a test can check.',
      );
    }
  }
  checkOutcome(
    value.expectedOutcome,
    label + '.expectedOutcome',
    errors,
    value.technique === 'architectural-invariant' ||
      value.technique === 'error-guessing' ||
      value.technique === 'decision-table',
  );
  if (value.executionLevel !== undefined && !CONDITION_EXECUTION_LEVEL_VALUES.has(value.executionLevel)) {
    errors.push(label + '.executionLevel, when present, must be one of dom|api.');
  }
  if (!SCENARIO_VALUES.has(value.scenario)) {
    errors.push(label + '.scenario must be one of positive|negative.');
  }
  if (value.negativeCategory !== undefined) {
    if (
      typeof value.negativeCategory !== 'string' ||
      !NEGATIVE_CATEGORY_VALUES.has(value.negativeCategory)
    ) {
      errors.push(
        label +
          '.negativeCategory must be one of ' +
          Array.from(NEGATIVE_CATEGORY_VALUES).join('|') +
          '.',
      );
    }
    if (value.scenario === 'positive') {
      errors.push(label + '.negativeCategory cannot be set when scenario is "positive".');
    }
  }
  const categorised =
    value.technique === 'architectural-invariant' ||
    (value.technique === 'error-guessing' && value.scenario === 'negative');
  if (categorised) {
    if (
      typeof value.negativeCategory !== 'string' ||
      !NEGATIVE_CATEGORY_VALUES.has(value.negativeCategory)
    ) {
      errors.push(
        label +
          '.negativeCategory is required and must be a valid NegativeCategory on an ' +
          (value.technique === 'architectural-invariant' ? 'architectural-invariant' : 'negative error-guessing') +
          ' condition.',
      );
    }
  }
  if (
    value.technique === 'decision-table' &&
    (!value.parameters || typeof value.parameters !== 'object' || Object.keys(value.parameters).length === 0)
  ) {
    errors.push(
      label +
        '.parameters must name the inputs this rule combines, with the literal value each takes in this column - a decision rule with no inputs is not one.',
    );
  }
  if (value.technique === 'property' || value.technique === 'metamorphic') {
    const metamorphic = value.technique === 'metamorphic';
    const allowed = metamorphic ? METAMORPHIC_RELATIONS : PROPERTY_RELATIONS;
    if (!allowed.has(value.relation)) {
      errors.push(label + '.relation must be one of ' + Array.from(allowed).join('|') + ' for a ' + value.technique + ' condition.');
    }
    if (typeof value.sourceInput !== 'string' || value.sourceInput.trim().length === 0) {
      errors.push(label + '.sourceInput must say what the run enters, concretely enough to reproduce.');
    }
    if (metamorphic && (typeof value.followUpInput !== 'string' || value.followUpInput.trim().length === 0)) {
      errors.push(label + '.followUpInput must say how the second run is derived from the first - that link is the relation.');
    }
    if (value.scenario !== 'positive') {
      errors.push(label + '.scenario must be "positive" - a ' + value.technique + ' condition states what the output always obeys.');
    }
  }
  if (value.outputs !== undefined) {
    if (
      !Array.isArray(value.outputs) ||
      !value.outputs.every(function (id) {
        return typeof id === 'string';
      })
    ) {
      errors.push(label + '.outputs, when present, must be an array of inventory control ids.');
    }
  }
  if (value.relation === 'output-matches-display' && (!Array.isArray(value.outputs) || value.outputs.length === 0)) {
    errors.push(label + '.outputs must name the copy, export or download control whose delivery this checks.');
  }
  isVerificationContract(value.verification, label + '.verification', errors);
  if (typeof value.isSpeculative !== 'boolean') {
    errors.push(label + '.isSpeculative must be a boolean.');
  }
  if (typeof value.reviewed !== 'boolean') {
    errors.push(label + '.reviewed must be a boolean.');
  }
  // Business rule: an unverified (isSpeculative) condition can never simultaneously be marked
  // reviewed - reviewed:true is a human's explicit sign-off, which a still-speculative
  // verification contract has not received.
  if (value.isSpeculative === true && value.reviewed === true) {
    errors.push(label + ' cannot have isSpeculative:true and reviewed:true at the same time.');
  }
  // Independent of the rule above: whenever reviewed is true (by whatever means it got there),
  // reviewedBy must say who/what actually set it.
  if (value.reviewed === true && ['human', 'auto-pilot', 'assistant'].indexOf(value.reviewedBy) === -1) {
    errors.push(label + '.reviewedBy must be "human", "auto-pilot" or "assistant" when reviewed is true.');
  }
  if ('reviewer' in value && value.reviewer !== 'person' && value.reviewer !== 'assistant') {
    errors.push(label + '.reviewer, when present, must be person or assistant - the generator sets it.');
  }
  // The assistant approves only what needs no person: a condition resting on a business rule, or one
  // the analysis wrote, is a person's to approve.
  if (value.reviewedBy === 'assistant' && value.reviewer !== 'assistant') {
    errors.push(label + ' was approved by the assistant, but it is a person\\'s to review - it rests on a business rule or was written by the analysis.');
  }
  if ('cut' in value && typeof value.cut !== 'boolean') {
    errors.push(label + '.cut, when present, must be a boolean.');
  }
  if ('cutBy' in value && value.cutBy !== 'person' && value.cutBy !== 'assistant') {
    errors.push(label + '.cutBy, when present, must be person or assistant.');
  }
  if (value.cutBy === 'assistant' && (typeof value.cutReason !== 'string' || value.cutReason.trim().length === 0)) {
    errors.push(label + ' was cut by the assistant without a reason - a person reads why it does not apply here.');
  }
  if (value.cut === true && value.reviewed === true) {
    errors.push(label + ' is cut and approved at once - a cut condition is one nobody wants tested.');
  }
}

function isUnsatisfiedPair(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  ['paramA', 'partitionA', 'paramB', 'partitionB', 'reason'].forEach(function (field) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      errors.push(label + '.' + field + ' must be a non-empty string.');
    }
  });
}

// Every field the crawl recorded outside the site frame is a parameter or an explicit exclusion.
// Live-observed without this: a GUID generator's five format checkboxes and a pairwise tool's value
// fields never became parameters, while the header's language switcher became one on 13 routes.
// The site frame's fields are the one exception: they belong to the route named in frameRouteId,
// where they are tested once, and to no other. Returns how many frame fields this inventory holds,
// so the caller can tell whether the frame needs a route at all.
function accountForFields(entry, label, inventory, controlById, isFrameRoute, errors) {
  const frameFieldCount = inventory.controls.filter(function (control) {
    return isField(control) && FRAME_REGIONS.has(control.region);
  }).length;
  if (typeof inventory.contentHash === 'string' && inventory.contentHash !== entry.sourceContentHash) {
    errors.push(
      label +
        '.sourceContentHash does not match the inventory recorded for this route - the page was re-crawled after these parameters were extracted, so the control ids they cite may point at other fields. Re-extract this route.',
    );
    return frameFieldCount;
  }
  const accounted = new Map();
  // An exclusion may also name an output control, which is how a copy or download nobody should
  // check gets a stated reason instead of a missing condition.
  function cite(id, where, allowOutput) {
    const control = controlById.get(id);
    if (!control) {
      errors.push(where + ' cites control "' + id + '", which the inventory does not list.');
      return;
    }
    if (FRAME_REGIONS.has(control.region) && !isFrameRoute) {
      errors.push(
        where +
          ' cites ' +
          describeControl(control) +
          ' in the ' +
          control.region +
          ', which belongs to the site frame shared by every page - its fields are tested once, on the route named in frameRouteId, and nowhere else.',
      );
      return;
    }
    if (!isField(control) && !(allowOutput && control.output === true)) {
      errors.push(where + ' cites ' + describeControl(control) + ', which is not a field a value can be entered into.');
      return;
    }
    const members = radioGroupOf(control, inventory);
    for (const member of members) {
      if (accounted.has(member.id)) {
        errors.push(
          where + ' cites ' + describeControl(member) + ', already accounted for by ' + accounted.get(member.id) + '.',
        );
        return;
      }
    }
    for (const member of members) accounted.set(member.id, where);
  }

  entry.parameters.forEach(function (p, i) {
    const where = label + '.parameters[' + i + ']';
    if (p && typeof p.control === 'string') {
      cite(p.control, where, false);
      return;
    }
    // A field the inventory does not list exists only because a probe on this page revealed it, so
    // it has to name that field - which also rules out the site frame, whose fields reveal nothing
    // on the page underneath.
    const revealer = p && typeof p.revealedBy === 'string' ? controlById.get(p.revealedBy) : null;
    if (!revealer || FRAME_REGIONS.has(revealer.region) || !isField(revealer)) {
      errors.push(
        where +
          ' has no control and no revealedBy naming one of this page\\'s own fields that revealed it - cite its id from the inventory, or leave it out if it belongs to the site frame.',
      );
    }
  });
  (Array.isArray(entry.excluded) ? entry.excluded : []).forEach(function (x, i) {
    const where = label + '.excluded[' + i + ']';
    if (!x || typeof x.control !== 'string') {
      errors.push(where + '.control must be a control id from the inventory.');
      return;
    }
    if (!EXCLUSION_REASONS.has(x.reason)) {
      errors.push(where + '.reason must be one of ' + Array.from(EXCLUSION_REASONS).join('|') + '.');
    }
    if ('note' in x && typeof x.note !== 'string') {
      errors.push(where + '.note, when present, must be a string.');
    }
    cite(x.control, where, true);
  });

  for (const control of inventory.controls) {
    if (!isField(control) || accounted.has(control.id)) continue;
    if (FRAME_REGIONS.has(control.region) && !isFrameRoute) continue;
    errors.push(
      label +
        ' leaves ' +
        describeControl(control) +
        ' unaccounted - make it a parameter (control: "' +
        control.id +
        '") or list it under excluded with a reason.',
    );
  }
  return frameFieldCount;
}

// A copy, export or download control hands the page's result to somewhere a test has to look at
// separately - live-observed, not one condition on a whole toolkit checked an Excel export or a
// "Copy to Clipboard". Each needs a condition naming it in outputs, or an exclusion with a reason
// that fits a control: a second run excused 48 of 49 as "result-output", which is what a result box
// is, not what a button delivering the result is. A field excluded as result-output is where the
// page shows its result, so a condition may name it in outputs too.
function checkOutputs(entry, label, controlById, inventory, isFrameRoute, errors) {
  const excluded = Array.isArray(entry.excluded) ? entry.excluded : [];
  const resultFields = new Set(
    excluded
      .filter(function (item) {
        return item && item.reason === 'result-output' && typeof item.control === 'string';
      })
      .map(function (item) {
        return item.control;
      }),
  );
  const checked = new Set();
  (Array.isArray(entry.conditions) ? entry.conditions : []).forEach(function (condition, i) {
    const outputs = condition && Array.isArray(condition.outputs) ? condition.outputs : [];
    outputs.forEach(function (id) {
      const control = controlById.get(id);
      if (!control || (control.output !== true && !resultFields.has(id))) {
        errors.push(
          label +
            '.conditions[' +
            i +
            '].outputs cites "' +
            id +
            '", which is neither a copy, export or download control in the inventory nor a field this route excludes as result-output.',
        );
        return;
      }
      checked.add(id);
    });
  });
  const covered = new Set(checked);
  excluded.forEach(function (item, i) {
    if (!item || typeof item.control !== 'string') return;
    const control = controlById.get(item.control);
    if (control && control.output === true) {
      const where = label + '.excluded[' + i + ']';
      if (item.reason === 'result-output') {
        errors.push(
          where +
            ' leaves out ' +
            describeControl(control) +
            ' as result-output, but it delivers the result rather than showing it - check what it delivers (an output-matches-display property naming it in outputs), or exclude it as a duplicate of one a condition checks, off-limits, disabled or needs-button.',
        );
      } else if (item.reason === 'duplicate') {
        const standIn = (String(item.note || '').match(/\\bc\\d+\\b/g) || []).find(function (id) {
          return id !== item.control && checked.has(id);
        });
        if (!standIn) {
          errors.push(
            where +
              ' calls ' +
              describeControl(control) +
              ' a duplicate, but its note names no output control a condition checks - name the control id that stands for it, and check that one.',
          );
        }
      }
    }
    covered.add(item.control);
  });
  for (const control of inventory.controls) {
    if (control.output !== true || covered.has(control.id)) continue;
    if (FRAME_REGIONS.has(control.region) && !isFrameRoute) continue;
    errors.push(
      label +
        ': ' +
        describeControl(control) +
        ' sends the page\\'s result elsewhere, and no condition checks what it delivers - add a property condition with relation output-matches-display naming it in outputs, or exclude it with a reason.',
    );
  }
}

// Everything outside test-conditions.json that an anchor may point at: the feature map, the field
// probes, the research each feature cites, and every route's inventory. Loaded once; a file that is
// missing leaves its kind of anchor unverifiable, and the anchor check says so rather than passing it.
function loadContext(data) {
  const featureMapLoaded = loadJson(FEATURE_MAP_PATH, 'artifacts/analysis/feature-map.json');
  const featureMap = featureMapLoaded.error ? null : featureMapLoaded.value;
  const siteMapLoaded = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json');
  const titleOf = new Map();
  const pathOf = new Map();
  if (!siteMapLoaded.error && siteMapLoaded.value && siteMapLoaded.value.routes && typeof siteMapLoaded.value.routes === 'object') {
    for (const [routePath, route] of Object.entries(siteMapLoaded.value.routes)) {
      if (route && typeof route.routeId === 'string' && typeof route.title === 'string') titleOf.set(route.routeId, route.title);
      if (route && typeof route.routeId === 'string') pathOf.set(route.routeId, routePath);
    }
  }
  const probesLoaded = loadJson(PROBES_PATH, 'artifacts/analysis/field-probes.json');
  const probeIds = new Set();
  if (!probesLoaded.error && probesLoaded.value && Array.isArray(probesLoaded.value.probes)) {
    for (const probe of probesLoaded.value.probes) {
      if (probe && typeof probe.id === 'string') probeIds.add(probe.id);
    }
  }
  const researchIds = new Map();
  // The checks each feature's research record holds, by id: what the research says to test, each of
  // which a condition of the feature cites or the analysis declines.
  const researchChecks = new Map();
  // The ids of each feature's field constraints, for the constraint anchors that say what tests them.
  const constraintIds = new Map();
  const features = data.features && typeof data.features === 'object' ? data.features : {};
  for (const [featureId, analysis] of Object.entries(features)) {
    const research = analysis && analysis.research;
    const ids = new Set();
    const checks = new Map();
    if (research && typeof research.file === 'string') {
      const loaded = loadJson(path.join(CWD, research.file), research.file);
      if (!loaded.error && loaded.value && Array.isArray(loaded.value.sources)) {
        for (const source of loaded.value.sources) {
          if (source && typeof source.id === 'string') ids.add(source.id);
        }
      }
      if (!loaded.error && loaded.value && Array.isArray(loaded.value.checks)) {
        for (const check of loaded.value.checks) {
          if (check && typeof check.id === 'string') checks.set(check.id, typeof check.statement === 'string' ? check.statement : '');
        }
      }
    }
    researchIds.set(featureId, ids);
    researchChecks.set(featureId, checks);
    const constraints = new Set();
    for (const field of analysis && Array.isArray(analysis.fields) ? analysis.fields : []) {
      for (const constraint of field && Array.isArray(field.constraints) ? field.constraints : []) {
        if (constraint && typeof constraint.id === 'string' && constraint.id.length > 0) constraints.add(constraint.id);
      }
    }
    constraintIds.set(featureId, constraints);
  }
  // Which routes each feature owns, by the feature map; and the one feature each route belongs to.
  const membersOf = new Map();
  const featureOfRoute = new Map();
  if (featureMap && featureMap.features && typeof featureMap.features === 'object') {
    for (const [featureId, feature] of Object.entries(featureMap.features)) {
      membersOf.set(featureId, new Set(feature && Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : []));
    }
  }
  if (featureMap && featureMap.routes && typeof featureMap.routes === 'object') {
    for (const [routeId, intent] of Object.entries(featureMap.routes)) {
      if (!intent || typeof intent.featureId !== 'string') continue;
      featureOfRoute.set(routeId, intent.featureId);
      if (!membersOf.has(intent.featureId)) membersOf.set(intent.featureId, new Set());
      membersOf.get(intent.featureId).add(routeId);
    }
  }
  return {
    featureMap: featureMap,
    probesFileExists: !probesLoaded.error,
    probeIds: probeIds,
    researchIds: researchIds,
    researchChecks: researchChecks,
    constraintIds: constraintIds,
    membersOf: membersOf,
    featureOfRoute: featureOfRoute,
    titleOf: titleOf,
    pathOf: pathOf,
    // Filled per route by validate(): routeId -> Map(controlId -> control).
    controlsByRoute: new Map(),
  };
}

// An anchor is a claim about where something comes from, so it has to point at something that
// exists. scope.routeIds are the routes whose inventories a control id may come from; scope.featureId
// is the feature whose research a source id may come from.
function checkAnchors(anchors, label, scope, ctx, errors, required) {
  if (!Array.isArray(anchors)) {
    errors.push(label + ' must be an array of anchors (kind, ref[, quote]).');
    return [];
  }
  if (required && anchors.length === 0) {
    errors.push(label + ' must hold at least one anchor - what this rests on.');
  }
  const kinds = [];
  anchors.forEach(function (anchor, i) {
    const where = label + '[' + i + ']';
    if (!anchor || typeof anchor !== 'object') {
      errors.push(where + ' must be an object.');
      return;
    }
    if (!ANCHOR_KINDS.has(anchor.kind)) {
      errors.push(where + '.kind must be one of ' + Array.from(ANCHOR_KINDS).join('|') + '.');
      return;
    }
    kinds.push(anchor.kind);
    if (typeof anchor.ref !== 'string' || anchor.ref.trim().length === 0 || anchor.ref.length > 200) {
      errors.push(where + '.ref must be a non-empty string of at most 200 characters.');
      return;
    }
    if (QUOTED_ANCHORS.has(anchor.kind)) {
      if (typeof anchor.quote !== 'string' || anchor.quote.trim().length === 0 || anchor.quote.length > 200) {
        errors.push(where + '.quote must hold the words relied on (at most 200 characters) - a ' + anchor.kind + ' anchor says where, the quote says what.');
      }
    }
    if (anchor.kind === 'control') {
      const routeIds = scope.routeIds || [];
      const known = routeIds.filter(function (routeId) {
        return ctx.controlsByRoute.has(routeId);
      });
      if (known.length > 0) {
        const exists = known.some(function (routeId) {
          return ctx.controlsByRoute.get(routeId).has(anchor.ref);
        });
        if (!exists) errors.push(where + ' cites control "' + anchor.ref + '", which no inventory of ' + routeIds.join(', ') + ' lists.');
      }
    } else if (anchor.kind === 'probe') {
      if (!ctx.probeIds.has(anchor.ref)) {
        errors.push(
          where +
            ' cites probe "' +
            anchor.ref +
            '", which artifacts/analysis/field-probes.json does not hold' +
            (ctx.probesFileExists ? '' : ' (no probe was recorded at all)') +
            ' - an observation nobody recorded is not one.',
        );
      }
    } else if (anchor.kind === 'research') {
      const ids = ctx.researchIds.get(scope.featureId);
      const checks = ctx.researchChecks.get(scope.featureId);
      if ((!ids || !ids.has(anchor.ref)) && (!checks || !checks.has(anchor.ref))) {
        errors.push(where + ' cites research "' + anchor.ref + '", which the research record of this feature lists neither as a source nor as a check.');
      }
    } else if (anchor.kind === 'constraint') {
      const ids = ctx.constraintIds.get(scope.featureId);
      if (!ids || !ids.has(anchor.ref)) {
        errors.push(where + ' cites constraint "' + anchor.ref + '", which no field of this feature\\'s analysis states.');
      }
    } else if (anchor.kind === 'feature' || anchor.kind === 'entity') {
      const table = ctx.featureMap ? ctx.featureMap[anchor.kind === 'feature' ? 'features' : 'entities'] : null;
      if (table && typeof table === 'object' && !(anchor.ref in table)) {
        errors.push(where + ' cites ' + anchor.kind + ' "' + anchor.ref + '", which the feature map does not hold.');
      }
    } else if (anchor.kind === 'human' && !/^(?:domainNotes|question):\\d+$/.test(anchor.ref)) {
      errors.push(where + '.ref must be "domainNotes:<index>" or "question:<index>" - where the person said it.');
    }
  });
  return kinds;
}

// Which anchor kinds make each source of an expected result checkable. A result said to come from
// research, a person or a requirement has to point at it; one observed has to point at the
// observation; one the markup states, at the control.
function checkOracleAnchors(oracle, kinds, label, errors) {
  const needs = {
    research: ['research'],
    human: ['human'],
    requirement: Array.from(BASIS_ANCHORS),
    observed: ['probe', 'entity'],
    markup: ['control'],
  }[oracle];
  if (!needs) return;
  const found = kinds.some(function (kind) {
    return needs.indexOf(kind) !== -1;
  });
  if (!found) {
    errors.push(label + ' says the expected result comes from "' + oracle + '" but no anchor points at one (' + needs.join(' or ') + ').');
  }
}

function checkLevel(value, label, errors) {
  if (!LEVEL_VALUES.has(value)) errors.push(label + ' must be one of high|medium|low.');
}

// How sure a reading may say it is depends on how many independent sources stand behind it: the
// page's own markup, what a probe saw the page do, published research, a person, a document. One
// source is one reading, however confidently it is written down; two that agree, or a person's own
// word, is more. The ceiling is computed here, never chosen.
const LEVEL_RANK = { low: 1, medium: 2, high: 3 };
const GROUP_OF_ANCHOR = {
  probe: 'a probe',
  research: 'research',
  human: 'a person',
  requirement: 'a document',
  ticket: 'a document',
  code: 'a document',
  document: 'a document',
};

function fieldCeiling(field, analysis, control, inventoryKnown) {
  const groups = new Set();
  const context = !inventoryKnown || Boolean(control && (control.hint || control.placeholder || control.options || control.constraints || (control.type && control.type !== 'text')));
  if (!inventoryKnown || (control && (control.name || context))) groups.add(context ? "the page's markup" : "the field's label alone");
  for (const constraint of Array.isArray(field.constraints) ? field.constraints : []) {
    for (const anchor of constraint && Array.isArray(constraint.anchors) ? constraint.anchors : []) {
      if (anchor && GROUP_OF_ANCHOR[anchor.kind]) groups.add(GROUP_OF_ANCHOR[anchor.kind]);
    }
  }
  for (const question of Array.isArray(analysis.questions) ? analysis.questions : []) {
    if (question && field.control && question.about === field.control && typeof question.answer === 'string' && question.answer.trim()) {
      groups.add('a person');
    }
  }
  const level =
    groups.has('a person') || groups.has('a document') || groups.size >= 2
      ? 'high'
      : groups.size === 1 && !groups.has("the field's label alone")
        ? 'medium'
        : 'low';
  return { level: level, groups: Array.from(groups) };
}

// A constraint the markup states, a probe saw enforced, a person gave or a requirement says is as
// sure as its source. One reasoned from the meaning of the field, or taken from research, needs a
// second source to be sure - and a probe that saw the page accept a value breaking it disagrees.
function constraintCeiling(constraint, kinds) {
  if (['markup', 'observed', 'human', 'requirement'].indexOf(constraint.source) !== -1) return { level: 'high', groups: [] };
  const groups = new Set([constraint.source === 'research' ? 'research' : 'reasoning']);
  for (const kind of kinds) {
    if (kind === 'probe') {
      if (constraint.enforcement === 'observed') groups.add('a probe');
    } else if (GROUP_OF_ANCHOR[kind]) groups.add(GROUP_OF_ANCHOR[kind]);
  }
  let level = groups.size >= 2 ? 'high' : 'medium';
  if (groups.has('a person') || groups.has('a document')) level = 'high';
  else if (constraint.enforcement === 'not-enforced') level = 'medium';
  return { level: level, groups: Array.from(groups) };
}

function checkCeiling(claimed, ceiling, label, errors) {
  if (!LEVEL_RANK[claimed] || LEVEL_RANK[claimed] <= LEVEL_RANK[ceiling.level]) return;
  errors.push(
    label +
      ' is "' +
      claimed +
      '", but it rests on ' +
      (ceiling.groups.length > 0 ? ceiling.groups.join(' and ') : 'nothing recorded') +
      ' only - "' +
      ceiling.level +
      '" at most. A second independent source (a probe, research, a person\\'s answer) is what raises it.',
  );
}

function checkText(value, label, errors, max) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(label + ' must be a non-empty string.');
    return;
  }
  if (max && value.length > max) errors.push(label + ' must be at most ' + max + ' characters.');
  const phrase = placeholderIn(value);
  if (phrase) errors.push(label + ' says "' + phrase + '" - say what it actually is.');
}

// Why something is left untested - shown to the person reviewing, who can overturn it.
function checkReason(value, label, errors) {
  if (typeof value !== 'string' || value.trim().length < 10) {
    errors.push(label + ' must say why, in words a person reviewing would accept (at least 10 characters).');
    return;
  }
  checkText(value, label, errors, 300);
}

// The analysis of one feature: what it is for, how it serves the application, what each of its
// fields means and should obey, what it depends on, what is still a question, and what research
// backs it. Every condition of the feature is derived from this, so it is checked before any is.
function checkFeatureAnalysis(featureId, analysis, label, data, ctx, errors) {
  if (!analysis || typeof analysis !== 'object') {
    errors.push(label + ' must be an object.');
    return;
  }
  if (analysis.featureId !== featureId) errors.push(label + '.featureId must equal its own key ("' + featureId + '").');
  if (ctx.featureMap && ctx.featureMap.features && !(featureId in ctx.featureMap.features)) {
    errors.push(label + ' analyses a feature the feature map does not hold - re-run /map-features or drop it.');
  }
  checkText(analysis.purpose, label + '.purpose', errors, 300);
  checkText(analysis.fitsApplication, label + '.fitsApplication', errors, 500);
  checkText(analysis.archetype, label + '.archetype', errors, 60);
  checkLevel(analysis.confidence, label + '.confidence', errors);
  const members = Array.from(ctx.membersOf.get(featureId) || []);
  const scope = { routeIds: members.length > 0 ? members : Object.keys(data.routes), featureId: featureId };
  checkAnchors(analysis.anchors, label + '.anchors', scope, ctx, errors, true);

  const seenConstraintIds = new Set();
  if (!Array.isArray(analysis.fields)) {
    errors.push(label + '.fields must be an array - one meaning per field of the feature.');
  } else {
    analysis.fields.forEach(function (field, i) {
      const where = label + '.fields[' + i + ']';
      if (!field || typeof field !== 'object') {
        errors.push(where + ' must be an object.');
        return;
      }
      if (typeof field.routeId !== 'string' || !(field.routeId in data.routes)) {
        errors.push(where + '.routeId must name a route in this file.');
      } else if (members.length > 0 && members.indexOf(field.routeId) === -1) {
        errors.push(where + '.routeId "' + field.routeId + '" is not a route of this feature in the feature map.');
      }
      const hasControl = typeof field.control === 'string' && field.control.length > 0;
      const hasParameter = typeof field.parameter === 'string' && field.parameter.length > 0;
      if (hasControl === hasParameter) {
        errors.push(where + ' must name exactly one of control (its inventory id) or parameter (a field a probe revealed).');
      }
      if (hasControl && ctx.controlsByRoute.has(field.routeId) && !ctx.controlsByRoute.get(field.routeId).has(field.control)) {
        errors.push(where + '.control "' + field.control + '" is not in the inventory of ' + field.routeId + '.');
      }
      checkText(field.meaning, where + '.meaning', errors, 300);
      const fieldControl = hasControl && ctx.controlsByRoute.has(field.routeId) ? ctx.controlsByRoute.get(field.routeId).get(field.control) : null;
      // What a field's meaning and constraints may borrow and still say something: its label, and
      // the title of its page.
      const fieldOwn = labelOf(fieldControl).concat(ctx.titleOf.get(field.routeId) || [], field.parameter || []);
      if (hasControl && citesControlId(field.meaning, field.control)) {
        errors.push(
          where + '.meaning names the control id ' + field.control + ' - say what the field means to the person using it: what they put in and what it changes.',
        );
      } else if (saysNothingOwn(field.meaning, fieldOwn)) {
        errors.push(
          where +
            '.meaning "' +
            field.meaning +
            '" only restates the field\\'s label - say what the value means here: what a person puts in, what it changes, in the terms of what this application is for.',
        );
      }
      if (!FIELD_ROLE_VALUES.has(field.role)) errors.push(where + '.role must be one of ' + Array.from(FIELD_ROLE_VALUES).join('|') + '.');
      if (fieldControl && field.role === 'free-text' && !takesFreeText(fieldControl)) {
        errors.push(
          where + '.role is free-text, but ' + describeControl(fieldControl) + ' only takes the values it offers - say what it holds: a quantity, a choice, a toggle, a setting.',
        );
      }
      if ('unit' in field && typeof field.unit !== 'string') errors.push(where + '.unit, when present, must be a string.');
      checkLevel(field.confidence, where + '.confidence', errors);
      if (!Array.isArray(field.constraints)) {
        errors.push(where + '.constraints must be an array (empty is a statement too: "any value").');
        return;
      }
      field.constraints.forEach(function (constraint, j) {
        const at = where + '.constraints[' + j + ']';
        if (!constraint || typeof constraint !== 'object') {
          errors.push(at + ' must be an object.');
          return;
        }
        checkText(constraint.statement, at + '.statement', errors, 200);
        if (saysNothingOwn(constraint.statement, fieldOwn)) {
          errors.push(
            at +
              '.statement "' +
              constraint.statement +
              '" states no rule - say the rule itself (a limit, a format, the values allowed), or leave constraints empty when nothing constrains the field.',
          );
        }
        // A rule the markup states is tested by the field's own boundaries and partitions; any other
        // is tested by whatever cites it, so it needs a name to be cited by.
        if ('id' in constraint || constraint.source !== 'markup') {
          if (typeof constraint.id !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(constraint.id)) {
            errors.push(
              at +
                '.id must be a short id, unique within the feature ("r1") - the partition, boundary or condition that tests this rule cites it with a constraint anchor.',
            );
          } else if (seenConstraintIds.has(constraint.id)) {
            errors.push(at + '.id "' + constraint.id + '" is already the id of another constraint of this feature.');
          } else {
            seenConstraintIds.add(constraint.id);
          }
        }
        if ('untestedReason' in constraint) checkReason(constraint.untestedReason, at + '.untestedReason', errors);
        if (!ORACLE_VALUES.has(constraint.source)) errors.push(at + '.source must be one of ' + Array.from(ORACLE_VALUES).join('|') + '.');
        checkLevel(constraint.confidence, at + '.confidence', errors);
        if (!ENFORCEMENT_VALUES.has(constraint.enforcement)) {
          errors.push(at + '.enforcement must be one of ' + Array.from(ENFORCEMENT_VALUES).join('|') + '.');
        }
        const kinds = checkAnchors(constraint.anchors, at + '.anchors', { routeIds: [field.routeId], featureId: featureId }, ctx, errors, true);
        checkOracleAnchors(constraint.source, kinds, at, errors);
        if ((constraint.enforcement === 'observed' || constraint.enforcement === 'not-enforced') && kinds.indexOf('probe') === -1) {
          errors.push(at + ' says the page ' + (constraint.enforcement === 'observed' ? 'enforces' : 'does not enforce') + ' it, which only a field probe can show - anchor the probe.');
        }
        checkCeiling(constraint.confidence, constraintCeiling(constraint, kinds), at + '.confidence', errors);
      });
      const inventoryKnown = ctx.controlsByRoute.has(field.routeId);
      const control = hasControl && inventoryKnown ? ctx.controlsByRoute.get(field.routeId).get(field.control) : null;
      checkCeiling(field.confidence, fieldCeiling(field, analysis, control, inventoryKnown), where + '.confidence', errors);
    });
  }

  if (!Array.isArray(analysis.dependencies)) {
    errors.push(label + '.dependencies must be an array.');
  } else {
    analysis.dependencies.forEach(function (dependency, i) {
      const where = label + '.dependencies[' + i + ']';
      if (!dependency || typeof dependency !== 'object') return errors.push(where + ' must be an object.');
      checkText(dependency.on, where + '.on', errors, 100);
      if (!DEPENDENCY_KINDS.has(dependency.kind)) errors.push(where + '.kind must be one of feature|entity|external.');
      checkText(dependency.why, where + '.why', errors, 300);
    });
  }
  if (!Array.isArray(analysis.questions)) {
    errors.push(label + '.questions must be an array (empty when nothing is in doubt).');
  } else {
    analysis.questions.forEach(function (question, i) {
      const where = label + '.questions[' + i + ']';
      if (!question || typeof question !== 'object') return errors.push(where + ' must be an object.');
      checkText(question.text, where + '.text', errors, 300);
      checkText(question.about, where + '.about', errors, 100);
      if ('answer' in question && typeof question.answer !== 'string') errors.push(where + '.answer, when present, must be what the person said.');
    });
  }

  const research = analysis.research;
  if (!research || typeof research !== 'object') {
    errors.push(label + '.research must say whether research was done, reused or skipped, and why.');
  } else {
    if (!RESEARCH_STATUSES.has(research.status)) errors.push(label + '.research.status must be one of done|cached|skipped.');
    checkText(research.archetype, label + '.research.archetype', errors, 60);
    if (research.status === 'skipped') {
      checkText(research.reason, label + '.research.reason', errors, 200);
    } else if (research.status === 'done' || research.status === 'cached') {
      if (typeof research.file !== 'string' || research.file.indexOf(RESEARCH_DIR + '/') !== 0) {
        errors.push(label + '.research.file must be the record under ' + RESEARCH_DIR + '/ that scripts/test-research.mjs wrote.');
      } else {
        const ids = ctx.researchIds.get(featureId);
        if (!ids || ids.size < MIN_RESEARCH_SOURCES) {
          errors.push(
            label +
              '.research.file ' +
              research.file +
              ' holds ' +
              (ids ? ids.size : 0) +
              ' source(s); research rests on at least ' +
              MIN_RESEARCH_SOURCES +
              ' - record it with node scripts/test-research.mjs, or mark it skipped with the reason.',
          );
        }
      }
    }
    if ('declined' in research) {
      if (!Array.isArray(research.declined)) {
        errors.push(label + '.research.declined, when present, must be an array of { check, reason }.');
      } else {
        const checks = ctx.researchChecks.get(featureId) || new Map();
        const seen = new Set();
        research.declined.forEach(function (item, i) {
          const at = label + '.research.declined[' + i + ']';
          if (!item || typeof item !== 'object') {
            errors.push(at + ' must be an object.');
            return;
          }
          if (typeof item.check !== 'string' || !checks.has(item.check)) {
            errors.push(at + '.check "' + item.check + '" is not a check of this feature\\'s research record.');
          } else if (seen.has(item.check)) {
            errors.push(at + '.check "' + item.check + '" is declined twice.');
          } else {
            seen.add(item.check);
          }
          checkReason(item.reason, at + '.reason', errors);
        });
      }
    }
  }
  if ('untestedReason' in analysis) checkReason(analysis.untestedReason, label + '.untestedReason', errors);
  checkText(analysis.analyzedAt, label + '.analyzedAt', errors);
}

// What each feature's analysis says to test, set against what its partitions, boundaries and
// conditions test. A research check, or a rule of a field the markup does not state, that nothing
// cites was read and then dropped - live-observed, 35 of 36 research checks never became a condition,
// and nothing could tell which. A cut condition still counts: cutting it was a decision someone made
// where the review shows it.
function checkCoverage(data, ctx, errors, warnings) {
  const found = new Map();
  function slot(featureId) {
    if (!found.has(featureId)) found.set(featureId, { research: new Set(), constraint: new Set(), conditions: 0, edges: 0, inputPages: 0 });
    return found.get(featureId);
  }
  function note(featureId, anchors) {
    if (typeof featureId !== 'string') return;
    for (const anchor of Array.isArray(anchors) ? anchors : []) {
      if (!anchor || typeof anchor.ref !== 'string') continue;
      if (anchor.kind === 'research') slot(featureId).research.add(anchor.ref);
      else if (anchor.kind === 'constraint') slot(featureId).constraint.add(anchor.ref);
    }
  }
  for (const [routeId, entry] of Object.entries(data.routes)) {
    if (!entry || typeof entry !== 'object') continue;
    const routeFeature = ctx.featureOfRoute.get(routeId);
    const controls = ctx.controlsByRoute.get(routeId) || new Map();
    let takesInput = false;
    for (const param of Array.isArray(entry.parameters) ? entry.parameters : []) {
      if (!param || typeof param !== 'object') continue;
      const control = typeof param.control === 'string' ? controls.get(param.control) : null;
      if (!(control && FRAME_REGIONS.has(control.region))) takesInput = true;
      const sets = [].concat(Array.isArray(param.partitions) ? param.partitions : [], Array.isArray(param.boundaries) ? param.boundaries : []);
      for (const set of sets) if (set) note(routeFeature, set.anchors);
    }
    if (takesInput && typeof routeFeature === 'string') slot(routeFeature).inputPages += 1;
    for (const condition of Array.isArray(entry.conditions) ? entry.conditions : []) {
      if (!condition || typeof condition.featureId !== 'string') continue;
      slot(condition.featureId).conditions += 1;
      if (condition.cut !== true && (condition.scenario === 'negative' || condition.technique === 'boundary-value')) slot(condition.featureId).edges += 1;
      note(condition.featureId, condition.anchors);
    }
  }
  for (const [featureId, analysis] of Object.entries(data.features)) {
    if (!analysis || typeof analysis !== 'object') continue;
    const label = 'features["' + featureId + '"]';
    const tested = slot(featureId);
    const research = analysis.research;
    if (research && (research.status === 'done' || research.status === 'cached')) {
      const declined = new Set(
        (Array.isArray(research.declined) ? research.declined : []).map(function (item) {
          return item && item.check;
        }),
      );
      for (const [id, statement] of ctx.researchChecks.get(featureId) || new Map()) {
        if (tested.research.has(id) && declined.has(id)) {
          errors.push(label + '.research declines check ' + id + ', which a condition of the feature cites - keep one or the other.');
        } else if (!tested.research.has(id) && !declined.has(id)) {
          errors.push(
            label +
              ': research check ' +
              id +
              ' ("' +
              statement.slice(0, 100) +
              '") is cited by no condition of this feature and not declined - write the condition it asks for (origin research, anchored { kind: "research", ref: "' +
              id +
              '" }), or add it to research.declined with the reason it does not apply here.',
          );
        }
      }
    }
    (Array.isArray(analysis.fields) ? analysis.fields : []).forEach(function (field, i) {
      (field && Array.isArray(field.constraints) ? field.constraints : []).forEach(function (constraint, j) {
        if (!constraint || constraint.source === 'markup' || typeof constraint.id !== 'string') return;
        const at = label + '.fields[' + i + '].constraints[' + j + '] ("' + String(constraint.statement).slice(0, 100) + '")';
        const cited = tested.constraint.has(constraint.id);
        const reasoned = typeof constraint.untestedReason === 'string' && constraint.untestedReason.trim().length > 0;
        if (cited && reasoned) {
          errors.push(at + ' is tested and says why it is not - drop untestedReason.');
        } else if (!cited && !reasoned) {
          errors.push(
            at +
              ' is tested by nothing - cite it ({ kind: "constraint", ref: "' +
              constraint.id +
              '" }) from the partition, boundary or condition that tests it, or say in untestedReason why nothing does.',
          );
        }
      });
    });
    const hasReason = typeof analysis.untestedReason === 'string' && analysis.untestedReason.trim().length > 0;
    if (tested.conditions === 0 && !hasReason) {
      errors.push(label + ' has not one condition on any of its pages - write what it should be tested for, or say in untestedReason why there is nothing to test.');
    } else if (tested.conditions > 0 && hasReason) {
      errors.push(label + '.untestedReason says there is nothing to test, but the feature has conditions - drop it.');
    }
    // A warning, not an error: a count with no source invites padding, but a feature that takes input
    // and tries nothing past its main flow is worth a second look before the person sees "0".
    if (tested.inputPages > 0 && tested.edges === 0) {
      warnings.push(
        label +
          ' takes input on ' +
          tested.inputPages +
          ' page(s) and has no edge case - no invalid value, limit or negative condition. Add the ones its fields, rules and research suggest; the review shows the count either way.',
      );
    }
  }
}

// What a condition the analysis wrote may borrow and still say something of its own: the page's
// title and address, and the feature's name. What is left has to name something of this page - a
// value, a count, a message, the thing produced. The feature's purpose is left out on purpose: an
// honest one names the very values a good condition is about.
function ownWordsOf(condition, routeId, ctx) {
  const featureId = condition && condition.featureId;
  const feature = ctx.featureMap && ctx.featureMap.features && typeof featureId === 'string' ? ctx.featureMap.features[featureId] : null;
  return [ctx.titleOf.get(routeId), ctx.pathOf.get(routeId), feature && feature.name].filter(function (text) {
    return typeof text === 'string';
  });
}

function checkAuthoredSubstance(condition, label, own, errors) {
  if (!condition || typeof condition !== 'object' || condition.origin === 'generated' || GENERATED_TECHNIQUES.has(condition.technique)) return;
  if (saysNothingOwn(condition.description, own, CONDITION_WORDS)) {
    errors.push(
      label + '.description "' + condition.description + '" would read the same on any page - name what this feature does here: what goes in and what a person then sees.',
    );
  }
  if (saysNothingOwn(condition.expectedOutcome, own, CONDITION_WORDS)) {
    errors.push(
      label + '.expectedOutcome "' + condition.expectedOutcome + '" is true of any page - name what a person sees: the value, the count, the message and where it appears.',
    );
  }
  // Only the first run's input: a follow-up is derived from the first run's output ("the feet shown,
  // converted back to metres"), so it rightly carries no value of its own.
  if (saysNothingOwn(condition.sourceInput, own, CONDITION_WORDS)) {
    errors.push(
      label + '.sourceInput "' + condition.sourceInput + '" enters nothing a test could type - give the values: the number, the text, the option chosen.',
    );
  }
}

// Every page that takes input has a condition the analysis wrote saying what that input produces -
// the main flow a person reviews - naming where the page shows it, whenever it records such a place:
// a field excluded as result-output, or a copy, export or download control nothing excludes.
// Live-observed without this: 26 pages that take input, and not one condition saying what any of
// them produces.
function checkMainFlow(entry, label, controlById, inventory, errors) {
  const params = Array.isArray(entry.parameters) ? entry.parameters : [];
  const ownInputs = params.filter(function (p) {
    const control = p && typeof p.control === 'string' ? controlById.get(p.control) : null;
    return !(control && FRAME_REGIONS.has(control.region));
  });
  if (ownInputs.length === 0) return;
  const excluded = Array.isArray(entry.excluded) ? entry.excluded : [];
  const excludedIds = new Set();
  const places = new Map();
  for (const item of excluded) {
    if (!item || typeof item.control !== 'string') continue;
    excludedIds.add(item.control);
    if (item.reason === 'result-output' && controlById.has(item.control)) places.set(item.control, describeControl(controlById.get(item.control)));
  }
  for (const control of inventory ? inventory.controls : []) {
    if (control && control.output === true && !FRAME_REGIONS.has(control.region) && !excludedIds.has(control.id)) {
      places.set(control.id, describeControl(control));
    }
  }
  const flows = (Array.isArray(entry.conditions) ? entry.conditions : []).filter(function (c) {
    return c && c.origin !== 'generated' && !GENERATED_TECHNIQUES.has(c.technique) && c.scenario === 'positive' && c.layer === 'behavior';
  });
  const where = Array.from(places.values()).join('; ');
  if (flows.length === 0) {
    errors.push(
      label +
        ' takes input, and no condition says what that input produces - write one positive behavior condition: what a person enters and what the page then shows' +
        (places.size > 0 ? ', naming in outputs where it shows it (' + where + ')' : '') +
        '.',
    );
  } else if (
    places.size > 0 &&
    !flows.some(function (c) {
      return Array.isArray(c.outputs) && c.outputs.some(function (id) {
        return places.has(id);
      });
    })
  ) {
    errors.push(label + ': none of its positive behavior conditions names where the page shows the result - add it to outputs of the one that reads it there (' + where + ').');
  }
}

// Every parameter of a route stands on a meaning: what the field is for decides which partitions,
// limits and rules are real. A parameter nobody explained was extracted from the markup alone - the
// exact failure this stage exists to stop.
function checkMeaningCoverage(routeId, entry, label, data, ctx, errors) {
  const featureId = ctx.featureOfRoute.get(routeId);
  if (!featureId) return;
  const analysis = data.features && data.features[featureId];
  if (!analysis || typeof analysis !== 'object') {
    errors.push(label + ' belongs to feature ' + featureId + ', which has no analysis under features - analyse the feature before its fields.');
    return;
  }
  const meanings = Array.isArray(analysis.fields) ? analysis.fields : [];
  (Array.isArray(entry.parameters) ? entry.parameters : []).forEach(function (param, i) {
    if (!param || typeof param !== 'object') return;
    const explained = meanings.some(function (field) {
      if (!field || field.routeId !== routeId) return false;
      if (typeof param.control === 'string') return field.control === param.control;
      return field.parameter === param.name;
    });
    if (!explained) {
      errors.push(
        label +
          '.parameters[' +
          i +
          '] ("' +
          param.name +
          '") has no meaning in features["' +
          featureId +
          '"].fields - say what the field is for before partitioning it.',
      );
    }
  });
}

// What every condition carries for the review, checked against the feature it claims and the anchors
// it cites. Priority is the generator's arithmetic, so it has to agree with the risk it was built from.
function checkConditionContext(condition, label, routeId, data, ctx, errors) {
  if (!condition || typeof condition !== 'object') return;
  const featureId = condition.featureId;
  if (typeof featureId !== 'string' || featureId.length === 0) {
    errors.push(label + '.featureId must name the feature this condition serves.');
  } else {
    if (!data.features || !(featureId in data.features)) {
      errors.push(label + '.featureId "' + featureId + '" has no analysis under features.');
    }
    const members = ctx.membersOf.get(featureId);
    if (members && members.size > 0 && !members.has(routeId)) {
      errors.push(label + '.featureId "' + featureId + '" is not a feature of this route in the feature map.');
    }
  }
  if (!LAYER_VALUES.has(condition.layer)) errors.push(label + '.layer must be one of field|rule|behavior|frame.');
  if (!ORACLE_VALUES.has(condition.oracle)) errors.push(label + '.oracle must be one of ' + Array.from(ORACLE_VALUES).join('|') + '.');
  if (!ORIGIN_VALUES.has(condition.origin)) {
    errors.push(label + '.origin must be one of generated|model|research|human.');
  } else if ((condition.origin === 'generated') !== GENERATED_TECHNIQUES.has(condition.technique)) {
    errors.push(
      label +
        (condition.origin === 'generated'
          ? '.origin is "generated" but the generator never builds a ' + condition.technique + ' condition.'
          : ' is a ' + condition.technique + ' condition, which only the generator builds - re-run node scripts/generate-test-conditions.mjs instead of writing one.'),
    );
  }
  const kinds = checkAnchors(condition.anchors, label + '.anchors', { routeIds: [routeId], featureId: featureId }, ctx, errors, true);
  checkOracleAnchors(condition.oracle, kinds, label, errors);
  if (condition.origin === 'research' && kinds.indexOf('research') === -1) {
    errors.push(label + ' comes from research but cites no research source.');
  }
  if (condition.origin === 'human' && kinds.indexOf('human') === -1) {
    errors.push(label + ' comes from a person but cites no human anchor.');
  }
  const risk = condition.risk;
  if (!risk || typeof risk !== 'object') {
    errors.push(label + '.risk must state how likely this is to break here (likelihood) and why (reason).');
  } else {
    checkLevel(risk.likelihood, label + '.risk.likelihood', errors);
    checkText(risk.reason, label + '.risk.reason', errors, 300);
  }
  if (!Number.isInteger(condition.riskScore) || condition.riskScore < 1 || condition.riskScore > 9) {
    errors.push(label + '.riskScore is missing - run node scripts/generate-test-conditions.mjs, which ranks every condition.');
  } else {
    const tier = condition.riskScore >= 6 ? 'P1' : condition.riskScore >= 3 ? 'P2' : 'P3';
    if (condition.priority !== tier) {
      errors.push(label + '.priority "' + condition.priority + '" does not match riskScore ' + condition.riskScore + ' - re-run node scripts/generate-test-conditions.mjs rather than setting it by hand.');
    }
    if (risk && WEIGHT[risk.likelihood] && condition.riskScore % WEIGHT[risk.likelihood] !== 0) {
      errors.push(label + '.riskScore ' + condition.riskScore + ' is not the likelihood times an impact - re-run the generator.');
    }
  }
  if ('valueNote' in condition && (typeof condition.valueNote !== 'string' || condition.valueNote.length > 300)) {
    errors.push(label + '.valueNote, when present, must be one sentence of at most 300 characters.');
  }
}

function validate() {
  const errors = [];
  const report = loadJson(REPORT_PATH, 'artifacts/analysis/test-conditions.json');
  if (report.error) {
    errors.push(report.error);
    return { status: 'FAILED', errors };
  }
  const data = report.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'artifacts/analysis/test-conditions.json must contain a JSON object, found ' +
        JSON.stringify(data) +
        '.',
    );
    return { status: 'FAILED', errors };
  }

  if (data.schemaVersion !== 3) {
    errors.push(
      'schemaVersion must be exactly 3 (found ' +
        JSON.stringify(data.schemaVersion) +
        '). Treat as absent and re-run /define-test-conditions rather than migrating in place.',
    );
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if (!data.routes || typeof data.routes !== 'object' || Array.isArray(data.routes)) {
    errors.push('routes must be an object keyed by routeId.');
    return { status: 'FAILED', errors };
  }
  const basis = data.basis;
  if (!basis || typeof basis !== 'object' || !BASIS_MODES.has(basis.mode)) {
    errors.push('basis.mode must be one of live-app|documents|mixed - what these conditions were derived from.');
  } else if (
    !Array.isArray(basis.sources) ||
    basis.sources.length === 0 ||
    !basis.sources.every(function (source) {
      return typeof source === 'string' && source.length > 0;
    })
  ) {
    errors.push('basis.sources must list what was read: the base URL of a live application, the documents or tickets used.');
  }
  if (!data.features || typeof data.features !== 'object' || Array.isArray(data.features)) {
    errors.push('features must be an object keyed by featureId - the analysis every condition is derived from.');
    data.features = {};
  }
  const ctx = loadContext(data);

  const siteMap = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json');
  const knownRouteIds = new Set();
  const removedRoutes = new Map();
  const inventoryPathById = new Map();
  if (!siteMap.error && siteMap.value && typeof siteMap.value.routes === 'object') {
    for (const route of Object.values(siteMap.value.routes)) {
      if (!route || typeof route.routeId !== 'string') continue;
      knownRouteIds.add(route.routeId);
      if (route.status === 'removed') removedRoutes.set(route.routeId, route);
      inventoryPathById.set(
        route.routeId,
        typeof route.inventory === 'string' ? route.inventory : INVENTORY_DIR + '/' + route.routeId + '.json',
      );
    }
  }
  const warnings = [];
  const frameRouteId = data.frameRouteId;
  if (frameRouteId !== undefined && (typeof frameRouteId !== 'string' || !(frameRouteId in data.routes))) {
    errors.push('frameRouteId, when present, must name a route in this file - it is where the site frame is tested.');
  }
  let frameFieldsSeen = 0;

  // An api-level value is only testable where the crawl actually saw the route call an API. A
  // missing contracts file means nothing was observed anywhere, which is exactly that answer.
  const apiContracts = loadJson(API_CONTRACTS_PATH, 'artifacts/site-map/api-contracts.json');
  const routesWithObservedCalls = new Set();
  if (!apiContracts.error && apiContracts.value && Array.isArray(apiContracts.value.contracts)) {
    for (const contract of apiContracts.value.contracts) {
      const ids = contract && Array.isArray(contract.observedFromRouteIds) ? contract.observedFromRouteIds : [];
      for (const id of ids) routesWithObservedCalls.add(id);
    }
  }

  for (const [key, entry] of Object.entries(data.routes)) {
    const label = 'routes["' + key + '"]';
    if (!entry || typeof entry !== 'object') {
      errors.push(label + ' must be an object.');
      continue;
    }
    if (entry.routeId !== key) {
      errors.push(label + '.routeId must equal its own key ("' + key + '").');
    }
    if (typeof entry.sourceContentHash !== 'string' || entry.sourceContentHash.length === 0) {
      errors.push(label + '.sourceContentHash must be a non-empty string.');
    }
    if (typeof entry.analyzedAt !== 'string' || entry.analyzedAt.length === 0) {
      errors.push(label + '.analyzedAt must be a non-empty string.');
    }
    const inventoryPath = inventoryPathById.get(key);
    const inventoryLoaded = inventoryPath ? loadJson(path.join(CWD, inventoryPath), inventoryPath) : null;
    const inventory =
      inventoryLoaded && !inventoryLoaded.error && inventoryLoaded.value && Array.isArray(inventoryLoaded.value.controls)
        ? inventoryLoaded.value
        : null;
    const controlById = new Map();
    if (inventory) {
      for (const control of inventory.controls) {
        if (control && typeof control.id === 'string') controlById.set(control.id, control);
      }
      ctx.controlsByRoute.set(key, controlById);
    }
    checkMeaningCoverage(key, entry, label, data, ctx, errors);
    // A partition or boundary saying where its expected result comes from has to point at it, the
    // same way a condition does - the generator carries both onto every condition it builds.
    (Array.isArray(entry.parameters) ? entry.parameters : []).forEach(function (param, i) {
      const sets = []
        .concat((param && Array.isArray(param.partitions) ? param.partitions : []).map(function (p, j) { return [p, 'partitions[' + j + ']']; }))
        .concat((param && Array.isArray(param.boundaries) ? param.boundaries : []).map(function (b, j) { return [b, 'boundaries[' + j + ']']; }));
      sets.forEach(function (pair) {
        const set = pair[0];
        if (!set || typeof set !== 'object') return;
        const where = label + '.parameters[' + i + '].' + pair[1];
        if ('oracle' in set && !ORACLE_VALUES.has(set.oracle)) {
          errors.push(where + '.oracle must be one of ' + Array.from(ORACLE_VALUES).join('|') + '.');
          return;
        }
        const scope = { routeIds: [key], featureId: ctx.featureOfRoute.get(key) };
        const kinds = 'anchors' in set ? checkAnchors(set.anchors, where + '.anchors', scope, ctx, errors, false) : [];
        if (set.oracle && ['research', 'human', 'requirement'].indexOf(set.oracle) !== -1) {
          checkOracleAnchors(set.oracle, kinds, where, errors);
        }
      });
    });
    // A rule grounded in a field probe quotes that probe: "<probe id>: <what the page did>".
    (Array.isArray(entry.parameters) ? entry.parameters : []).forEach(function (param, i) {
      const rules = []
        .concat((param && Array.isArray(param.partitions) ? param.partitions : []).map(function (p) { return p && p.rule; }))
        .concat((param && Array.isArray(param.boundaries) ? param.boundaries : []).map(function (b) { return b && b.rule; }));
      rules.forEach(function (rule) {
        if (!rule || rule.signal !== 'field-probe' || typeof rule.excerpt !== 'string') return;
        const id = rule.excerpt.split(':')[0].trim();
        if (!ctx.probeIds.has(id)) {
          errors.push(
            label + '.parameters[' + i + '] cites field probe "' + id + '", which artifacts/analysis/field-probes.json does not hold - start the excerpt with the probe id.',
          );
        }
      });
    });

    // Without an inventory nothing can say a field was missed, so an empty list is refused outright;
    // with one, the accounting below is what decides - a page with no fields of its own has none.
    if (!Array.isArray(entry.parameters) || (!inventory && entry.parameters.length === 0)) {
      errors.push(label + '.parameters must be a non-empty array.');
    } else {
      entry.parameters.forEach(function (p, i) {
        isParameter(
          p,
          label + '.parameters[' + i + ']',
          {
            routeId: key,
            routesWithObservedCalls: routesWithObservedCalls,
            inventory: inventory,
            control: p && typeof p.control === 'string' ? controlById.get(p.control) || null : null,
            warnings: warnings,
          },
          errors,
        );
      });
    }

    if ('excluded' in entry && !Array.isArray(entry.excluded)) {
      errors.push(label + '.excluded, when present, must be an array.');
    }
    const isFrameRoute = frameRouteId === key;
    if (inventory && Array.isArray(entry.parameters)) {
      frameFieldsSeen += accountForFields(entry, label, inventory, controlById, isFrameRoute, errors);
    } else if (!inventory && inventoryPath) {
      warnings.push(
        label +
          ': no inventory at ' +
          inventoryPath +
          ', so nothing can check that every field on this page was accounted for - re-run /map-site to record one.',
      );
    }
    if (!Array.isArray(entry.constraints)) {
      errors.push(label + '.constraints must be an array.');
    } else {
      entry.constraints.forEach(function (c, i) {
        isConstraint(c, label + '.constraints[' + i + ']', errors);
      });
    }
    if (!siteMap.error && !knownRouteIds.has(key)) {
      errors.push(
        label +
          ' has no matching routeId in artifacts/site-map/site-map.json - dangling reference. Re-run /map-site or remove this entry.',
      );
    } else if (removedRoutes.has(key)) {
      errors.push(
        label +
          (removedRoutes.get(key).removedBy === 'human'
            ? ' is a page the person left out of every stage - remove this entry.'
            : ' is a page the site map marks removed - remove this entry, or re-run /map-site if the page is back.'),
      );
    }

    if (!PARAMETERS_ONLY) {
      if (!Array.isArray(entry.conditions)) {
        errors.push(label + '.conditions must be an array.');
      } else {
        const seenIds = new Set();
        const parameters = Array.isArray(entry.parameters) ? entry.parameters : [];
        entry.conditions.forEach(function (c, i) {
          isCondition(c, label + '.conditions[' + i + ']', errors);
          checkConditionContext(c, label + '.conditions[' + i + ']', key, data, ctx, errors);
          checkAuthoredSubstance(c, label + '.conditions[' + i + ']', ownWordsOf(c, key, ctx), errors);
          if (c && c.parameters && typeof c.parameters === 'object') {
            const invalid = invalidPartitionCount(c, parameters);
            const combining = c.technique === 'combinatorial' || c.technique === 'equivalence-partition';
            const probing = c.technique === 'boundary-value' || c.technique === 'checklist-based';
            if ((combining && invalid > 1) || (probing && invalid > 0)) {
              errors.push(
                label +
                  '.conditions[' +
                  i +
                  '] carries more than one invalid value - the first one rejected hides what happens to the rest. Re-run node scripts/generate-test-conditions.mjs rather than editing vectors by hand.',
              );
            }
          }
          if (c && typeof c.conditionId === 'string') {
            if (seenIds.has(c.conditionId)) {
              errors.push(
                label +
                  '.conditions[' +
                  i +
                  '].conditionId "' +
                  c.conditionId +
                  '" is a duplicate within this route.',
              );
            }
            seenIds.add(c.conditionId);
          }
        });
        checkMainFlow(entry, label, controlById, inventory, errors);
      }
      if (!Array.isArray(entry.unsatisfiedPairs)) {
        errors.push(label + '.unsatisfiedPairs must be an array.');
      } else {
        entry.unsatisfiedPairs.forEach(function (u, i) {
          isUnsatisfiedPair(u, label + '.unsatisfiedPairs[' + i + ']', errors);
        });
      }
      if (typeof entry.sourceParamsHash !== 'string') {
        errors.push(label + '.sourceParamsHash must be a string.');
      }
      if (inventory) checkOutputs(entry, label, controlById, inventory, isFrameRoute, errors);
    }
  }

  if (frameFieldsSeen > 0 && !frameRouteId) {
    warnings.push(
      'The site frame carries fields of its own (a language switcher, a theme toggle) and no route is named in frameRouteId, so they are tested nowhere - name the route that should carry them, usually the one with the fewest fields of its own.',
    );
  }

  // After the routes, so every inventory is loaded for the control anchors the analyses cite.
  for (const [featureId, analysis] of Object.entries(data.features)) {
    checkFeatureAnalysis(featureId, analysis, 'features["' + featureId + '"]', data, ctx, errors);
  }
  if (!PARAMETERS_ONLY) checkCoverage(data, ctx, errors, warnings);
  // Seven features, one sentence: "Provides <feature> capabilities within the toolkit." A purpose that
  // reads the same for three features or more once each one's own name is taken out was written for
  // none of them. A warning, not an error: sibling features can share a shape of sentence honestly.
  const sameText = new Map();
  for (const [featureId, analysis] of Object.entries(data.features)) {
    const mapped = ctx.featureMap && ctx.featureMap.features ? ctx.featureMap.features[featureId] : null;
    const name = mapped && typeof mapped.name === 'string' ? mapped.name : featureId;
    const nameWords = new Set(wordsOf(name));
    for (const field of ['purpose', 'fitsApplication']) {
      const words = wordsOf(analysis && analysis[field]).filter(function (word) {
        return !nameWords.has(word);
      });
      if (words.length < 6) continue;
      const key = field + '|' + words.join(' ');
      if (!sameText.has(key)) sameText.set(key, []);
      sameText.get(key).push(name);
    }
  }
  for (const [key, names] of sameText) {
    if (names.length < 3) continue;
    warnings.push(
      names.length +
        ' features share one ' +
        key.split('|')[0] +
        ' once their names are taken out (' +
        names.join(', ') +
        ') - it says what none of them does. Rewrite each from what the feature takes in and gives back.',
    );
  }
  // A question still open is a decision the tests depend on and nobody has made.
  const open = [];
  for (const [featureId, analysis] of Object.entries(data.features)) {
    const questions = analysis && Array.isArray(analysis.questions) ? analysis.questions : [];
    questions.forEach(function (question) {
      if (question && typeof question.answer !== 'string') open.push(featureId + ': ' + String(question.text).slice(0, 80));
    });
  }
  if (open.length > 0) {
    warnings.push(open.length + ' question(s) for a person are still open - ask them with the review: ' + open.slice(0, 5).join(' | '));
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors, warnings };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
