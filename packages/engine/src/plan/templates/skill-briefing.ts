import { resolveStackConventions } from '../stack-conventions.js';

// Template for scripts/skill-briefing.mjs. create-if-absent.
//
// Every skill in this project opens by telling the person what is about to happen. That text used to
// be one sentence each, composed inline in the skill's own prose - which meant a first-time user was
// told what a stage was called and nothing about what it would produce, how long it would take, or
// what it would touch. Live feedback on a real run: the pipeline entry point's own introduction was
// "жиденький", and a review question about a file arrived without the file's path in it.
//
// It lives in a script for the same reason the crawl's bounds do. A briefing composed fresh each run
// is a briefing that shortens under pressure - the model summarizing its own summary - and the parts
// that get dropped first are exactly the ones that cost something to omit: the time it will take, the
// fact that it touches a live application, the fact that nothing writes code without approval.
// Authored once, printed verbatim, it says the same thing on every assistant on every run.
//
// The shape is what usability guidance for consequential confirmations converges on, applied to a
// terminal: say what will happen and what it produces rather than asking "are you sure"; give options
// that name their own outcome ("Start the crawl" / "Not now") instead of Yes/No; disclose cost and
// side effects before the decision rather than after; and do not ask twice for one decision - inside
// /ground-zero-setup's chain the stage gate already asked, so the briefing prints and no second
// question follows.
export function renderSkillBriefing(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const sc = resolveStackConventions(tool, language);
  const isCypress = sc.automationTool === 'cypress';
  const sessionArtifact = isCypress
    ? 'a cy.session() login command Cypress restores between spec files'
    : 'a session file under .auth/ that every test starts from';
  const pageObjectPath = sc.pagePath('<name>');

  return `#!/usr/bin/env node

/**
 * The briefing every skill prints before it does anything: what will happen, how, why, and what is
 * worth knowing before deciding. Authored here rather than composed per run - zero model
 * involvement, identical text on every assistant.
 *
 * Usage:
 *   node scripts/skill-briefing.mjs --skill=<name>
 *   node scripts/skill-briefing.mjs --skill=<name> --context=chain
 *   node scripts/skill-briefing.mjs list
 *
 * --context=direct (the default) is a skill invoked on its own: it prints the briefing and asks the
 * returned question. --context=chain is a skill invoked as a stage of /ground-zero-setup: it prints
 * the same briefing and asks nothing, because that chain's own stage gate already carries the
 * decision. Two questions for one decision is friction, not safety.
 */

import process from 'node:process';

const BRIEFINGS = {
  'auth-setup': {
    command: '/auth-setup',
    what:
      'Captures a real, working login for your tests - ${sessionArtifact} - and, if you want it, wires the same credentials into CI.',
    how: 'Asks a short series of questions computed from what this project already has, then prints one command for you to run yourself. A real browser opens, you log in normally - SSO, MFA, whatever your app uses - and closing the window saves the session.',
    why: 'Without it every later step only ever sees the signed-out surface of the application, which on most apps is the login page and nothing else.',
    notes: [
      'You type your credentials into the browser, never into this chat. Nothing echoes them back, and no part of this flow needs to know them.',
      'Nothing is pushed to CI without a separate yes to that specific question.',
    ],
    produces: ['.auth/<role>.json'],
    question: {
      text: 'Set up the login session now?',
      options: [
        { id: 'start', label: 'Set up the session', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'scan-and-generate-pom': {
    command: '/scan-and-generate-pom',
    what:
      'Writes a verified Page Object for the page you name, in \\\`${pageObjectPath}\\\`.',
    how: 'Opens the page live, reads its elements by test id, role and label, reuses the shared widgets this project already has, and checks every locator against the running application before saving anything.',
    why: 'Tests address your application through these objects. A locator nobody verified becomes a test that fails for a reason that has nothing to do with your product.',
    notes: [
      'Reads the live page and never submits anything. Existing method signatures are preserved, so specs already using this page keep compiling.',
    ],
    produces: ['${pageObjectPath}'],
    question: {
      text: 'Generate the Page Object now?',
      options: [
        { id: 'start', label: 'Generate it', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'automate-test': {
    command: '/automate-test',
    what: 'Turns a reviewed test case into real, running test code - and runs it until it is green or until it can tell you exactly why it is not.',
    how: 'Reads the case (a TMS ticket or a local draft), shows you what it intends to write and waits for your approval, then synthesizes the spec, generates any Page Object it is missing, and executes it.',
    why: 'This is the step that produces the actual suite. Everything before it is a plan on disk.',
    notes: [
      'Writes files and runs tests against your live application.',
      'How long it runs scales with how many cases are in the batch: one case is minutes, a full backlog is considerably more, and it writes and runs each one in turn.',
      'Nothing is written until you approve the proposal - in guided mode and in auto-pilot alike. That gate is never skipped.',
      'Test data is generated fresh; it never reuses a real account or a value read off your app.',
    ],
    produces: ['a test spec file, and any missing Page Object it needed'],
    question: {
      text: 'Write and run the test code now?',
      options: [
        { id: 'start', label: 'Start - I will still approve the proposal first' },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'heal-test': {
    command: '/heal-test',
    what: 'Works out why a test is failing and applies one targeted fix - or tells you plainly that it is a real product bug and changes nothing.',
    how: "Reads the failing run's own evidence (network, console, DOM, screenshots), classifies the failure, fixes the locator, the wait or the test data, and re-runs that single test. Two attempts, then it rolls its own changes back.",
    why: 'A red test is either a defect worth reporting or drift worth fixing, and guessing which costs more than finding out.',
    notes: [
      'Modifies Page Objects and re-runs one test. It never edits a test to make a real failure disappear - a product bug is reported as one.',
      'Runs \\\`${sc.testRunCmd}\\\` scoped to the failing test, not the whole suite.',
    ],
    produces: ['a fix in the affected Page Object, or a reported defect'],
    question: {
      text: 'Investigate the failing test now?',
      options: [
        { id: 'start', label: 'Investigate it', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'bulk-rescan': {
    command: '/bulk-rescan',
    what: 'Re-points every Page Object that a UI change broke, across the routes actually affected.',
    how: 'Runs the suite to find what is genuinely broken, tells you the exact routes before touching a single file, then rewrites those locators in parallel and re-verifies each one against the live application.',
    why: 'One design-system change breaks many tests for the same reason. Fixing them one at a time costs more and drifts further apart with every fix.',
    notes: [
      'It starts by running the whole suite to find out what is genuinely broken, so the first few minutes are your own tests executing against the app.',
      'That first step only reports. You see the exact blast radius - which routes, how many - and approve it before a single file is rewritten.',
      'Public method signatures are preserved, so your specs keep compiling.',
    ],
    produces: ['updated locators in the affected Page Objects'],
    question: {
      text: 'Find what the UI change broke?',
      options: [
        { id: 'start', label: 'Run the suite and show me the scope', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'map-site': {
    command: '/map-site',
    what: 'Crawls your application and produces artifacts/site-map/site-map.json: every page it reached, every control on it (kept per page under artifacts/site-map/inventory/), a screenshot of it, and the dialogs it raises - for you to review.',
    how: 'Signs in with your saved session, walks the app link by link inside limits you set before it starts, reads each page and looks at its own screenshot, and writes down what it finds as it goes.',
    why: 'Everything later is built on knowing which pages exist. No later stage can invent a page this one did not find.',
    notes: [
      'This is the long one: tens of minutes on a small app, hours on a large one, and it uses a real share of this session\\'s budget.',
      'It touches your live application. Before it starts you choose whether it may interact at all or only read - and if it may, it still never presses anything that commits (buy, delete, submit).',
      'It reports progress as it goes and picks up where it stopped if it is interrupted, so stopping costs you the current page and nothing more.',
    ],
    produces: ['artifacts/site-map/site-map.json', 'artifacts/site-map/inventory/'],
    question: {
      text: 'Start the crawl?',
      options: [
        { id: 'start', label: 'Start the crawl', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'map-features': {
    command: '/map-features',
    what: 'Produces artifacts/analysis/feature-map.json: what each page is for and how much it costs when it breaks, those pages grouped into features, the things your application works with (orders, users, invoices), what can happen to each of them, and how they connect.',
    how: 'Reads every mapped page once to work out what it is part of and how critical it is, groups them into features mechanically, cross-checks that against the traffic the crawl already observed and the forms on the pages themselves, then asks you what the application is and the two or three things no artifact can answer.',
    why: 'Tests are written against features and entities rather than pages, and a link between two entities becomes a precondition every test built on it inherits - so you confirm those links before anything is built on them.',
    notes: [
      'It visits every page again, so on a large map this is minutes rather than seconds - but read-only: it reads markup and existing artifacts and never clicks, fills or submits anything.',
      'Everything it drafts is a hypothesis marked as one until you approve it. A resource-shaped path is not proof of a domain entity.',
      'How critical each page is decides how much testing it gets later, so that column is the one worth reading closely.',
    ],
    produces: ['artifacts/analysis/feature-map.json'],
    question: {
      text: 'Build the feature map?',
      options: [
        { id: 'start', label: 'Build it', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'define-test-conditions': {
    command: '/define-test-conditions',
    what: 'Produces artifacts/analysis/test-conditions.json: what should be tested on each page - valid and invalid inputs, the boundaries around them, and the failure modes worth defending against.',
    how: "Reads each page's fields and the rules already declared in its markup, briefly toggles optional controls to reveal fields a static read would miss, and generates the mechanical conditions deterministically - reasoning only where the answer genuinely needs it.",
    why: 'This is the one stage where a real defect can be found before any code exists, and the one place your own knowledge - a business rule, a past incident - changes what gets tested.',
    notes: [
      'It toggles and fills fields to see what appears, and never presses a button: nothing is submitted, created or deleted.',
      'If your app saves on every keystroke, say so and it will stay with static markup only.',
    ],
    produces: ['artifacts/analysis/test-conditions.json'],
    question: {
      text: 'Define the test conditions?',
      options: [
        { id: 'start', label: 'Define them', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'design-test-cases': {
    command: '/design-test-cases',
    what: 'Produces artifacts/test-cases/test-cases.json: readable test cases - a title, preconditions, and numbered steps each with its own expected result.',
    how: 'Decides for every condition which interface should drive it (the UI, or the API when a real contract was observed) and how far the test should reach, then drafts one case per journey.',
    why: 'A case a person can read is what makes the next step - writing the code - something you can check rather than something you have to trust.',
    notes: [
      'Nothing runs against your application here, and nothing blocks: the draft is written and stays correctable at any point.',
    ],
    produces: ['artifacts/test-cases/test-cases.json'],
    question: {
      text: 'Draft the test cases?',
      options: [
        { id: 'start', label: 'Draft them', recommended: true },
        { id: 'stop', label: 'Not now' },
      ],
    },
  },

  'ground-zero-setup': {
    command: '/ground-zero-setup',
    what: 'Takes a brand-new project all the way to running, verified tests: it crawls your app, works out what it is made of, decides what to test, writes readable test cases, then writes and runs the actual test code.',
    how: 'It runs the existing stage commands in order and adds no analysis of its own, pausing after each one so you approve what it found before it goes further. It always resumes from wherever the project actually is, so stopping is free and re-running it never starts over.',
    why: 'Done by hand, this means remembering which command follows which and working out where you left off after every pause.',
    notes: [
      'It signs in to your application and crawls it live, under limits you set at the crawl stage.',
      'No test code is ever written without your explicit approval of the proposal - in guided mode and in auto-pilot alike.',
      'The stage list, how long this takes, and where the pauses are come next, from the pipeline itself.',
    ],
    produces: ['every artifact of the stages it runs, and the test files at the end'],
    // No question of its own: the very next thing this skill asks is the guided-versus-auto-pilot
    // choice, which is the same decision. Asking to continue and then immediately asking how to
    // continue is two questions for one decision.
    question: null,
  },
};

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

// Rendered as an aligned block rather than a paragraph: the three questions a person actually has
// (what will this do, how, and why should I let it) stay readable at a glance, and the things worth
// knowing before answering sit below them instead of being buried mid-sentence.
function renderBriefing(entry) {
  const lines = [
    'What happens:  ' + entry.what,
    'How:           ' + entry.how,
    'Why:           ' + entry.why,
  ];
  if (entry.notes && entry.notes.length > 0) {
    lines.push('');
    lines.push('Before you decide:');
    for (const note of entry.notes) lines.push('  - ' + note);
  }
  return lines.join('\\n');
}

function main() {
  const rest = process.argv.slice(2);
  const args = parseArgs(rest);

  if (rest[0] === 'list') {
    process.stdout.write(
      JSON.stringify({ action: 'list', skills: Object.keys(BRIEFINGS) }, null, 2) + '\\n',
    );
    return;
  }

  const skill = typeof args.skill === 'string' ? args.skill.replace(/^\\//, '') : '';
  const entry = BRIEFINGS[skill];
  if (!entry) {
    process.stdout.write(
      JSON.stringify(
        {
          action: 'briefing',
          ok: false,
          error:
            'unknown skill: ' + (skill || '(none given)') + '. Known: ' + Object.keys(BRIEFINGS).join(', '),
        },
        null,
        2,
      ) + '\\n',
    );
    process.exit(1);
  }

  const context = args.context === 'chain' ? 'chain' : 'direct';
  const askConfirmation = context === 'direct' && entry.question !== null;

  process.stdout.write(
    JSON.stringify(
      {
        action: 'briefing',
        skill: skill,
        command: entry.command,
        context: context,
        briefing: renderBriefing(entry),
        produces: entry.produces,
        askConfirmation: askConfirmation,
        question: askConfirmation ? entry.question : null,
        skipReason: askConfirmation
          ? null
          : context === 'chain'
            ? 'the chain gate already carries this decision - print the briefing and continue'
            : "this skill's own next question is the same decision - print the briefing and ask that instead",
      },
      null,
      2,
    ) + '\\n',
  );
}

main();
`;
}
