# Changelog

All notable changes to this project are documented here, newest release first. Each entry is one
dense line: a bold category prefix (`Added`/`Changed`/`Fixed`/`Removed`/`Security`) followed by what
changed, and why only if it isn't obvious. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Verification detail (the exact command
or test run to confirm a fix) lives in the corresponding commit message, not here — `git log` is the
audit trail; this file is release notes.

## [0.33.0] - 2026-09-04

- **Changed**: streamlined Protocol 123 to v3.0 by placing Invariants Discovery (`test-conditions-designer`) before Architect plan formulation, adopting a single Lead Reviewer (`code-reviewer`) with on-demand Arbiter escalation, and adding dedicated runner test suite `protocol-123-runner.test.ts`.
- **Changed**: relocated non-test setup and fixture files from `tests/` to dedicated `fixtures/` directory (`fixtures/index.ts` with `@fixtures` alias in TS Playwright, `fixtures/auth.setup.ts`, Python `fixtures/auth_setup.py`) and added `fixtures/` to CPOM linter target directories.
- **Added**: polymorphic AI operational skills and AI agents generator (`stack-conventions.ts`) establishing 100% native multi-stack parity across TypeScript Playwright, Cypress TS, Python pytest, C# NUnit, and Java JUnit 5.
- **Added**: lightweight Protocol 456 pipeline redesign (Phases 0-5) with deterministic runner `scripts/protocol-456.mjs`, on-demand upstream web research, fast-track pre-scoped track execution, and single-reviewer risk audit.
- **Added**: in-situ initial viewport screenshot capture and Selective Visual Triage Gate in `/map-site`, with `artifacts/site-map/screenshots/` path validation, regex schema constraints, and gitignore protection across all 5 generated stack profiles.
- **Added**: `scripts/protocol-123.mjs` deterministic pipeline runner, prompt template generator for mandatory subagents (including dual-track `web-researcher`), and phase gate verifier.
- **Added**: Selective Vision integration in `pom-engineer` referencing disk screenshots for unlabeled icons and prohibiting base64 inlining.
- **Added**: 9-category negative testing taxonomy, architectural-invariant technique, and Defensive Oracle Polarity validation in Stage 2 test conditions.
- **Fixed**: CPOM primitive reuse in `sdet-architect` and `pom-engineer`, python pytest fixtures with dynamic `base_url`, git-hooks script casing, and parameterized hydration helpers across all four supported languages.
- **Fixed**: a fresh `/ground-zero-setup` run opened in Russian with no Russian anywhere in the
  user's own request - a model defaults to mirroring ambient context rather than genuinely
  defaulting. Every operational skill now opens with an explicit "default to English, switch only
  on the user's own signal" note.
- **Fixed**: the structured interactive-choice-tool convention (use AskUserQuestion or equivalent
  when available) had drifted out of sync between skills - present in `/map-site`'s Core-Purpose
  Confirmation, but `/ground-zero-setup`'s own mode-choice question argued the opposite ("not a
  fixed menu tied to any particular tool"). Unified into one shared instruction, applied at every
  point across the pipeline where the human is asked to choose among options.
- **Added**: `pipeline-status.mjs` now computes a fixed roadmap string (all four stages plus their
  review points, current position bracketed) alongside its existing stage/nextCommand fields -
  printed by every skill at every human-facing stop, so the pipeline's shape and position are
  always visible without re-deriving them.
- **Changed**: `/design-test-cases` now presents every newly-drafted test case as its own labeled
  block (title, preconditions, numbered steps) immediately, instead of only a count summary - a
  stage that drafts real content and reports only a number defeated the point of drafting it. When
  a TMS/task-tracker is configured, it also asks one short, skippable question about recording
  these test cases there too. Still never a blocking gate - reviewable content shown immediately is
  not the same as gating on approval of it.
