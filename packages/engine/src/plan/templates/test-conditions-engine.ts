// Template for generating scripts/generate-test-conditions.mjs. create-if-absent.
// The deterministic half of ADR 0012 Stage 2's "Hybrid Two-Phase Engine": an LLM (via the
// /define-test-conditions skill's Step 2) infers parameters[]/constraints[] from read-only DOM
// inspection; this script mechanically expands that into 2-way combinatorial coverage plus
// 3-value boundary-value conditions, falling back to one condition per partition
// (equivalence-partition technique) for a route with fewer than 2 parameters, where pairwise
// coverage has nothing to pair against - zero model involvement, same zero-dependency style as
// scripts/orchestrate-swarm.mjs and the two validate-*.mjs scripts. The checklist-based technique
// additionally cross-references artifacts/analysis/business-intent.json's criticalityTier - reviewed
// entries only, per that file's own Human Sign-Off Gateway rule - to scale down on medium/low-
// criticality routes rather than firing the same fixed checklist everywhere regardless of the
// route's own importance.
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
const BUSINESS_INTENT_PATH = path.join(CWD, 'artifacts', 'analysis', 'business-intent.json');

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

// Deterministic redaction backstop - same PII classes as /map-site Step 6's guard, applied
// mechanically here rather than trusted to prompt-following alone. Separators (space, hyphen,
// parens, dot) between digits do not defeat the match - "4111 1111 1111 1111",
// "123-45-6789", and "(555) 123-4567" must all redact fully, not just their first unbroken run.
const DIGIT_RUN = /\\d(?:[\\s\\-().]*\\d){5,}/g;
const MAJORITY_DIGIT_TOKEN = /[A-Za-z0-9]{8,}/g;

function isMajorityDigit(token) {
  const digits = token.replace(/[^0-9]/g, '').length;
  return digits > token.length / 2;
}

function redact(text) {
  if (typeof text !== 'string') return text;
  let out = text.replace(DIGIT_RUN, '[REDACTED]');
  out = out.replace(MAJORITY_DIGIT_TOKEN, function (token) {
    return isMajorityDigit(token) ? '[REDACTED]' : token;
  });
  return out;
}

