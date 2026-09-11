# AI Agent Integration

Part of [EITR Architecture](README.md). Covers what a generated project ships for AI assistants to
operate on it after `eitr new` exits - see the README's Introduction for why this exists at all.

## The 4-layer structure

Every generated test repository is structured with four dedicated AI layers:

```
Generated Test Repository
├── 1. Actors Layer (.agents/agents/, .claude/agents/, .cursor/skills/, .devin/rules/, .codex/agents/, .github/agents/)
│   ├── sdet-orchestrator     -- Single facade & DAG task router
│   ├── tms-validator         -- TMS requirements quality gate, atomicity check & GIGO guard
│   ├── sdet-architect        -- Architecture governance, DI fixtures & CPOM validation
│   ├── pom-engineer          -- DOM inspection, Page Object generation & live-DOM liveness checking
│   ├── test-data-engineer    -- Structured/bulk datasets & minimal-valid file fixtures on request
│   └── assertion-auditor     -- Web-first anti-fake-green guard & mutation verification
│
├── 2. Workflows Layer (.agents/skills/, .claude/skills/, .cursor/skills/, .codex/skills/, .github/)
│   ├── /auth-setup           -- Session capture (auth.json) and state re-use with SSO fallback
│   ├── /scan-and-generate-pom-- Live DOM exploration + live-DOM Page Object verification
│   ├── /automate-test        -- End-to-end flow: TMS ticket OR a locally-drafted journey ->
│   │                             DLP -> Intent -> AST Code -> Green run
│   ├── /heal-test            -- 4-Point trace inspection + Two-Strike autonomous fix loop
│   ├── /bulk-rescan          -- Batch locator update on Page Objects, re-verified against the live DOM
│   ├── /ground-zero-setup    -- Guided orchestrator: chains /map-site + /define-test-conditions +
│   │                             /design-test-cases + /automate-test end-to-end, one command from
│   │                             nothing to verified working tests, with a human sign-off gate per
│   │                             stage (or auto-pilot for local review; code synthesis always gated)
│   ├── /map-site             -- Route graph crawler, site topology, per-page control inventory,
│   │                             shared widgets & overlay recording (ADR 0012 Stage 1 crawl half)
│   ├── /define-test-conditions -- Read-only form-parameter extraction + deterministic 2-way
│   │                             combinatorial/boundary-value condition generation (ADR 0012 Stage 2)
│   └── /design-test-cases    -- Deterministic test-level classification + drafted test case per
│                                 journey (ADR 0012 Stage 3/4)
│
├── 3. Model Context Protocol (MCP) Layer (.mcp.json, .cursor/mcp.json, .claude/mcp.json, etc.)
│   ├── Playwright MCP        -- Live DOM querying, selector evaluation, visual feedback
│   └── TMS Bridge MCP        -- TestRail / Zephyr / Jira Xray / ADO test case extraction (.mcp/tms-bridge/)
│
└── 4. Lifecycle Guards, Hooks & Rules Layer
    ├── Root Context          -- AGENTS.md, CLAUDE.md, copilot-instructions.md
    ├── Path/Glob-Scoped Rules-- .cursor/rules/*.mdc, .devin/rules/*.md, .github/instructions/*.instructions.md
    └── CPOM Contract         -- CONVENTIONS.md (Method Safety Contract & locator hierarchy)
```

`/map-site` and `/bulk-rescan` are AI-driven skills specifically because they need a live
browser/DOM to do real work - see
[`decisions/0007-remove-fake-map-rescan-cli-commands.md`](decisions/0007-remove-fake-map-rescan-cli-commands.md)
for why these are not, and cannot correctly be, plain CLI commands.

## Native per-assistant rule generation

EITR generates native rule/skill formats for each selected AI assistant during scaffolding, rather
than one shared format every assistant has to interpret:

- **Cursor:** `.cursor/skills/*/SKILL.md` (agents auto-invocable; operational skills carry
  `disable-model-invocation: true` to keep them explicit-only, per Cursor's own agent-vs-skill
  distinction), `AGENTS.md` (read natively - confirmed 2026), and `.cursor/rules/*.mdc`
  (`description`/`globs`/`alwaysApply` frontmatter - the .mdc extension is mandatory, a plain `.md`
  file here is silently ignored)
