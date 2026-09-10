// Template for scripts/map-features-questions.mjs. create-if-absent.
//
// The two questions /map-features has to ask about the application as a whole - what KIND of thing
// it is, and what it is FOR. They used to sit in the crawl's own question set, which is the wrong
// place twice over: neither can be answered before something has read the pages (the crawl only
// finds them), and the answers change how this stage scores criticality, not how the crawl runs.
//
// Same contract as scripts/auth-questions.mjs and scripts/map-site-questions.mjs: the script decides
// what to ask and in what order from the project's own recorded state, the skill asks it and records
// the answer id. Held as prose, "do not ask what a person already answered" holds most of the time;
// encoded here, it holds every run.
export function renderMapFeaturesQuestions(): string {
  return `#!/usr/bin/env node

/**
 * Which question /map-features asks next about the application as a whole, given what is already
 * recorded and what the analysis proposed. Zero model involvement.
 *
 * Usage:
 *   node scripts/map-features-questions.mjs
 *   node scripts/map-features-questions.mjs --answers='{"application-kind":"sandbox-demo"}'
 *   node scripts/map-features-questions.mjs --status='{...}'   (harness only)
 *
 * Prints one of:
 *   { status: 'ASK', question: {...}, answered: [...] }
 *   { status: 'DONE', plan: {...} }
 *   { status: 'FAILED', errors: [...] }
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

// Real state, read from the one file that already owns these facts. --status exists so a harness can
// drive every branch without building a project on disk; nothing in normal use passes it.
function loadStatus(errors) {
  const injected = argValue('status');
  if (injected !== null) {
    try {
      return JSON.parse(injected);
    } catch (err) {
      errors.push('--status is not valid JSON: ' + err.message);
      return null;
    }
  }
  const profile = readJson(PROFILE_PATH) || {};
  return {
    hasApplicationKind: Boolean(profile.applicationKind),
    corePurposeCandidates:
      profile.corePurpose && Array.isArray(profile.corePurpose.candidates)
        ? profile.corePurpose.candidates
        : [],
    corePurposeSelected: Boolean(profile.corePurpose && profile.corePurpose.selected),
  };
}

const QUESTIONS = [
  {
    id: 'application-kind',
    // Separate from purpose deliberately: what an application IS FOR and what KIND of thing it is
    // are different facts, and only the second one tells a practice sandbox from the real system it
    // imitates - which decides whether an auth route is a real credential surface or an exhibit.
    text: 'Is this the real production application, or a sandbox or demo, an internal tool, or a staging copy?',
    options: [
      { id: 'production', label: 'The real production application' },
      { id: 'sandbox-demo', label: 'A sandbox, demo or practice application' },
      { id: 'internal-tool', label: 'An internal tool' },
      { id: 'staging', label: 'A staging copy of production' },
    ],
    allowsFreeText: false,
    applies: function (answers, status) {
      return status.hasApplicationKind !== true;
    },
  },
  {
    id: 'core-purpose',
    text: 'What is this application for? Pick the reading that fits, or describe it yourself.',
    // Built from whatever the analysis actually proposed. One candidate is the normal case - the
    // analysis is told to write a single well-evidenced reading rather than pad the list - and a
    // structured choice tool rejects a call carrying one option, so the "describe it myself"
    // alternative is appended here rather than left to the model to remember at the point of asking.
    dynamicOptions: function (status) {
      const options = status.corePurposeCandidates.map(function (candidate, index) {
        return {
          id: 'candidate:' + index,
          label:
            candidate && typeof candidate.value === 'string' ? candidate.value : '(unreadable candidate)',
        };
      });
      const likely = options[0];
      if (likely) likely.recommended = true;
      options.push({ id: 'own-words', label: 'None of these - I will describe it myself' });
      return options;
    },
    allowsFreeText: true,
    freeTextHint:
      "A one-sentence description in the human's own words. Record it as corePurpose.selected with source 'human'; picking a candidate records that candidate's value with source 'observed'.",
    applies: function (answers, status) {
      return status.corePurposeCandidates.length > 0 && status.corePurposeSelected !== true;
    },
  },
];

function optionsFor(question, status) {
  return question.dynamicOptions ? question.dynamicOptions(status) : question.options;
}

function checkAnswers(answers, status, errors) {
  for (const question of QUESTIONS) {
    const answer = answers[question.id];
    if (answer === undefined) continue;
    const known = optionsFor(question, status).map(function (option) {
      return option.id;
    });
    // Free text is recorded as an option id by the model reading what a person meant, so an id that
    // is not on the list is a recording error rather than a person's mistake - and silently keeping
    // it would put an answer nobody gave into the project's own record.
    if (known.indexOf(answer) === -1) {
      errors.push(
        question.id +
          ' was answered "' +
          answer +
          '", which is not one of its options (' +
          known.join(', ') +
          ').',
      );
    }
  }
}

// What the answers add up to, so a skill acts on a decision rather than on its own recollection of a
// conversation that may have run over many turns.
function planFor(answers, status) {
  const kind = answers['application-kind'] || null;
  const purpose = answers['core-purpose'] || null;
  const candidateIndex =
    typeof purpose === 'string' && purpose.startsWith('candidate:')
      ? Number(purpose.slice('candidate:'.length))
      : null;
  return {
    // Already in app-profile.json's own vocabulary, so the value recorded is the one its validator
    // accepts rather than the option id.
    applicationKind: kind === 'staging' ? 'staging-of-production' : kind,
    // Whether the answer carries its own evidence forward, or is the person's own words. The
    // distinction is what tells a later reader how much the recorded purpose is worth.
    corePurpose:
      purpose === null
        ? null
        : purpose === 'own-words'
          ? { source: 'human', candidateIndex: null }
          : { source: 'observed', candidateIndex: candidateIndex },
    // The one case where nothing was proposed: the analysis found no reading it could evidence, so
    // there is nothing to confirm and the field stays absent rather than being filled with a guess.
    purposeAsked: status.corePurposeCandidates.length > 0,
  };
}

function main() {
  const errors = [];
  const rawAnswers = argValue('answers');
  let answers = {};
  if (rawAnswers !== null) {
    try {
      answers = JSON.parse(rawAnswers);
    } catch (err) {
      errors.push('--answers is not valid JSON: ' + err.message);
    }
  }
  const status = loadStatus(errors);
  if (errors.length > 0 || status === null) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: errors }, null, 2) + '\\n');
    process.exit(1);
  }

  checkAnswers(answers, status, errors);
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: errors }, null, 2) + '\\n');
    process.exit(1);
  }

  for (const question of QUESTIONS) {
    if (answers[question.id] !== undefined) continue;
    if (!question.applies(answers, status)) continue;
    process.stdout.write(
      JSON.stringify(
        {
          status: 'ASK',
          question: {
            id: question.id,
            text: question.text,
            options: optionsFor(question, status),
            allowsFreeText: question.allowsFreeText === true,
            freeTextHint: question.freeTextHint || null,
          },
          answered: Object.keys(answers),
        },
        null,
        2,
      ) + '\\n',
    );
    return;
  }

  process.stdout.write(
    JSON.stringify({ status: 'DONE', plan: planFor(answers, status) }, null, 2) + '\\n',
  );
}

main();
`;
}
