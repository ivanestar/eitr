# AI Agent Integration

Part of [EITR Architecture](README.md). Covers what a generated project ships for AI assistants to
operate on it after `eitr new` exits - see the README's Introduction for why this exists at all.

## The 4-layer structure

Every generated test repository is structured with four dedicated AI layers:

```
Generated Test Repository
├── 1. Actors Layer (.agents/agents/, .claude/agents/, .cursor/skills/, .windsurf/rules/, .codex/agents/, .github/agents/)
│   ├── sdet-orchestrator     -- Single facade & DAG task router
│   ├── tms-validator         -- TMS requirements quality gate, atomicity check & GIGO guard
│   ├── sdet-architect        -- Architecture governance, DI fixtures & CPOM validation
│   ├── pom-engineer          -- DOM inspection, Page Object generation & live-DOM liveness checking
│   ├── test-automator        -- Linear test synthesis from TMS, dynamic TDM & fast-path API
│   ├── assertion-auditor     -- Web-first anti-fake-green guard & mutation verification
│   ├── trace-debugger        -- Playwright trace analysis & Two-Strike self-healing
│   └── review-arbiter        -- Independent Review Arbiter, adjudicates multi-agent findings (Protocol 123)
│
├── 2. Workflows Layer (.agents/skills/, .claude/skills/, .cursor/skills/, .windsurf/workflows/, .codex/skills/, .github/)
│   ├── /auth-setup           -- Session capture (auth.json) and state re-use with SSO fallback
│   ├── /scan-and-generate-pom-- Live DOM exploration + live-DOM Page Object verification
│   ├── /automate-ticket      -- End-to-end flow: TMS ticket OR a locally-drafted journey ->
│   │                             DLP -> Intent -> AST Code -> Green run
│   ├── /heal-test            -- 4-Point trace inspection + Two-Strike autonomous fix loop
│   ├── /bulk-rescan          -- Batch locator update on Page Objects, re-verified against the live DOM
│   ├── /ground-zero-setup    -- Guided orchestrator: chains /map-site + /derive-test-conditions +
│   │                             /compose-test-cases, with a human sign-off gate per stage, or auto-pilot
│   ├── /map-site             -- Route graph crawler, site topology, shared widget mining &
│   │                             optional read-only business-intent analysis (ADR 0012 Stage 1)
│   ├── /derive-test-conditions -- Read-only form-parameter extraction + deterministic 2-way
│   │                             combinatorial/boundary-value condition generation (ADR 0012 Stage 2)
│   └── /compose-test-cases   -- Deterministic test-level classification + drafted test case per
│                                 journey (ADR 0012 Stage 3/4)
│
├── 3. Model Context Protocol (MCP) Layer (.mcp.json, .cursor/mcp.json, .claude/mcp.json, etc.)
│   ├── Playwright MCP        -- Live DOM querying, selector evaluation, visual feedback
│   └── TMS Bridge MCP        -- TestRail / Zephyr / Jira Xray / ADO test case extraction (.mcp/tms-bridge/)
│
└── 4. Lifecycle Guards, Hooks & Rules Layer
    ├── Root Context          -- AGENTS.md, CLAUDE.md, .windsurfrules, copilot-instructions.md
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
  distinction - `.cursor/rules/*.mdc` is auto-injected context, not a command/skill primitive)
- **Windsurf:** `.windsurf/rules/*.md`
- **Claude Code:** `CLAUDE.md` and `.claude/skills/*/SKILL.md`
- **GitHub Copilot:** `.github/copilot-instructions.md`
- **Antigravity:** `.agents/agents/*/agent.md` and `.agents/skills/*/SKILL.md` (folder per skill,
  live-verified 2026-09-03 against the installed Antigravity CLI's own bundled documentation - a
  flat `.agents/skills/<name>.md` file is silently never discovered at all) and `AGENTS.md`
- **OpenAI Codex:** `.codex/skills/*/SKILL.md`
- **Aider:** `.aider.conf.yml`, `CONVENTIONS.md`, and `AGENTS.md`

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

## Business-intent analysis (`/map-site` Step 6, ADR 0012 Stage 1)

A strictly read-only `/map-site` step, run automatically as part of every `create`/`update` pass
(unless the user explicitly asks to skip it), infers per-route business intent (`businessFeature`)
and criticality (`criticalityTier`) into a typed artifact, `docs/analysis/business-intent.json`
(`.scaffold/schemas/business-intent.types.ts` documents its shape - `schemaVersion: 1`,
`Field<T>`-wrapped values, keyed by `routeId`). It never performs a mutating Playwright call of any
kind, not even a `trial: true` dry-run - inference draws only from already-rendered page title, heading text, form field labels,
button/link text, and ARIA roles reached by a single navigation per route. A zero-dependency
validator (`scripts/validate-business-intent.mjs`) mechanically checks the artifact's shape before
a Human Sign-Off Gateway presents results for review; no other skill or agent treats an entry with
`reviewed: false` as ground truth. `confidence` is computed from evidence-signal strength (a
heading/ARIA/manual signal implies `high`, form-labels/button-link-text implies `medium`,
route-path alone implies `low`) and mechanically checked against that rule, never chosen freely;
`criticalityTier` follows a written, evidence-anchored checklist rather than free inference, and
every `Field<T>` carries a `reasoning` string naming which checklist criterion it matched. Approval also records who gave it - `reviewedBy: 'human'` for a
real conversational approval, or `'auto-pilot'` only when `/ground-zero-setup`'s auto-pilot mode set
it on the user's own explicit pre-authorization - so a later audit can always tell which entries a
human actually looked at. `docs/site-map/site-map.json` itself gets the same mechanical
gate one level down (`scripts/validate-site-map.mjs`, run immediately after every `create`/`update`
pass, before shared-widget mining, the swarm dispatcher, or this step read it) - the shape defect
this catches (a malformed route entry, a duplicate `routeId`) is cheaper and more reliably caught by
code than by asking a model to notice it, the same reasoning ADR 0012 applies at every stage
boundary. See
[`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md)
for the design decision this implements and what remains out of scope for this first stage
(transport choice, cross-route journey synthesis).

## Test-condition derivation (`/derive-test-conditions`, ADR 0012 Stage 2)

A second, explicit-request-only, strictly read-only skill consumes `business-intent.json`'s
`reviewed: true` entries plus `site-map.json` and derives typed test conditions per route into
`docs/analysis/test-conditions.json` (`.scaffold/schemas/test-conditions.types.ts` documents its
shape). An LLM step infers form parameters and their equivalence partitions from markup only
(tag, `type`, label text, HTML5 constraint attributes, `<select>` option text, static ARIA
relationships) - never a field's current `value`/`checked`/`selected` state, never a mutating
call. A deterministic, zero-dependency generator (`scripts/generate-test-conditions.mjs`) then
mechanically expands those partitions into 2-way combinatorial coverage and 3-value
boundary-value conditions: it seeds one candidate vector per still-uncovered parameter pair and
greedily fills every other column around it, backtracking within that fill - a pair only lands in
`unsatisfiedPairs` (with the exact constraint that blocks it) when completing a vector around it
is genuinely impossible, never merely because an earlier, unrelated greedy attempt stalled. The
same mechanical shape gate pattern applies (`scripts/validate-test-conditions.mjs`), plus a
deterministic redaction backstop - independent of what the LLM step already did - masking
digit-run and majority-digit PII shapes in every evidence excerpt and sample value before the
artifact is ever written. Every generated condition starts `isSpeculative: true`/`reviewed: false`
with an empty verification contract; a human fills in expected UI/state/network behavior at the
same kind of Human Sign-Off Gateway Stage 1 already established, recording `reviewedBy` the same
way (`'human'` or `'auto-pilot'`) once approved. See
[`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md)
for what remains out of scope for this stage (domain classification, journey/test-level placement,
spec synthesis, combinatorial strength beyond 2-way, general boolean-predicate constraints).

## Guided greenfield orchestration (`/ground-zero-setup`)

A thin orchestrator over Stage 1, Stage 2, and Stage 3 for a brand-new application, adding no
analysis logic of its own. It sequences `/map-site create` (with its automatic Step 6),
`/derive-test-conditions`, and `/compose-test-cases` in order, pausing at each stage's own Human
Sign-Off Gateway by default (Guided mode) - except `/compose-test-cases`, which has no blocking gate
of its own and is simply run and moved past - or writing `reviewedBy: 'auto-pilot'` straight through
on the user's own explicit pre-authorization (Auto-pilot mode). What runs next is never hardcoded in
the orchestrator's own prose - both it and the underlying skills' own end-of-run hints consult one
deterministic script, `scripts/pipeline-status.mjs`, which recomputes the pipeline's current stage
from real artifact state on disk (site map existence, reviewed business-intent entries, reviewed
test conditions, drafted/automated journeys) every time it runs, never from a cached belief. This
keeps the single-source-of-truth property intact as later stages get added - extending the script's
stage list is the only change a new stage needs, not a rewrite of the orchestrator's own sequencing.
Once the pipeline reaches `test-cases-drafted` (or `complete`, once every drafted case has been
automated), this skill stops honestly on purpose: `/automate-ticket` synthesizes and executes real
code, a materially different action than approving a JSON review artifact, so triggering it stays an
explicit, separate human command in every mode, including auto-pilot. `/automate-ticket` itself now
reads `docs/analysis/journeys.json` directly when invoked with no ticket ID - no TMS ticket required
to close the loop from a from-nothing greenfield project.

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
- The `apiClient` fixture in `tests/fixtures.ts` runs `await client.cleanup()` after every test,
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
  `docs/site-map/site-map.json` and `components/` to match scenario steps to existing CPOM classes
  instead of regenerating duplicates.
- **Human sign-off gateway** (`/automate-ticket`): before writing test files, the agent presents a
  structured proposal (summary, steps, preconditions, Page Objects used, TDM strategy) for explicit
  review - zero code is written until approved.
- **Strict AST linearity:** synthesized tests ban `if`/`else`, loops, and `try/catch` wrapping
  assertions - every branch a test could take must be its own test.
- Every step is wrapped in `await test.step('Step N: ...', ...)`; fixtures supply dependencies, no
  raw `new PageObject(page)` in test files.

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