- **Devin Desktop** (Windsurf's 2026 rebrand): skills at the same shared `.agents/skills/*/SKILL.md`
  path as Antigravity (confirmed in Devin's own skills documentation), `AGENTS.md` (read natively at
  project root), agent personas at `.devin/rules/agent-*.md` and task rules at `.devin/rules/*.md`
  (`trigger`/`globs`/`description` frontmatter - `.windsurfrules` and `.windsurf/rules/` still work
  as legacy fallbacks but are no longer generated), and project-scoped MCP via
  `.devin/mcp_config.json` (the old Windsurf/Cascade had no project-scoped MCP mechanism at all)
- **Claude Code:** `CLAUDE.md` (imports `CONVENTIONS.md` via Claude Code's own `@path` syntax
  instead of duplicating its CPOM contract) and `.claude/skills/*/SKILL.md`
- **GitHub Copilot:** `.github/copilot-instructions.md` (repo-wide overview) plus path-scoped
  `.github/instructions/*.instructions.md` (`applyTo` frontmatter) for task-specific rules
- **Antigravity:** `.agents/agents/*/agent.md` and `.agents/skills/*/SKILL.md` (folder per skill,
  live-verified 2026-09-03 against the installed Antigravity CLI's own bundled documentation - a
  flat `.agents/skills/<name>.md` file is silently never discovered at all) and `AGENTS.md`
- **OpenAI Codex:** `.codex/skills/*/SKILL.md` and `AGENTS.md` (its own native root convention)
- **Aider:** `.aider.conf.yml`, `CONVENTIONS.md`, and `AGENTS.md`

`AGENTS.md` itself carries only the 7 task-workflow rule blocks shared across every assistant that
reads it - it deliberately excludes the Locator Priority Hierarchy, which lives solely in
`CONVENTIONS.md` (a one-line pointer sends the reader there instead of duplicating it verbatim in
every always-loaded root file).

## Anti-fake-green assertion engine

A generated test has no single, self-evident correct answer to compare against - the same oracle
problem any test author faces when there's no ground truth to check output against directly. EITR's
answer is a pseudo-oracle: cross-checking the UI against the backend response that produced it,
rather than trusting either signal alone. Concretely, to prevent automated tests from passing without
verifying actual business logic:

- **Expected-results mapping:** every TMS test case's Expected Result becomes a strict, auto-retrying
  web assertion (`toHaveText()`/`toBeVisible()`/`toBeEnabled()`), not a loose truthy check.
- **Unawaited-promise guard:** rejects `expect(locator.isVisible()).toBeTruthy()`-shaped assertions,
  which evaluate the (always-truthy) Promise object rather than its resolved value.
- **No non-retrying boolean checks:** a snapshot state reader (`...Now()`) wrapped in a boolean
  assertion is rejected - it should be a real web-first assertion instead.
- **Dual-layer validation:** UI DOM changes are checked alongside the backend network response that
  caused them (`Promise.all([page.waitForResponse(...), action()])` or an `apiClient` check).
- **Mutation analysis:** a test must deterministically fail if the backend returns HTTP 4xx/5xx or
  the UI component fails to render - not just pass by never actually looking.

## Route intent analysis (`/map-features`, ADR 0012 Stage 1)

A strictly read-only pass over every active route infers what each page is part of (a feature label)
and how much it costs when it breaks (a criticality tier), writing both into
`artifacts/analysis/feature-map.json` beside the features they roll up into
(`.scaffold/schemas/feature-map.types.ts` documents its shape - `schemaVersion: 2`,
`Field<T>`-wrapped values, keyed by `routeId`). This used to be a `/map-site` step writing a separate
`business-intent.json`; it moved because a per-page label of what a page is for is the transpose of
grouping pages into features, so the two were one judgement kept in two files with two review
gateways and one axis at two granularities that could disagree. It never performs a mutating
Playwright call of any kind, not even a `trial: true` dry-run - inference draws only from
already-rendered page title, heading text, form field labels, button/link text, and ARIA roles
reached by a single navigation per route. A zero-dependency validator
(`scripts/validate-feature-map.mjs`) mechanically checks the artifact's shape before a Human
Sign-Off Gateway presents results for review; no other skill or agent treats an entry with
`reviewed: false` as ground truth. Every review gateway in the pipeline renders through one shared
script (`scripts/render-review-artifact.mjs`) rather than each skill re-specifying a block format in
prose: it builds the artifact from the stored JSON, so the text a human approves cannot drift from
what was actually written, and it decides by entry count whether the artifact belongs inline or in
`artifacts/review/<kind>-review.md` - a large run previously scrolled past the top of the terminal
and got abbreviated by the model, which asks a human to approve entries they never saw. For the
site map, feature map and test conditions the file is always written and never deleted: a person
may tick, answer and correct right in it, and `scripts/apply-review.mjs` reads the edits back
against the exact rendering they were made on (ADR 0015). The three files work the same way - a box
to approve, deleting an entry to take it out, a `Notes:` line under every entry (after `//` on a
condition) kept in `app-profile.json` with the entry it is about (ADR 0020), "Your notes" for
everything else - and a route or page
deleted there is left out of every later stage, recorded in `app-profile.json` so a new crawl
refuses it, and its test conditions and test cases go with it; a file with edits nobody read back is
never redrawn (ADR 0017). Before the site-map and feature-map
gates, `scripts/corroboration.mjs` checks what the stage concluded against the independent records
about each page - status, markup, screenshot, traffic, per-role access - and journals every
disagreement and how it was settled (ADR 0016). When more
than one role session exists, `/map-site` can also crawl once per role, recording `crawledAsRoles`
and a per-route `access` map in the site map; the resulting access differences are the only
observed evidence of a permission boundary anywhere in the pipeline, and `/define-test-conditions`
draws its `permission_denied` conditions from them rather than from a role's name. `confidence` is computed from evidence-signal strength (a
heading/ARIA/manual signal implies `high`, form-labels/button-link-text implies `medium`,
route-path alone implies `low`) and mechanically checked against that rule, never chosen freely -
it stays an internal signal, never shown in the review artifact itself. Criticality follows a written, evidence-anchored checklist rather than
free inference, is labeled "draft" in the review artifact (it drives real downstream automation -
`/define-test-conditions`'s checklist volume - once approved, so it earns its own reminder beyond
the block-level notice), and every `Field<T>` carries a `reasoning` string that reads as a plain
explanation for a human (what was found, why it matters for this kind of application), never a
trace of which internal rule fired. Evidence is deduplicated once per route rather than repeated
under both fields. After every route is drafted, an app-level (not per-route) `corePurpose` is
synthesized - one plausible one-sentence description of what the application is actually for per
genuinely distinct interpretation the evidence supports (exactly one when only one reading holds
up, up to 4 when the evidence is actually ambiguous - never reworded restatements of the same
reading padding the count), each grounded in evidence gathered across the whole crawl, with the
model's best guess marked. The human
picks one or describes the purpose in their own words in a short exchange before the main Review
Artifact; a route whose functionality directly delivers the confirmed purpose gets raised to `high`
if the generic checklist alone would have placed it lower (never automatically to `critical`, which
stays reserved for its own payment/auth/destructive-action criteria). The Review Artifact recaps the
confirmed purpose, numbers each route for easy reference, and offers a bulk-correction shorthand
(`high: 1, 4, 5-8; critical: 2-3`) alongside free-form correction. Approval also records who gave it - `reviewedBy: 'human'` for a
real conversational approval, or `'auto-pilot'` only when `/ground-zero-setup`'s auto-pilot mode set
it on the user's own explicit pre-authorization - so a later audit can always tell which entries a
human actually looked at. `artifacts/site-map/site-map.json` itself gets the same mechanical
gate one level down (`scripts/validate-site-map.mjs`, run immediately after every `create`/`update`
pass, before shared-widget mining, the swarm dispatcher, or this step read it) - the shape defect
this catches (a malformed route entry, a duplicate `routeId`) is cheaper and more reliably caught by
code than by asking a model to notice it, the same reasoning ADR 0012 applies at every stage
boundary. Immediately after that gate, an optional, never-blocking Coverage Cross-Check
(`scripts/check-sitemap-coverage.mjs`) looks for the target site's own `sitemap.xml` (via
`robots.txt`'s `Sitemap:` directive or the conventional default path) and flags any route it lists
that the crawl didn't reach - most sites publish no sitemap.xml at all, so a `SKIPPED` result is the
normal outcome, not an error.