- **Changed**: `/ground-zero-setup` now names Stage 4 (`/automate-test`) explicitly in its Pre-Flight
  disclosure and prints the pipeline roadmap throughout, instead of only mentioning it in a closing
  aside easy to read as "pipeline complete" with nothing left. The orchestrator still never runs
  `/automate-test` itself in any mode - only the ambiguity between "stop here" (End of Chain) and
  "ask what's next" (the Stage Loop's own question) is resolved: the latter now explicitly defers
  to End of Chain the moment `nextCommand` becomes `/automate-test`, rather than the two silently
  disagreeing.
- **Changed**: renamed `/automate-ticket` to `/automate-test`, and redesigned its intake logic: an
  explicit ticket ID now gets a brief confirmation naming the TMS provider before fetching; with no
  ID, it checks for un-automated local drafts and configured TMS providers and asks only when at
  least two genuinely different sources are actually possible - proceeding directly the moment
  there is only one real answer, and skipping the question altogether when arriving straight from
  `/ground-zero-setup`'s own chain.
- **Changed**: test-condition descriptions no longer use one uniform "Verify the page
  accepts/handles..." template regardless of technique - boundary-value conditions now read as an
  edge-value accept/reject verdict, checklist-based conditions (always negative by construction)
  read as a malformed-input safety claim, keeping the general accepts/handles phrasing only for
  combinatorial/equivalence-partition conditions. Still fully deterministic - the variation is
  grounded in which technique produced the condition, not cosmetic rotation.
- **Added**: `pom-engineer` now has an explicit Component Reuse Order spanning the whole
  `components/` tree (primitives, widgets, and the base classes every Page Object already extends)
  - compose an already-scaffolded component first, synthesize a new reusable one second, and only
    register an element directly on the Page Object as the residual case. Found missing (only widget
    reuse was covered) from a live Page Object review.
- **Fixed**: `pom-engineer` was producing Page Objects with only generic landmark children (a main
  region, a heading, a "primary container") and no reference to real interactive elements a route's
  own `test-conditions.json` had already extracted evidence for - making those routes impossible to
  meaningfully automate. It must now cross-reference every named parameter in a route's
  `test-conditions.json` entry against the Page Object's own children, and scan for every real
  interactive element the live DOM contains rather than stopping at generic landmarks.
- **Fixed**: `/automate-test`'s synthesized code could be structurally compliant (correct
  `test.step()` wrapping, fixture DI, linear structure) while asserting nothing related to what a
  step actually claimed to do - a step titled "enter language=\"en\"" whose body only checked an
  unrelated container's visibility, reported from live use. Content fidelity is now mandatory: each
  step's body must perform the literal action its description names and assert the literal value
  its expected result names, with a good/bad example drawn from the exact reported failure.
- **Fixed**: self-referential compliance narration ("CPOM architectural contract strictly honored:
  no assertions in Page Objects, Web-First assertions used, ...") had only ever been banned in
  `/map-site`'s own "Reporting to the User" section, not project-wide, and reappeared in
  `/automate-test`'s final report. Now a global rule applied to every operational skill.
- **Changed**: `/define-test-conditions`'s parameter extraction gains one narrow, bounded exception
  to its read-only posture - progressive-disclosure forms (a checkbox, radio, dropdown, or filled
  field that reveals more fields) were under-extracting parameters a purely static read could never
  see. `.check()`/`.uncheck()`, `.selectOption()`, and `.fill()` with synthesized values are now
  allowed, one control probed and reset at a time, never combined, and never reaching a
  submit/create/delete/send-shaped button under any circumstance.
- **Added**: `/design-test-cases` now brackets every literal on-screen name a step references (a
  button/link label, a page name, a checkbox/radio/dropdown option, a toast message) using a fixed
  small verb vocabulary, e.g. `Click the [X] button`, so `/automate-test` can ground its synthesized
  locators' accessible names directly in that text instead of re-guessing or paraphrasing them.
- **Changed**: `assertion-auditor`'s dual-layer (UI+API) assertion check is now a floor, not a
  ceiling - a state-changing step also gets corroborated with every other genuinely available
  independent signal (a success toast, a related list/detail endpoint, an unambiguous page-state
  transition) rather than stopping at exactly two layers by convention. `/automate-test`'s synthesis
  step and the generated project's own AI rules doc carry the same principle.

## [0.32.0] - 2026-09-04

- **Fixed**: `/map-site` Step 6's Core-Purpose Inference could draft 2-4 candidates that were just
  reworded restatements of the same underlying interpretation instead of genuinely distinct ones,
  found in live use. Now writes one candidate per interpretation actually distinct enough to change
  a route's criticality, including exactly one when the evidence only supports one reading.
- **Changed**: `/map-site`'s Business-Intent Review Artifact now prints each route's criticality
  in uppercase on its own line (`Route criticality (draft): CRITICAL`), its reasoning on the line
  below (`Reasoning: ...`), and evidence as one comma-separated `Evidences: "...", "..."` line
  instead of one line per entry - found unreadable at a glance in live use.

## [0.31.0] - 2026-09-04

- **Changed**: `/derive-test-conditions` and `/compose-test-cases` renamed to `/define-test-conditions`
  and `/design-test-cases` (Test Analysis defines test conditions; Test Design designs test cases
  from them). Prose throughout both skills, `/ground-zero-setup`, `pipeline-status.mjs`'s
  `nextCommand`, and the `sdet-orchestrator` agent updated to match.
- **Changed**: the drafted-test-case artifact moved from `docs/analysis/journeys.json` to its own
  `artifacts/test-cases/test-cases.json` - `artifacts/analysis/` now holds only Stage 1/2's
  business-intent and test-conditions artifacts, the final output of the test analysis phase.
  `scripts/compose-journeys.mjs` now creates its output directory itself.
- **Changed**: the whole app-analysis pipeline's output root renamed from `docs/` to `artifacts/`
  (`artifacts/site-map/`, `artifacts/analysis/`, `artifacts/test-cases/`) - `artifact` was already
  the term used throughout every review gateway's own name (Business-Intent Review Artifact,
  Test-Conditions Review Artifact); the folder now matches. Frees `docs/` for a generated project's
  own real documentation, which nothing previously claimed.
