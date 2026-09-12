// Template for generating scripts/generate-test-conditions.mjs. create-if-absent.
// The deterministic half of ADR 0012 Stage 2's "Hybrid Two-Phase Engine": an LLM (via the
// /define-test-conditions skill's Step 2) infers parameters[]/constraints[] from read-only DOM
// inspection; this script mechanically expands that into 2-way combinatorial coverage plus
// 3-value boundary-value conditions, falling back to one condition per partition
// (equivalence-partition technique) for a route with fewer than 2 parameters, where pairwise
// coverage has nothing to pair against - zero model involvement, same zero-dependency style as
// scripts/orchestrate-swarm.mjs and the two validate-*.mjs scripts. The checklist-based technique
// additionally cross-references artifacts/analysis/feature-map.json's per-route criticality -
// reviewed entries only, per that file's own Human Sign-Off Gateway rule - to scale down on
// medium/low-criticality routes rather than firing the same fixed checklist everywhere regardless
// of the route's own importance.
//
// The combinatorial phase seeds one vector per remaining needed pair (in the pair's own build
// order) and greedily fills every other column around that seed, backtracking within the fill.
// This guarantees forward progress every iteration by construction - the loop resolves at least
// the pair it targeted each time, either by covering it (and everything else the finished vector
// incidentally covers) or by proving it unsatisfiable - so termination needs no arbitrary retry
// limit. A pair only proves genuinely unsatisfiable when filling the OTHER columns around it hits
// a real dead end (a 3-way-or-deeper conflict from multiple independent ConstraintRules
// interacting) - buildNeededPairs already excludes any pair directly forbidden by a single rule
// before it ever becomes a seed candidate.
//
// Invalid values follow the single-fault rule the same way PICT treats its negative values: two
// invalid values never share a vector, because the first rejection hides whatever the application
// does with the second. Valid pairs are covered only by all-valid vectors, and each invalid value is
// paired with every valid value of every other parameter in vectors that carry it alone. A valid
// pair sitting inside a negative vector does not count as covered - a rejected submission never
// exercised it.
//
// Descriptions carry no verbs of their own judgment. Each is the vector's values followed by the
// expected outcome the extraction step recorded on the partition or boundary it draws on, so a
// condition always names something a person can check.

import { PII_MASK_SOURCE } from './pii-mask.js';

