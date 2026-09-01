# Changelog

All notable changes to this project are documented here, newest release first.

The format follows [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/): entries are
grouped under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. This project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Where the reason for a change
is worth knowing, the entry says why (closes a known gap, follows an architecture decision, fixes a
real bug) - not just what changed.

## [0.6.0] - 2026-08-29

### Added

- `cache: 'pip'` / `cache: 'maven'` / `cache: 'gradle'` on the generated GitHub Actions
  `setup-python`/`setup-java` steps for Python and Java (Maven + Gradle) - both actions support this
  built-in dependency-cache parameter officially; TS/JS already had `cache: 'npm'`, this closes the
  gap for the other two languages.
- Real `postTestResult` for all 4 TMS providers (was a no-op stub): Azure DevOps (`Results - Add`),
  TestRail (`add_result_for_case`), Zephyr Scale (`testexecutions`), and Xray Cloud (a real 4-step
  GraphQL chain - resolve Test issueId -> Test Execution issueId -> testRunId -> `updateTestRunStatus`).
  Split the shared `jira`/`xray`/`zephyr` adapter branch (which always returned empty `steps`) into
  three real, correctly-authenticated branches.
- Full ticket CRUD and test-plan/cycle management in the TMS bridge: `mcp__tms__search`,
  `create_issue`, `update_issue`, `delete_issue`, `list_test_plans`, `create_test_run`, and a real
  `get_suite_context` (was a stub). Delete returns an honest "not implemented" error where a
  provider's API has no such endpoint (Zephyr Scale test-case deletion, Xray Server/DC
  result-publishing), rather than a fabricated one. Added a `gqlEscape()` helper for every
  user-supplied value interpolated into an Xray GraphQL query.
- MCP protocol handshake now supports both eras: the legacy `initialize` handshake still works for
  older clients, and a `server/discover` RPC plus per-request `_meta` version negotiation was added
  for the 2026-07-28 spec.
- `npm run test:e2e:pairwise` and a new nightly CI workflow (`.github/workflows/nightly.yml`,
  03:00 UTC + manual dispatch) running the full gate plus the pairwise scaffold-and-build suite,
  kept out of the fast push/PR gate so that one stays quick.
- Dependency-vulnerability scanning in generated CI: `npm audit --audit-level=high` (JS/TS/Cypress),
  `pip-audit` (Python), `dotnet list package --vulnerable --include-transitive` (C#). Java
  intentionally skipped - no zero-config, no-external-service audit tool exists for Maven/Gradle.
- `eslint.config.js` with `eslint-plugin-playwright` for TypeScript/JavaScript projects, alongside
  the existing CPOM-specific `lint-cpom.js`, catching floating promises and deprecated Playwright
  API usage that the CPOM linter was never designed to.
- `architecture-doc-writer` skill (mirrored to `.claude/skills/` and `.agents/skills/`), recording
  the structure/format standard for future architecture-doc changes - including the rule that dated
  narration belongs in `CHANGELOG.md`, never in `docs/architecture/`.
- `Select` (portal/descriptor combobox), `Element`, and `Heading` CPOM primitives, and
  `FrameContainer` (iframe scoping), ported to Python, Java, and C# - closing the last CPOM
  cross-language parity gap left open by TODO.md's deterministic-generation-line audit.
  `Select`/`Element`/`Heading` also shipped for Cypress TS/JS; `FrameContainer` is TS/JS Playwright
  - Python/Java/C# only - Cypress has no `FrameLocator` equivalent (cross-origin iframes are out of
    its default model), a deliberate scope exclusion rather than a gap.
- Attachment/evidence upload for all 4 TMS providers' `mcp__tms__post_test_result` (was silently
  unsupported): Azure DevOps (JSON body with a base64 `stream` field), TestRail and Zephyr Scale
  (multipart uploads via a new shared `httpPostMultipart()` helper), and Xray Cloud
  (`addEvidenceToTestRun` GraphQL mutation). Per-file upload success/failure is reported back in the
  tool response; a failed result-post still short-circuits before any attachment is attempted.
- MCP protocol spec-compliance additions for the 2026-07-28 revision: `resultType: 'complete'` on
  every `tools/list` and `tools/call` result envelope (previously only on `server/discover`), and
  `CacheableResult` fields (`ttlMs`, `cacheScope`) on `tools/list`, since the tool list is fixed
  per-process. Per-request `_meta.clientCapabilities`/`_meta.clientInfo` are now read and logged
  (debug-only) rather than silently ignored; no formal negotiation is performed against them yet.
