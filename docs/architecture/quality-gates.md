# Quality Gates

Part of [EITR Architecture](README.md).

## Static CPOM contract linter

Every generated project ships a zero-dependency static CPOM auditor - no pip/npm/NuGet/Maven
package install, no network access, runs in under a second before any browser launches. The
concrete implementation is per-language, each at a rigor tier matched to what a single-file,
zero-dependency script can reasonably check in that language:

| Language                      | Script                                                                                | Mechanism                                 | Rules                       |
| ----------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------- |
| TypeScript/JavaScript/Cypress | `scripts/lint-cpom.js` (`npm run lint:cpom`)                                          | line-by-line regex scan                   | 1-5, all real               |
| Python                        | `scripts/lint_cpom.py`                                                                | real AST (`ast.NodeVisitor`, stdlib only) | 1-3 real, 4 N/A, 5 deferred |
| Java                          | `scripts/LintCpom.java` (JDK single-file source-launch, `java scripts/LintCpom.java`) | line-by-line scan                         | 1-5, all real               |
| C#                            | `scripts/LintCpom.cs` (.NET file-based apps, `dotnet run --file scripts/LintCpom.cs`) | line-by-line scan                         | 1-5, all real               |

The five rules, in spirit, across every implementation:

1. **Zero arbitrary delays** - no `sleep()`/`Thread.sleep()`, `setTimeout()`,
   `page.waitForTimeout()`/`.waitForTimeout()`.