- **Removed**: the `overrides/` seed directory and its `README.md` - real customization already
  happens by building on top of the owned tree (a Page Object importing from `components/`, a test
  importing from `shared/`), and the dedicated directory added a step nothing actually used.
  `tsconfig.json`'s `include` and the generated README's component-library section updated to
  match; `docs/architecture/decisions/0004-path-authority-regeneration.md` updated to drop the
  now-false "exactly one correct home" claim while keeping its still-valid core decision (path
  authority by write-policy, not content hash).
- **Changed**: `/design-test-cases` now requires one atomic action per drafted step, each with its
  own concrete expected result drawn from the underlying condition's `description`/`scenario`,
  instead of steps that bundled several actions behind one blanket result at the end - drafted
  steps read too generically to review or automate meaningfully, reported from live use. Each
  drafted step maps to its own `test.step()` block once `/automate-ticket` generates code from it,
  so a step needs its own verifiable result to be useful.
- **Fixed**: `/define-test-conditions`'s Test-Conditions Review Artifact printed only per-parameter
  statistics (`Parameter: ... Technique: ... Conditions: <count> Speculative: <count>`), never the
  actual conditions - a human could not review or correct what they never saw, reported from live
  use. Every condition now carries a `description` (one plain sentence, e.g. `Verify the page
accepts language="en" (positive)`) and a `scenario` (`positive`/`negative`), synthesized
  deterministically from the vector's own resolved partition sample values or literal
  boundary/checklist probe - zero model involvement, same as the rest of condition generation. The
  artifact now lists every condition by its description instead of an aggregate count, and surfaces
  within-route parameter constraints in plain language when present (cross-route/cross-feature
  dependencies remain untracked and out of scope for this stage).

## [0.30.0] - 2026-09-04

- **Fixed**: Java's Playwright dependency pin (Gradle and Maven templates) and its Docker image tag
  were stale at 1.52.0 while Python, C#, and TypeScript had already moved to 1.62.x; bumped to
  1.62.0 to match, confirmed against Maven Central and the upstream GitHub release.
- **Fixed**: `renderCypressConfig` hardcoded `baseUrl` instead of respecting `E2E_BASE_URL`, unlike
  the Playwright config's equivalent.
- **Fixed**: `/ground-zero-setup`'s Auto-pilot mode wording was ambiguous about whether it covered
  `/automate-ticket`; it now explicitly carves that stage out.
- **Added**: `security-auditor`'s five pillars now name the concrete risk class each one guards
  against (credential exposure, unauthorized access, data exposure, supply-chain risk).
- **Changed**: `docs/architecture/quality-gates.md` frames the CI/CD gate tiers as continuous
  testing in practice.
- **Added**: `/derive-test-conditions` golden eval case - the skills benchmark now covers all 9
  operational skills.
- **Removed**: `packages/evals`'s redundant local `test` script, already provided at the workspace
  root.

## [0.29.0] - 2026-09-04