- Real system-level test of the generated MCP bridge (`packages/engine/test/mcp-protocol-system.test.ts`):
  spawns the actual generated `index.js` as a child process and talks JSON-RPC over stdio, covering
  the legacy `initialize` handshake, `server/discover`, and the `resultType`/`CacheableResult`
  additions above - the protocol layer had no test exercising a real running process before this.
- `.github/dependabot.yml` for Java projects (Maven or Gradle ecosystem, weekly) generated when the
  selected CI/CD provider is GitHub Actions - the zero-config way to get PR-based dependency
  freshness/security signal for an ecosystem with no `npm audit`/`pip-audit`/`dotnet list
--vulnerable` equivalent. Scoped narrowly on purpose: only `language: 'java'` and only GitHub
  Actions (GitLab CI/Jenkins/TeamCity have no equivalent auto-consumed manifest format) - this is a
  different, narrower re-introduction than the blanket `github-actions`-ecosystem Dependabot config
  removed entirely earlier in this same release (see Removed); it does not affect this repository's
  own Dependabot posture, only what Java projects receive from the generator.
- Content-assertion test coverage for the CI/CD generator (`packages/engine/test/cicd-content.test.ts`):
  per-branch string assertions for GitHub Actions/GitLab CI/Jenkinsfile across Python/C#/Java-Maven/
  Java-Gradle/default(TS-JS), YAML syntactic-validity parsing for every GitHub Actions and GitLab CI
  branch (previously zero tests parsed the generated YAML), and a TeamCity Kotlin DSL brace-balance
  check across all branches.
- Integration-level regression coverage for all 4 TMS adapters
  (`packages/engine/test/tms-adapters.test.ts`): spawns the real generated MCP bridge against a local
  mock HTTP server and exercises `getAdapter()`'s actual request/response logic for Azure DevOps,
  TestRail, Zephyr Scale, and Xray Cloud - the only prior test asserted template text, not adapter
  behavior.

### Changed

- Restructured `docs/architecture.md` (a single 464-line file mixing living documentation with
  dated narration - "Direction change (2026-07-17)", "Status: PIVOTED", and a build-sequencing plan
  for work long since shipped) into `docs/architecture/`: an arc42-lite overview (`README.md`) plus
  topic files (`data-and-component-model.md`, `generation-engine.md`, `ai-agent-integration.md`,
  `quality-gates.md`, `known-gaps.md`) and a `decisions/` folder with 9 Nygard-format ADRs. Dropped
  stale content rather than migrating it verbatim: the old design's `verify` CLI command and the
  scanned-`LoginPage` login seed (both superseded by the AI-driven live-DOM approach), and the
  "Slice 1/2/3" build-sequencing plan.
- Split the TMS provider selector into two questions (**breaking CLI change**):
  `--task-tracker <id>` (`jira`/`azure-devops`/`none`) and `--tms-providers <ids>` (multi-select:
  `azure-devops`/`testrail`/`xray`/`zephyr`) - reflecting that Xray and Zephyr are Jira apps and a
  project commonly pairs one tracker with one or more TMS systems. `PlanOptions.tmsProvider` is
  replaced by `taskTracker`/`tmsProviders`; every `mcp__tms__*` tool gained an optional `provider`
  argument, auto-resolved when only one is configured. This also exposed and fixed a latent bug: the
  old combined `jira-xray` choice never matched the engine's separate `jira`/`xray` adapter names,
  so selecting it silently fell back to a mock adapter with no env vars wired through.
- Deduplicated stack detection: the CLI's URL pre-fill hint and the engine's own `recon()` each had
  a separate framework/UI-library regex heuristic that could disagree on the same URL. Extracted a
  shared `stack-heuristics.ts` module; `recon()`'s own heuristics were also strengthened (dropped
  false-positive-prone signals like a bare `id="root"`, added Next.js/Nuxt/SvelteKit build-artifact
  signatures).
- Dependabot scoped down to `github-actions` only (dropped the routine npm/pip/nuget/maven/gradle
  version-bump entry, since a routine "there's a newer version" PR costs more integration-debugging
  effort than the bump itself usually warrants) - then removed entirely later in this same release,
  see Removed.

### Fixed

- `terminal-e2e.test.ts` restored to the CI gate - its one failing assertion could not be reproduced
  across 5 separate re-runs, very likely fixed as a side effect of an earlier, unrelated change.
- `packages/evals/test/e2e/cli.test.ts` (16 pairwise CLI combinations with real
  npm/pip/mvn/gradle builds) had 7 failures: 4 Cypress cases asserted successful generation instead
  of the intentional Cypress-withhold rejection, and 3 C# cases compared the generated filename
  against the raw sandbox directory name instead of its PascalCase form. This file had never been
  wired into any npm script or CI workflow, which is why both regressions went unnoticed for
  multiple releases.
