# 0023: Test conditions are evaluated against synthetic applications whose defects are known

## Status

Accepted

## Decision

`/define-test-conditions` is measured by a suite of generated datasets. Each dataset is a small web
application whose every field, limit, rule and defect is known, plus the artifacts the earlier stages
would have left. The suite runs in two halves: one free and deterministic, one paid.

- **The datasets.** An input-space model of 18 factors - kind of page, where its limits are stated,
  where it shows its result, which defect is seeded into it, whether a rule of the domain is left
  unstated, how well the fields are labelled, language, size, repeated controls, site frame, API
  calls, research, a person's notes, production or sandbox, pages per feature, contact fields,
  fields revealed by a toggle, an unstated limit worth asking about. A mixed-strength covering array
  holds every feasible three-way combination of the six factors that decide what a page is, and every
  two-way combination of all eighteen: 181 datasets. Ten more reproduce failures seen on live runs.
  A fifth of them are held out and never read while the skill is tuned.
- **The gold.** Each page is written together with its answer key - the meaning and validity of every
  field, the limits and where each is stated, the rules the markup does not state, the main flow with
  the value it should produce, and the defect seeded into the page's own script. Keys are the page's
  `data-testid`s, which carry no meaning, so nothing in the key can leak into what the assistant
  reads.
- **The free half.** A reference analysis is built from the gold for every dataset and run through
  the stage's own scripts: both gates, the generator, the assistant's check, the review, then
  `/design-test-cases`. Nineteen mutations of that reference model the ways an analysis goes wrong -
  template conditions, no main flow, a boundary on a limit nothing states, research recorded and
  never used, an export control excused as a result box, today's wrong result written down as the
  expected one. Each says where it should be caught. Two numbers come out: how often a gate refuses a
  right analysis (it must never), and how much of each way of going wrong the gates and graders
  catch.
- **The paid half.** The real skill runs in a real assistant (Antigravity CLI, Claude Code) on a copy
  of the dataset it has never seen, unattended, and what it leaves in `test-conditions.json` is
  scored by the same graders. Trials are repeated so both pass@1 and pass^k are reported.
- **The graders.** Code wherever a fact decides it: the main flow exists, names where the result
  appears and states the value the page should produce; every stated limit has a boundary and no
  boundary stands on a limit nothing states; nothing valid is called invalid; the rule the markup
  does not state is tested; the seeded defect is targeted and today's wrong behaviour is not written
  down as expected; a question is asked where nothing states a limit; sample values are test data;
  every field is accounted for; research checks are used or declined. A model judges only what code
  cannot: whether a condition would actually fail on the seeded defect. It is a different model
  family from the assistant under evaluation, every judgement is recorded with what it was shown, and
  a person labels a sample to measure the judge's agreement.
- **Isolation.** Every trial gets its own copy of the project, its own run of the application on its
  own port, and the answer key is withheld from the copy. Before a batch runs, the assistant has to
  show which folder it is working in; while it runs, a guard watches everything outside the copy and
  stops the batch at the first file that changes. This was written after a first run attached to the
  repository's own workspace and modified a project there.

## Context

The stage is where the tests of everything downstream come from: a condition nobody would notice is
missing becomes a test case nobody writes. Its quality had been judged by reading one live run at a
time, which is slow, biased towards what the reader already suspects, and impossible to compare
between versions. The existing eval for the stage only checked that the skill's own text mentioned
certain words.

Evaluating an agent is not evaluating a prompt: the result is a file it produced after many turns of
tool use, so the score has to come from the artifact and the environment state, not from the
transcript. Grading has to be objective enough that two people reading the same artifact and the same
answer key reach the same verdict, which is what the synthetic applications buy: nothing about them
is unknown.

## Alternatives Considered

- **Score real applications.** Most faithful. Rejected as the base: nobody knows the full truth about
  a real site, so every grader would rest on a reading of it, and the answer key would drift with the
  site. Real failures enter the suite as dataset factors instead.
- **A model grades the analysis against a rubric.** Cheap to build. Rejected as the main grader: an
  LLM judge inherits the weaknesses of the model it judges, needs calibration to be trusted at all,
  and gives a number nobody can check. It is kept for the one judgement code cannot make.
- **Many random datasets.** Easy to scale. Rejected: coverage of an input space is what makes a suite
  representative, not volume. A covering array says exactly which combinations are covered and which
  are not.
- **Run the whole pipeline per dataset, from the crawl.** Closer to a real run. Rejected: it measures
  four stages at once, so a bad score says nothing about which one is weak. The upstream artifacts are
  built deterministically instead, and the same ones go to every trial.
- **Mutation testing of the generated test cases.** The standard way to value a test suite. Rejected
  for this stage: there is no code to mutate yet. The equivalent here is the defect seeded into the
  page, which the conditions either target or miss.

## Consequences

- The datasets are written by the same people who write the rules, so they can share a blind spot.
  Ten of them reproduce failures found in live runs, and every new live failure is meant to become a
  factor level or a dataset rather than a one-off fix.
- The free half is a regression net for the deterministic scripts and runs in minutes; the paid half
  costs a real run per dataset per trial and is only started deliberately.
- A grader that fails the reference analysis is a broken grader until shown otherwise - the suite
  asserts that first, so its own mistakes surface before any verdict about an assistant.
- The suite measures one stage. A weak site map or feature map upstream would change what the stage
  can do, and this says nothing about either.
