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
- **Visual regression (`toHaveScreenshot()` baseline testing):** deliberately excluded, not planned
  (maintainer decision, 2026-09-02). It was flagged as an architectural mismatch before this
  decision: `shared/utils/visual.ts`, a screenshot-mask helper, was being generated unconditionally
  into every TypeScript project (`assets.ts`) despite research classifying baseline visual regression
  as Extended/opt-in - Playwright's own docs describe it as optional and warn about cross-platform
  snapshot fragility - and despite zero generated example ever using it. Rather than promote it to a
  documented opt-in pattern, the maintainer chose to remove it outright: the maintenance cost (flaky
  cross-platform/cross-browser pixel diffs, binary baseline images that don't review cleanly in a
  PR, recurring baseline-approval churn on every legitimate UI change) was judged not worth it for
  this project's actual usage pattern. The dead helper and its unconditional wiring have been
  removed. This does not affect the unrelated `trace-debugger` "Visual Diff & Screenshot Overlay"
  capability (comparing pre/post-failure frames during self-healing triage), which stays. Re-open
  only on a new, explicit maintainer decision to build this - not on a future audit finding the gap
  again.
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