- **Added**: `/map-site` Step 6 now drafts an app-level `corePurpose` (2-4 plausible one-sentence
  descriptions of what the application is actually for, each grounded in crawl evidence, with the
  model's best guess marked) and confirms it with the human in a short exchange before the main
  Review Artifact - picking a candidate or describing the purpose in free text. A route that
  directly delivers the confirmed purpose gets raised to `high` if the generic checklist alone
  would have placed it lower (never automatically to `critical`).
- **Changed**: the Business-Intent Review Artifact now recaps the confirmed core purpose, numbers
  each route for easy reference (stable sorted-path order), and offers a bulk-correction shorthand
  (`high: 1, 4, 5-8; critical: 2-3`) alongside free-form correction.

## [0.28.0] - 2026-09-04

- **Changed**: `/map-site`'s Business-Intent Review Artifact no longer shows `confidence` (it stays
  an internal, mechanically-checked signal only), labels `criticalityTier` as draft/unapproved, and
  deduplicates evidence that both `businessFeature` and `criticalityTier` cite instead of printing
  it twice - raised directly from a live run against a real site. `reasoning` must now read as a
  plain explanation for a human (what was found, why it matters for this kind of application), never
  a trace naming the checklist or confidence rule by name. The skill also stops narrating routine
  mechanical-gate success (script names, "passed validation") in its summary to the user - that's
  implementation detail, not user-facing signal.
- **Added**: an optional, never-blocking Coverage Cross-Check (`scripts/check-sitemap-coverage.mjs`,
  `/map-site` Step 3d) - looks for the target site's own `sitemap.xml` (via `robots.txt`'s
  `Sitemap:` directive or the conventional default path, following one level of a sitemap index) and
  flags a route it lists that the crawl didn't reach. Most sites publish no sitemap.xml at all, so a
  `SKIPPED` result is the normal outcome, not an error.

## [0.27.0] - 2026-09-04

- **Changed**: `/map-site` Step 6 (business-intent analysis) no longer lets `confidence` be chosen
  freely - it's computed from evidence-signal strength and mechanically checked by
  `scripts/validate-business-intent.mjs`. `criticalityTier` now follows a written,
  evidence-anchored checklist (critical/high/medium/low, mixed-criticality routes take the maximum
  tier found) instead of free inference, with a checklist-conformance self-verification pass before
  the Mechanical Gate. Every `Field<T>` gains a required `reasoning` string naming which criterion
  it matched. The Human Sign-Off Gateway's review artifact label changes from `Tier:` to
  `Route criticality:` and gains a `Why: <reasoning>` line - `businessFeature` and `criticalityTier`
  each get their own summary/reasoning/evidence block with their own independently-computed
  `Confidence:`, never a single shared slot for two values that routinely disagree.

## [0.26.0] - 2026-09-04

- **Added**: `/automate-ticket` now reads `docs/analysis/journeys.json` directly when invoked with
  no TMS ticket ID, automating every un-automated drafted test case through its own existing
  Human Sign-Off Gateway and quality gate - no TMS ticket required to close the greenfield loop.
- **Changed**: `scripts/pipeline-status.mjs` and `/ground-zero-setup` now recognize Stage 3/4
  (`/compose-test-cases` and the local-journey automation bridge above), replacing the old
  `ready-to-automate` terminal stage with `test-conditions-reviewed` -> `test-cases-drafted` ->
  `complete`. `complete` is reported only once every route with reviewed test conditions actually
  has a drafted test case, checked per route against `test-conditions.json` - not merely "some
  journey somewhere has one," which could otherwise report the pipeline done while a route was
  never even drafted. `/ground-zero-setup`'s chain now includes `/compose-test-cases`, but still
  stops before `/automate-ticket` in every mode - code synthesis stays an explicit human command.

## [0.25.0] - 2026-09-03

- **Added**: `/ground-zero-setup` - a guided orchestrator for a brand-new application that chains
  `/map-site create` and `/derive-test-conditions` end-to-end, pausing at each stage's own Human
  Sign-Off Gateway by default, or running fully unattended in auto-pilot mode (still recording
  `reviewedBy: 'auto-pilot'` on every entry it approves, never silently defaulting to that mode).
  Stops honestly once test conditions are reviewed - journey placement and spec synthesis are not
  built yet, so it points the user at `/automate-ticket` for the manual next step.
- **Added**: `scripts/pipeline-status.mjs` - a deterministic, zero-dependency script computing the
  current app-analysis pipeline stage from real artifact state on disk, consulted by
  `/ground-zero-setup` and by `/map-site`'s own end-of-run hint instead of a hardcoded "run X next"
  string that would go stale as new stages get added.
