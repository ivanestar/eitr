# Known Gaps & Deliberate Backlog

Part of [EITR Architecture](README.md). Architectural deviations from an idealized "enterprise-ready"
framework that are known and deliberately deferred, not accidental. For day-to-day bug/finding
tracking, see the repository's local `TODO.md` (gitignored, not part of this document) - this page
is for gaps significant enough to shape future architecture, not routine findings.

- **Frozen stacks carry no test signal:** the Python, C#, Java and Cypress generators are still in
  the repository and still work, but nothing offers them and none of their tests run
  ([decisions/0013-freeze-non-typescript-stacks.md](decisions/0013-freeze-non-typescript-stacks.md)).
  An unrelated refactor can therefore break one silently, and unfreezing will begin with repairs
  rather than a green suite. Accepted knowingly: the alternative was paying for four stacks' worth
  of verification before a single one had shipped.
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
  `artifacts/analysis/feature-map.json`); and its actual audience - an SDET already working inside
  an AI coding assistant - already has a strictly better interface to the same data (asking the
  assistant to read/query `site-map.json` directly, which is faster and more flexible than a
  static text-substring filter). `artifacts/site-map/site-map.json` and
  `.scaffold/schemas/site-map.schema.json` are unaffected and remain the source of truth for every
  consumer (`pom-engineer`, `/scan-and-generate-pom`, `/automate-test`, `/map-features`). Re-open only on a new, explicit maintainer decision to build a human-facing view again -
  not on a future audit finding the gap again.
- **Test cases from requirements alone:** the pipeline that derives test cases without a
  hand-written TMS ticket
  ([`decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md`](decisions/0012-multi-stage-app-analysis-and-test-synthesis-pipeline.md))
  runs end to end from a crawled application: `/map-site` records the routes, `/map-features`
  groups them into features with a criticality each, `/define-test-conditions` analyses every
  reviewed feature in context
  ([`decisions/0014-context-driven-test-analysis.md`](decisions/0014-context-driven-test-analysis.md)),
  `/design-test-cases` composes journeys (a feature's happy path across its own routes, targeted
  journeys per route for the rest), and `/automate-test` turns a drafted test case into a spec behind
  its own Human Sign-Off Gateway. Requirements, tickets and code can back a condition as evidence
  beside a crawled application; a documents-only basis, with no application to crawl, is not built.
  `/design-test-cases` and `/automate-test` also still read conditions per route and do not yet use
  a condition's layer, oracle or priority. `/legacy-audit` and a Requirements-Diff Agent, when they
  are built, enter this pipeline as further sources rather than becoming separate features.
