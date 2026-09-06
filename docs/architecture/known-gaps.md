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
  removed. This does not affect the unrelated `/heal-test` "Visual Diff & Screenshot Overlay"
  capability (comparing pre/post-failure frames during self-healing triage), which stays - it was
  previously duplicated in a separate `trace-debugger` agent, removed 2026-09-06 as redundant since
  only `/heal-test` was ever actually invoked on the common path. Re-open
  only on a new, explicit maintainer decision to build this - not on a future audit finding the gap
  again.
- **Human-readable site-map viewer (`artifacts/site-map/site-map.html`):** deliberately excluded, not
  planned (maintainer decision, 2026-09-02). Previously generated unconditionally alongside
  `site-map.json` - a self-contained HTML/JS table view with search/filter, fetching
  `site-map.json` client-side at view-time so it could never drift from the actual crawl. Removed
  outright: the fetch happens to hit a real, well-known browser restriction (Chromium blocks
  `fetch()` from a `file://`-loaded page reading a sibling local file), breaking the single most
  natural way to open the file (double-click); it had already fallen behind the schema it existed
  to visualize (no awareness of `coverage`, `routeId`, or the sibling
  `artifacts/analysis/business-intent.json`); and its actual audience - an SDET already working inside
  an AI coding assistant - already has a strictly better interface to the same data (asking the
  assistant to read/query `site-map.json` directly, which is faster and more flexible than a
  static text-substring filter). `artifacts/site-map/site-map.json` and
  `.scaffold/schemas/site-map.schema.json` are unaffected and remain the source of truth for every
  consumer (`pom-engineer`, `/scan-and-generate-pom`, `/automate-test`, the business-intent
  Step 6). Re-open only on a new, explicit maintainer decision to build a human-facing view again -
  not on a future audit finding the gap again.
- **Requirements → test-case generation:** an agent that derives test cases from live application
  analysis or existing requirements documentation, rather than from an already-written TMS ticket,
  is a considered future extension (see the README's Introduction). The shape a future
  implementation must take - a staged, mechanically-gated pipeline in the assistant layer,
  subsuming `/legacy-audit` and the Requirements-Diff Agent backlog items as entry points rather than
  separate features - is settled in
  [`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md).
  Stage 1 (per-route business-intent/criticality analysis, `/map-site` Step 6 - see
  [`ai-agent-integration.md`](ai-agent-integration.md)) is implemented. Stage 2 (test-condition
  derivation - 2-way combinatorial coverage, 3-value boundary-value analysis, a mechanical
  redaction backstop, human sign-off - the new `/define-test-conditions` skill) is implemented.
  Stage 3 (test-level/journey placement - the deterministic `/design-test-cases` classifier,
  ADR 0012 Track 5) is implemented, v0: journeys are single-route only, no cross-route flow
  detection yet. Stage 4 (spec synthesis) is implemented as a bridge rather than a new gate:
  `/automate-test` now reads `artifacts/test-cases/test-cases.json` directly when invoked with no TMS
  ticket ID, so its own existing Human Sign-Off Gateway (unchanged) is the human sign-off before
  code generation for a locally-drafted test case too - closing the greenfield "from nothing" flow
  end-to-end without a hand-written TMS ticket.
- **CI test sharding for Java/C# on GitHub Actions:** resolved (Track 8, maintainer-authorized
  reversal of the original position below, 2026-09-02). Neither Maven Surefire/Gradle nor NUnit
  ships a free, official automatic-balanced-split mechanism (only manual tag/category filtering
  with no auto-balancing; the one real automatic option, Gradle Develocity Test Distribution, is a
  paid product), so the original decision was to accept the gap rather than hand-roll a splitter.
  The maintainer authorized reversing that decision on different grounds (CI execution time on
  large projects, not tooling availability), so a deterministic FNV-1a hash-based class-count
  partitioner now 4-way shards C# and Java the same way TS/JS (`--shard`) and Python
  (`pytest-split`) already did - GitHub Actions only, matching Track 8's own acceptance criterion;
  GitLab CI/Jenkins/TeamCity remain unsharded for these two languages. Partitions by test-class
  **count**, not measured execution time (same class of limitation `pytest-split`/`--shard` accept
  by default). Re-open only on a new, explicit maintainer decision (e.g. to extend sharding to the
  other 3 CI providers) - not on a future audit finding this gap again.
