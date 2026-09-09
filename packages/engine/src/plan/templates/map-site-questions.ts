// Template for scripts/map-site-questions.mjs - the deterministic question flow for /map-site,
// built the same way scripts/auth-questions.mjs is and for the same reason.
//
// The ordering here is load-bearing in ways that are easy to get subtly wrong and invisible when
// they are: whether to overwrite a site map is meaningless before knowing one exists; the crawl
// boundary must be settled before anything is clicked, not after; an application's purpose cannot be
// confirmed before a crawl has produced candidates to choose between; and the API-style question
// must be asked ONLY in the one case the crawl could not answer it, since asking otherwise invites a
// human to contradict what was actually observed. Encoded once, those hold every run, on every
// assistant, in every model. Held as prose, they hold most of the time.
//
// It also mechanically enforces the rule that a structured choice needs at least two options - the
// core-purpose question is built from whatever candidates the analysis produced, and one candidate
// is the normal case, so the "I will describe it myself" alternative is appended here rather than
// left to the model to remember.
export function renderMapSiteQuestions(): string {
  return `#!/usr/bin/env node

/**
 * Computes which question /map-site should ask next, from the project's real state on disk.
 *
 * Usage:
 *   node scripts/map-site-questions.mjs --phase=preflight
 *   node scripts/map-site-questions.mjs --phase=preflight --answers='{"crawl-boundary":"safe-interactions"}'
 *   node scripts/map-site-questions.mjs --phase=postcrawl --answers='{...}'
 *   node scripts/map-site-questions.mjs --list
 *
 * Answers:
 *   { status: 'ASK',    question: {...}, answered: [...] }  - ask this, then re-run with it added
 *   { status: 'STOP',   outcome: {...} }                    - the flow ends here, for a real reason
 *   { status: 'DONE',   plan: {...} }                       - nothing left to ask in this phase
 *   { status: 'FAILED', errors: [...] }                     - an answer is not one of its options
 *
 * Two phases, because half of these questions only have meaning once a crawl has run:
 *   preflight  - before any page is loaded
 *   postcrawl  - after site-map.json and api-contracts.json exist
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const CWD = process.cwd();
const PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');

const PHASES = ['preflight', 'postcrawl'];
const THIN_RESULT_ROUTES = 2;

function argValue(name) {
  const prefix = '--' + name + '=';
  for (const raw of process.argv.slice(2)) {
    if (raw.indexOf(prefix) === 0) return raw.slice(prefix.length);
  }
  return null;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

// Real state, gathered from the scripts that already own each fact rather than re-derived here.
// --status exists so a harness can drive every branch without building a project on disk for each
// one; nothing in normal use passes it.
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
  const siteMap = readJson(SITE_MAP_PATH);
  const contracts = readJson(CONTRACTS_PATH);

  let capturedRoles = [];
  try {
    const authStatus = spawnSync('node', [path.join('scripts', 'auth-status.mjs')], {
      cwd: CWD,
      encoding: 'utf8',
    });
    if (authStatus.status === 0) {
      const parsed = JSON.parse(authStatus.stdout);
      if (Array.isArray(parsed.capturedRoles)) capturedRoles = parsed.capturedRoles;
    }
  } catch {
    // No auth-status is a normal state - it just means no roles were ever captured.
  }

  let orphanedScreenshotCount = 0;
  try {
    const mapStatus = spawnSync('node', [path.join('scripts', 'map-site-status.mjs'), 'create'], {
      cwd: CWD,
      encoding: 'utf8',
    });
    if (mapStatus.status === 0) {
      const parsed = JSON.parse(mapStatus.stdout);
      if (Number.isInteger(parsed.orphanedScreenshotCount)) {
        orphanedScreenshotCount = parsed.orphanedScreenshotCount;
      }
    }
  } catch {
    // Same: absence is not an error.
  }

  const entries = contracts && Array.isArray(contracts.contracts) ? contracts.contracts : [];
  return {
    siteMapExists: siteMap !== null,
    routeCount: siteMap && siteMap.routes ? Object.keys(siteMap.routes).length : 0,
    orphanedScreenshotCount: orphanedScreenshotCount,
    capturedRoles: capturedRoles,
    hasCrawlBoundary: Boolean(profile.crawlBoundary),
    // The stored answers themselves, not only whether they exist. A question that is skipped
    // because it was already answered has to hand that answer forward, or the run proceeds with
    // neither - live-observed leaving a second crawl with no boundary at all, which is worse than
    // asking again.
    storedCrawlBoundary: profile.crawlBoundary ? profile.crawlBoundary.value : null,
    storedOffLimits:
      profile.crawlBoundary && Array.isArray(profile.crawlBoundary.offLimits)
        ? profile.crawlBoundary.offLimits
        : null,
    hasApiStyle: Boolean(profile.apiStyle),
    contractsExist: contracts !== null,
    // A contract whose operation style is 'opaque' was seen and could not be read, so a file of
    // nothing but opaque entries is exactly the case the crawl cannot answer for itself.
    readableContractCount: entries.filter(function (entry) {
      return !entry || !entry.operation || entry.operation.style !== 'opaque';
    }).length,
  };
}

const QUESTIONS = [
  {
    id: 'existing-site-map',
    phase: 'preflight',
    text: 'A site map already exists for this project. Starting fresh discards it and gives every route a new identity, so anything recorded against those routes needs reviewing again. Refresh the existing one instead, or start fresh anyway?',
    options: [
      { id: 'update', label: 'Refresh the existing map, keeping route history', recommended: true },
      { id: 'recreate', label: 'Start fresh and discard it' },
    ],
    allowsFreeText: false,
    applies: function (answers, status) {
      return status.siteMapExists === true;
    },
  },
  {
    id: 'orphaned-screenshots',
    phase: 'preflight',
    text: 'There are screenshots on disk that belong to no route in any site map - left behind by a crawl that did not finish. Delete them before starting?',
    options: [
      { id: 'delete', label: 'Delete them', recommended: true },
      { id: 'keep', label: 'Leave them alone' },
    ],
    allowsFreeText: false,
    applies: function (answers, status) {
      return status.orphanedScreenshotCount > 0;
    },
  },
  {
    id: 'roles',
    phase: 'preflight',
    // Options are built from the sessions that actually exist, so this can never offer a role
    // nobody captured. Skipped entirely below one session, where there is nothing to choose.
    text: 'More than one saved login session exists. Crawl as all of them, so the map records what each role could reach, or as one?',
    dynamicOptions: function (status) {
      const options = [
        { id: 'all', label: 'All of them, one pass per role', recommended: true },
      ];
      for (const role of status.capturedRoles) {
        options.push({ id: 'only:' + role, label: 'Only ' + role });
      }
      return options;
    },
    allowsFreeText: false,
    applies: function (answers, status) {
      return status.capturedRoles.length > 1;
    },
  },
  {
    id: 'crawl-boundary',
    phase: 'preflight',
    // Asked before any page is loaded, deliberately: a wrong guess either wastes the run on
    // excessive caution or performs an action on a live application that nobody sanctioned.
    text: 'What is the crawler allowed to do while exploring this app?',
    options: [
      { id: 'read-only', label: 'Read only - navigate and read, never interact' },
      {
        id: 'safe-interactions',
        label: 'Read plus safe interactions - checkboxes, dropdowns, tabs, expanders; nothing that creates, submits, deletes or sends',
        recommended: true,
      },
      { id: 'full', label: 'Any in-app action is fine' },
      { id: 'full-except', label: 'Any in-app action except areas I will name' },
    ],
    allowsFreeText: false,
    applies: function (answers, status) {
      return status.hasCrawlBoundary !== true;
    },
  },
  {
    id: 'off-limits',
    phase: 'preflight',
    text: 'Which routes or features are off-limits? Name them in one reply.',
    options: [],
    allowsFreeText: true,
    freeTextHint:
      'A list of areas in the human own words, e.g. "the contact form, billing". Echo them back as a formatted list and get one explicit confirmation before crawling - never proceed on a guessed reading of free text.',
    applies: function (answers) {
      return answers['crawl-boundary'] === 'full-except';
    },
  },
  {
    id: 'thin-result',
    phase: 'postcrawl',
    // A thin result is a finding, not a result. A live run produced a two-route map from a deep-link
    // start URL and carried it forward into every later stage as if it were the whole application.
    text: 'The crawl found very few routes. That usually means it started somewhere that links to almost nothing - a login page, or a deep link - rather than that the application is this small. Is this really all of it?',
    options: [
      { id: 'accept', label: 'Yes, that is the whole application' },
      { id: 'restart', label: 'No - I will give a different start URL or capture a session that sees more' },
    ],
    allowsFreeText: false,
    applies: function (answers, status) {
      return status.siteMapExists === true && status.routeCount <= THIN_RESULT_ROUTES;
    },
  },
  {
    id: 'api-style',
    phase: 'postcrawl',
    // Asked ONLY when the crawl observed nothing readable. Asking otherwise invites an answer that
    // contradicts what was actually seen, and observation beats recollection every time.
    text: "Nothing readable came back from this application's network traffic while crawling. Do you know how its pages talk to the server? If you are not sure, say so - a guess here would be recorded as fact.",
    // "I do not know" is a real answer, not a missing one. Without it the only way forward is a
    // guess, and a guess recorded as an established fact is exactly what this project treats as
    // worse than an admitted gap - later stages draft API-level tests from this.
    options: [
      { id: 'unknown', label: "I don't know", recommended: true },
      { id: 'rest', label: 'REST - each address is a thing, like /api/orders/42' },
      { id: 'graphql', label: 'GraphQL - one address that everything is asked through' },
      { id: 'rpc', label: 'RPC - named operations (gRPC-Web, tRPC, JSON-RPC)' },
      { id: 'mixed', label: 'More than one of these' },
      {
        id: 'none-observable',
        label: 'No API as such - form submits or server-side actions',
      },
    ],
    allowsFreeText: false,
    applies: function (answers, status) {
      if (status.hasApiStyle === true) return false;
      return status.contractsExist === true && status.readableContractCount === 0;
    },
  },
];

function optionsFor(question, status) {
  return question.dynamicOptions ? question.dynamicOptions(status) : question.options;
}

function questionsForPhase(phase) {
  return QUESTIONS.filter(function (question) {
    return question.phase === phase;
  });
}

// The one end state that is not "keep going": the human said the route list is not the application.
// Continuing past that would carry a known-wrong map into every later stage, which is exactly the
// live failure this exists to prevent.
function outcomeFor(answers) {
  if (answers['thin-result'] === 'restart') {
    return {
      reason: 'restart-with-different-start',
      message:
        'The route list is not the whole application. Nothing further runs on it: ask for a start URL that reaches more, or for a role session that sees more, and crawl again.',
    };
  }
  return null;
}

function planFor(answers, status) {
  // This run's answer first, then whatever was recorded on an earlier one. A question skipped
  // because it is already answered must still deliver that answer.
  const boundary = answers['crawl-boundary'] || status.storedCrawlBoundary || null;
  const rolesAnswer = answers.roles;
  let roles = [];
  if (rolesAnswer === 'all') roles = status.capturedRoles.slice();
  else if (typeof rolesAnswer === 'string' && rolesAnswer.indexOf('only:') === 0) {
    roles = [rolesAnswer.slice('only:'.length)];
  } else if (status.capturedRoles.length === 1) roles = status.capturedRoles.slice();

  return {
    mode: answers['existing-site-map'] === 'recreate' ? 'create' : status.siteMapExists ? 'update' : 'create',
    roles: roles,
    crawlBoundary: boundary,
    offLimits:
      boundary !== 'full-except'
        ? null
        : typeof answers['off-limits'] === 'string'
          ? answers['off-limits']
          : status.storedOffLimits && status.storedOffLimits.length > 0
            ? status.storedOffLimits.join(', ')
            : null,
    pruneOrphanedScreenshots: answers['orphaned-screenshots'] === 'delete',
    // "I don't know" records nothing rather than recording uncertainty as a value: an absent field
    // already means "nobody established this", which is exactly what happened.
    apiStyle: answers['api-style'] && answers['api-style'] !== 'unknown' ? answers['api-style'] : null,
    applicationKind: answers['application-kind'] || null,
    corePurpose: answers['core-purpose'] || null,
  };
}

function checkAnswers(answers, status) {
  const errors = [];
  const byId = {};
  for (const question of QUESTIONS) byId[question.id] = question;

  for (const id of Object.keys(answers)) {
    const question = byId[id];
    if (!question) {
      errors.push('"' + id + '" is not a question this flow asks.');
      continue;
    }
    const options = optionsFor(question, status);
    if (options.length === 0) continue;
    const ids = options.map(function (option) {
      return option.id;
    });
    if (ids.indexOf(answers[id]) === -1) {
      errors.push(
        '"' +
          answers[id] +
          '" is not one of the options for "' +
          id +
          '" (' +
          ids.join(', ') +
          '). Interpret a free-text answer into one of them before recording it.',
      );
    }
  }
  return errors;
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\\n');
}

function main() {
  if (process.argv.slice(2).indexOf('--list') !== -1) {
    emit({
      status: 'LIST',
      phases: PHASES,
      questions: QUESTIONS.map(function (question) {
        return {
          id: question.id,
          phase: question.phase,
          text: question.text,
          options: question.options || [],
          dynamic: Boolean(question.dynamicOptions),
          allowsFreeText: question.allowsFreeText === true,
        };
      }),
    });
    return;
  }

  const errors = [];
  const phase = argValue('phase') || 'preflight';
  if (PHASES.indexOf(phase) === -1) {
    errors.push('--phase must be one of ' + PHASES.join('|') + ' (got "' + phase + '").');
  }

  let answers = {};
  const rawAnswers = argValue('answers');
  if (rawAnswers !== null) {
    try {
      answers = JSON.parse(rawAnswers);
    } catch (err) {
      errors.push('--answers is not valid JSON: ' + err.message);
    }
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    errors.push('--answers must be a JSON object of questionId -> answer.');
    answers = {};
  }

  const status = errors.length === 0 ? loadStatus(errors) : null;
  if (errors.length === 0) errors.push.apply(errors, checkAnswers(answers, status));
  if (errors.length > 0) {
    emit({ status: 'FAILED', errors: errors });
    process.exit(1);
  }

  const answered = QUESTIONS.map(function (question) {
    return question.id;
  }).filter(function (id) {
    return Object.prototype.hasOwnProperty.call(answers, id);
  });

  const outcome = outcomeFor(answers);
  if (outcome) {
    emit({ status: 'STOP', phase: phase, outcome: outcome, answered: answered });
    return;
  }

  for (const question of questionsForPhase(phase)) {
    if (Object.prototype.hasOwnProperty.call(answers, question.id)) continue;
    if (!question.applies(answers, status)) continue;
    emit({
      status: 'ASK',
      phase: phase,
      question: {
        id: question.id,
        text: question.text,
        options: optionsFor(question, status),
        allowsFreeText: question.allowsFreeText === true,
        freeTextHint: question.freeTextHint || null,
      },
      answered: answered,
    });
    return;
  }

  emit({ status: 'DONE', phase: phase, plan: planFor(answers, status), answered: answered });
}

main();
`;
}
