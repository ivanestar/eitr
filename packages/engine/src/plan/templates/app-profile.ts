// Template for scripts/app-profile.mjs — the single read/validate entry point for
// artifacts/analysis/app-profile.json.
//
// Deliberately NOT an assembler: it never merges site-map.json, business-intent.json, or anything
// else into its output. Merging would put a second copy of those facts in circulation and quietly
// couple every consumer to stages that may not have run. This script answers exactly one question -
// "what durable facts do we have about this application that live nowhere else" - and returns a
// well-formed empty profile when the answer is "none yet", so a caller never has to branch on
// whether the file exists.
export function renderAppProfile(): string {
  return `#!/usr/bin/env node

/**
 * Reads and validates artifacts/analysis/app-profile.json - the durable record of facts about this
 * application that nothing else stores. Zero model involvement, safe to run at any time.
 *
 * Usage:
 *   node scripts/app-profile.mjs              # print the profile (or a well-formed empty one)
 *   node scripts/app-profile.mjs --validate   # check shape only; exits 1 on a malformed file
 *
 * Every field is optional by design. An absent profile is a normal state, not an error: a caller
 * that does not find the fact it wants asks the human, exactly as it would have anyway.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');

const APPLICATION_KINDS = [
  'production',
  'sandbox-demo',
  'internal-tool',
  'staging-of-production',
  'unknown',
];
const API_STYLES = ['rest', 'graphql', 'rpc', 'mixed', 'none-observable', 'unknown'];
const CRAWL_BOUNDARIES = ['read-only', 'safe-interactions', 'full', 'full-except'];
const FACT_SOURCES = ['human', 'observed'];

// Pointers to where the rest of the project's knowledge lives, reported only for the files that
// actually exist right now - a pointer to a file that was never written is worse than no pointer.
const KNOWN_ARTIFACTS = [
  { key: 'siteMap', file: path.join('artifacts', 'site-map', 'site-map.json') },
  { key: 'businessIntent', file: path.join('artifacts', 'analysis', 'business-intent.json') },
  { key: 'apiContracts', file: path.join('artifacts', 'site-map', 'api-contracts.json') },
  { key: 'testConditions', file: path.join('artifacts', 'analysis', 'test-conditions.json') },
  { key: 'testCases', file: path.join('artifacts', 'test-cases', 'test-cases.json') },
];

function emptyProfile() {
  return { schemaVersion: 1, generatedAt: null, exists: false };
}

function loadProfile() {
  if (!fs.existsSync(PROFILE_PATH)) return { data: null, parseError: null };
  try {
    return { data: JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')), parseError: null };
  } catch (err) {
    return { data: null, parseError: err.message };
  }
}

function checkFact(fact, label, allowedValues, errors) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    errors.push(label + ' must be an object when present.');
    return;
  }
  if (allowedValues && !allowedValues.includes(fact.value)) {
    errors.push(label + '.value must be one of ' + allowedValues.join('|') + '.');
  }
  if (!FACT_SOURCES.includes(fact.source)) {
    errors.push(label + '.source must be one of ' + FACT_SOURCES.join('|') + '.');
  }
  if (typeof fact.recordedAt !== 'string' || fact.recordedAt.length === 0) {
    errors.push(label + '.recordedAt must be a non-empty string.');
  }
  if ('note' in fact && typeof fact.note !== 'string') {
    errors.push(label + '.note, when present, must be a string.');
  }
}

// The confirmed one-sentence answer to "what is this application for". Only \`selected\` is
// authoritative; \`candidates\` is what the analysis proposed before anyone answered.
function checkCorePurpose(purpose, errors) {
  if (!purpose || typeof purpose !== 'object' || Array.isArray(purpose)) {
    errors.push('corePurpose must be an object when present.');
    return;
  }
  if (!Array.isArray(purpose.candidates) || purpose.candidates.length === 0) {
    errors.push('corePurpose.candidates must be a non-empty array.');
  } else {
    purpose.candidates.forEach((candidate, index) => {
      const label = 'corePurpose.candidates[' + index + ']';
      if (!candidate || typeof candidate !== 'object') {
        errors.push(label + ' must be an object.');
        return;
      }
      if (typeof candidate.value !== 'string' || candidate.value.trim() === '') {
        errors.push(label + '.value must be a non-empty string.');
      }
      if (typeof candidate.reasoning !== 'string' || candidate.reasoning.trim() === '') {
        errors.push(label + '.reasoning must be a non-empty string.');
      }
      if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
        errors.push(label + '.evidence must be a non-empty array - never propose a reading with nothing behind it.');
      }
    });
    const count = purpose.candidates.length;
    if (
      !Number.isInteger(purpose.mostLikelyIndex) ||
      purpose.mostLikelyIndex < 0 ||
      purpose.mostLikelyIndex >= count
    ) {
      errors.push('corePurpose.mostLikelyIndex must be an integer index into candidates (0..' + (count - 1) + ').');
    }
  }
  if (typeof purpose.reviewed !== 'boolean') {
    errors.push('corePurpose.reviewed must be a boolean.');
  }
  // The failure this catches: a run that asked the question, got an answer, and recorded the
  // approval without recording the answer itself.
  if (purpose.reviewed === true && !purpose.selected) {
    errors.push('corePurpose.reviewed is true but corePurpose.selected is absent - record what was actually confirmed, not just that something was.');
  }
  if ('selected' in purpose) {
    checkFact(purpose.selected, 'corePurpose.selected', null, errors);
    if (purpose.selected && typeof purpose.selected.value !== 'string') {
      errors.push('corePurpose.selected.value must be a string.');
    }
  }
}

function checkRoles(roles, errors) {
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) {
    errors.push('roles must be an object keyed by role name when present.');
    return;
  }
  for (const [key, role] of Object.entries(roles)) {
    const label = 'roles["' + key + '"]';
    if (!role || typeof role !== 'object') {
      errors.push(label + ' must be an object.');
      continue;
    }
    if (role.name !== key) {
      errors.push(label + '.name must equal its own key (found ' + JSON.stringify(role.name) + ').');
    }
    checkFact(role.purpose, label + '.purpose', null, errors);
    if (!Array.isArray(role.exclusiveRoutes)) {
      errors.push(label + '.exclusiveRoutes must be an array - an empty one is a real finding, not a missing field.');
    }
    if (typeof role.reviewed !== 'boolean') {
      errors.push(label + '.reviewed must be a boolean.');
    }
  }
}

function validate(data, parseError) {
  const errors = [];
  if (parseError !== null) {
    errors.push('artifacts/analysis/app-profile.json is not valid JSON: ' + parseError);
    return errors;
  }
  // An absent profile is valid - it just means nothing durable has been learned yet.
  if (data === null) return errors;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('artifacts/analysis/app-profile.json must contain a JSON object.');
    return errors;
  }
  if (data.schemaVersion !== 1) {
    errors.push('schemaVersion must be exactly 1 (found ' + JSON.stringify(data.schemaVersion) + ').');
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }

  if ('applicationKind' in data) {
    checkFact(data.applicationKind, 'applicationKind', APPLICATION_KINDS, errors);
  }

  if ('corePurpose' in data) {
    checkCorePurpose(data.corePurpose, errors);
  }

  if ('roles' in data) {
    checkRoles(data.roles, errors);
  }

  if ('apiStyle' in data) {
    checkFact(data.apiStyle, 'apiStyle', API_STYLES, errors);
  }

  if ('crawlBoundary' in data) {
    checkFact(data.crawlBoundary, 'crawlBoundary', CRAWL_BOUNDARIES, errors);
    const offLimits = data.crawlBoundary && data.crawlBoundary.offLimits;
    if (offLimits !== undefined) {
      if (!Array.isArray(offLimits) || !offLimits.every((item) => typeof item === 'string')) {
        errors.push('crawlBoundary.offLimits, when present, must be an array of strings.');
      }
    }
  }

  if ('testTypes' in data) {
    if (!Array.isArray(data.testTypes)) {
      errors.push('testTypes, when present, must be an array.');
    } else {
      const seen = new Set();
      data.testTypes.forEach((entry, i) => {
        const label = 'testTypes[' + i + ']';
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push(label + ' must be an object.');
          return;
        }
        // Deliberately not checked against a fixed list of known type ids: the whole point of this
        // field is that a new test type can be introduced without editing the pipeline.
        if (typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id)) {
          errors.push(label + '.id must be a lowercase kebab-case string.');
        } else if (seen.has(entry.id)) {
          errors.push(label + '.id "' + entry.id + '" appears more than once.');
        } else {
          seen.add(entry.id);
        }
        if (typeof entry.inScope !== 'boolean') {
          errors.push(label + '.inScope must be a boolean.');
        }
        if (typeof entry.decidedAt !== 'string' || entry.decidedAt.length === 0) {
          errors.push(label + '.decidedAt must be a non-empty string.');
        }
        if ('rationale' in entry && typeof entry.rationale !== 'string') {
          errors.push(label + '.rationale, when present, must be a string.');
        }
      });
    }
  }

  if ('domainNotes' in data) {
    if (!Array.isArray(data.domainNotes)) {
      errors.push('domainNotes, when present, must be an array.');
    } else {
      data.domainNotes.forEach((entry, i) => {
        const label = 'domainNotes[' + i + ']';
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push(label + ' must be an object.');
          return;
        }
        if (typeof entry.note !== 'string' || entry.note.trim().length === 0) {
          errors.push(label + '.note must be a non-empty string.');
        }
        if (typeof entry.statedDuring !== 'string' || entry.statedDuring.length === 0) {
          errors.push(label + '.statedDuring must be a non-empty string.');
        }
        if (typeof entry.recordedAt !== 'string' || entry.recordedAt.length === 0) {
          errors.push(label + '.recordedAt must be a non-empty string.');
        }
      });
    }
  }

  return errors;
}

function main() {
  const validateOnly = process.argv.slice(2).includes('--validate');
  const { data, parseError } = loadProfile();
  const errors = validate(data, parseError);

  if (validateOnly) {
    const status = errors.length === 0 ? 'PASSED' : 'FAILED';
    process.stdout.write(JSON.stringify({ status, errors }, null, 2) + '\\n');
    process.exit(errors.length === 0 ? 0 : 1);
  }

  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors }, null, 2) + '\\n');
    process.exit(1);
  }

  const artifactIndex = {};
  for (const { key, file } of KNOWN_ARTIFACTS) {
    if (fs.existsSync(path.join(CWD, file))) {
      artifactIndex[key] = file.split(path.sep).join('/');
    }
  }

  const profile = data === null ? emptyProfile() : Object.assign({ exists: true }, data);
  profile.artifactIndex = artifactIndex;
  process.stdout.write(JSON.stringify(profile, null, 2) + '\\n');
}

main();
`;
}