- Jira description loss: Jira REST v3 returns `description` as an Atlassian Document Format object,
  not a plain string, and `getTestCase` was silently discarding it for every Jira/Xray project.
  Added `adfToPlainText`/`plainTextToAdf` round-tripping.
- Rewrote `mcp__inspect_dom`'s description and response shape (`status: "heuristic"`) to match what
  the tool actually does, instead of claiming a live DOM capture that never happened.
- Removed unreachable `defaultOutputDirForAutomationTool` branches (`webdriverio`/`selenium`/
  `junit`/`nunit` can never be selected - `AUTOMATION_TOOL_CHOICES` never offers them).
- `CLAUDE.md`/`AGENTS.md` doc-drift fixes: clarified that `innovation-brainstormer`/
  `project-memory-keeper`/`commit-writer` are standalone utilities, not stages of the formal
  pipelines; fixed a one-directional cross-reference so both files now remind each other to stay in
  sync; corrected a stale eval-test count (now 90 tests / 17 files) and its "CI doesn't run these"
  caveat (`npm run eval` already runs in CI).
- **Python `Select` semantics** (breaking behavior change for previously-generated projects):
  `renderPythonSelect()` was a duplicate of `NativeSelect` (native `<select>` wrapper) mislabeled as
  the descriptor/listbox-overlay combobox that TypeScript's `Select` actually is. Regenerating a
  Python project now emits the correct portal/descriptor semantics - trigger + listbox + option
  locators, a `reveal` recipe, listbox resolved from the page root via `.last`. `NativeSelect`
  remains unchanged for the native `<select>` case Python's `Select` wrongly served before. If a
  previously-generated project's Page Objects call `Select.select_option(...)`, regenerating this
  file will change its behavior - use `NativeSelect` there instead, or keep the old file if it was
  hand-edited.
- **TeamCity Kotlin DSL `matrix` import** (generated `.teamcity/settings.kts`, both the TS/JS shard
  - merge branch and the Python shard-only branch of `renderTeamcityKotlinDsl`): the previous
    `import jetbrains.buildServer.configs.kotlin.buildFeatures.matrix` failed to compile on a real
    TeamCity 2025.03 server ("Unresolved reference: matrix") - verified live via a Docker-hosted
    TeamCity instance, which also confirmed the correct import,
    `jetbrains.buildServer.configs.kotlin.matrix` (the extension function lives in the versioned DSL
    root package, not under `.buildFeatures.`), against both the server's own bundled DSL jar and
    JetBrains' official Matrix Build docs. The same live pass confirmed the `MergeReports` build
    type's snapshot + artifact dependency on the matrix-generated `E2ETests` cells materializes
    exactly as coded once the import is fixed - closing the previously-open "unverified" MAJOR item
    in TODO.md.
- **TestRail `get_cases` silent truncation**: TestRail hard-caps `get_cases` at 250 records per page
  (documented API limit); the generated MCP bridge called it once with no `offset` and returned
  whatever the first page contained, silently dropping every case beyond the 250th for any suite
  larger than that. `mcp__tms__get_suite_context` now paginates the full result set.
- **Cursor slash-command primitive** (confirmed functional bug, not cosmetic): both AI-agent and
  AI-operational-skill scaffolding wrote every Cursor file to `.cursor/rules/*.mdc`, which Cursor
  treats as auto-injected context, not an invocable command or skill - a generated
  `/scan-and-generate-pom`-equivalent could never actually appear as a Cursor command. Rewritten to
  the real primitives: `.cursor/skills/${name}/SKILL.md` for both, with operational skills (not
  agents) additionally getting `disable-model-invocation: true` so only agents remain
  auto-invocable, matching Cursor's own agent-vs-skill distinction.
- **Antigravity skills path**: generated `.agents/skills/${name}/SKILL.md` (a folder-per-skill
  layout) corrected to `.agents/skills/${name}.md` (flat file per skill), matching Antigravity's
  actual native skill format; `.agents/agents/${name}/agent.md` (folder-per-agent) was already
  correct and is unchanged. Antigravity-generated agents also now declare `subagent: true` in their
  frontmatter.

### Removed

- `eitr map` and `eitr rescan`/`recon` CLI commands - both were non-functional. `eitr map`'s
  crawler never actually crawled; its "worker loop" returned hardcoded route/component data
  regardless of the target URL. `eitr rescan` never inspected a live DOM or rewrote a single
  locator; it printed a fabricated "verified 100% Green against live DOM" message with no DOM ever
  touched. Both had been documented as doing real work for several releases. Site mapping and
  locator rescanning now happen only through the `/map-site` and `/bulk-rescan` AI-assistant skills,
  which already did the real work.
