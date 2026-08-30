# Quality Gates

Part of [EITR Architecture](README.md).

## Static CPOM contract linter

`scripts/lint-cpom.js` (`npm run lint:cpom`), emitted into every generated TS/JS project, is a
zero-dependency static audit that runs in under a second, before any browser launches:

1. **Zero arbitrary delays** - no `sleep()`, `setTimeout()`, `page.waitForTimeout()`.
2. **Mandatory `Now()` suffix** on every point-in-time state reader in `components/`.
3. **Zero assertions in components** - no `expect(...)` inside Component/Page-Object classes.
4. **Unawaited-promise guard** - rejects `expect(locator.isVisible()).toBeTruthy()`-shaped
   assertions in test specs.
5. **Fixture dependency injection** - rejects raw `new PageObject(page)` in test specs.

`eslint.config.js` (`npm run lint:eslint`, `eslint-plugin-playwright`) is generated alongside it for
TS/JS projects, catching general correctness issues (floating promises, deprecated Playwright APIs)
`lint-cpom.js` was never designed to - it complements the CPOM-specific linter rather than
replacing it.

## Multi-tier CI/CD gate

- **Tier 1 (static contract gate):** `npm run lint:cpom` (and `lint:eslint` where generated) -
  sub-second, before browsers launch.
- **Tier 2 (scenario regression gate):** `npm test` - full parallel E2E execution with trace
  artifact uploads on failure.

Generated CI templates (GitHub Actions, GitLab CI, Jenkins, TeamCity) also include a
dependency-vulnerability audit step (`npm audit`/`pip-audit`/`dotnet list package --vulnerable`,
per language) ahead of the test run.

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