- **Added**: `reviewedBy: 'human' | 'auto-pilot'` alongside the existing `reviewed` field on both
  `business-intent.json` and `test-conditions.json` entries, mechanically required whenever
  `reviewed: true` - records who actually approved an entry.

## [0.24.0] - 2026-09-03

- **Fixed**: business-intent analysis (`/map-site` Step 6) now runs automatically as part of every
  `create`/`update` pass instead of needing a separate, undiscoverable explicit request - closes the
  gap where a user had no way to know Step 6 existed short of reading skill source.
- **Fixed**: internal architecture-decision references ("ADR 0012" and its dev-repo-only file path)
  no longer leak into generated scripts, type-contract files, or skill text - they described a
  document that doesn't exist in a generated project at all.
- **Changed**: `site-map.schema.json`, `business-intent.types.ts`, and `test-conditions.types.ts`
  moved from `docs/` to `.scaffold/schemas/` - `docs/` is reserved for the filled-in artifacts
  themselves (useful context on their own), not tooling/schema files.
- **Changed**: the Human Sign-Off Gateway tables in `/map-site` and `/derive-test-conditions` now
  resolve each `routeId` to its human-readable path/title and print as one labeled block per route
  instead of a Markdown table, which renders unreadably in a plain terminal.
- **Fixed**: test-condition generation no longer produces zero output for a route with fewer than
  2 parameters (the common case - a single search box or one-field form) - pairwise coverage has
  nothing to pair against there, so it now falls back to one condition per partition
  (`technique: 'equivalence-partition'`). The mechanical validator's technique allowlist was
  updated in lockstep so these conditions actually pass Gate 2.
- **Added**: a fourth test-condition technique, `checklist-based` (ISTQB experience-based testing)
  - a closed, deterministic list of well-known problematic values per parameter kind
    (XSS/SQL-injection markers, malformed emails, numeric overflow, invalid dates), complementary to
    boundary-value rather than a replacement for it.
- **Fixed**: the invocation-control claim in `/derive-test-conditions` named only Claude Code,
  Cursor, and Codex as enforcing "explicit command only," implying Antigravity was the sole
  exception - live verification found Windsurf and Copilot have no such mechanism either, and
  Cursor/Codex both have open 2026 reliability bugs in the mechanism itself. Reworded to name all
  three assistants with no mechanism and treat the other three as a hint, not a guarantee.
- **Added**: `checklist-based` condition generation now scales with the route's own
  `business-intent.json` criticality - full checklist on `critical`/`high` routes or when
  criticality is unknown, skipped on `medium`/`low` routes to avoid drowning low-value pages in
  noise. Only reviewed business-intent entries count; an unreviewed entry is never treated as
  ground truth, matching the same rule its own Human Sign-Off Gateway already states.

## [0.23.0] - 2026-09-03

- **Added**: ADR 0012 Stage 2 - test-condition derivation. A new `/derive-test-conditions` skill
  consumes `business-intent.json` + `site-map.json` and derives `docs/analysis/test-conditions.json`:
  read-only DOM inspection of form parameters/equivalence partitions, a deterministic zero-dependency
  generator (`scripts/generate-test-conditions.mjs`) that mechanically expands them into 2-way
  combinatorial coverage and 3-value boundary-value conditions, a mechanical redaction backstop
  (masks digit-run/majority-digit PII shapes regardless of separators), and a mechanical shape gate
  (`scripts/validate-test-conditions.mjs`) before the same Human Sign-Off Gateway pattern Stage 1
  already established. Unsatisfiable parameter-pair combinations are surfaced with their exact
  conflicting constraint rather than silently dropped or crashing generation.

## [0.22.0] - 2026-09-03

