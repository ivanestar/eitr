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
│   ├── /automate-ticket      -- End-to-end flow: TMS ticket -> DLP -> Intent -> AST Code -> Green run
│   ├── /heal-test            -- 4-Point trace inspection + Two-Strike autonomous fix loop
│   ├── /bulk-rescan          -- Batch locator update on Page Objects, re-verified against the live DOM
│   └── /map-site             -- Route graph crawler, site topology, shared widget mining &
│                                 optional read-only business-intent analysis (ADR 0012 Stage 1)
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
- **Antigravity:** `.agents/agents/*/agent.md` and `.agents/skills/*.md` (flat file per skill, not a
  `SKILL.md`-per-folder layout) and `AGENTS.md`
- **OpenAI Codex:** `.codex/skills/*/SKILL.md`
- **Aider:** `.aider.conf.yml`, `CONVENTIONS.md`, and `AGENTS.md`

## Anti-fake-green assertion engine

To prevent automated tests from passing without verifying actual business logic:

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

An opt-in, strictly read-only `/map-site` step infers per-route business intent
(`businessFeature`) and criticality (`criticalityTier`) into a typed artifact,
`docs/analysis/business-intent.json` (`docs/analysis/business-intent.types.ts` documents its
shape - `schemaVersion: 1`, `Field<T>`-wrapped values, keyed by `routeId`). It never runs
automatically and never performs a mutating Playwright call of any kind, not even a `trial: true`
dry-run - inference draws only from already-rendered page title, heading text, form field labels,
button/link text, and ARIA roles reached by a single navigation per route. A zero-dependency
validator (`scripts/validate-business-intent.mjs`) mechanically checks the artifact's shape before
a Human Sign-Off Gateway presents results for review; no other skill or agent treats an entry with
`reviewed: false` as ground truth. See
[`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md)
for the design decision this implements and what remains out of scope for this first stage
(transport choice, cross-route journey synthesis, test-condition derivation).

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