- Dependabot entirely, from both this repo and the generated-project template -
  `renderDependabotConfig()` and its wiring are gone; no generated project gets a `dependabot.yml`
  anymore (later in this same release, `renderDependabotConfig()` was reintroduced from scratch with
  a much narrower scope - Java + GitHub Actions only, filling a real audit-tooling gap rather than
  the blanket every-ecosystem config removed here; see Added). GitHub's native vulnerability-alerts
  and automated-security-fixes are enabled directly on
  this repo instead, which needs no config file; end users can enable the same toggle on their own
  repo once pushed to GitHub.
- The Contributor License Agreement process (`.github/workflows/cla.yml`, the signatures branch,
  `CLA.md`) - its only function beyond the Apache-2.0 license itself was preserving a future
  relicensing right, not needed with no external contributors expected. Re-add if the project
  starts accepting outside contributions.

### Security

- **Command injection in the generated MCP bridge's `mcp__run_test` tool**: `specPath`/`project`
  arguments from an MCP `tools/call` request were concatenated into a shell command string and run
  via `spawnSync(shell, [flag, cmdLine])` with no sanitization - an attacker-controlled value
  reaching this tool (e.g. via indirect prompt injection from a scraped ticket or web page) could
  execute arbitrary commands with the developer's own environment/secrets access. Replaced with
  direct argv execution (`spawnSync(bin, argv, { shell: false })`), a whitelist regex on both
  arguments that also rejects a leading `-`/`--` (closing a CLI-flag/argument-injection gap an
  independent review caught - e.g. a `specPath` of `--updateSnapshot` would otherwise pass the
  character-class check and be handed to the runner as a real flag, letting a request silently
  alter runner behavior while still reporting `status: passed`), and Windows `.cmd` resolution
  scoped to real batch-file wrappers (`npx`/`npm`/`mvn`) only. An unrecognized JSON-RPC method now
  returns a proper `-32601` error instead of a silent empty result.

## [0.5.2] - 2026-08-29

### Fixed

- C# project names now follow .NET's PascalCase convention. `toProjectName()` previously lowercased
  every language's project name identically (npm/pip-style kebab-case), producing invalid
  `.csproj`/assembly names like `mytestproject.csproj` for C#.

### Changed

- Cypress generation temporarily disabled at the CLI's language/tool selection gate, pending a CPOM
  primitive redesign native to Cypress's own command-chain/retry model instead of reusing the
  Playwright-shaped one. The generator and template code are untouched and still fully functional -
  only the questionnaire and flag validation stop offering it.

## [0.5.1] - 2026-08-28

### Fixed

- Cross-platform `npm` resolution: `findNpmCli()` only checked the flat Windows Node.js layout. The
  official POSIX (Linux/macOS) tarball layout puts npm one level up in `lib/node_modules/npm/`,
  so every TypeScript/JavaScript generator combination failed auto-install on `ubuntu-latest`.
  Added the POSIX path as a fallback.
- The Python + Playwright end-to-end test ran `pytest` against the system Python, but the generator
  installs pytest into a project-local `.venv`. Worked by accident locally; failed on a clean CI
  runner. The test now invokes the `.venv` interpreter directly, with a system-Python fallback.
- The C# end-to-end test asserted the generated `.csproj` filename equals the raw temp-directory
  name, but the generator PascalCases it via `toProjectName()`. Masked by Windows' case-insensitive
  filesystem; broke on Linux whenever the temp dir's random suffix contained an uppercase letter.
  `toProjectName()` is now exported and reused by the test instead of duplicating its logic.

### Changed

- Relicensed from Fair Source (FSL-1.1-ALv2) to Apache License 2.0. `COMMERCIAL.md` and the
  commercial-license template removed (no longer applicable - Apache-2.0 has no Competing-Use
  restriction to waive). `README.md`, `CLA.md`, and `CONTRIBUTING.md` updated to drop Fair
  Source/Competing-Use language.

## [0.5.0] - 2026-08-28

An audit-remediation release: 7 critical and 12 major findings from a repo-wide audit, plus 8
findings from a separate AI dev-tooling review.

### Added

- `agent-reviewer` subagent, validating agent `.md` definitions (frontmatter completeness,
  tool-list sanity, boundary-constraint coverage), mirrored into `.claude/agents/` and
  `.agents/agents/`.
- Real RFC 6238 TOTP generation in `tests/auth.setup.ts` (HMAC-SHA1-based, via Node's built-in
  `node:crypto`, verified against the official RFC 6238 Appendix B test vectors) - was previously
  unimplemented.
