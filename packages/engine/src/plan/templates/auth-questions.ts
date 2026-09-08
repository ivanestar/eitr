// Template for generating scripts/auth-questions.mjs. create-if-absent.
// The question sequence of /auth-setup, computed rather than remembered.
//
// Every other guided flow in this project already computes "which stage now" from real state
// (pipeline-status.mjs, map-site-status.mjs, auth-status.mjs). The questions inside a stage were
// the one part still living only as prose, which has two costs. A model has to hold the ordering,
// the conditions and the contradiction rules in its head while also running the flow; and when it
// gets one wrong there is no way to notice mechanically, because nothing anywhere states what the
// right question was.
//
// The split this draws: the script owns WHAT to ask, in what order, with which options, and what
// the answers add up to. The model owns exactly one thing the script cannot do - reading a person's
// own words and deciding which of the offered option ids they meant. That part stays a judgment
// call, and it is now a small, isolated one instead of being tangled through the whole flow.
export function renderAuthQuestions(): string {
  return `#!/usr/bin/env node

/**
 * Computes the next question in the /auth-setup flow from the answers given so far.
 * Zero model involvement - pure state machine, safe to run at any time.
 *
 * Usage:
 *   node scripts/auth-questions.mjs
 *   node scripts/auth-questions.mjs --answers='{"has-login":"yes","proceed":"continue"}'
 *   node scripts/auth-questions.mjs --answers=@answers.json
 *   node scripts/auth-questions.mjs --status='{"hasSession":false,...}'   (test injection)
 *
 * Output:
 *   { status: 'ASK',  question: {...}, answered: [...] }        - ask this, then re-run with it
 *   { status: 'STOP', outcome: {...}, answered: [...] }         - the flow ends here, and why
 *   { status: 'DONE', plan: {...},    answered: [...] }         - every question answered
 *   { status: 'FAILED', errors: [...] }                         - the answers are not usable
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const CWD = process.cwd();
const AUTH_STATUS_PATH = path.join(CWD, 'scripts', 'auth-status.mjs');

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find(function (a) {
    return a.indexOf(prefix) === 0;
  });
  return found ? found.slice(prefix.length) : undefined;
}

// Accepts inline JSON or @path, so a long answer set does not have to fit on a command line.
function readJsonArg(raw, label, errors) {
  if (raw === undefined) return null;
  let text = raw;
  if (raw.indexOf('@') === 0) {
    const filePath = path.resolve(CWD, raw.slice(1));
    if (!fs.existsSync(filePath)) {
      errors.push(label + ' file not found: ' + raw.slice(1));
      return null;
    }
    text = fs.readFileSync(filePath, 'utf8');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    errors.push(label + ' is not valid JSON: ' + err.message);
    return null;
  }
}

// State comes from auth-status.mjs, which is already the single source of truth for what is on
// disk. Re-deriving it here would give the project two places to disagree about whether a session
// exists. --status exists so a test can inject a state without building a filesystem for it.
function loadStatus(errors) {
  const injected = readJsonArg(argValue('status'), '--status', errors);
  if (injected) return injected;
  if (errors.length > 0) return null;
  if (!fs.existsSync(AUTH_STATUS_PATH)) {
    errors.push('scripts/auth-status.mjs not found - it is where this flow reads its state from.');
    return null;
  }
  const run = spawnSync(process.execPath, [AUTH_STATUS_PATH], { cwd: CWD, encoding: 'utf8' });
  if (run.status !== 0) {
    errors.push('scripts/auth-status.mjs failed: ' + (run.stderr || '').trim());
    return null;
  }
  try {
    return JSON.parse(run.stdout);
  } catch (err) {
    errors.push('scripts/auth-status.mjs did not return JSON: ' + err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// The questions
// ---------------------------------------------------------------------------
//
// Each one declares when it applies, what it offers, and whether a person may answer in their own
// words instead. 'recommended' marks the default an option list is allowed to have exactly one of.
// The text is written out in full here rather than left to the model, so that what a human is
// asked does not vary between runs, assistants, or models.

const QUESTIONS = [
  {
    id: 'has-login',
    // Asked before anything is explained, deliberately: whether to approve a login-capture
    // procedure is not a question anyone has a basis to answer before it is established that their
    // application has a login at all.
    text: 'Does your app have a login at all - anything behind a sign-in you want tested?',
    options: [
      { id: 'yes', label: 'Yes, there is a login' },
      { id: 'no', label: 'No login anywhere' },
    ],
    allowsFreeText: false,
    applies: function () {
      return true;
    },
  },
  {
    id: 'proceed',
    text: "This saves a real login session to a file, so tests don't have to log in every time - locally, and in CI too if you want. A real browser opens once, you log in by hand, and the session is saved. Continue, or stop here?",
    options: [
      { id: 'continue', label: 'Continue' },
      { id: 'stop', label: 'Stop here' },
    ],
    allowsFreeText: false,
    applies: function (answers) {
      return answers['has-login'] === 'yes';
    },
  },
  {
    id: 'existing-session',
    text: 'A saved session already exists. Reuse it, replace it, or add another role alongside it?',
    options: [
      { id: 'reuse', label: 'Reuse it as-is' },
      { id: 'capture-fresh', label: 'Capture a fresh one' },
      { id: 'add-role', label: 'Add another role' },
    ],
    allowsFreeText: false,
    // Only when there is something to overwrite. Asking otherwise offers a choice between three
    // things that do not exist.
    applies: function (answers, status) {
      return answers.proceed === 'continue' && status.hasSession === true;
    },
  },
  {
    id: 'roles',
    text: 'Does the application have more than one user role (Admin, Customer, Vendor, and so on) - and how many do you want to capture right now?',
    options: [
      { id: 'single', label: 'One kind of user, no separate roles' },
      { id: 'all', label: 'Several roles - capture all of them now', recommended: true },
      { id: 'some', label: 'Several roles - capture only some now' },
      { id: 'none-and-no-login', label: 'No roles and no login at all' },
    ],
    allowsFreeText: true,
    freeTextHint:
      'Interpret an answer given in their own words into exactly one option id above. Ask again only when it genuinely fits none of them.',
    applies: function (answers) {
      if (answers.proceed !== 'continue') return false;
      // Reusing a session that already works asks nothing further about roles.
      return answers['existing-session'] === undefined || answers['existing-session'] !== 'reuse';
    },
  },
  {
    id: 'role-names',
    text: 'Which roles? Name them in one reply - they become the session file and credential slot names.',
    options: [],
    allowsFreeText: true,
    freeTextHint:
      'A list of role names, comma-separated, recorded in the human\\'s own words. Each becomes a session filename and an E2E_<ROLE>_USERNAME variable, so each needs latin letters or digits in it; a name written in another script is refused by name rather than dropped, and the answer is to ask that role for a latin name, never to transliterate it yourself.',
    applies: function (answers) {
      return answers.roles === 'all' || answers.roles === 'some';
    },
  },
  {
    id: 'ci',
    text: 'Want this login available in CI too, so tests run there the same way?',
    options: [
      { id: 'yes', label: 'Yes, wire it into CI', recommended: true },
      { id: 'no', label: 'No, local only' },
    ],
    allowsFreeText: false,
    // Never asked on a project generated without CI: there is no pipeline for the answer to change.
    applies: function (answers, status) {
      if (answers.proceed !== 'continue') return false;
      return typeof status.ciProvider === 'string' && status.ciProvider.length > 0;
    },
  },
  {
    id: 'push-secrets',
    text: 'Push the auth values as CI secrets now, from this machine?',
    options: [
      { id: 'yes', label: 'Yes, push them now' },
      { id: 'no', label: 'No, I will add them myself' },
    ],
    allowsFreeText: false,
    // Writing secrets into a remote project is the one irreversible, outward-facing action in this
    // whole flow, so it gets its own explicit answer rather than riding along on the CI question.
    applies: function (answers) {
      return answers.ci === 'yes';
    },
  },
];

const QUESTION_BY_ID = {};
for (const question of QUESTIONS) QUESTION_BY_ID[question.id] = question;

// ---------------------------------------------------------------------------
// Terminal outcomes
// ---------------------------------------------------------------------------
//
// Each one is a real, supported end state rather than a failure, and each says what it means in
// the words the human should hear. A flow that ends early is not an incomplete run.

function outcomeFor(answers) {
  if (answers['has-login'] === 'no') {
    return {
      reason: 'no-login',
      message:
        'Nothing to set up - this app has no login, so there is no session to capture. Do not describe the capture procedure.',
    };
  }
  if (answers.proceed === 'stop') {
    return { reason: 'declined', message: 'Stopped before anything ran. Nothing was changed.' };
  }
  // A person cannot both have a login and have no login. Rather than picking whichever answer came
  // last, the flow stops and says which two answers disagree - guessing an intent here would mean
  // either capturing a session nobody wants or skipping one they do.
  if (answers.roles === 'none-and-no-login') {
    return {
      reason: 'contradiction',
      message:
        'The answer "no roles and no login at all" contradicts the earlier answer that this app does have a login. Stopping rather than choosing one of the two - re-run and answer the first question again.',
    };
  }
  if (answers['existing-session'] === 'reuse') {
    return {
      reason: 'reusing-session',
      message: 'Keeping the session that already exists. Nothing to capture.',
    };
  }
  if (answers.ci === 'no') {
    return {
      reason: 'local-only',
      message:
        'The session works locally. CI can be wired up later by re-running this - nothing about that decision is permanent.',
    };
  }
  return null;
}

// A role name becomes a filename and an environment variable name, and POSIX environment names are
// ASCII by definition - so a name written in any other script cannot pass through unchanged.
// Transliterating it would mean choosing one romanisation out of several defensible ones, and for
// most writing systems there is no obvious choice at all, so this returns null and the caller asks.
// What it must never do is quietly return an empty string: a person who named two roles and got a
// single unnamed session would have no way to tell that their answer was dropped.
function slugifyRole(name) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.length > 0 ? slug : null;
}

function splitRoleNames(answers) {
  if (answers.roles === 'single' || answers.roles === undefined) return [];
  return String(answers['role-names'] || '')
    .split(/[,\\n]/)
    .map(function (name) {
      return name.trim();
    })
    .filter(function (name) {
      return name.length > 0;
    });
}

// What the answers add up to, so the skill acts on a computed plan rather than on its own reading
// of a conversation that may have run over many turns.
function planFor(answers, status) {
  const labels = splitRoleNames(answers);
  const roles = [];
  const roleLabels = {};
  for (const label of labels) {
    const slug = slugifyRole(label);
    if (slug === null) continue;
    roles.push(slug);
    // The human's own wording is kept alongside the machine name, so a report can say "Admin"
    // where the filesystem says "admin" without anyone re-deriving it.
    roleLabels[slug] = label;
  }
  return {
    capture: answers['existing-session'] !== 'reuse',
    roles: roles,
    roleLabels: roleLabels,
    // The flat single-user case keeps the E2E_USERNAME/E2E_PASSWORD names that already exist.
    envRoleStubs: roles.length > 0,
    wireCi: answers.ci === 'yes',
    ciProvider: answers.ci === 'yes' ? status.ciProvider : null,
    pushSecrets: answers['push-secrets'] === 'yes',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function checkAnswers(answers) {
  const errors = [];
  // A name that cannot become a filename and an environment variable name is refused by name,
  // rather than silently contributing nothing to the plan.
  for (const label of splitRoleNames(answers)) {
    if (slugifyRole(label) !== null) continue;
    errors.push(
      'The role name "' +
        label +
        '" has no letters or digits that can be used in a filename and an environment variable name (E2E_<ROLE>_USERNAME), so it cannot be used as one. Ask for a latin-alphabet name for this role and keep the original as its display label - do not transliterate it yourself.',
    );
  }
  for (const [id, value] of Object.entries(answers)) {
    const question = QUESTION_BY_ID[id];
    if (!question) {
      errors.push('"' + id + '" is not a question in this flow.');
      continue;
    }
    if (question.options.length === 0) continue;
    const known = question.options.some(function (option) {
      return option.id === value;
    });
    if (!known) {
      errors.push(
        '"' +
          value +
          '" is not one of the options for "' +
          id +
          '" (' +
          question.options
            .map(function (option) {
              return option.id;
            })
            .join(', ') +
          '). Interpret a free-text answer into one of them before recording it.',
      );
    }
  }
  return errors;
}

function main() {
  // Every question and option this flow can ever produce, in one place. Exists so that "all
  // branches are covered" is a checkable fact rather than a claim someone makes in a commit
  // message, and so a downstream harness can enumerate the flow without re-reading this file.
  if (process.argv.slice(2).indexOf('--list') !== -1) {
    process.stdout.write(
      JSON.stringify(
        {
          status: 'LIST',
          questions: QUESTIONS.map(function (question) {
            return {
              id: question.id,
              text: question.text,
              options: question.options,
              allowsFreeText: question.allowsFreeText === true,
            };
          }),
        },
        null,
        2,
      ) + '\\n',
    );
    return;
  }

  const errors = [];
  const answers = readJsonArg(argValue('answers'), '--answers', errors) || {};
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    errors.push('--answers must be a JSON object of questionId -> answer.');
  }
  const status = errors.length === 0 ? loadStatus(errors) : null;
  if (errors.length === 0) errors.push.apply(errors, checkAnswers(answers));
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ status: 'FAILED', errors: errors }, null, 2) + '\\n');
    process.exit(1);
  }

  const answered = QUESTIONS.map(function (question) {
    return question.id;
  }).filter(function (id) {
    return Object.prototype.hasOwnProperty.call(answers, id);
  });

  const outcome = outcomeFor(answers);
  if (outcome) {
    process.stdout.write(
      JSON.stringify({ status: 'STOP', outcome: outcome, answered: answered }, null, 2) + '\\n',
    );
    return;
  }

  for (const question of QUESTIONS) {
    if (Object.prototype.hasOwnProperty.call(answers, question.id)) continue;
    if (!question.applies(answers, status)) continue;
    process.stdout.write(
      JSON.stringify(
        {
          status: 'ASK',
          question: {
            id: question.id,
            text: question.text,
            options: question.options,
            allowsFreeText: question.allowsFreeText === true,
            freeTextHint: question.freeTextHint || null,
          },
          answered: answered,
        },
        null,
        2,
      ) + '\\n',
    );
    return;
  }

  process.stdout.write(
    JSON.stringify({ status: 'DONE', plan: planFor(answers, status), answered: answered }, null, 2) +
      '\\n',
  );
}

main();
`;
}