2. **Mandatory point-in-time-read suffix** on every non-retrying state getter (`is*`/`has*`/`get*`
   prefix, exempt by known structural return type - e.g. `Locator`/`Page` - not by a fixed method
   name list) in `components/` - `Now()` (TS/JS), `_now` (Python), `Now()` (Java), `NowAsync()`
   (C#, since the Playwright C# API is async-only). All four implementations now check the same
   `is/has/get` prefix set consistently.
3. **Zero assertions in components** - no `expect(...)`/`Assertions.*`/`Assert.*`/`Expect(...)`
   inside Component/Page-Object classes.
4. **Non-retrying/unawaited assertion guard** - rejects a raw, non-auto-retrying state check
   wrapped directly in an assertion in test specs (e.g.
   `expect(locator.isVisible()).toBeTruthy()` in TS, `assertTrue(locator.isVisible())` in Java,
   `Assert.That(await locator.IsVisibleAsync())` in C#) instead of the language's auto-retrying
   web-first assertion. **N/A for Python**: the generated Python templates use
   `playwright.sync_api` exclusively (fully synchronous, no `await`/Promise concept exists to
   guard against this bug class) - this is a deliberate no-op documented in the script's own
   header, not an oversight. The C# implementation is best-effort/single-line, the same lower
   rigor tier the TS implementation of this rule already carries.
5. **Fixture dependency injection** - rejects raw `new PageObject(...)`/`new Component(...)`
   construction in test specs outside setup/fixture files. **Deferred for Python**: `conftest.py`
   currently exposes only a `browser_context_args` fixture - there is no Page-Object-returning
   fixture convention yet for this rule to check test specs against. The script's header documents
   this as a deliberate deferral; once such a fixture convention exists, this rule slots in the
   same way it already does for TS/Java/C#.

The Java and C# scripts run as native single-file programs in their own language rather than
through Node.js: none of the generated CI templates for Python/C#/Java install Node.js anywhere, so
a Node-executed linter would be a new recurring CI dependency for those three languages, not a
one-time cost. Java's single-file source-launch (JDK 11+) and .NET's file-based apps (.NET 10 SDK+)
both let a `.java`/`.cs` file run directly with no project file and no separate compile step, using
only the toolchain each generated project already needs anyway - **with one exception**: file-based
apps require the .NET 10 SDK specifically, one major ahead of the .NET 8 SDK the generated C#
project itself targets and the one its CI templates otherwise install. The C# CI templates install
the .NET 10 SDK strictly alongside the existing .NET 8 toolchain (GitHub Actions: a second
`dotnet-version` entry in the same `setup-dotnet` step; GitLab CI: an isolated job on a
`dotnet/sdk:10.0` image; Jenkins: an isolated stage-level `agent` on the same image) so the
project's own net8.0 build/test path is untouched.

`eslint.config.js` (`npm run lint:eslint`, `eslint-plugin-playwright`) is generated alongside
`scripts/lint-cpom.js` for TS/JS projects, catching general correctness issues (floating promises,
deprecated Playwright APIs) that script was never designed to - it complements the CPOM-specific
linter rather than replacing it. No language currently has an equivalent secondary general-purpose
linter wired in by EITR itself.

## Multi-tier CI/CD gate

- **Tier 1 (static contract gate):** `npm run lint:cpom` (and `lint:eslint` where generated) for
  TS/JS/Cypress, or the equivalent per-language CPOM script above for Python/Java/C# - sub-second,
  before browsers launch.
- **Tier 2 (scenario regression gate):** `npm test`/`pytest`/`mvn test`/`gradle test`/`dotnet test` -
  full parallel E2E execution with trace artifact uploads on failure.

Java's Tier 1 gate is also enforced at build time, not only in CI: `pom.xml`/`build.gradle` wire
`scripts/LintCpom.java` into Maven's `validate` phase and Gradle's `test`/`check` tasks respectively,
so a local `mvn test`/`gradle test` fails on a CPOM violation before CI ever runs - no separate SDK
requirement, since Java's single-file source-launch uses the same JDK the rest of the project needs
anyway. C# gets the equivalent as an explicit opt-in only (`dotnet build -t:LintCpom`, documented in
the generated README), not wired into the default build chain, because `scripts/LintCpom.cs` needs
the .NET 10 SDK specifically (see above) while the project itself targets net8.0 - hooking it into
every `dotnet build` would break local builds for any developer who only has the .NET 8 SDK the
project actually requires. CI's own C# CPOM gate (a separate job provisioning .NET 10 alongside .NET 8) is unaffected and remains the primary enforcement point for C#.

Generated CI templates (GitHub Actions, GitLab CI, Jenkins) wire the Tier 1 CPOM gate as its own
step/job/stage ahead of the Tier 2 test run, for every language; Java's variant also installs
Playwright's browser binaries first (`mvn exec:java` CLI install, or a generated `playwrightInstall`
Gradle task) since neither ecosystem downloads them automatically. TeamCity generates both the
original Markdown setup guide and a `.teamcity/settings.kts` Kotlin DSL Configuration-as-Code file
covering the same steps, per JetBrains' own default onboarding path since 2019. Generated CI
templates also include a dependency-vulnerability audit step (`npm audit`/`pip-audit`/`dotnet list
package --vulnerable`, per language) ahead of the test run; Java's Maven/Gradle CI templates do not
yet have an equivalent zero-config audit step (tracked separately, not part of the CPOM gate) on any
provider. GitHub Actions
workflows declare a least-privilege `permissions:` block and a `concurrency`/cancel-in-progress
group; GitLab CI configs declare a top-level `workflow: rules` guard against duplicate
push/merge-request pipelines. TS/JS and Python shard the Tier 2 run 4-way on all 4 generated CI
systems: TS/JS via Playwright's native `--shard=X/Y`, each shard producing a blob report that a
merge job/stage/build-type combines into one HTML + JUnit report via `playwright merge-reports`;
Python via the third-party `pytest-split` plugin (`--splits`/`--group`), which reports per shard
independently (no merge step, since pytest has no equivalent mergeable report format). TeamCity's
merge wiring for TS/JS follows TeamCity's documented general dependency pattern but isn't verified
against a live server (tracked in TODO.md). Java and C# do not shard, by design, not oversight -
see `known-gaps.md` ("No CI test sharding for Java or C#").

## API testing support

To keep E2E tests fast without a full UI round-trip for setup/teardown, generated projects embed a
custom `ApiClient` wrapper (`shared/utils/api-client.ts`) around the language's native HTTP client:

- **REST:** typed `get()`/`post()`/`put()`/`delete()` helpers.
- **GraphQL:** a `graphql(query, variables)` method mapping to a POST payload.
- **Polyglot equivalents:** Java uses `okhttp3`/`playwright.request`, Python and C# use their
  Playwright request context.

## AST-based quality evaluation (`@eitr/evals`)

To keep AI-generated code conformant to the Method Safety Contract across languages, `@eitr/evals`
parses generated/candidate code with a TypeScript AST Compiler API pass, flagging violations
(`expect()` inside a class, a missing `Now` suffix, a constructor parameter property in a
component) mechanically rather than by asking an LLM to self-report compliance. It also runs
offline, deterministic eval tests (`npm run eval`) against every AI agent/skill/rule generator in
this repository - see `CLAUDE.md`/`AGENTS.md` Section 8.