- `aider` added to the CLI's AI-assistant choices (the engine-side generator already supported it).
- `scripts/check-version-parity.mjs` (cross-checks `ENGINE_VERSION`, all 4 `package.json` versions,
  and the CHANGELOG head entry) and `scripts/check-mirror-parity.mjs` (diffs every `.claude/agents`/
  `.claude/skills` file against its `.agents/` counterpart).
- A `PreToolUse` hook (`scripts/block-raw-git-commit.mjs`) denying any raw `git commit` shell
  invocation, forcing every commit through the OpSec safe-commit script. Went through 5 rounds of
  adversarial review - each of the first 3 rounds found a real bypass through a special case the
  script tried to carve out, so the final design fails closed instead: it also denies a command that
  merely mentions "git commit" inside an unrelated string, by deliberate design choice, not a bug.
- `security-auditor` gained a 5th check: dependency/CVE audit via `npm audit --omit=dev` after any
  `package.json` change, with an explicit abort rule for a `high`/`critical` finding.
- New test coverage: framework-helper hydration tests (React/Vue/Svelte/Angular), `auth-setup`'s
  RFC 6238 vectors and `storageStatePath` threading, the new `aider` choice, and parity tests
  extended from React-only to all 4 supported frameworks.

### Changed

- CI now runs the full engine + CLI test suite (36+ files) and the deterministic eval suite
  (`npm run eval`, 16 files), up from a 3-file boundary-test-only gate.
- Generator templates and this repo's own dev tooling now use Antigravity's `.agents/agents/`/
  `.agents/skills/` convention (was `.gemini/`).
- Codex agents now emit `.codex/agents/<name>.toml` (was Markdown+YAML frontmatter); GitHub Copilot
  agents now use the `.agent.md` suffix; Windsurf agents/skills now carry proper frontmatter.
- `doc-sync-enforcer`'s mirror-parity rule now requires running `check-mirror-parity.mjs` after any
  `.claude/` agent or skill edit and reconciling any reported drift.
- `PlanOptions.storageStatePath` is now actually threaded through `PlaywrightAdapter` into
  `renderAuthSetup()` - it was previously accepted but unused.

### Fixed

- Corrected the invalid `FSL-1.1-Apache-2.0` license identifier to the registered SPDX identifier
  `FSL-1.1-ALv2` across all 4 `package.json` files.
- `mcp-tms.test.ts` had 3 stale count/content assertions predating the `review-arbiter`/
  `agent-reviewer`/`protocol-123` additions; fixed in place.
- `README.md` and the `CLAUDE.md`/`AGENTS.md` polyglot-parity rule corrected a false "5-language
  parity" claim - Cypress is TypeScript/JavaScript-only.
- `protocol-123` skill's frontmatter said "8-phase," though the body always ran phases 0-8;
  corrected to "9-phase." Its stale "44+ deterministic eval tests" claim replaced with the verified
  count (84 tests / 16 files at the time) plus a note to re-check via `npm run eval` rather than
  trusting a hardcoded number.
- `agent-reviewer`'s tool-list cross-check previously flagged every one of the 17 agents as a
  violation, since none of them declare a `tools:` frontmatter field. The rubric now skips that
  check when the field is absent and scores on name/description accuracy instead, assessing the
  resulting over-grant risk under the boundary-constraint dimension instead.
- Packaging hygiene: `vitest` added as an explicit `packages/cli` devDependency;
  `packages/evals/tsconfig.json` now extends the shared base config (7 strict-mode violations
  fixed across 4 files).
- Corrected `AGENTS.md`/`CLAUDE.md` Section 14 wording ("...QA/Doc Sync/Telemetry Report" ->
  "...Summary Report") to fix a test this release's CI-widening step would otherwise have exposed.

### Removed

- The half-wired 3-tier "POM-Sanity" component-liveness pipeline (the `sanity` Playwright/Cypress
  project, the mandatory `test:sanity` CI step, and its templates) - removed rather than finished.
  Every agent/skill instruction that referenced it now points at direct live-DOM verification
  instead.
