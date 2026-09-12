// Template for scripts/ground-zero-questions.mjs. create-if-absent.
//
// The questions /ground-zero-setup asks on its own behalf: how to run the chain, whether to capture
// the sessions of declared roles first, and what a person decides at each stage's gate. Written as
// prose, the option lists drifted between runs and between assistants - a gate offered three choices
// on one pass and five on the next, and nothing could tell whether the question asked was the right
// one. Same contract as scripts/auth-questions.mjs, scripts/map-site-questions.mjs and
// scripts/map-features-questions.mjs: the script decides what to ask from the project's own state,
// the skill asks it in the language of the conversation and records the answer id.
export function renderGroundZeroQuestions(): string {
  return `#!/usr/bin/env node

/**
 * Which question /ground-zero-setup asks next. Zero model involvement.
 *
 * Usage:
 *   node scripts/ground-zero-questions.mjs --phase=preflight
 *   node scripts/ground-zero-questions.mjs --phase=preflight --answers='{"mode":"guided"}'
 *   node scripts/ground-zero-questions.mjs --phase=gate
 *   node scripts/ground-zero-questions.mjs --phase=gate --answers='{"stage-gate":"approve-continue"}'
 *   node scripts/ground-zero-questions.mjs --status='{...}'   (harness only)
 *
 * Prints one of:
 *   { status: 'ASK', phase, show, question: {...}, answered: [...] }   - show: the stage report to
 *                                                                        print above a gate question
 *   { status: 'DONE', phase, plan: {...} }
 *   { status: 'FAILED', errors: [...] }
 *
 * preflight: the run mode, then - when a role declared in .env has no saved session - whether to
 * capture it before the crawl. gate: the one question at the end of a stage, built from where
 * scripts/pipeline-status.mjs says the project is.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const CWD = process.cwd();
const PHASES = ['preflight', 'gate'];

// What approving each stage leads to. A stage whose review is still open and the same stage already
// approved lead to the same next command; the closing stages have no gate of this skill's own.
const NEXT_AFTER = {
  'site-map-pending-review': '/map-features',
  'site-map-reviewed': '/map-features',
  'feature-map-pending-review': '/define-test-conditions',
  'feature-map-reviewed': '/define-test-conditions',
  'test-conditions-pending-review': '/design-test-cases',
  'test-conditions-reviewed': '/design-test-cases',
  'test-cases-drafted': '/automate-test',
};

// The review each gate is about, whose stage report the person sees above the question.
const REVIEW_OF = {
  'site-map-pending-review': 'site-map',
  'site-map-reviewed': 'site-map',
  'feature-map-pending-review': 'feature-map',
  'feature-map-reviewed': 'feature-map',
  'test-conditions-pending-review': 'test-conditions',
  'test-conditions-reviewed': 'test-conditions',
};

// The stage report as the review file was last drawn - it ends with the file's path. Read from the
// rendering kept beside the file, so it is the same text the review holds, not a recollection of it.
function reportFor(stage) {
  const kind = REVIEW_OF[stage];
  if (!kind) return null;
  const file = path.join(CWD, 'artifacts', 'review', '.base', kind + '-review.json');
  if (!fs.existsSync(file)) return null;
  try {
    const base = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof base.report === 'string' ? base.report : null;
  } catch {
    return null;
  }
}

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\\n');
}

function runScript(name) {
  if (!fs.existsSync(path.join(CWD, 'scripts', name))) return null;
  const result = spawnSync('node', [path.join('scripts', name)], { cwd: CWD, encoding: 'utf8' });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

// Real state, read from the two scripts that already own it. --status exists so a harness can drive
// every branch without building a project on disk; nothing in normal use passes it.
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
  const auth = runScript('auth-status.mjs') || {};
  const pipeline = runScript('pipeline-status.mjs') || {};
  return {
    authNextStep: typeof auth.nextStep === 'string' ? auth.nextStep : null,
    rolesMissingSession: Array.isArray(auth.rolesMissingSession) ? auth.rolesMissingSession : [],
    stage: typeof pipeline.stage === 'string' ? pipeline.stage : null,
  };
}

const QUESTIONS = [
  {
    id: 'mode',
    phase: 'preflight',
    text: 'How should the run go?',
    options: [
      { id: 'guided', label: 'Guided - stop at every stage for your review', recommended: true },
      { id: 'auto-pilot', label: 'Auto-pilot - the assistant approves each stage and stops only before any test code is written' },
    ],
    applies: function () {
      return true;
    },
  },
  {
    id: 'missing-roles',
    phase: 'preflight',
    dynamicText: function (status) {
      return (
        'No session is saved for ' +
        status.rolesMissingSession.join(', ') +
        ', so the crawl will not see the pages only ' +
        (status.rolesMissingSession.length === 1 ? 'that role reaches' : 'those roles reach') +
        '. Capture ' +
        (status.rolesMissingSession.length === 1 ? 'it' : 'them') +
        ' before the crawl?'
      );
    },
    options: [
      { id: 'capture-now', label: 'Capture now (/auth-setup)', recommended: true },
      { id: 'continue-without', label: 'Continue with the sessions there are' },
    ],
    applies: function (answers, status) {
      return status.authNextStep === 'roles-incomplete' && status.rolesMissingSession.length > 0;
    },
  },
  {
    id: 'stage-gate',
    phase: 'gate',
    // /design-test-cases has no approval of its own - its drafts are reviewed later - so its gate only
    // decides whether the chain goes on.
    dynamicText: function (status) {
      return status.stage === 'test-cases-drafted'
        ? 'Continue to ' + NEXT_AFTER[status.stage] + '?'
        : 'Approve this stage and continue to ' + NEXT_AFTER[status.stage] + '?';
    },
    dynamicOptions: function (status) {
      const next = NEXT_AFTER[status.stage];
      if (status.stage === 'test-cases-drafted') {
        return [
          { id: 'continue', label: 'Continue to ' + next, recommended: true },
          { id: 'pause', label: 'Pause here' },
        ];
      }
      return [
        { id: 'approve-continue', label: 'Approve and continue to ' + next, recommended: true },
        { id: 'approve-pause', label: 'Approve and pause here' },
        { id: 'reject', label: 'Reject with comments' },
        { id: 'stop', label: 'Stop for now, without approving' },
      ];
    },
    allowsFreeText: true,
    freeTextHint: 'Only with "reject": the corrections in the person\\'s words. Apply them, show the review again and ask this question again.',
    applies: function (answers, status) {
      return Boolean(NEXT_AFTER[status.stage]);
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
    if (!question.applies(answers, status)) continue;
    const known = optionsFor(question, status).map(function (option) {
      return option.id;
    });
    // An id not on the list is a recording error, not a person's mistake: keeping it would put an
    // answer nobody gave into the run.
    if (known.indexOf(answer) === -1) {
      errors.push(question.id + ' was answered "' + answer + '", which is not one of its options (' + known.join(', ') + ').');
    }
  }
}

// What the answers add up to, so the skill acts on a decision rather than on its recollection of a
// conversation that may have run over many turns.
function planFor(phase, answers, status) {
  if (phase === 'preflight') {
    return {
      mode: answers.mode || null,
      reviewedBy: answers.mode === 'auto-pilot' ? 'auto-pilot' : 'human',
      captureMissingRoles: answers['missing-roles'] === 'capture-now',
      rolesMissingSession: status.rolesMissingSession,
    };
  }
  const gate = answers['stage-gate'] || null;
  const next = NEXT_AFTER[status.stage] || null;
  return {
    stage: status.stage,
    gate: Boolean(next),
    approve: gate === 'approve-continue' || gate === 'approve-pause',
    continueTo: gate === 'approve-continue' || gate === 'continue' ? next : null,
    rework: gate === 'reject',
  };
}

function main() {
  const errors = [];
  const phase = argValue('phase') || 'preflight';
  if (PHASES.indexOf(phase) === -1) errors.push('--phase must be one of ' + PHASES.join('|') + ' (got "' + phase + '").');
  const rawAnswers = argValue('answers');
  let answers = {};
  if (rawAnswers !== null) {
    try {
      answers = JSON.parse(rawAnswers) || {};
    } catch (err) {
      errors.push('--answers is not valid JSON: ' + err.message);
    }
  }
  const status = errors.length === 0 ? loadStatus(errors) : null;
  if (errors.length === 0 && status) checkAnswers(answers, status, errors);
  if (errors.length > 0 || status === null) {
    emit({ status: 'FAILED', errors: errors });
    process.exit(1);
  }

  for (const question of QUESTIONS) {
    if (question.phase !== phase) continue;
    if (answers[question.id] !== undefined) continue;
    if (!question.applies(answers, status)) continue;
    emit({
      status: 'ASK',
      phase: phase,
      show: phase === 'gate' ? reportFor(status.stage) : null,
      question: {
        id: question.id,
        text: question.dynamicText ? question.dynamicText(status) : question.text,
        options: optionsFor(question, status),
        allowsFreeText: question.allowsFreeText === true,
        freeTextHint: question.freeTextHint || null,
      },
      answered: Object.keys(answers),
    });
    return;
  }
  emit({ status: 'DONE', phase: phase, plan: planFor(phase, answers, status) });
}

main();
`;
}