function redactEntry(entry) {
  for (const param of entry.parameters || []) {
    for (const ev of param.evidence || []) {
      if (ev && typeof ev.excerpt === 'string') ev.excerpt = redact(ev.excerpt);
    }
    for (const partition of param.partitions || []) {
      if (Array.isArray(partition.sampleValues)) {
        partition.sampleValues = partition.sampleValues.map(redact);
      }
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

function hashParams(entry) {
  return crypto
    .createHash('sha256')
    .update(stableStringify({ parameters: entry.parameters, constraints: entry.constraints || [] }))
    .digest('hex');
}

// Same delimiter-collision-free convention as pairKey below (an ordered JSON tuple, not raw
// '='/'&'-joined concatenation) - a parameter name or partition id containing those characters
// could otherwise produce a colliding conditionId.
function conditionId(routeId, vector) {
  const sortedEntries = Object.keys(vector)
    .sort()
    .map(function (k) {
      return [k, vector[k]];
    });
  return crypto
    .createHash('sha256')
    .update(routeId + '|' + JSON.stringify(sortedEntries))
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

// Pairs directly forbidden by a single ConstraintRule never enter needed at all - only a pair
// that ends up unsatisfiable through a THIRD parameter's cascading conflict (multiple independent
// rules interacting) can still fail once it's picked as a seed - see buildSeededVector.
function buildNeededPairs(parameters, constraints) {
  const needed = new Set();
  for (let i = 0; i < parameters.length; i++) {
    for (let j = i + 1; j < parameters.length; j++) {
      for (const pa of parameters[i].partitions) {
        for (const pb of parameters[j].partitions) {
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
// THIS vector has already fixed (seed values plus any columns filled so far). Every call site has
// at least the seed's 2 values already fixed, so there is no "nothing fixed yet" case to special-case.
function scoreCandidate(parameters, param, partition, vector, needed) {
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
// where every candidate failed even after exhausting every earlier column's alternatives.
function fillRemaining(parameters, constraints, needed, vector, col) {
  if (col >= parameters.length) return null;
  const param = parameters[col];
  if (Object.prototype.hasOwnProperty.call(vector, param.name)) {
    return fillRemaining(parameters, constraints, needed, vector, col + 1);
  }
  const candidates = param.partitions.filter(function (p) {
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

// Phrasing varies by technique - grounded in a real distinction (what kind of probe this is), not
// cosmetic rotation: a boundary-value condition reads as an accept/reject verdict on an edge value,
// a checklist-based condition (always negative by construction) reads as a safety claim about a
// malformed input, and combinatorial/equivalence-partition conditions read as a general
// accept/handle claim about a value combination. All three stay fully deterministic.
function describeText(technique, joinedClauses, scenario) {
  if (technique === 'boundary-value') {
    const verdict = scenario === 'positive' ? 'accepted' : 'rejected';
    return 'Verify the boundary value ' + joinedClauses + ' is ' + verdict + ' (' + scenario + ')';
  }
  if (technique === 'checklist-based') {
    return (
      'Verify the page safely rejects the malformed input ' + joinedClauses + ' (' + scenario + ')'
    );
  }
  const verb = scenario === 'positive' ? 'accepts' : 'correctly handles';
  return 'Verify the page ' + verb + ' ' + joinedClauses + ' (' + scenario + ')';
}

// Synthesizes a human-readable sentence for one condition's vector, deterministically from data
// already present - never free model inference. targetName/targetIsValid apply only to
// boundary-value/checklist-based conditions, where that one parameter's vector entry is a literal
// probe value rather than a partitionId; every other technique resolves every vector entry as a
// partitionId lookup against that parameter's own partitions.
function describeCondition(parameters, vector, targetName, targetIsValid, technique) {
  const orderedNames = parameters
    .map(function (p) {
      return p.name;
    })
    .filter(function (name) {
      return Object.prototype.hasOwnProperty.call(vector, name);
    });
  let allValid = true;
  const clauses = orderedNames.map(function (name) {
    const rawValue = vector[name];
    let text;
    let isValid;
    if (name === targetName) {
      text = rawValue;
      isValid = targetIsValid;
    } else {
      const param = paramByName(parameters, name);
      const partition =
        param &&
        param.partitions.find(function (p) {
          return p.id === rawValue;
        });
      text =
        partition && partition.sampleValues && partition.sampleValues[0] !== undefined
          ? partition.sampleValues[0]
          : rawValue;
      isValid = !partition || partition.kind === 'valid';
    }
    if (!isValid) allValid = false;
    return name + '=' + JSON.stringify(text);
  });
  const scenario = allValid ? 'positive' : 'negative';
  return {
    description: describeText(technique, clauses.join(', '), scenario),
    scenario: scenario,
  };
}

function buildBoundaryConditions(routeId, parameters) {
  const conditions = [];
  for (const param of parameters) {
    if (!param.boundaries || param.boundaries.length === 0) continue;
    const validPartition =
      param.partitions.find(function (p) {
        return p.kind === 'valid';
      }) || param.partitions[0];
    if (!validPartition) continue;
    for (const boundarySet of param.boundaries) {
      boundarySet.values.forEach(function (value, index) {
        const vector = {};
        for (const other of parameters) {
          if (other.name === param.name) {
            vector[other.name] = value;
            continue;
          }
          const otherValid =
            other.partitions.find(function (p) {
              return p.kind === 'valid';
            }) || other.partitions[0];
          vector[other.name] = otherValid.id;
        }
        const isValid = boundaryProbeIsValid(boundarySet.boundary, index);
        const described = describeCondition(parameters, vector, param.name, isValid, 'boundary-value');
        conditions.push({
          conditionId: conditionId(routeId, vector),
          parameters: vector,
          technique: 'boundary-value',
          description: described.description,
          scenario: described.scenario,
          verification: {},
          isSpeculative: true,
          reviewed: false,
        });
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
      const described = describeCondition(
        parameters,
        vector,
        undefined,
        undefined,
        'equivalence-partition',
      );
      conditions.push({
        conditionId: conditionId(routeId, vector),
        parameters: vector,
        technique: 'equivalence-partition',
        description: described.description,
        scenario: described.scenario,
        verification: {},
        isSpeculative: true,
        reviewed: false,
      });
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

// Reads artifacts/analysis/business-intent.json fresh on every run (a separate artifact from a
// different skill's stage - it can change or be re-reviewed between when /define-test-conditions
// Step 1 last checked it and when this script runs) and returns a routeId -> criticalityTier.value
// map, using ONLY entries with reviewed:true - an unreviewed entry is never ground truth for any
// other skill or agent (the same rule /map-site Step 6's own Human Sign-Off Gateway states), so an
// unreviewed route falls through to "unknown" exactly like a route missing from the file entirely.
// Missing file, malformed content, or a route absent/unreviewed all resolve to "unknown" rather
// than an error - this generator's own job is condition synthesis, not re-validating an artifact
// Gate 1/Gate 2 of a DIFFERENT skill already gates. "unknown" defaults to the safe (full-checklist)
// side below, never the reduced side.
function loadCriticalityMap() {
  const map = {};
  const loaded = loadJson(BUSINESS_INTENT_PATH, 'artifacts/analysis/business-intent.json');
  if (loaded.error || !loaded.value || typeof loaded.value.routes !== 'object') return map;
  for (const [routeId, entry] of Object.entries(loaded.value.routes)) {
    if (!entry || entry.reviewed !== true) continue;
    const tier = entry.criticalityTier && entry.criticalityTier.value;
    if (typeof tier === 'string') map[routeId] = tier;
  }
  return map;
}

// Checklist-based probing is real signal for a critical/high route and mostly noise for a
// low-value one - reduce volume on medium/low criticality routes rather than firing the same
// fixed checklist everywhere regardless of the route's own importance. Unknown criticality (no
// business-intent.json, this route missing from it, or its entry not yet reviewed) stays on the
// safe side: run the full
// checklist rather than silently under-testing because Stage 1 wasn't run.
function shouldRunChecklist(criticalityTier) {
  return criticalityTier !== 'medium' && criticalityTier !== 'low';
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
        const otherValid =
          other.partitions.find(function (p) {
            return p.kind === 'valid';
          }) || other.partitions[0];
        if (!otherValid) continue;
        vector[other.name] = otherValid.id;
      }
      const described = describeCondition(parameters, vector, target.name, false, 'checklist-based');
      conditions.push({
        conditionId: conditionId(routeId, vector),
        parameters: vector,
        technique: 'checklist-based',
        description: described.description,
        scenario: described.scenario,
        verification: {},
        isSpeculative: true,
        reviewed: false,
      });
    }
  }
  return conditions;
}

function generateForRoute(routeId, entry, criticalityTier) {
  redactEntry(entry);
  const currentHash = hashParams(entry);
  if (entry.conditions && entry.conditions.length > 0 && entry.sourceParamsHash === currentHash) {
    return;
  }
  const { vectors, unsatisfied } = buildVectors(entry.parameters, entry.constraints || []);
  const combinatorialConditions = vectors.map(function (vector) {
    const described = describeCondition(
      entry.parameters,
      vector,
      undefined,
      undefined,
      'combinatorial',
    );
    return {
      conditionId: conditionId(routeId, vector),
      parameters: vector,
      technique: 'combinatorial',
      description: described.description,
      scenario: described.scenario,
      verification: {},
      isSpeculative: true,
      reviewed: false,
    };
  });
  const boundaryConditions = buildBoundaryConditions(routeId, entry.parameters);
  const equivalencePartitionConditions = buildEquivalencePartitionConditions(
    routeId,
    entry.parameters,
  );
  const checklistConditions = buildChecklistConditions(routeId, entry.parameters, criticalityTier);
  const seen = new Set();
  const deduped = [];
  for (const c of combinatorialConditions.concat(
    boundaryConditions,
    equivalencePartitionConditions,
    checklistConditions,
  )) {
    if (seen.has(c.conditionId)) continue;
    seen.add(c.conditionId);
    deduped.push(c);
  }
  entry.conditions = deduped;
  entry.unsatisfiedPairs = unsatisfied;
  entry.sourceParamsHash = currentHash;
}

// Structural guard before any route is touched: a malformed entry (missing/non-array parameters,
// a parameter missing partitions) reports the same clean {status:'FAILED', errors:[...]} shape as
// the missing-file/no-routes cases below, instead of an unhandled TypeError mid-generation.
function checkShape(data) {
  const errors = [];
  for (const [routeId, entry] of Object.entries(data.routes)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.parameters)) {
      errors.push('routes["' + routeId + '"].parameters must be an array.');
      continue;
    }
    entry.parameters.forEach(function (param, i) {
      if (!param || typeof param !== 'object' || !Array.isArray(param.partitions)) {
        errors.push('routes["' + routeId + '"].parameters[' + i + '].partitions must be an array.');
      }
    });
  }
  return errors;
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
  for (const [routeId, entry] of Object.entries(data.routes)) {
    generateForRoute(routeId, entry, criticalityByRoute[routeId]);
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(data, null, 2) + '\\n', 'utf8');
  process.stdout.write(
    JSON.stringify({ status: 'GENERATED', routes: Object.keys(data.routes).length }) + '\\n',
  );
}

generate();
`;
}