- 12 dead "showcase" functions (`cpom-showcase.ts`, `api-test.ts`, and their per-language siblings
  across Python, Java, C#, JavaScript, and Cypress) that no generator ever called.
- `PlanOptions.generateSanitySpecs` (the feature it gated no longer exists).
- The standalone `release-manager` skill, which told users to run a raw `git commit && git tag` -
  in direct conflict with this repo's safe-commit rule. Its changelog-formatting conventions were
  folded into `npm-release-engineer.md` instead, so release ownership lives in one place.

## [0.4.0] - 2026-08-25

### Added

- 6 specialized SDET agent system prompts (`sdet-orchestrator`, `sdet-architect`, `pom-engineer`,
  `test-automator`, `assertion-auditor`, `trace-debugger`), natively formatted for 6 AI assistants
  (Antigravity/Gemini, Claude Code, Cursor, Windsurf, Codex, Copilot), enriched with concrete SDET
  practices: fixture-based DI, 3-tier locator priority, dynamic TDM, `test.step()` demarcation,
  web-first assertions, dual-layer (UI+API) validation, and a 4-point trace-triage checklist.
- Fixture-first dependency injection (`test.extend<{ loginPage: LoginPage }>()`), replacing the
  `let pageObject` in `beforeEach` pattern; native Playwright tag metadata
  (`tag: ['@sanity', '@tier1']`) and `@pytest.mark` markers for CI filtering; `expect.soft` for
  multi-attribute inspection without stopping at the first failure.
- `review-arbiter`: an independent judge agent evaluating multi-agent review findings against
  ground truth (`CONVENTIONS.md`, `AGENTS.md`, the live DOM), classifying each as `ACCEPTED`,
  `DISMISSED: FALSE_POSITIVE`, `DISMISSED: HALLUCINATED_RULE`, or `DISMISSED: OUT_OF_SCOPE`.
- `protocol-123` (`/123`): a standardized 8-phase SDET automation lifecycle (baseline -> recon &
  web search -> spec formulation -> plan review & arbiter -> human intent lock -> TDD dual
  synthesis -> code review & arbiter -> two-strike self-healing -> quality gate & handoff), with 4
  deterministic report schemas and a telemetry summary (per-phase duration, token usage, cost).
- 15 specialized meta-agents established (`architect`, `researcher`, `web-researcher`,
  `test-writer`, `eval-engineer`, `code-reviewer`, `review-arbiter`, `core-developer`,
  `security-auditor`, `flake-sentinel`, `qa-guard`, `doc-sync-enforcer`, `framework-auditor`,
  `skill-reviewer`, `innovation-brainstormer`); `web-researcher`, `review-arbiter`, and
  `eval-engineer` hardened with explicit step-by-step protocols, structured report schemas, and
  Good/Bad examples.
- `mcp__run_test`/`mcp__inspect_dom`: an embedded, zero-lock-in MCP server for isolated test
  execution, trace-file discovery, and semantic DOM inspection, configured across Cursor, Claude
  Code, Windsurf, Copilot, and Antigravity.
- MFA/SSO and API-token auth bypass in `/auth-setup`: automated TOTP generation (RFC 6238 via
  `TOTP_SECRET`), API fast-path token injection, dev session cookie import.
- Error-signature clustering in `/tms-triage`: groups failures sharing a root cause (HTTP status,
  URI pattern, stack trace) into one primary defect, linking secondary tests as blocked.
- Batch Proposal Matrix in `/automate-ticket` and `sdet-architect`: one artifact covering multiple
  ticket scenarios with 1-click approval.
- Parallel worker swarm in `/bulk-rescan`: an Orchestrator-Worker fan-out/fan-in pattern across
  non-overlapping routes.
- `DragAndDrop` (`dragToTarget`, `dragByOffset`) and `Canvas` (`clickAtRelative`, `drawPath`) CPOM
  primitives, across all polyglot adapters.
- `docs/app-graph.html`: a zero-dependency interactive site-topology dashboard with search
  filtering.
- `eitr doctor --ai`: diagnostics for Claude Code, Cursor, Windsurf, Aider, Antigravity, and MCP
  JSON-RPC compatibility.
- A pre-commit hook (`.githooks/pre-commit`) enforcing formatting, linting, and eval checks before
  every commit.
- `eitr rescan` (alias `eitr recon`) CLI command for rapid Page Object locator updates on UI
  redesigns, running POM sanity micro-tests (`--verify`) to confirm liveness. (Removed in 0.6.0 -
  it never actually inspected the live DOM; see that entry.)
- `scripts/lint-cpom.js` (`npm run lint:cpom`): a zero-dependency static audit for 5 CPOM rules (no
  arbitrary delays, mandatory `Now()` suffix, no assertions in components, unawaited-promise guard,
  fixture DI).
- Multi-tier CI/CD quality gates across GitHub Actions, GitLab CI, Jenkins, and TeamCity: lint ->
  sanity tests -> full test suite.
- `e2e-scaffold.test.ts`: automated verification of Zero Lock-in and Zero-Emoji compliance across
  generated frameworks.
- `assertion-auditor` agent: 100% Expected-Results mapping, an unawaited-promise guard, a ban on
  non-retrying boolean snapshot checks, dual-layer (UI+API) validation, and mutation-analysis
  inversion checks.
- A TDM layer and teardown registry: `registerTeardown()` and LIFO `cleanup()` in `ApiClient`, plus
  collision-free `createUniqueId()`/`createTestEmail()` generators; an `apiClient` fixture runs
  cleanup automatically after every test, including on failure.
- `trace-debugger` agent and a hardened `/heal-test` skill: fail-fast real-bug detection (checks
  for 5xx responses/console errors before touching a Page Object), 4-point trace triage, isolated
  single-spec execution, and the Two-Strike Rule with automatic rollback and structured taxonomy
  reporting (`[FLAKY/TIMING]`, `[SELECTOR DRIFT]`, `[PRODUCT BUG]`).
- Embedded TMS MCP bridge (`.mcp/tms-bridge/`) with local caching (`.tms-cache/<safeId>.json`,
  path-traversal protected), graceful fallback on network timeouts, and an XML step parser for
  Azure DevOps, TestRail, Jira Xray, and Zephyr.
- `tms-validator` agent (GIGO protection): checks scenario atomicity (<=10 steps), verifiable
  expected results, and TDM prerequisites, rejecting weak tickets with a scored report (below an
  80% quality score).
- Human sign-off gateway in `/automate-ticket`: a Markdown proposal artifact (title, route, Page
  Objects used, preconditions, TDM strategy) reviewed before any test code is written.
- Strict AST linearity rules for synthesized tests: no `if`/`else`, loops, or `try`/`catch` around
  assertions; mandatory `test.step()` demarcation and fixture DI.
- `eitr auth`: session/credential capture, with a `headed` mode (interactive SSO/OAuth/SAML/Okta
  login with 2FA/MFA fallback, auto-saved to `.auth/user.json`) and a `token` mode (CI
  service-account token injection via `E2E_API_TOKEN`), plus automatic `baseURL` resolution and
  token masking in terminal output.
- A 3-tier component sanity engine: passive liveness/actionability checks, point-in-time state
  reads, and reversible-interaction checks (focus/blur, tab navigation), co-located as
  `<name>.sanity.spec.ts` next to each Page Object. (Removed in 0.5.0 - never fully wired into
  scaffolded projects; see that entry.)
- `eitr map`: a site crawler synthesizing `docs/site-map.json` and a human-readable
  `docs/APP_GRAPH.md` (Mermaid route hierarchy), with bounded depth/page limits, a worker pool
  (`concurrency = 4..6`), and pure URL canonicalization (strips trailing slashes/hash fragments,
  sorts and dedupes query parameters, rejects external domains). (Removed in 0.6.0 - the crawler
  turned out to return hardcoded data regardless of the target URL; see that entry.)
- Shared-widget mining: detects recurring DOM structures across 2+ routes and recommends
  extracting them into `components/widgets/<name>.widget.ts`.
- `/map-site` operational skill, across all 6 supported AI assistants.

### Changed

- Crawler pagination handling (`canonicalizeUrl`) strips volatile query parameters (`page`,
  `offset`, `cursor`, `limit`, etc.) while keeping real filters, collapsing infinite-scroll
  pagination into one canonical route; `/scan-and-generate-pom` and `/map-site` cap feed/list
  scrolling at 2 viewports and require synthesizing a CPOM Collection instead of scrolling
  indefinitely.
- The Orchestrator-Worker swarm pattern (Shared Primitives First, one route per worker, barrier
  synchronization via `test:sanity`) is now the standard across `sdet-orchestrator`, `pom-engineer`,
  `/map-site`, and `/bulk-rescan`.
- `pom-engineer`/`/scan-and-generate-pom` mandate a co-located sanity spec for every generated Page
  Object, running it immediately with autonomous self-healing under the Two-Strike Rule;
  `/map-site`'s scope narrowed to crawling/topology/widget-mining only, delegating Page Object
  synthesis to `pom-engineer`.

### Fixed

- Directory structure cleanup: `components/pages/` reserved strictly for Page Object classes;
  sanity micro-tests moved to a dedicated `tests/pom-sanity/` directory instead of living alongside
  them; removed noisy example showcases (`cpom-showcase.*`, `api-showcase.*`) from default test
  directories across all 5 languages, replaced with a minimal starter smoke test per language.
- `mcp.json` and editor-config folders (`.cursor/`, `.claude/`, `.windsurf/`, `.codex/`, `.vscode/`)
  are now generated only for the assistants actually selected in the questionnaire, not
  unconditionally for every editor.

### Removed

- The obsolete `ai-tms-skills.ts` templates, superseded by the first-class agents and operational
  skills above.

## [0.3.0] - 2026-08-24

### Added

- 5 operational workflows (`/auth-bootstrap`, `/scan-and-generate-pom`, `/automate-ticket`,
  `/heal-test`, `/bulk-rescan`), formatted natively per assistant (Markdown skills, Cursor rules,
  Windsurf workflows, GitHub prompt files).
- MCP manifests across 6 editors (`.mcp.json`, `.cursor/mcp.json`, `.claude/mcp.json`,
  `.vscode/mcp.json`, `.windsurf/mcp.json`, `.codex/mcp.json`) configuring the Playwright MCP
  server alongside the local TMS bridge, with corporate proxy support (`HTTP_PROXY`,
  `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`, `PLAYWRIGHT_DOWNLOAD_HOST`).
- Native root context files: `.windsurfrules` for Windsurf Cascade, an expanded `AGENTS.md` for
  OpenAI Codex, and `.github/copilot-instructions.md`.
- `custom-instructions.md`, create-if-absent, so a user's own instructions are never overwritten by
  a framework update.

### Removed

- 40+ obsolete, duplicate static rule files left over from earlier generation iterations, for a
  clean, non-conflicting 4-layer AI architecture.

## [0.2.1] - 2026-08-24

### Added

- Native CI/CD workflow templates for GitHub Actions, GitLab CI, Jenkins, and TeamCity, for C#
  (.NET), Java (Maven/Gradle), and Cypress.

### Fixed

- `--storage-state` added to `eitr new`'s recognized options (was causing an unknown-option error).
- `ReconOptions` type now exported from `@scaffolder/engine`.
- Install-hint commands now use the actual target working directory instead of a generic fallback.
- Cypress component base template gained `isVisibleNow()`/`isEnabledNow()` point-in-time checkers.
- `.gitignore` templates for every language/tool now include `.idea/`, `.vscode/`, `test-results/`.
- `apply()` skips rewriting a file when its content is already byte-for-byte identical after
  line-ending normalization.
- Component method-safety-contract test gained case-insensitive flag and `isDisabled` detection,
  and now scans both TypeScript and JavaScript runtime assets.
- `detect()` no longer crashes on an empty project or one without a `package.json` - falls back to
  a safe baseline stack profile with wrapped JSON parsing.
- Test matrix extended to cover all 5 supported languages; `parity.test.ts` upgraded to strict
  file-level assertions.
- Cypress scaffolding connected to the TypeScript/JavaScript adapters without file collisions.
- Duplicate `.gitignore` entries removed for the C# and Java tool adapters.
- `eitr install` now recognizes `pom.xml`/`build.gradle` for Java.
- `pytest` choice synchronized across schema, validators, and driver prompts.
- `--ai-assistants` and `--tms-provider` flags added to `eitr init`'s argument options and prefill
  parser.
- `FrontendFramework` type exported from the engine's public module entry.
- Windows line-ending normalization (CRLF -> LF) applied in `apply()`, removing false clobber
  warnings on Windows.

### Security

- Fixed a Windows drive-relative path-traversal vulnerability (`^[a-zA-Z]:`) in questionnaire path
  validation.

## [0.2.0] - 2026-07-23

### Added

- Polyglot registry-pattern engine architecture, adding generation support for Python (pytest),
  Java (Maven/Gradle), C# (NUnit), JavaScript, and Cypress.
- `RadioGroup`/`RadioButton` CPOM primitives; the `Table` primitive gained `rowByColumn()` column
  search and `cellTextNow()` synchronous cell reads, across all 5 languages.
- UI adapters for Radix UI (`[data-state="open"]` portals) and Ant Design
  (`.ant-select-dropdown`); a `hover` reveal-trigger pattern alongside the existing `click`/`none`.
- `--storage-state` CLI flag to pass an authenticated session to the headless recon crawler.
- Scaffolding integration tests now run a real compile step (`tsc -b`, `mvn test-compile`,
  `gradle classes`) instead of a shallow file check.

### Changed

- The engine is now language-agnostic, built on strict `LanguageAdapter`/`ToolAdapter` interfaces.
- Default output directory is now dynamically inferred from the target framework/language (e.g.
  `PlaywrightTests/`, `CypressTests/`).
- The monolithic `.ai/` rules directory replaced by instructions generated per AI provider; the
  redundant `.ai/` folder generation from TMS MCP skills removed in favor of pure native assistant
  directories.

## [0.1.0] - 2026-07-23

### Added

- Core CLI scaffolding capabilities; dynamic generation of Page Objects and test utilities.
- Interactive questionnaire mode for configuring project scaffolding.
- Zero Lock-in enforcement: generated frameworks are entirely self-contained, with no runtime
  dependency on EITR.
- AI-assistant rules generation for Claude, Cursor, Copilot, Windsurf, Aider, and Codex.
- CLI version read dynamically from `package.json` for a unified header.
- A styled ASCII banner with author attribution shown on execution.

### Fixed

- Removed leftover EITR-specific naming from user-facing generated templates.
- Fixed trailing newline escape sequences in CLI terminal output.