export function renderTestConditionsEngine(): string {
  return `#!/usr/bin/env node

/**
 * Deterministic test-condition generator for artifacts/analysis/test-conditions.json.
 * Zero model involvement - reads parameters[]/constraints[] already extracted per route and
 * mechanically computes 2-way combinatorial coverage plus 3-value boundary-value conditions.
 *
 * Usage:
 *   node scripts/generate-test-conditions.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const CWD = process.cwd();
const REPORT_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');

const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const INVENTORY_DIR = path.join(CWD, 'artifacts', 'site-map', 'inventory');
// Techniques only the analysis writes. Together with any condition whose origin is not 'generated',
// these survive every regeneration untouched.
const MODEL_AUTHORED_TECHNIQUES = [
  'architectural-invariant',
  'property',
  'metamorphic',
  'decision-table',
  'error-guessing',
];
const FRAME_REGIONS = ['header', 'nav', 'footer', 'aside'];

// Risk level = likelihood x impact, each on a 1-3 scale - the conventional risk-matrix product.
const WEIGHT = { high: 3, medium: 2, low: 1 };

// How strongly a source says the expected result is right, strongest first. When a condition draws
// on several partitions, it carries the strongest of their oracles.
const ORACLE_ORDER = ['requirement', 'human', 'research', 'domain', 'observed', 'markup'];

// A generated condition's likelihood, by what it probes. The analysis states its own for every
// condition it writes; these are the generator's defaults for the ones it builds.
const DEFAULT_RISK = {
  'checklist-based': {
    likelihood: 'low',
    reason: 'a malformed or injection-shaped value that every field of this kind should turn away',
  },
  'boundary-value': { likelihood: 'medium', reason: 'limits are where off-by-one mistakes live' },
  'invalid-value': { likelihood: 'medium', reason: 'a value outside what the field should take' },
  'valid-combination': { likelihood: 'low', reason: 'valid values of several inputs meeting in one run' },
  'valid-value': { likelihood: 'low', reason: 'a representative value the feature should accept' },
  'state-transition': {
    likelihood: 'medium',
    reason: 'a transition of the entity lifecycle, where state handling usually breaks',
  },
  'use-case': { likelihood: 'medium', reason: 'the entity main flow walked end to end' },
};

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

// Deterministic redaction backstop, applied mechanically here rather than trusted to
// prompt-following alone.
${PII_MASK_SOURCE}

// Excerpts and option labels are read off the page, so the whole rule applies to them. Sample values
// are test data the extraction wrote itself, and masking one leaves its partition with nothing to
// type. So an email address stays, and so does a phone or card number reserved for testing; a plain
// number in a number field and a date in a date field stay too, where the analysis says the field
// holds a quantity, an amount, a date or a setting. Every other digit shape is still masked, in case
// a real account or card number was copied instead of made up.
const PLAIN_NUMBER = /^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][-+]?\\d+)?$/;
const PLAIN_DATE = /^\\d{4}-\\d{2}(?:-\\d{2})?(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?$|^\\d{2}:\\d{2}(?::\\d{2})?$/;
const MEASURING_ROLES = ['quantity', 'money', 'date-time', 'setting', 'search-filter', 'choice'];

function redactSample(param, role, value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  const plain = (param.kind === 'number' && PLAIN_NUMBER.test(text)) || (param.kind === 'date' && PLAIN_DATE.test(text));
  if (plain && MEASURING_ROLES.indexOf(role) !== -1) return value;
  return maskPii(value, { keepEmails: true, keepTestData: true });
}

function redactEntry(entry, fieldRoles) {
  for (const param of entry.parameters || []) {
    for (const ev of param.evidence || []) {
      if (ev && typeof ev.excerpt === 'string') ev.excerpt = maskPii(ev.excerpt);
    }
    const role = fieldRoles && param.control ? fieldRoles[param.control] : undefined;
    for (const partition of param.partitions || []) {
      if (Array.isArray(partition.sampleValues)) {
        partition.sampleValues = partition.sampleValues.map(function (value) {
          return redactSample(param, role, value);
        });
      }
    }
    if (Array.isArray(param.options)) {
      param.options = param.options.map(function (option) {
        return maskPii(option);
      });
    }
  }
}

// Stable serialization: object keys sorted at every level so two logically-identical
// parameters/constraints trees hash identically regardless of key-write order (two separate LLM
// extraction passes over the same unchanged page are not guaranteed to emit object keys in the
// same order). Array element order is kept as-is - element order is semantically meaningful here
// (partitions, boundary values, evidence entries), unlike object key order.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return (
      '{' +
      keys
        .map(function (k) {
          return JSON.stringify(k) + ':' + stableStringify(value[k]);
        })
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

function hashParams(entry, lifecycleBundle) {
  return crypto
    .createHash('sha256')
    .update(
      stableStringify({
        parameters: entry.parameters,
        constraints: entry.constraints || [],
        // A changed entity lifecycle changes which conditions this route should carry just as
        // surely as a changed parameter does, so it belongs in the same cheap-skip hash.
        lifecycle: lifecycleBundle || null,
      }),
    )
    .digest('hex');
}

// Same delimiter-collision-free convention as pairKey below (an ordered JSON tuple, not raw
// '='/'&'-joined concatenation) - a parameter name or partition id containing those characters
// could otherwise produce a colliding conditionId.
function conditionId(routeId, vector, extra) {
  const sortedEntries = Object.keys(vector || {})
    .sort()
    .map(function (k) {
      return [k, vector[k]];
    });
  const salt = extra ? '|' + extra : '';
  return crypto
    .createHash('sha256')
    .update(routeId + '|' + JSON.stringify(sortedEntries) + salt)
    .digest('hex')
    .slice(0, 16);
}

function paramIndex(parameters, name) {
  return parameters.findIndex(function (p) {
    return p.name === name;
  });
}

// Canonical, delimiter-collision-free key for an unordered parameter-value pair, ordered by the
// pair's position in the parameters array so buildNeededPairs/removeCoveredPairs/the seed loop all
// agree on the same key for the same logical pair regardless of call order.
function pairKey(parameters, nameA, valueA, nameB, valueB) {
  const iA = paramIndex(parameters, nameA);
  const iB = paramIndex(parameters, nameB);
  const ordered =
    iA <= iB
      ? [
          [nameA, valueA],
          [nameB, valueB],
        ]
      : [
          [nameB, valueB],
          [nameA, valueA],
        ];
  return JSON.stringify(ordered);
}

function violatesConstraint(paramName, partitionId, fixed, constraints) {
  for (const rule of constraints) {
    if (
      rule.thenParam === paramName &&
      rule.thenExcludesPartition === partitionId &&
      fixed[rule.ifParam] === rule.ifPartition
    ) {
      return true;
    }
    if (
      rule.ifParam === paramName &&
      rule.ifPartition === partitionId &&
      fixed[rule.thenParam] === rule.thenExcludesPartition
    ) {
      return true;
    }
  }
  return false;
}

function isInvalidPartition(param, partitionId) {
  const partition =
    param &&
    param.partitions.find(function (p) {
      return p.id === partitionId;
    });
  return Boolean(partition && partition.kind === 'invalid');
}

// The one parameter in a vector holding an invalid partition, or null for an all-valid vector.
// Never more than one exists: seeds carry at most one and fillRemaining only adds valid values.
function invalidNameOf(parameters, vector) {
  for (const name of Object.keys(vector)) {
    if (isInvalidPartition(paramByName(parameters, name), vector[name])) return name;
  }
  return null;
}

// Pairs directly forbidden by a single ConstraintRule never enter needed at all - only a pair
// that ends up unsatisfiable through a THIRD parameter's cascading conflict (multiple independent
// rules interacting) can still fail once it's picked as a seed - see buildSeededVector. Only valid
// values are paired: an invalid one is tested on its own, in a vector of its own (buildVectors).
function buildNeededPairs(parameters, constraints) {
  const needed = new Set();
  for (let i = 0; i < parameters.length; i++) {
    for (let j = i + 1; j < parameters.length; j++) {
      for (const pa of parameters[i].partitions) {
        for (const pb of parameters[j].partitions) {
          if (pa.kind === 'invalid' || pb.kind === 'invalid') continue;
          const fixed = {};
          fixed[parameters[j].name] = pb.id;
          if (violatesConstraint(parameters[i].name, pa.id, fixed, constraints)) continue;
          needed.add(pairKey(parameters, parameters[i].name, pa.id, parameters[j].name, pb.id));
        }
      }
    }
  }
  return needed;
}

// How many currently-uncovered needed pairs this candidate would newly cover against the values
// THIS vector has already fixed (seed values plus any columns filled so far). A vector holding an
// invalid value covers no pair, so nothing scores there and each column keeps its first valid value.
function scoreCandidate(parameters, param, partition, vector, needed) {
  if (invalidNameOf(parameters, vector) !== null) return 0;
  let count = 0;
  for (const name of Object.keys(vector)) {
    if (needed.has(pairKey(parameters, param.name, partition.id, name, vector[name]))) count++;
  }
  return count;
}

function describeDeadEnds(parameters, constraints, fixed, col) {
  const param = parameters[col];
  const found = [];
  for (const partition of param.partitions) {
    for (const rule of constraints) {
      if (
        rule.thenParam === param.name &&
        rule.thenExcludesPartition === partition.id &&
        fixed[rule.ifParam] === rule.ifPartition
      ) {
        found.push({
          paramA: rule.ifParam,
          partitionA: rule.ifPartition,
          paramB: param.name,
          partitionB: partition.id,
          reason:
            'excluded by constraint: ' +
            rule.ifParam +
            '=' +
            rule.ifPartition +
            ' -> ' +
            rule.thenParam +
            '!=' +
            rule.thenExcludesPartition,
        });
      }
      if (
        rule.ifParam === param.name &&
        rule.ifPartition === partition.id &&
        fixed[rule.thenParam] === rule.thenExcludesPartition
      ) {
        found.push({
          paramA: param.name,
          partitionA: partition.id,
          paramB: rule.thenParam,
          partitionB: rule.thenExcludesPartition,
          reason:
            'excluded by constraint: ' +
            rule.ifParam +
            '=' +
            rule.ifPartition +
            ' -> ' +
            rule.thenParam +
            '!=' +
            rule.thenExcludesPartition,
        });
      }
    }
  }
  return found;
}

// Fills every column NOT already present in vector (the seed's 2 columns are skipped), trying the
// highest-scoring conflict-free candidate first (stable sort - ties keep the partitions array's
// own declared order, so results are deterministic run to run) and backtracking within this fill
// when a later column dead-ends. Returns null on success, or the dead-end facts for the column
// where every candidate failed even after exhausting every earlier column's alternatives. Only
// valid values fill a column: whether a vector carries an invalid value is decided by its seed.
function fillRemaining(parameters, constraints, needed, vector, col) {
  if (col >= parameters.length) return null;
  const param = parameters[col];
  if (Object.prototype.hasOwnProperty.call(vector, param.name)) {
    return fillRemaining(parameters, constraints, needed, vector, col + 1);
  }
  const validPartitions = param.partitions.filter(function (p) {
    return p.kind !== 'invalid';
  });
  if (validPartitions.length === 0) {
    return {
      deadEnds: [
        {
          reason: param.name + ' has no valid partition to hold while another value is probed',
        },
      ],
    };
  }
  const candidates = validPartitions.filter(function (p) {
    return !violatesConstraint(param.name, p.id, vector, constraints);
  });
  if (candidates.length === 0) {
    return { deadEnds: describeDeadEnds(parameters, constraints, vector, col) };
  }
  candidates.sort(function (a, b) {
    return (
      scoreCandidate(parameters, param, b, vector, needed) -
      scoreCandidate(parameters, param, a, vector, needed)
    );
  });
  let lastDeadEnd = null;
  for (const partition of candidates) {
    vector[param.name] = partition.id;
    const result = fillRemaining(parameters, constraints, needed, vector, col + 1);
    if (result === null) return null;
    lastDeadEnd = result;
    delete vector[param.name];
  }
  return lastDeadEnd;
}

function removeCoveredPairs(parameters, vector, needed) {
  const names = Object.keys(vector);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      needed.delete(pairKey(parameters, names[i], vector[names[i]], names[j], vector[names[j]]));
    }
  }
}

function buildVectors(parameters, constraints) {
  const needed = buildNeededPairs(parameters, constraints);
  const vectors = [];
  const unsatisfied = [];

  while (needed.size > 0) {
    const nextKey = needed.values().next().value;
    const seedPair = JSON.parse(nextKey);
    const vector = {};
    vector[seedPair[0][0]] = seedPair[0][1];
    vector[seedPair[1][0]] = seedPair[1][1];

    const dead = fillRemaining(parameters, constraints, needed, vector, 0);
    if (dead) {
      const reasons = dead.deadEnds
        .map(function (d) {
          return d.reason;
        })
        .join('; ');
      unsatisfied.push({
        paramA: seedPair[0][0],
        partitionA: seedPair[0][1],
        paramB: seedPair[1][0],
        partitionB: seedPair[1][1],
        reason:
          reasons.length > 0
            ? 'combining these two values leaves no valid assignment for another parameter: ' + reasons
            : 'could not be combined with the rest of the route under its constraint set',
      });
      needed.delete(nextKey);
    } else {
      vectors.push(vector);
      removeCoveredPairs(parameters, vector, needed);
    }
  }

  // Each invalid value once, every other parameter at its first valid value: the application
  // rejects the input on that one value, so pairing it with every value of the others adds tests
  // that all fail the same way. A rejection that depends on another field is a decision rule,
  // written by the analysis. A route with one parameter is covered partition by partition already
  // (buildEquivalencePartitionConditions).
  for (const param of parameters.length >= 2 ? parameters : []) {
    for (const partition of param.partitions) {
      if (partition.kind !== 'invalid') continue;
      const vector = {};
      vector[param.name] = partition.id;
      const dead = fillRemaining(parameters, constraints, new Set(), vector, 0);
      if (dead) {
        unsatisfied.push({
          paramA: param.name,
          partitionA: partition.id,
          paramB: null,
          partitionB: null,
          reason:
            'no valid value of the other parameters can stand beside it: ' +
            dead.deadEnds
              .map(function (d) {
                return d.reason;
              })
              .join('; '),
        });
      } else {
        vectors.push(vector);
      }
    }
  }

  return { vectors, unsatisfied };
}

function paramByName(parameters, name) {
  return parameters.find(function (p) {
    return p.name === name;
  });
}

// HTML5 min/max are inclusive per spec - the boundary value itself is valid, the value one step
// inside it is valid, and only the value one step past it is invalid. The 3-value BVA order is
// always [boundary-1, boundary, boundary+1] regardless of which side (min/max) is being probed.
function boundaryProbeIsValid(boundary, index) {
  return boundary === 'min' ? index !== 0 : index !== 2;
}

// Where a 3-value BVA probe sits relative to its limit, indexed the same way BoundarySet.values is.
const BOUNDARY_POSITION = {
  min: ['one below the minimum', 'at the minimum', 'one above the minimum'],
  max: ['one below the maximum', 'at the maximum', 'one above the maximum'],
};

function levelNote(level) {
  if (level === 'dom') return 'set by script - the control does not offer it';
  if (level === 'api') return 'sent straight to the API';
  return null;
}

function firstValidPartition(param) {
  return (
    param.partitions.find(function (p) {
      return p.kind === 'valid';
    }) || param.partitions[0]
  );
}

function withoutTrailingStop(text) {
  return String(text).replace(/[\\s.]+$/, '');
}

// Synthesizes a condition's sentence, outcome and scenario deterministically from data already
// present - never free model inference. probe applies only to boundary-value/checklist-based
// conditions, where one parameter's vector entry is a literal value rather than a partitionId and
// the probe itself supplies its note and outcome; every other entry resolves as a partitionId
// lookup. A negative vector carries exactly one invalid value, so its outcome is that value's own;
// an all-valid vector's outcome is every distinct outcome its values promise.
function describeCondition(parameters, vector, probe) {
  const orderedNames = parameters
    .map(function (p) {
      return p.name;
    })
    .filter(function (name) {
      return Object.prototype.hasOwnProperty.call(vector, name);
    });
  let fault = null;
  const validOutcomes = [];
  const clauses = orderedNames.map(function (name) {
    const rawValue = vector[name];
    if (probe && name === probe.name) {
      return name + '=' + JSON.stringify(rawValue) + ' (' + probe.note + ')';
    }
    const param = paramByName(parameters, name);
    const partition =
      param &&
      param.partitions.find(function (p) {
        return p.id === rawValue;
      });
    const text =
      partition && partition.sampleValues && partition.sampleValues[0] !== undefined
        ? partition.sampleValues[0]
        : rawValue;
    if (partition && partition.kind === 'invalid') {
      const level =
        partition.executionLevel === 'dom' || partition.executionLevel === 'api'
          ? partition.executionLevel
          : null;
      fault = { outcome: partition.expectedOutcome, level: level };
      const note = levelNote(level);
      return name + '=' + JSON.stringify(text) + ' (invalid' + (note ? ', ' + note : '') + ')';
    }
    if (partition && typeof partition.expectedOutcome === 'string') {
      const outcome = withoutTrailingStop(partition.expectedOutcome);
      if (validOutcomes.indexOf(outcome) === -1) validOutcomes.push(outcome);
    }
    return name + '=' + JSON.stringify(text);
  });

  let scenario;
  let expectedOutcome;
  let executionLevel = null;
  if (probe) {
    scenario = probe.isValid ? 'positive' : 'negative';
    expectedOutcome = withoutTrailingStop(probe.outcome);
  } else if (fault) {
    scenario = 'negative';
    expectedOutcome = withoutTrailingStop(fault.outcome);
    executionLevel = fault.level;
  } else {
    scenario = 'positive';
    expectedOutcome = validOutcomes.join('; ');
  }
  const described = {
    description: 'With ' + clauses.join(', ') + ': ' + expectedOutcome + ' (' + scenario + ')',
    expectedOutcome: expectedOutcome,
    scenario: scenario,
  };
  if (executionLevel) described.executionLevel = executionLevel;
  return described;
}

// Copies what describeCondition resolved onto a condition, in the field order every technique
// writes, so re-running over unchanged input serializes byte-identically.
function conditionFrom(conditionIdValue, vector, technique, described) {
  const cond = {
    conditionId: conditionIdValue,
    parameters: vector,
    technique: technique,
    description: described.description,
    expectedOutcome: described.expectedOutcome,
  };
  if (described.executionLevel) cond.executionLevel = described.executionLevel;
  cond.scenario = described.scenario;
  return cond;
}

// A probe takes its outcome from the boundary itself, never from the parameter's valid partition:
// a partition's outcome is written for its own sample value ("exactly 5 GUIDs are listed"), and
// reusing it for the value at the limit promised 5 GUIDs for a count of 1 in a live run.
function buildBoundaryConditions(routeId, parameters) {
  const conditions = [];
  for (const param of parameters) {
    if (!param.boundaries || param.boundaries.length === 0) continue;
    const validPartition = firstValidPartition(param);
    if (!validPartition) continue;
    for (const boundarySet of param.boundaries) {
      boundarySet.values.forEach(function (value, index) {
        const vector = {};
        for (const other of parameters) {
          if (other.name === param.name) {
            vector[other.name] = value;
            continue;
          }
          vector[other.name] = firstValidPartition(other).id;
        }
        const isValid = boundaryProbeIsValid(boundarySet.boundary, index);
        const described = describeCondition(parameters, vector, {
          name: param.name,
          isValid: isValid,
          note: BOUNDARY_POSITION[boundarySet.boundary][index],
          outcome: isValid ? boundarySet.acceptedOutcome : boundarySet.rejectedOutcome,
        });
        const cond = conditionFrom(conditionId(routeId, vector), vector, 'boundary-value', described);
        Object.assign(cond, { verification: {}, isSpeculative: true, reviewed: false });
        if (described.scenario === 'negative') {
          cond.negativeCategory = 'boundary';
        }
        conditions.push(cond);
      });
    }
  }
  return conditions;
}

// A route with fewer than 2 parameters has no pair to combine at all - buildVectors's needed set
// stays permanently empty regardless of how many partitions that sole parameter has, so pairwise
// coverage alone silently produces zero conditions. Common case (a single search box, a one-field
// subscribe form), not a rare edge case - cover each of the sole parameter's partitions directly.
function buildEquivalencePartitionConditions(routeId, parameters) {
  if (parameters.length >= 2) return [];
  const conditions = [];
  for (const param of parameters) {
    for (const partition of param.partitions) {
      const vector = {};
      vector[param.name] = partition.id;
      const described = describeCondition(parameters, vector);
      const cond = conditionFrom(
        conditionId(routeId, vector),
        vector,
        'equivalence-partition',
        described,
      );
      Object.assign(cond, { verification: {}, isSpeculative: true, reviewed: false });
      if (described.scenario === 'negative') {
        cond.negativeCategory = 'invalid_input';
      }
      conditions.push(cond);
    }
  }
  return conditions;
}

// Closed, deterministic checklist of well-known problematic values per ParameterKind (ISTQB
// experience-based "checklist-based testing" - a fixed, repeatable list, not ad hoc "error
// guessing"). Complementary to boundary-value, not redundant with it: these probe malformed-format
// and injection-class failures a numeric/length boundary never touches. Values are synthesized
// test data written to the artifact, never submitted to a live page by this generator.
const CHECKLIST_VALUES = {
  text: ['<script>alert(1)</script>', "' OR '1'='1", 'A'.repeat(1000), '  leading-trailing-space  '],
  email: ['plainaddress', '@missinglocal.com', 'user@', 'user@.com'],
  number: ['-1', '0', '1e309'],
  date: ['0000-00-00', '9999-12-31', 'not-a-date'],
};

// What the page must show for a checklist probe. Nothing here knows whether the application accepts
// a given value, so each outcome is the robustness a person can check either way - the input never
// escapes into markup or breaks the page - rather than a guess about which values it rejects.
const CHECKLIST_OUTCOMES = {
  text: 'the value is rejected with a message or shown back as plain text - no script runs and no error page appears',
  email: 'the address is rejected with a validation message and nothing is submitted with it',
  number:
    'the value is rejected with a message or used as entered - no NaN, Infinity or error page appears',
  date: 'the date is rejected with a message or shown as entered - no "Invalid Date", NaN or error page appears',
};

// Reads artifacts/analysis/feature-map.json fresh on every run (a separate artifact from a
// different skill's stage - it can change or be re-reviewed between when /define-test-conditions
// Step 1 last checked it and when this script runs) and returns a routeId -> criticality map, using
// ONLY entries with reviewed:true - an unreviewed entry is never ground truth for any other skill or
// agent (the same rule /map-features' own Human Sign-Off Gateway states), so an unreviewed route
// falls through to "unknown" exactly like a route missing from the file entirely.
// Missing file, malformed content, or a route absent/unreviewed all resolve to "unknown" rather
// than an error - this generator's own job is condition synthesis, not re-validating an artifact
// Gate 1/Gate 2 of a DIFFERENT skill already gates. "unknown" defaults to the safe (full-checklist)
// side below, never the reduced side.
function loadCriticalityMap() {
  const map = {};
  const loaded = loadJson(FEATURE_MAP_PATH, 'artifacts/analysis/feature-map.json');
  if (loaded.error || !loaded.value || typeof loaded.value.routes !== 'object') return map;
  for (const [routeId, entry] of Object.entries(loaded.value.routes)) {
    if (!entry || entry.reviewed !== true) continue;
    const tier = entry.criticality && entry.criticality.value;
    if (typeof tier === 'string') map[routeId] = tier;
  }
  return map;
}

// Checklist-based probing is real signal for a critical/high route and mostly noise for a
// low-value one - reduce volume on medium/low criticality routes rather than firing the same
// fixed checklist everywhere regardless of the route's own importance. Unknown criticality (no
// feature-map.json, this route missing from it, or its entry not yet reviewed) stays on the
// safe side: run the full
// checklist rather than silently under-testing because Stage 1 wasn't run.
function shouldRunChecklist(criticalityTier) {
  return criticalityTier !== 'medium' && criticalityTier !== 'low';
}

// Lifecycle-derived conditions belong to a feature and its entities, not to a page - but this file
// is keyed by route, so each feature's bundle is attached to one representative member route (the
// lowest routeId) rather than repeated on every page the feature happens to touch. Only reviewed
// features and reviewed entities count, for the same reason loadCriticalityMap only reads reviewed
// entries: an unreviewed derivation is a draft, not ground truth.
function loadFeatureLifecycles() {
  const byRouteId = {};
  const loaded = loadJson(FEATURE_MAP_PATH, 'artifacts/analysis/feature-map.json');
  const data = loaded.value;
  if (loaded.error || !data || typeof data.features !== 'object' || data.features === null) {
    return byRouteId;
  }
  const entities = typeof data.entities === 'object' && data.entities !== null ? data.entities : {};
  for (const feature of Object.values(data.features)) {
    if (!feature || feature.reviewed !== true) continue;
    const memberRouteIds = Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : [];
    if (memberRouteIds.length === 0) continue;
    const primaryRouteId = memberRouteIds.slice().sort()[0];
    const featureEntities = (Array.isArray(feature.entityIds) ? feature.entityIds : [])
      .map(function (entityId) {
        return entities[entityId];
      })
      .filter(function (entity) {
        return (
          entity &&
          entity.reviewed === true &&
          entity.lifecycle &&
          Array.isArray(entity.lifecycle.states) &&
          entity.lifecycle.states.length > 0
        );
      })
      .map(function (entity) {
        return {
          entityId: entity.entityId,
          name: entity.name,
          states: entity.lifecycle.states,
          transitions: Array.isArray(entity.lifecycle.transitions) ? entity.lifecycle.transitions : [],
        };
      })
      .sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
    if (featureEntities.length === 0) continue;
    byRouteId[primaryRouteId] = {
      featureId: feature.featureId,
      featureName: feature.name,
      entities: featureEntities,
    };
  }
  return byRouteId;
}

function entityAnchors(entity) {
  return entity.entityId ? [{ kind: 'entity', ref: entity.entityId }] : [];
}

// State transition testing, the textbook construction: every defined transition is one positive
// condition, and every (state, trigger) pair the lifecycle does NOT define is one negative
// condition - "refunding an unpaid invoice" is exactly that shape. Bounded by states x triggers,
// which stays small because the states come from what was actually observed plus whatever a person
// added by hand.
function buildStateTransitionConditions(routeId, bundle, criticalityTier) {
  if (!bundle) return [];
  const conditions = [];
  for (const entity of bundle.entities) {
    for (const transition of entity.transitions) {
      const description =
        'Verify a ' +
        entity.name +
        ' moves from "' +
        transition.from +
        '" to "' +
        transition.to +
        '" on ' +
        transition.trigger +
        '.';
      conditions.push({
        conditionId: conditionId(routeId, {}, 'state-transition|' + entity.name + '|' + description),
        parameters: { entity: entity.name, from: transition.from, to: transition.to },
        technique: 'state-transition',
        description: description,
        expectedOutcome: 'the ' + entity.name + ' is now "' + transition.to + '"',
        featureId: bundle.featureId,
        anchors: entityAnchors(entity),
        scenario: 'positive',
        verification: {},
        isSpeculative: true,
        reviewed: false,
      });
    }
    // Invalid transitions are the expensive half of this technique and mostly noise on a page
    // nobody depends on - same reduction the checklist already applies, for the same reason.
    if (!shouldRunChecklist(criticalityTier)) continue;
    const triggers = Array.from(
      new Set(
        entity.transitions.map(function (transition) {
          return transition.trigger;
        }),
      ),
    ).sort();
    for (const state of entity.states) {
      for (const trigger of triggers) {
        const defined = entity.transitions.some(function (transition) {
          return transition.from === state.name && transition.trigger === trigger;
        });
        if (defined) continue;
        const description =
          'Verify a ' +
          entity.name +
          ' rejects ' +
          trigger +
          ' while it is "' +
          state.name +
          '", leaving it unchanged.';
        conditions.push({
          conditionId: conditionId(
            routeId,
            {},
            'state-transition|' + entity.name + '|' + description,
          ),
          parameters: { entity: entity.name, from: state.name, trigger: trigger },
          technique: 'state-transition',
          description: description,
          expectedOutcome: trigger + ' is refused and the ' + entity.name + ' stays "' + state.name + '"',
          featureId: bundle.featureId,
          anchors: entityAnchors(entity),
          scenario: 'negative',
          negativeCategory: 'state_violation',
          verification: {},
          isSpeculative: true,
          reviewed: false,
        });
      }
    }
  }
  return conditions;
}

// One condition per entity whose lifecycle actually goes somewhere: the main flow a person would
// walk, named in the order the transitions define it. This is the condition a cross-route journey
// is built from - a single-screen test cannot carry it.
function buildUseCaseConditions(routeId, bundle) {
  if (!bundle) return [];
  const conditions = [];
  for (const entity of bundle.entities) {
    if (entity.transitions.length < 2) continue;
    const flow = entity.transitions
      .map(function (transition) {
        return transition.trigger;
      })
      .join(', then ');
    const description =
      'Verify the main flow of ' +
      bundle.featureName +
      ': a ' +
      entity.name +
      ' can be ' +
      flow +
      ', and the result of each step is visible in the next.';
    const finalState = entity.transitions[entity.transitions.length - 1].to;
    conditions.push({
      conditionId: conditionId(routeId, {}, 'use-case|' + entity.name + '|' + description),
      parameters: { entity: entity.name, feature: bundle.featureName },
      technique: 'use-case',
      description: description,
      expectedOutcome:
        'the ' + entity.name + ' ends "' + finalState + '", with the result of each step visible in the next',
      featureId: bundle.featureId,
      anchors: entityAnchors(entity),
      scenario: 'positive',
      verification: {},
      isSpeculative: true,
      reviewed: false,
    });
  }
  return conditions;
}

function buildChecklistConditions(routeId, parameters, criticalityTier) {
  if (!shouldRunChecklist(criticalityTier)) return [];
  const conditions = [];
  for (const target of parameters) {
    const values = CHECKLIST_VALUES[target.kind];
    if (!values) continue;
    for (const value of values) {
      const vector = {};
      for (const other of parameters) {
        if (other.name === target.name) {
          vector[other.name] = value;
          continue;
        }
        const otherValid = firstValidPartition(other);
        if (!otherValid) continue;
        vector[other.name] = otherValid.id;
      }
      const described = describeCondition(parameters, vector, {
        name: target.name,
        isValid: false,
        note: 'malformed-input checklist',
        outcome: CHECKLIST_OUTCOMES[target.kind],
      });
      const cond = conditionFrom(conditionId(routeId, vector), vector, 'checklist-based', described);
      Object.assign(cond, {
        negativeCategory: 'invalid_input',
        verification: {},
        isSpeculative: true,
        reviewed: false,
      });
      conditions.push(cond);
    }
  }
  return conditions;
}

function generateForRoute(routeId, entry, criticalityTier, lifecycleBundle, fieldRoles) {
  redactEntry(entry, fieldRoles);
  const currentHash = hashParams(entry, lifecycleBundle);
  if (entry.conditions && entry.conditions.length > 0 && entry.sourceParamsHash === currentHash) {
    return;
  }
  // A condition a person or the assistant cut stays cut when the route is regenerated: the same inputs
  // rebuild the same id, and a cut undone by regenerating is a decision silently thrown away.
  const cutIds = new Map(
    (entry.conditions || [])
      .filter(function (c) {
        return c && c.cut === true && c.conditionId;
      })
      .map(function (c) {
        return [c.conditionId, c];
      }),
  );
  const { vectors, unsatisfied } = buildVectors(entry.parameters, entry.constraints || []);
  const combinatorialConditions = vectors.map(function (vector) {
    const described = describeCondition(entry.parameters, vector);
    const cond = conditionFrom(conditionId(routeId, vector), vector, 'combinatorial', described);
    Object.assign(cond, { verification: {}, isSpeculative: true, reviewed: false });
    if (described.scenario === 'negative') {
      cond.negativeCategory = 'invalid_input';
    }
    return cond;
  });
  const boundaryConditions = buildBoundaryConditions(routeId, entry.parameters);
  const equivalencePartitionConditions = buildEquivalencePartitionConditions(
    routeId,
    entry.parameters,
  );
  const checklistConditions = buildChecklistConditions(routeId, entry.parameters, criticalityTier);
  const stateTransitionConditions = buildStateTransitionConditions(
    routeId,
    lifecycleBundle,
    criticalityTier,
  );
  const useCaseConditions = buildUseCaseConditions(routeId, lifecycleBundle);
  // Conditions the analysis wrote rather than this script - invariants, output properties,
  // metamorphic relations, decision rules, expected failures, research findings, a person's own -
  // survive every regeneration untouched; only an id is filled in when one is missing.
  const invariantConditions = (entry.conditions || [])
    .filter(isAuthored)
    .map(function (c) {
      if (!c.conditionId) {
        const salt =
          c.technique === 'architectural-invariant'
            ? (c.negativeCategory || '') + '|' + (c.description || '')
            : c.technique + '|' + (c.relation || '') + '|' + (c.description || '');
        c.conditionId = conditionId(routeId, c.parameters || {}, salt);
      }
      return c;
    });
  const seen = new Set();
  const deduped = [];
  for (const c of combinatorialConditions.concat(
    boundaryConditions,
    equivalencePartitionConditions,
    checklistConditions,
    stateTransitionConditions,
    useCaseConditions,
    invariantConditions,
  )) {
    if (seen.has(c.conditionId)) continue;
    seen.add(c.conditionId);
    if (cutIds.has(c.conditionId)) {
      const was = cutIds.get(c.conditionId);
      c.cut = true;
      c.reviewed = false;
      delete c.reviewedBy;
      if (was.cutBy) c.cutBy = was.cutBy;
      if (was.cutReason) c.cutReason = was.cutReason;
    }
    deduped.push(c);
  }
  entry.conditions = deduped;
  entry.unsatisfiedPairs = unsatisfied;
  entry.sourceParamsHash = currentHash;
}

// Structural guard before any route is touched: a malformed entry (missing/non-array parameters,
// a parameter missing partitions) reports the same clean {status:'FAILED', errors:[...]} shape as
// the missing-file/no-routes cases below, instead of an unhandled TypeError mid-generation. A
// partition or boundary with no recorded outcome stops generation too: every description is built
// from those outcomes, and filling the gap with a stock phrase is exactly what this file refuses to
// do. node scripts/validate-test-conditions.mjs --stage=parameters reports the full list.
function checkShape(data) {
  const errors = [];
  for (const [routeId, entry] of Object.entries(data.routes)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.parameters)) {
      errors.push('routes["' + routeId + '"].parameters must be an array.');
      continue;
    }
    entry.parameters.forEach(function (param, i) {
      const label = 'routes["' + routeId + '"].parameters[' + i + ']';
      if (!param || typeof param !== 'object' || !Array.isArray(param.partitions)) {
        errors.push(label + '.partitions must be an array.');
        return;
      }
      param.partitions.forEach(function (partition, j) {
        if (
          !partition ||
          typeof partition.expectedOutcome !== 'string' ||
          partition.expectedOutcome.trim().length === 0
        ) {
          errors.push(label + '.partitions[' + j + '].expectedOutcome must be a non-empty string.');
        }
      });
      (Array.isArray(param.boundaries) ? param.boundaries : []).forEach(function (boundary, j) {
        ['acceptedOutcome', 'rejectedOutcome'].forEach(function (field) {
          if (!boundary || typeof boundary[field] !== 'string' || boundary[field].trim().length === 0) {
            errors.push(label + '.boundaries[' + j + '].' + field + ' must be a non-empty string.');
          }
        });
      });
    });
  }
  return errors;
}

function isAuthored(condition) {
  if (!condition) return false;
  if (condition.origin && condition.origin !== 'generated') return true;
  return MODEL_AUTHORED_TECHNIQUES.indexOf(condition.technique) !== -1;
}

// Everything the review needs to rank a condition that the generator can know itself: which feature
// it serves (from the feature map), how bad a failure there is (the feature's impact), and which of
// a route's controls are the site frame (from its inventory).
function loadRankingContext() {
  const loaded = loadJson(FEATURE_MAP_PATH, 'artifacts/analysis/feature-map.json');
  const data = loaded.error ? null : loaded.value;
  const featureByRoute = {};
  const impactByFeature = {};
  const criticalityByRoute = {};
  if (data && typeof data.features === 'object' && data.features !== null) {
    for (const [featureId, feature] of Object.entries(data.features)) {
      if (!feature) continue;
      if (typeof feature.impact === 'string') impactByFeature[featureId] = feature.impact;
      for (const routeId of Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : []) {
        if (!featureByRoute[routeId]) featureByRoute[routeId] = featureId;
      }
    }
  }
  if (data && typeof data.routes === 'object' && data.routes !== null) {
    for (const [routeId, intent] of Object.entries(data.routes)) {
      if (!intent) continue;
      if (typeof intent.featureId === 'string') featureByRoute[routeId] = intent.featureId;
      if (intent.criticality && typeof intent.criticality.value === 'string') {
        criticalityByRoute[routeId] = intent.criticality.value;
      }
    }
  }
  return { featureByRoute, impactByFeature, criticalityByRoute };
}

function frameControlsOf(routeId) {
  const file = path.join(INVENTORY_DIR, routeId + '.json');
  const loaded = loadJson(file, 'inventory');
  const frame = new Set();
  if (loaded.error || !loaded.value || !Array.isArray(loaded.value.controls)) return frame;
  for (const control of loaded.value.controls) {
    if (control && FRAME_REGIONS.indexOf(control.region) !== -1) frame.add(control.id);
  }
  return frame;
}

function oracleOfSignal(signal) {
  if (signal === 'manual') return 'human';
  if (signal === 'field-probe') return 'observed';
  return 'markup';
}

// A rule only the markup states is about the field; one a label or a person states carries meaning
// for the business, even though it is checked at the field.
function layerOfSignal(signal) {
  return signal === 'form-label' || signal === 'manual' ? 'rule' : 'field';
}

function strongest(oracles) {
  let best = null;
  for (const oracle of oracles) {
    if (ORACLE_ORDER.indexOf(oracle) === -1) continue;
    if (best === null || ORACLE_ORDER.indexOf(oracle) < ORACLE_ORDER.indexOf(best)) best = oracle;
  }
  return best;
}

// A rule grounded in a field probe quotes it as "<probe id>: <what the page did>"; the condition
// built from it points at that probe, which is what makes its "observed" oracle checkable.
function probeAnchorOf(rule) {
  if (!rule || rule.signal !== 'field-probe' || typeof rule.excerpt !== 'string') return null;
  const id = rule.excerpt.split(':')[0].trim();
  return /^p\\d+$/.test(id) ? { kind: 'probe', ref: id } : null;
}

function controlAnchor(param) {
  if (!param) return null;
  if (param.control) return { kind: 'control', ref: param.control };
  if (param.revealedBy) return { kind: 'control', ref: param.revealedBy };
  return null;
}

// Layer, oracle, anchors and default risk of a condition this script built, read off the partitions
// and boundaries it was built from.
function describeGenerated(condition, entry) {
  const parameters = entry.parameters || [];
  const anchors = [];
  function addAnchor(anchor) {
    if (!anchor) return;
    const known = anchors.some(function (existing) {
      return existing.kind === anchor.kind && existing.ref === anchor.ref;
    });
    if (!known) anchors.push(anchor);
  }

  // The entity anchor was set where the condition was built, from the lifecycle it walks.
  if (condition.technique === 'state-transition' || condition.technique === 'use-case') {
    (Array.isArray(condition.anchors) ? condition.anchors : []).forEach(addAnchor);
    return {
      layer: 'behavior',
      oracle: 'observed',
      anchors: anchors,
      risk: DEFAULT_RISK[condition.technique],
    };
  }

  if (condition.technique === 'boundary-value' || condition.technique === 'checklist-based') {
    let target = null;
    let literal = null;
    for (const [name, value] of Object.entries(condition.parameters || {})) {
      const param = paramByName(parameters, name);
      if (!param) continue;
      const isPartition = (param.partitions || []).some(function (partition) {
        return partition.id === value;
      });
      if (!isPartition) {
        target = param;
        literal = value;
        break;
      }
    }
    addAnchor(controlAnchor(target));
    if (condition.technique === 'checklist-based') {
      return { layer: 'field', oracle: 'domain', anchors: anchors, risk: DEFAULT_RISK['checklist-based'] };
    }
    const boundary = target
      ? (target.boundaries || []).find(function (candidate) {
          return Array.isArray(candidate.values) && candidate.values.indexOf(literal) !== -1;
        })
      : null;
    const signal = boundary && boundary.rule ? boundary.rule.signal : 'html5-constraint';
    if (boundary) addAnchor(probeAnchorOf(boundary.rule));
    if (boundary && Array.isArray(boundary.anchors)) boundary.anchors.forEach(addAnchor);
    return {
      layer: layerOfSignal(signal),
      oracle: (boundary && boundary.oracle) || oracleOfSignal(signal),
      anchors: anchors,
      risk: DEFAULT_RISK['boundary-value'],
    };
  }

  // combinatorial and equivalence-partition: a vector of partition ids.
  let invalid = null;
  const oracles = [];
  for (const [name, partitionId] of Object.entries(condition.parameters || {})) {
    const param = paramByName(parameters, name);
    if (!param) continue;
    const partition = (param.partitions || []).find(function (candidate) {
      return candidate.id === partitionId;
    });
    if (!partition) continue;
    if (partition.kind === 'invalid') {
      invalid = { param: param, partition: partition };
      addAnchor(controlAnchor(param));
      addAnchor(probeAnchorOf(partition.rule));
      if (Array.isArray(partition.anchors)) partition.anchors.forEach(addAnchor);
    } else {
      oracles.push(partition.oracle || 'domain');
      if (partition.oracle && Array.isArray(partition.anchors)) partition.anchors.forEach(addAnchor);
    }
  }
  if (invalid) {
    const signal = invalid.partition.rule ? invalid.partition.rule.signal : 'html5-constraint';
    return {
      layer: layerOfSignal(signal),
      oracle: invalid.partition.oracle || oracleOfSignal(signal),
      anchors: anchors,
      risk: DEFAULT_RISK['invalid-value'],
    };
  }
  for (const name of Object.keys(condition.parameters || {})) {
    addAnchor(controlAnchor(paramByName(parameters, name)));
  }
  return {
    layer: 'behavior',
    oracle: strongest(oracles) || 'domain',
    anchors: anchors,
    risk:
      condition.technique === 'combinatorial'
        ? DEFAULT_RISK['valid-combination']
        : DEFAULT_RISK['valid-value'],
  };
}

// Fills in what every condition carries for the review - its feature, layer, oracle, anchors and
// default risk on the generator's own conditions - then ranks every condition, authored ones
// included: risk score = likelihood x the feature's impact, and the priority tier it lands in.
// Runs on every pass, so a feature whose impact changed at review re-ranks without regenerating.
// Who reviews a condition. A person, where its expected result is a judgment only the domain can
// confirm: the analysis wrote it, it rests on words (a label, a person, a requirement, research), or
// it walks an entity's lifecycle. The assistant, where the page's own markup, the malformed-input
// checklist or this script's combinations settle it - checked against the markup by the gate, and
// kept or cut by the assistant for whether it applies here. Set on every pass, so every reader of the
// file splits the conditions the same way.
const PERSON_ORACLES = ['human', 'requirement', 'research'];

function reviewerOf(condition) {
  if (isAuthored(condition)) return 'person';
  if (condition.technique === 'state-transition' || condition.technique === 'use-case') return 'person';
  if (condition.layer === 'rule' || PERSON_ORACLES.indexOf(condition.oracle) !== -1) return 'person';
  return 'assistant';
}

function annotateAndRank(data, context) {
  for (const [routeId, entry] of Object.entries(data.routes)) {
    const frameControls = routeId === data.frameRouteId ? frameControlsOf(routeId) : new Set();
    for (const condition of entry.conditions || []) {
      if (!isAuthored(condition)) {
        const described = describeGenerated(condition, entry);
        condition.origin = 'generated';
        // A lifecycle condition belongs to the feature whose entity it walks, set when it was built;
        // every other one to the feature its route belongs to now, which a review may have changed.
        const lifecycle = condition.technique === 'state-transition' || condition.technique === 'use-case';
        if (!lifecycle || !condition.featureId) condition.featureId = context.featureByRoute[routeId] || null;
        condition.layer = described.layer;
        condition.oracle = described.oracle;
        condition.risk = { likelihood: described.risk.likelihood, reason: described.risk.reason };
        condition.anchors =
          described.anchors.length > 0
            ? described.anchors
            : condition.featureId
              ? [{ kind: 'feature', ref: condition.featureId }]
              : [];
        const allFrame =
          frameControls.size > 0 &&
          condition.anchors.length > 0 &&
          condition.anchors.every(function (anchor) {
            return anchor.kind === 'control' && frameControls.has(anchor.ref);
          });
        if (allFrame) condition.layer = 'frame';
      }
      condition.reviewer = reviewerOf(condition);
      const impact =
        context.impactByFeature[condition.featureId] || context.criticalityByRoute[routeId] || 'high';
      const likelihood = condition.risk && condition.risk.likelihood;
      if (WEIGHT[likelihood] && WEIGHT[impact]) {
        condition.riskScore = WEIGHT[likelihood] * WEIGHT[impact];
        condition.priority = condition.riskScore >= 6 ? 'P1' : condition.riskScore >= 3 ? 'P2' : 'P3';
      } else {
        delete condition.riskScore;
        delete condition.priority;
      }
    }
  }
}

function generate() {
  const report = loadJson(REPORT_PATH, 'artifacts/analysis/test-conditions.json');
  if (report.error) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: [report.error] }, null, 2) + '\\n');
    process.exit(1);
  }
  const data = report.value;
  if (!data || typeof data !== 'object' || !data.routes || typeof data.routes !== 'object') {
    process.stdout.write(
      JSON.stringify(
        { status: 'FAILED', errors: ['artifacts/analysis/test-conditions.json has no routes object.'] },
        null,
        2,
      ) + '\\n',
    );
    process.exit(1);
  }
  const shapeErrors = checkShape(data);
  if (shapeErrors.length > 0) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: shapeErrors }, null, 2) + '\\n');
    process.exit(1);
  }
  const criticalityByRoute = loadCriticalityMap();
  const lifecyclesByRoute = loadFeatureLifecycles();
  // What each field holds, by the feature analysis: it decides whether a long number in a sample is
  // the value under test or data that must not be stored.
  const rolesByRoute = {};
  for (const analysis of Object.values(data.features || {})) {
    for (const field of analysis && Array.isArray(analysis.fields) ? analysis.fields : []) {
      if (!field || typeof field.routeId !== 'string' || typeof field.control !== 'string') continue;
      if (!rolesByRoute[field.routeId]) rolesByRoute[field.routeId] = {};
      rolesByRoute[field.routeId][field.control] = field.role;
    }
  }
  for (const [routeId, entry] of Object.entries(data.routes)) {
    generateForRoute(routeId, entry, criticalityByRoute[routeId], lifecyclesByRoute[routeId], rolesByRoute[routeId]);
  }
  annotateAndRank(data, loadRankingContext());
  fs.writeFileSync(REPORT_PATH, JSON.stringify(data, null, 2) + '\\n', 'utf8');
  const tiers = { P1: 0, P2: 0, P3: 0 };
  for (const entry of Object.values(data.routes)) {
    for (const condition of entry.conditions || []) {
      if (tiers[condition.priority] !== undefined) tiers[condition.priority]++;
    }
  }
  process.stdout.write(
    JSON.stringify({ status: 'GENERATED', routes: Object.keys(data.routes).length, priorities: tiers }) + '\\n',
  );
}

generate();
`;
}