- **Added**: a mechanical shape gate for `docs/site-map/site-map.json` itself
  (`scripts/validate-site-map.mjs`, mirroring `business-intent.json`'s existing validator), run by
  `/map-site`'s new Step 3c right after every `create`/`update` pass and before shared-widget
  mining, the swarm dispatcher, or business-intent analysis read the file - catches malformed
  route entries and duplicate `routeId`s (the join key `business-intent.json` relies on) before an
  LLM or a human ever sees them.

## [0.21.0] - 2026-09-03

- **Added**: `pom-engineer`'s Tier 3 liveness check now covers the whole class of
  conditionally-rendered UI (dialogs/drawers, dropdown/select menus, tooltips, expandable
  disclosure sections, date pickers, context menus), not just tabs/accordions, and treats a
  `dialog`/similar entry in `site-map.json`'s per-route `regions`/`components` as an active
  discovery lead rather than a passive confirmation.

## [0.20.0] - 2026-09-03

- **Added**: Antigravity skills that depend on a slash-command argument (currently `map-site`) now
  explain their mode in plain language instead of referencing "the argument this skill was invoked
  with" - Antigravity has no such mechanism; skills there activate autonomously from their
  description, or by being asked for by name in chat.

## [0.19.0] - 2026-09-03

- **Fixed**: Antigravity CLI skills were invisible entirely. A skill must live in its own subfolder
  as `SKILL.md` (`.agents/skills/<name>/SKILL.md`), not as a flat file - Antigravity skills also
  aren't slash commands, they activate autonomously or by name in chat, unlike Claude Code/Cursor/
  Codex CLI's real `/name arg` support.

## [0.18.0] - 2026-09-03

- **Fixed**: generated agent/skill frontmatter could silently fail to parse - an unescaped colon or
  leading bracket in an interpolated `description`/`argument-hint` value breaks YAML, hiding the
  whole skill from an assistant's list with no error. Every interpolated frontmatter value across
  all 6 assistants is now escaped through one shared helper instead of patched case by case.

## [0.17.0] - 2026-09-02

- **Fixed**: `/map-site create` on an existing `site-map.json` now warns before discarding route
  identity; `update` with no existing file now announces its fallback to `create` instead of
  silently redirecting; crawl bounds are concrete numbers (6 hops / 500 pages) instead of an
  unenforceable phrase; `argument-hint` is always quoted so it can't parse as a YAML array.
- **Removed**: the human-readable `site-map.html` viewer, deliberately, not replaced - it broke
  under `file://` (the natural way to open it) and had already drifted from the schema.
  `site-map.json` remains the source of truth for every real consumer.

## [0.16.0] - 2026-09-02

- **Added**: business-intent analysis (`/map-site` Step 6, [ADR 0012](docs/architecture/decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md)
  Stage 1) - an opt-in, strictly read-only step that infers per-route business purpose and
  criticality into `docs/analysis/business-intent.json`, gated behind a human sign-off before
  anything treats it as ground truth.

## [0.15.1] - 2026-09-02

- **Added**: completed MCP protocol conformance test coverage - standalone/TMS tool counts and
  invalid-call error-response shape are now asserted against a real spawned server.

## [0.15.0] - 2026-09-02

- **Added**: deterministic FNV-1a hash-based CI sharding for C# and Java on GitHub Actions, matching
  the sharding TS/JS and Python already had.

## [0.14.0] - 2026-09-02

- **Added**: deterministic swarm dispatch (`scripts/orchestrate-swarm.mjs`), replacing LLM-reasoned
  "dispatch N workers" instructions across the AI-agent orchestration surface - computes a route DAG
  from the site map, verifies workers actually produced their expected files, and reindexes widgets
  deterministically.

## [0.13.0] - 2026-09-02

- **Removed**: visual regression scaffolding (`shared/utils/visual.ts` and its unconditional
  generation) - no generated example ever used it, and cross-platform pixel-diff flakiness wasn't
  worth the maintenance cost for how EITR is actually used.

## [0.12.2] - 2026-09-02

- **Fixed**: `pom-engineer`'s liveness check now catches occluded/`opacity: 0` phantom elements - the
  previous wording let an agent accept raw DOM presence as proof an element was real and clickable.

## [0.12.1] - 2026-09-02

- **Added**: taught the Anti-Over-Mocking Guard (Rule 6) to `test-automator`/`assertion-auditor` and
  the shared conventions doc, so an AI assistant knows the rule exists and how to legitimately
  suppress it (`// @allow-mock: <reason>`) instead of only hitting it as an opaque lint failure.

## [0.12.0] - 2026-09-02

- **Added**: CPOM linter Rule 6 (Anti-Over-Mocking Guard) across all 4 languages - flags an
  unannotated network mock/interception in a test spec, a known AI-assistant failure mode where a
  failing test gets "fixed" by mocking the endpoint instead of fixing the real defect.

## [0.11.0] - 2026-09-02

- **Fixed**: MCP server config paths/formats were wrong for 5 of 6 assistants (Antigravity, Claude
  Code, Codex CLI, Copilot, Windsurf) - live-verified and corrected against each assistant's actual
  current config location and schema.
- **Changed**: `/map-site` output consolidated from 4 files into `docs/site-map/` (3 files);
  `site-map.schema.json` bumped to `schemaVersion: 2` with `lastUpdatedAt`/`contentHash`/
  `lastCheckedAt`/`status`, letting `/map-site update` skip unchanged routes; `/map-site` now takes
  an explicit `create`/`update` mode.

## [0.10.0] - 2026-09-02

- **Added**: Python CPOM Rule 5 (Fixture Dependency Injection), closing the last CPOM parity gap
  between Python and TS/Java/C#.
- **Fixed**: TeamCity CI templates now run the CPOM contract linter for every language.

## [0.9.0] - 2026-09-01

- **Removed**: the separate `eitr.config.ts` machine-owned config file (inlined into
  `playwright.config.ts`/the Cypress equivalent) and the `'regenerate'` write policy engine-wide - a
  generated project is never touched by EITR again, so silent-overwrite semantics served no real
  scenario.
- **Changed**: renamed the engine's metadata directory `.eitr/` -> `.scaffold/`; added
  `.tms-cache/` to every `.gitignore` branch.

## [0.8.0] - 2026-09-01

- **Removed**: JavaScript decommissioned as a supported EITR language target
  ([ADR 0011](docs/architecture/decisions/0011-removal-of-untyped-javascript-target.md)) - Playwright
  already runs TypeScript natively with zero extra build step, so plain JS added maintenance cost
  with no matching benefit.
- **Changed**: `plan()` now throws a typed `UnsupportedLanguageError`; Cypress is TypeScript-only
  going forward; fixed the questionnaire silently resetting the E2E tool to `playwright` on every
  language change.

## [0.7.1] - 2026-09-01

- **Security**: bumped `@playwright/test` 1.51.1 -> 1.62.1 (SSL certificate verification bypass
  during browser download, [GHSA-7mvr-c777-76hp](https://github.com/advisories/GHSA-7mvr-c777-76hp));
  patched `nanoid`, `postcss`, and the `esbuild`/`vite` chain via a `vitest` 2.x -> 4.1.11 upgrade.

## [0.7.0] - 2026-09-01

- **Added**: build-time CPOM contract enforcement for Java/C# (previously CI-only); real
  `postTestResult` and ticket CRUD for all 4 TMS providers (Azure DevOps, TestRail, Zephyr, Xray);
  MCP protocol handshake support for both the legacy and 2026-07-28 spec eras; dependency-
  vulnerability scanning in generated CI (`npm audit`, `pip-audit`, `dotnet list package
--vulnerable`); `Select`/`Element`/`Heading`/`FrameContainer` CPOM primitives ported to Python/
  Java/C#; attachment/evidence upload for all 4 TMS providers; the `architecture-doc-writer` skill.
- **Changed**: restructured `docs/architecture.md` into `docs/architecture/` (arc42-lite overview +
  topic files + Nygard ADRs); split the TMS provider selector into separate task-tracker and TMS-
  providers questions.
- **Fixed**: CPOM linter false positive on `FrameLocator`/`IFrameLocator`-returning members; Jira
  REST v3 description loss (Atlassian Document Format object vs plain string); Python's `Select`
  now implements the real descriptor/listbox-overlay semantics instead of duplicating `NativeSelect`
  (**breaking behavior change** for previously-generated projects calling
  `Select.select_option(...)` - use `NativeSelect` there instead, or keep the old file if hand-
  edited); TeamCity Kotlin DSL `matrix` import path; TestRail `get_cases` pagination (was silently
  truncating past 250 records); Cursor slash commands were being written to `.cursor/rules/*.mdc`
  (auto-injected context, not an invocable command) - rewritten to `.cursor/skills/`.
- **Removed**: `eitr map`/`eitr rescan` CLI commands - neither did real work (the crawler returned
  hardcoded data regardless of target URL, the rescanner never touched a live DOM); Dependabot
  entirely (GitHub's native vulnerability alerts cover the same need with no config file); the CLA
  process (`CLA.md`, `.github/workflows/cla.yml`).
- **Security**: every generated Dockerfile now runs as non-root; fixed a command-injection
  vulnerability in the generated MCP bridge's `mcp__run_test` tool (shell-string execution replaced
  with argv-based execution and a strict whitelist).

## [0.5.2] - 2026-08-29

- **Fixed**: C# project names now follow PascalCase (`toProjectName()` was lowercasing every
  language identically, producing invalid `.csproj` names).
- **Changed**: Cypress generation temporarily disabled at the CLI's selection gate, pending a CPOM
  primitive redesign native to Cypress's own command-chain/retry model.

## [0.5.1] - 2026-08-28

- **Fixed**: cross-platform `npm` resolution (added the POSIX tarball layout as a fallback, fixing
  TS/JS generation on `ubuntu-latest`); the Python E2E test now runs against the generator's own
  `.venv` instead of the system Python; the C# E2E test now reuses `toProjectName()` instead of
  duplicating its PascalCase logic.
- **Changed**: relicensed from Fair Source (FSL-1.1-ALv2) to Apache License 2.0.

## [0.5.0] - 2026-08-28

An audit-remediation release (7 critical / 12 major findings).

- **Added**: `agent-reviewer` subagent; real RFC 6238 TOTP generation in `auth.setup.ts`; `aider` as
  a CLI assistant choice; `check-version-parity.mjs`/`check-mirror-parity.mjs`; a `PreToolUse` hook
  blocking raw `git commit` in favor of the OpSec safe-commit script; `security-auditor` gained a
  dependency/CVE audit check.
- **Changed**: CI now runs the full test suite and eval suite instead of a 3-file boundary-test
  gate; dev tooling moved to Antigravity's `.agents/` convention; Codex agents now emit TOML,
  Copilot agents use `.agent.md`.
- **Fixed**: SPDX license identifier corrected to `FSL-1.1-ALv2`; stale test/doc counts and a false
  "5-language parity" claim corrected.
- **Removed**: the half-wired 3-tier POM-Sanity liveness pipeline (never finished - direct live-DOM
  verification replaced it); 12 dead "showcase" functions; the standalone `release-manager` skill
  (told users to run a raw `git commit && git tag`, conflicting with the safe-commit rule).

## [0.4.0] - 2026-08-25

- **Added**: 6 specialized SDET agent prompts (`sdet-orchestrator`, `sdet-architect`, `pom-engineer`,
  `test-automator`, `assertion-auditor`, `trace-debugger`) across 6 assistants; `review-arbiter`; the
  9-phase `protocol-123` SDET automation lifecycle; an embedded MCP server (`mcp__run_test`/
  `mcp__inspect_dom`); MFA/SSO and API-token auth bypass in `/auth-setup`; error-signature clustering
  in `/tms-triage`; the Orchestrator-Worker parallel swarm pattern in `/bulk-rescan`; `DragAndDrop`/
  `Canvas` CPOM primitives; the embedded TMS MCP bridge (Azure DevOps, TestRail, Jira Xray, Zephyr);
  `tms-validator` (ticket quality scoring); a human sign-off gateway in `/automate-ticket`;
  `/map-site` operational skill.
- **Changed**: crawler pagination handling collapses infinite-scroll pagination into one canonical
  route; sanity specs co-located with their Page Objects, later moved to a dedicated directory.

## [0.3.0] - 2026-08-24

- **Added**: 5 operational workflows (`/auth-bootstrap`, `/scan-and-generate-pom`,
  `/automate-ticket`, `/heal-test`, `/bulk-rescan`), native per assistant; MCP manifests across 6
  editors with corporate proxy support; native root context files for Windsurf/Codex/Copilot.
- **Removed**: 40+ obsolete duplicate rule files left over from earlier generation iterations.

## [0.2.1] - 2026-08-24

- **Added**: native CI/CD templates (GitHub Actions, GitLab CI, Jenkins, TeamCity) for C#, Java, and
  Cypress.
- **Fixed**: several CLI option/flag and cross-language scaffolding bugs; Windows CRLF normalization
  in `apply()`.
- **Security**: fixed a Windows drive-relative path-traversal vulnerability in questionnaire path
  validation.

## [0.2.0] - 2026-07-23

- **Added**: polyglot registry-pattern engine architecture (Python, Java, C#, JavaScript, Cypress);
  `RadioGroup`/`RadioButton` CPOM primitives; Radix UI/Ant Design adapters.
- **Changed**: engine is now language-agnostic via `LanguageAdapter`/`ToolAdapter` interfaces.

## [0.1.0] - 2026-07-23

- **Added**: initial CLI scaffolding, interactive questionnaire mode, Zero Lock-in enforcement,
  AI-assistant rules generation for 6 assistants.
