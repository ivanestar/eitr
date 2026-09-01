# Known Gaps & Deliberate Backlog

Part of [EITR Architecture](README.md). Architectural deviations from an idealized "enterprise-ready"
framework that are known and deliberately deferred, not accidental. For day-to-day bug/finding
tracking, see the repository's local `TODO.md` (gitignored, not part of this document) - this page
is for gaps significant enough to shape future architecture, not routine findings.

- **Dependency Injection & IoC:** cross-cutting concerns (`ApiClient`, logging) are currently
  coupled to the test runner via Playwright fixtures rather than resolved through a standalone IoC
  container independent of the test runner.
- **Locator extensibility:** `LocatorSpec` is a closed discriminated union with a hardcoded switch
  for resolution (role, text, testId, custom). A polymorphic registry strategy would let a project
  register first-class custom locator strategies (e.g. framework-specific node selectors) via
  `playwright.config.ts` instead.
- **Advanced state/wait management:** relies entirely on Playwright's native auto-waiting. An
  extensible `WaitStrategy` interface for app-level synchronization (GraphQL hydration, network
  idle) beyond what auto-waiting covers is not yet built.
- **Middleware/interceptors:** no generic hook point around CPOM Actions (auto-logging every
  `click()`, telemetry dispatch, visual-regression snapshot capture on action).
- **Visual regression:** masking helpers exist (`shared/utils/visual.ts`) but there is no generated
  `toHaveScreenshot()` example or CI wiring for baseline artifacts yet.
- **Requirements → test-case generation:** an agent that derives test cases from live application
  analysis or existing requirements documentation, rather than from an already-written TMS ticket,
  is a considered future extension (see the README's Introduction) but not yet built.
- **No CI test sharding for Java or C#:** TS/JS (Playwright's native `--shard`) and Python
  (`pytest-split`) shard 4-way across all 4 generated CI systems. Java (Maven Surefire/Gradle +
  JUnit 5) and C# (NUnit) deliberately do not, and won't gain a hand-rolled EITR-authored splitter
  either - neither ecosystem ships a free, official automatic-balanced-split mechanism (only manual
  tag/category filtering with no auto-balancing; the one real automatic option, Gradle Develocity
  Test Distribution, is a paid product, out of place in a free/OSS scaffolder). Re-open only if one
  of these ecosystems ships a free official equivalent to `pytest-split`/`--shard`.
