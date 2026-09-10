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
  'manual',
]);
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
]);
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
  if (control.type === 'number') return 'number';
  return null;
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
      } else if (control && control.type === 'number') {
        p.sampleValues.forEach(function (sample) {
          if (sample !== '' && !VALID_FLOAT.test(sample.trim())) {
            errors.push(
              pLabel +
                ' sample "' +
                sample +
                '" cannot be the value of a number field - the browser replaces anything that is not a number with an empty value. Use "" for an empty entry, or a number.',
            );
          }
        });
      }
      checkOutcome(p.expectedOutcome, pLabel + '.expectedOutcome', errors);

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
        if (CLOSED_CHOICE_KINDS.has(value.kind) && !offLevel) {
          errors.push(
            pLabel +
              ' is an invalid value for a ' +
              value.kind +
              ', which the control itself can never produce - set executionLevel to dom (set by script, past the control) or api.',
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
    });
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
    value.technique === 'architectural-invariant',
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
  if (value.technique === 'architectural-invariant') {
    if (
      typeof value.negativeCategory !== 'string' ||
      !NEGATIVE_CATEGORY_VALUES.has(value.negativeCategory)
    ) {
      errors.push(
        label +
          '.negativeCategory is required and must be a valid NegativeCategory when technique is "architectural-invariant".',
      );
    }
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
  if (value.reviewed === true && value.reviewedBy !== 'human' && value.reviewedBy !== 'auto-pilot') {
    errors.push(label + '.reviewedBy must be "human" or "auto-pilot" when reviewed is true.');
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
function accountForFields(entry, label, inventory, controlById, errors) {
  if (typeof inventory.contentHash === 'string' && inventory.contentHash !== entry.sourceContentHash) {
    errors.push(
      label +
        '.sourceContentHash does not match the inventory recorded for this route - the page was re-crawled after these parameters were extracted, so the control ids they cite may point at other fields. Re-extract this route.',
    );
    return;
  }
  const accounted = new Map();
  function cite(id, where) {
    const control = controlById.get(id);
    if (!control) {
      errors.push(where + ' cites control "' + id + '", which the inventory does not list.');
      return;
    }
    if (FRAME_REGIONS.has(control.region)) {
      errors.push(
        where +
          ' cites ' +
          describeControl(control) +
          ' in the ' +
          control.region +
          ', which belongs to the site frame shared by every page rather than to this route - leave it out.',
      );
      return;
    }
    if (!isField(control)) {
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
      cite(p.control, where);
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
    cite(x.control, where);
  });

  for (const control of inventory.controls) {
    if (!isField(control) || FRAME_REGIONS.has(control.region) || accounted.has(control.id)) continue;
    errors.push(
      label +
        ' leaves ' +
        describeControl(control) +
        ' unaccounted - make it a parameter (control: "' +
        control.id +
        '") or list it under excluded with a reason.',
    );
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

  if (data.schemaVersion !== 2) {
    errors.push(
      'schemaVersion must be exactly 2 (found ' +
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

  const siteMap = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json');
  const knownRouteIds = new Set();
  const inventoryPathById = new Map();
  if (!siteMap.error && siteMap.value && typeof siteMap.value.routes === 'object') {
    for (const route of Object.values(siteMap.value.routes)) {
      if (!route || typeof route.routeId !== 'string') continue;
      knownRouteIds.add(route.routeId);
      inventoryPathById.set(
        route.routeId,
        typeof route.inventory === 'string' ? route.inventory : INVENTORY_DIR + '/' + route.routeId + '.json',
      );
    }
  }
  const warnings = [];

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
    }

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
    if (inventory && Array.isArray(entry.parameters)) {
      accountForFields(entry, label, inventory, controlById, errors);
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
    }

    if (!PARAMETERS_ONLY) {
      if (!Array.isArray(entry.conditions)) {
        errors.push(label + '.conditions must be an array.');
      } else {
        const seenIds = new Set();
        const parameters = Array.isArray(entry.parameters) ? entry.parameters : [];
        entry.conditions.forEach(function (c, i) {
          isCondition(c, label + '.conditions[' + i + ']', errors);
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
    }
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors, warnings };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