What is on each page is collected by a script rather than read off by the crawling model:
`scripts/page-inventory.mjs` hands the crawl browser-side source for `page.evaluate` (`probe`), then
stores every landmark and every control - role, accessible name, type, HTML5 constraints, options,
and whether it sends a result elsewhere - in `artifacts/site-map/inventory/<routeId>.json` and
answers with the route entry's `regions`, `components` and `contentHash` (`record`). The hash covers
structure only (title with digits normalized, regions, each control's region, role and type), so a
pagination chain still repeats it and the crawl budget still stops the chain; names go into
per-region fingerprints instead, which `shared` compares across routes to name the header,
navigation, footer and sidebar regions that recur as shared widgets.

The probe walks open shadow roots and same-origin frames as well as the document, and lists what it
cannot read into (cross-origin frames, drawing surfaces) instead of leaving it silently out. A page
that marks up no header or footer is split into its top-level blocks; `shared` recognises a block
that recurs, with at least 80% of its labelled controls in common, on a large share of the routes
as the site frame by that repetition alone, and matches marked-up regions the same way, so a
header carrying breadcrumbs is still one header. `record` also says whether the page is the application at all (`access`: a bot
check, a refusal status on a near-empty page, or one identical page served at two addresses), and
`scripts/crawl-budget.mjs` stops the pass on it rather than mapping the refusal. What deterministic
code cannot place in every language and markup - elements that react to the pointer but are marked
up as no control, labels outside the English output words, overlay buttons in the visitor's
language - goes to the crawling assistant as a numbered question (`classify`, and the overlay
ledger's `label`); the script checks every answer against the list it asked, takes control names
from the page rather than the answer, remembers each decision for the rest of the crawl, and counts
them in the run summary. See
[`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md)
for the design decision this implements and what remains out of scope for this first stage
(transport choice, cross-route journey synthesis).

## Test analysis (`/define-test-conditions`, ADR 0012 Stage 2)

Stage 2 and Stage 3 below take their names (test analysis defines test conditions, test design
designs test cases from them) from the ISTQB Foundation Level syllabus's fundamental test process.

The stage works feature by feature, riskiest first, and starts every feature from an analysis
rather than from its fields (ADR 0014). The analysis records what the feature does and how it
serves the application's confirmed purpose, what each field means and should obey, where each
constraint comes from and what the page enforces today, the feature's dependencies, and the
questions only a person can settle. `scripts/test-analysis-plan.mjs` decides the test basis and
computes the step each feature is at: a crawled application, or one with requirements, tickets or
code as evidence. `scripts/field-probe.mjs` types values into fields to see what they accept,
within the crawl boundary and never submitting on production. `scripts/test-research.mjs` keeps
research per kind of feature: at least five sources from four sites, and no query naming the
application.

Every condition carries its feature, its layer (field, rule, behaviour, frame), the source of its
expected result - which separates checks of correctness from regression checks - its anchors
(checked to exist, one matching that source), and a likelihood. The generator ranks all of them as
likelihood times the feature's impact, and removes nothing. What follows describes the mechanical
half of the stage.

A second, explicit-request-only, strictly read-only skill consumes the feature map's
`reviewed: true` routes plus `site-map.json` and derives typed test conditions per route into
`artifacts/analysis/test-conditions.json` (`.scaffold/schemas/test-conditions.types.ts` documents its
shape). An LLM step infers form parameters and their equivalence partitions primarily from markup
(tag, `type`, label text, HTML5 constraint attributes, `<select>` option text, static ARIA
relationships) - never a field's pre-existing `value`/`checked`/`selected` state. One narrow,
bounded exception exists for progressive-disclosure forms: `.check()`/`.uncheck()`,
`.selectOption()`, and `.fill()` with synthesized (never real) values are allowed specifically to
observe fields a purely static read would never see, one control probed and reset at a time, never
reaching a submit-shaped button under any circumstance. A deterministic, zero-dependency generator
(`scripts/generate-test-conditions.mjs`) then
mechanically expands those partitions into 2-way combinatorial coverage and 3-value
boundary-value conditions: it seeds one candidate vector per still-uncovered parameter pair and
greedily fills every other column around it, backtracking within that fill - a pair only lands in
`unsatisfiedPairs` (with the exact constraint that blocks it) when completing a vector around it
is genuinely impossible, never merely because an earlier, unrelated greedy attempt stalled.
Every condition carries who reviews it (ADR 0021): a person, for what the analysis wrote and what
rests on a rule stated in words or an entity's lifecycle; the assistant, for what the markup, the
malformed-input checklist or the generator's combinations settle - kept or cut with a reason through
`scripts/assistant-check.mjs` before the review, summed up as one line per page with the person's veto.
Only valid values are paired. Each invalid value is tested once, beside the first valid value of
every other parameter, and two never share a vector (ADR 0019): the application rejects the input
on that one value, so pairing it with every value of the others only adds tests that fail the same
way, and a rejection that depends on another field is a decision rule the analysis writes.
Extraction starts from the route's page inventory rather than a fresh reading of the page: every
field the crawl recorded outside the site frame must end up a parameter (citing the field's
inventory id) or an exclusion with a reason from a closed list, and the gate checks the rest of the
extraction against the same record - offered options, HTML5 attributes, field types. For a page
that turns input into output, the agent also writes `property` and `metamorphic` conditions from
closed relation lists (count, uniqueness, format, pair coverage, round-trip, idempotence and so on),
since such a page has no example answer to state in advance; every copy, export or download
control needs one of them, or a stated exclusion; and the site frame's own fields are tested once,
on the route the file names in `frameRouteId`.
The same mechanical shape gate pattern applies (`scripts/validate-test-conditions.mjs`), plus a
deterministic redaction backstop - independent of what the LLM step already did - masking
digit-run and majority-digit PII shapes in every evidence excerpt, sample value and option label
before the artifact is ever written. Sample values are test data, so the backstop keeps what can
never be anyone's (ADR 0018): phone numbers reserved for fiction, published test cards, and a
plain number or date in a field the analysis says holds a quantity, an amount or a date. A limit
the markup declares (`min`, `max`, `step`, the lengths) is recorded as written. The gate also
refuses a parameter filled in from a template instead of read from its field: a name or a meaning
built from the control id, a kind that does not match the field, free text on a control that only
offers values, and an outcome true of every field. It also holds the extraction to what the page states:
an invalid partition and a boundary each quote the rule they rest on (a placeholder is refused as
one), a select or radio records its offered options so none of them can be marked invalid, and an
invalid value such a control cannot produce carries an `executionLevel` (`dom` or `api`) that
`compose-journeys.mjs` routes by. Every partition records an `expectedOutcome` for its first
sample value and every boundary an `acceptedOutcome` and a `rejectedOutcome` for its probes - a
boundary probe never borrows the partition's, which was written for a different value - and every
generated condition carries a `description` (the vector's values followed by that outcome, e.g.
`With count="5": exactly 5 GUIDs are listed in the result (positive)`), the `expectedOutcome` on
its own, and a `scenario` (`positive`/`negative`) - all synthesized deterministically, and all
rejected by the gate when they fall back on a stock phrase such as "correctly handles". That is
what a human reviews at sign-off, never a bare parameter/technique/count summary, and what
`/design-test-cases` carries into each step's expected result. The full gate also checks coverage
(ADR 0022). Every page that takes input has a condition the analysis wrote saying what the input
produces, naming the result box or copy/export control it reads it from. Every markup limit has a
boundary. Every research check is cited by a condition (`{ kind: 'research', ref: 'k2' }`) or listed in
`research.declined` with a reason. Every field rule the markup does not state is cited by what tests
it (`{ kind: 'constraint', ref: 'r1' }`) or carries an `untestedReason`. A feature with no condition
says why. A condition the analysis wrote is refused when its text holds nothing beyond the page's
title, address and feature name. The review opens each feature with a coverage line and a "Not
tested, and why" line. Every generated condition starts `isSpeculative: true`/`reviewed: false`
with an empty verification contract; a human fills in expected UI/state/network behavior at the
same kind of Human Sign-Off Gateway Stage 1 already established, recording `reviewedBy` the same
way (`'human'` or `'auto-pilot'`) once approved. See
[`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md)
for what remains out of scope for this stage (domain classification, journey/test-level placement,
spec synthesis, combinatorial strength beyond 2-way, general boolean-predicate constraints).

## Test design (`/design-test-cases`, ADR 0012 Stage 3)

Bridges `test-conditions.json`'s reviewed conditions to a drafted, TMS-shaped test case, keyed by
`artifacts/test-cases/test-cases.json` (`.scaffold/schemas/test-cases.types.ts` documents its shape).
`scripts/compose-journeys.mjs` deterministically decides how every condition is driven (UI or API,
targeted or end to end) and groups them into journeys: one walk across each reviewed feature's own
routes for its happy path, and targeted journeys per route and interface for everything else - zero
model involvement. A route's criticality never gates this; only a feature's impact does, and only
once a person has approved the feature. An LLM step then drafts each journey's `testCase` (title, preconditions,
ordered steps): every step is one atomic action with its own concrete expected result, never a
step bundling several actions behind one blanket result - drawn directly from each condition's own
`description`/`scenario` rather than invented prose, since `/automate-test` wraps each drafted
step in its own `test.step()` block and needs something concrete to assert on. Any literal on-screen
name a step references - a button/link label, a page name, a checkbox/radio/dropdown option, a
toast message - is wrapped in square brackets from a fixed small verb vocabulary (`Click the [X]
button`, `Navigate to the [X] page`, `Select the [X] dropdown > [Y] option`, ...), so `/automate-test`
can ground its locators' accessible names directly in that bracketed text instead of re-guessing or
paraphrasing them. Unlike every earlier
stage in this pipeline, this one does not pause for a blocking Human Sign-Off Gateway - every
drafted `testCase` is still presented as its own labeled block (title, preconditions, numbered
steps) immediately, alongside the current pipeline roadmap and, when a TMS/task-tracker is
configured, a short optional question about recording these test cases there too; the draft is
simply never gated on approval before the skill finishes, reviewable at any later point rather than
blocking the pipeline on it.

## Guided greenfield orchestration (`/ground-zero-setup`)

A thin orchestrator over all four stages for a brand-new application, adding no analysis or
code-synthesis logic of its own. `pipeline-status.mjs` also computes a fixed roadmap string (all
four stages plus their review points, current position bracketed) that this skill and every stage it
sequences print at each human-facing stop, plus a script-authored `preFlightNotice` (roadmap + cost
warning + human-gates disclosure, printed verbatim rather than composed fresh by the model each run),
per-stage `stageTimings` (derived from each artifact's own timestamp, not a guess), and
`routeCoverage` (routes mapped/reviewed/automated, and any flagged as likely crawler artifacts). It
sequences `/map-site create`, `/map-features`, `/define-test-conditions`, `/design-test-cases`,
and `/automate-test` in order, pausing at each stage's own Human Sign-Off
Gateway by default (Guided mode) - except `/design-test-cases`, which has no blocking gate of its
own and is simply run and moved past - or writing `reviewedBy: 'auto-pilot'` straight through on the
user's own explicit pre-authorization for local artifact review (Auto-pilot mode). Guided mode merges
what used to be two separate exchanges (approve-this-stage, then what-next) into one combined
question. What runs next is never hardcoded in the orchestrator's own prose - both it and the
underlying skills' own end-of-run hints consult one deterministic script, `scripts/pipeline-status.mjs`,
which recomputes the pipeline's current stage from real artifact state on disk (site map existence,
a reviewed feature map, reviewed test conditions, drafted/automated journeys) every time it
runs, never from a cached belief. This keeps the single-source-of-truth property intact as later
stages get added - extending the script's stage list is the only change a new stage needs, not a
rewrite of the orchestrator's own sequencing. `/automate-test` is an in-chain stage like the three
before it, not a separate command the user must remember to run afterward - but the one point where
code actually gets synthesized and executed still needs its own human decision: `/automate-test`'s
own Step 4 Human Sign-Off Gateway remains a hard blocking stop in every mode, including auto-pilot,
never bypassed by this orchestrator's own local-review pre-authorization. The Final Report - files
changed, gate results, review counts by `reviewedBy`, stage timings, route coverage, and the current
pipeline stage - now prints once, at the true end of the run (`complete`), instead of prematurely at
`test-cases-drafted`.

## Self-healing (Two-Strike Rule & 4-point trace triage)

When a generated test fails during live execution:

1. **Fail-fast real-bug detection** - inspect the network waterfall for HTTP 4xx/5xx and console
   logs for unhandled exceptions before touching any Page Object. A genuine server/application
   crash is reported as a real application bug, not "healed."
2. **4-point trace triage** - `trace.zip`, console logs, network waterfalls, and visual snapshots
   diagnose timing vs. selector drift vs. a race condition.
3. **Two-Strike Rule**, running only the specific failing test file:
   - Attempt 1: adjust the locator per the 3-tier priority (`getByTestId → getByRole → getByLabel`).
   - Attempt 2: fix timing/synchronization (a web-first assertion or network waiter).
   - On a second consecutive failure: roll back (`git checkout -- <files>`) and report a structured
     taxonomy (`[FLAKY/TIMING]`, `[SELECTOR DRIFT]`, `[PRODUCT BUG]`) instead of trying a third time.

## Test data management & teardown

- `ApiClient` provides `createUniqueId()`/`createTestEmail()` for collision-free data isolation, no
  external dependency required.
- Tests register cleanup via `apiClient.registerTeardown(async () => { ... })`; tasks run LIFO
  inside `try/catch`.
- The `apiClient` fixture in `fixtures/index.ts` runs `await client.cleanup()` after every test,
  including on failure/timeout.
- Hardcoded production dependencies and shared mutable data are forbidden.

## TMS ingestion quality gate (GIGO protection)

Before generating a test from a TMS ticket, `tms-validator` checks:

- **Scenario atomicity** (step limit <= 10) - one business outcome per ticket, not an overloaded
  monolithic test plan.
- **Verifiable expected results** - every step needs an explicit, measurable outcome.
- **TDM completeness** - required test data, credentials, and preconditions are present.

A quality score below 80% rejects the ticket upfront with a structured scorecard for the author,
rather than generating a flaky test from an underspecified one.

## Deterministic generation & human sign-off

- **Component registry indexing:** Page Objects and shared widgets are indexed from
  `artifacts/site-map/site-map.json` and `components/` to match scenario steps to existing CPOM classes
  instead of regenerating duplicates.
- **Human sign-off gateway** (`/automate-test`): before writing test files, the agent presents a
  structured proposal (summary, steps, preconditions, Page Objects used, TDM strategy) for explicit
  review - zero code is written until approved.
- **Strict AST linearity:** synthesized tests ban `if`/`else`, loops, and `try/catch` wrapping
  assertions - every branch a test could take must be its own test.
- Every step is wrapped in `await test.step('Step N: ...', ...)`; fixtures supply dependencies, no
  raw `new PageObject(page)` in test files.
- **Content fidelity:** a step's body must perform the literal action its `description` names and
  assert the literal value its `expectedResult` names - never a structurally-correct assertion on
  an unrelated element standing in for the real one. A bracketed literal name in the drafted step
  (`Click the [Place Order] button`) grounds the synthesized locator's accessible name verbatim.
- **Multi-source corroboration:** for a state-changing step, UI-visible-change + API-response
  validation (matched against the submitted values) is the floor, not the ceiling - a success toast,
  a related list/detail endpoint, or an unambiguous page-state transition gets asserted too whenever
  the app genuinely surfaces it, so a bug has more than one signal to slip past.

## Enterprise security & resilience

- **Local caching & circuit breaker** (`.mcp/tms-bridge/`): TMS test cases are cached in
  `.tms-cache/<safeId>.json` with path-traversal protection, enabling offline execution and
  API-rate-limit resilience.
- **DLP:** pre-prompt filtering masks PII (emails, phone numbers, customer data) before anything is
  sent to an LLM API.
- **Session protection:** `auth.json`/`.auth/user.json` are stored locally with secure permissions
  and are permanently excluded from version control.
- **Corporate infrastructure:** native support for `HTTP_PROXY`/`HTTPS_PROXY`, custom CA certs
  (`NODE_EXTRA_CA_CERTS`), and internal artifact repositories (`PLAYWRIGHT_DOWNLOAD_HOST`).

## Protocol 123 (`/123`)

An explicitly user-triggered, 9-phase engineering lifecycle for complex or high-risk changes -
never runs by default. Phase 0 baseline, Phase 1 recon/web-search, Phase 2 spec formulation
(`sdet-architect`), Phase 3 multi-agent plan review + Review Arbiter verdict, Phase 4 human intent
lock (zero code until approved), Phase 5 TDD dual synthesis (shared primitives first, then linear
test synthesis), Phase 6 code-review swarm + Arbiter authorization, Phase 7 Two-Strike self-healing,
Phase 8 quality gate + handoff report. The Review Arbiter cross-references review comments against
ground truth (`CONVENTIONS.md`, `AGENTS.md`, the live DOM) and classifies each as
`ACCEPTED [CRITICAL/MAJOR]`, `DISMISSED: FALSE_POSITIVE`, `DISMISSED: HALLUCINATED_RULE`, or
`DISMISSED: OUT_OF_SCOPE`. The full phase-by-phase protocol lives in
`.claude/skills/protocol-123/SKILL.md` (and its `.agents/` mirror), not duplicated here.
