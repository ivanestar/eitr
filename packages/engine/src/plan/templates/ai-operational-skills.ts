import type { FileDescriptor } from '../../types/generation-plan.js';

interface SkillDefinition {
  name: string;
  description: string;
  content: string;
  /** Claude Code / Cursor / Codex CLI Agent Skills frontmatter: named argument(s), e.g. ['mode']. */
  arguments?: string[];
  /** Placeholder shown to the user for the argument(s), e.g. '[create|update]'. */
  argumentHint?: string;
  /**
   * Suppresses model-initiated auto-invocation, so this only runs when the user explicitly types
   * the slash command - the documented pattern for a workflow with real side effects (live network
   * crawl, file writes), matching Claude Code's own /commit and /deploy examples.
   */
  disableModelInvocation?: boolean;
}

// Renders the 'arguments'/'argument-hint' frontmatter lines for assistants on the Agent Skills
// open standard (Claude Code, Cursor, Codex CLI) when a skill declares them - empty string for a
// skill with neither, so this composes cleanly into every assistant branch below.
function argumentFrontmatter(skill: SkillDefinition): string {
  const lines: string[] = [];
  if (skill.arguments) {
    lines.push(`arguments: [${skill.arguments.join(', ')}]`);
  }
  if (skill.argumentHint) {
    // Always YAML-double-quoted: the hint's own documented example values ('[issue-number]',
    // '[create|update]') start with '[', which an unquoted YAML scalar parses as a flow sequence
    // (an array) instead of a string - exactly the "must be a string" validation error this
    // guards against. Escape backslashes first, then quotes, so any future hint value stays safe.
    const escaped = skill.argumentHint.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    lines.push(`argument-hint: "${escaped}"`);
  }
  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

function buildOperationalSkills(tool: string, language: string): SkillDefinition[] {
  const isCypress = tool.toLowerCase().includes('cypress');
  const frameworkName = isCypress ? 'Cypress' : 'Playwright';

  return [
    {
      name: 'protocol-123',
      description:
        'Executes the rigorous 8-phase SDET Protocol 123 for full-lifecycle test automation, baseline establishment, or maintenance with multi-agent review and Arbiter adjudication.',
      content: `# Skill: Protocol 123 SDET Engineering (/protocol-123, /123)

## Purpose
Executes the deterministic, production-grade 8-phase SDET workflow for test automation, Page Object refactoring, and test suite maintenance with multi-agent review and Arbiter false-positive filtering.

## 8-Phase SDET Lifecycle

### Phase 0: Pre-Flight Baseline
- Execute baseline verification via terminal: \`npm test\` to confirm clean initial state.

### Phase 1: Recon, Live Web Search & Ingestion
1. Requirements Ingestion & GIGO Gate:
   - Ingest TMS case via 'tms-validator' (Quality Score >= 80%, atomicity <= 10 steps, concrete expected results).
2. Live DOM & Site Map Reconnaissance:
   - Consult \`docs/site-map/site-map.json\`, \`components/pages/\`, and \`components/widgets/\`.
   - Inspect live DOM (3-Tier Locator Priority, shadow DOM, iframes).
3. Live Web Search & Recommendations:
   - Launch Web Search subagents to query official ${frameworkName} and UI library documentation for the target components.
   - Formulate concrete task-specific recommendations for architectural design and test synchronization.

### Phase 2: Spec Formulation (SDD Automation Proposal)
- Synthesize the deterministic Automation Proposal Artifact before writing code:
\`\`\`markdown
### Automation Proposal Artifact
| Field | Value |
|---|---|
| Ticket ID & Title | TC-XXX: [Title] |
| Target Route & Page | /app/route -> LoginPage, DashboardPage |
| Shared Widgets Used | NavbarWidget, DataGridWidget |
| Web Research Findings | [Latest docs & best practice recommendations] |
| Preconditions Fast-Path | ApiClient.createUser(), ApiClient.login() |
| Dynamic TDM Strategy | UUIDs, createTestEmail() |
| Step-by-Step Matrix | Step 1..N -> Expected Results -> Web-First Assertions |
\`\`\`

### Phase 3: Plan Review Swarm & Arbiter Adjudication
1. Review Swarm: Dispatch independent review subagents:
   - 'assertion-auditor': Checks for Fake-Green risks and Dual-Layer UI+API assertions.
   - 'sdet-architect': Checks CPOM contract and fixture DI.
   - 'flake-sentinel': Checks for zero arbitrary sleep and event race condition safety.
2. Arbiter Adjudication: 'review-arbiter' validates raw findings against Ground Truth (CONVENTIONS.md), filters false positives/nitpicks, and outputs the official Review Arbiter Verdict Artifact:
\`\`\`markdown
### Review Arbiter Verdict Artifact
- Arbiter Status: [APPROVED | REQUIRES_REFINEMENT]
- Findings Processed: N total (M accepted, K dismissed)
- Actionable Fixes: [Exact Line + Concrete Fix]
- Dismissed Findings: [Reviewer + Dismissal Reason: FALSE_POSITIVE / HALLUCINATED_RULE / OUT_OF_SCOPE]
\`\`\`

### Phase 4: Human Intent Lock (Sign-off)
- Present Proposal Artifact and Arbiter Verdict to the human engineer.
- BLOCKING GATE: ZERO code is written until explicitly approved by the user.

### Phase 5: TDD Dual Synthesis
1. Step 5a (Shared Primitives First):
   - 'pom-engineer' synthesizes CPOM Page Objects in \`components/pages/\` and verifies each one against the live DOM.
2. Step 5b (Linear Test Synthesis):
   - 'test-automator' synthesizes strictly linear test code in \`tests/TC-{id}-{feature}.spec.ts\`.
   - Wrap steps in \`await test.step()\`, inject fixtures via \`test.extend\`, and register teardown via \`apiClient.registerTeardown()\`.

### Phase 6: Code Review Swarm & Arbiter Adjudication
1. Reviewers inspect \`git diff\` for Web-First matchers, zero sleep, and no assertions inside Page Objects.
2. 'review-arbiter' evaluates diff comments, dismisses bogus warnings, and approves final code changes.

### Phase 7: Two-Strike Self-Healing
- Execute isolated test: \`${isCypress ? 'npx cypress run --spec tests/TC-XXX.cy.ts' : 'npx playwright test tests/TC-XXX.spec.ts'}\`.
- If failure occurs, 'trace-debugger' performs 4-point trace triage in \`trace.zip\`. Max 2 attempts.
- If still red after 2 attempts, execute Two-Strike rollback: \`git checkout -- <files>\` and output Two-Strike Triage Report:
\`\`\`markdown
### Two-Strike Triage Report
- Triage Category: [FLAKY / TIMING] | [SELECTOR DRIFT] | [PRODUCT BUG]
- Root Cause Evidence: Network status / Console log / DOM screenshot
- Action Taken: Two-Strike rollback executed via git checkout -- <files>
\`\`\`

### Phase 8: Quality Gate & Final Handoff
- Run contract audit: \`npm run lint:cpom\` and \`npm test\`.
- Present the deterministic Final Handoff Report with Telemetry Summary:
\`\`\`markdown
### Final Handoff Report
- Created/Updated Page Objects: [List with paths]
- Created Test Specs: [List with paths]
- Execution Results: Total N, Passed M, Failed 0
- Real Application Bugs Discovered: [None | Issue details]

### Protocol 123 Telemetry Summary
| Phase | Duration | Est. Tokens (In/Out) | Est. Cost ($) | Status |
|---|---|---|---|---|
| Phase 0: Pre-Flight Baseline | 2.1s | 1.2k / 0.3k | $0.002 | PASSED |
| Phase 1: Recon & Ingestion | 4.5s | 3.5k / 1.1k | $0.007 | PASSED |
| Phase 2: Spec Formulation (SDD) | 3.8s | 2.8k / 1.8k | $0.008 | PASSED |
| Phase 3: Plan Review & Arbiter | 6.2s | 8.4k / 2.2k | $0.016 | PASSED |
| Phase 4: Human Intent Lock | User | 0 / 0 | $0.000 | APPROVED |
| Phase 5: TDD Dual Synthesis | 7.1s | 5.2k / 3.4k | $0.015 | PASSED |
| Phase 6: Code Review & Arbiter | 5.4s | 7.1k / 1.9k | $0.014 | PASSED |
| Phase 7: Self-Healing (Triage) | 0.0s | 0 / 0 | $0.000 | SKIPPED |
| Phase 8: Quality Gate & Handoff | 3.0s | 2.0k / 0.8k | $0.004 | PASSED |
| **TOTAL** | **32.1s** | **30.2k / 11.5k** | **~$0.066** | **100% GREEN** |
\`\`\`
`,
    },
    {
      name: 'auth-setup',
      description:
        'Captures, validates, and manages authenticated browser sessions for testing (/auth-setup, /auth-bootstrap).',
      content: `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Establishes a reusable authenticated browser state for running tests and reconnaissance inside protected application zones.

## Workflow
1. **Execution Mode Decision:**
   - Primary (API Fast-Path Token Injection): Execute headless API authentication and write JWT/session token directly to \`.auth/user.json\` via \`apiClient\` for instant zero-browser setup.
   - Interactive & MFA Fallback: If blocked by SSO (Okta, Keycloak, Azure AD), MFA, or TOTP:
     * If \`process.env.TOTP_SECRET\` is provided, automatically generate TOTP 2FA code (RFC 6238).
     * If developer session cookies are available, import them directly into storageState.
     * Fallback to headed browser session with manual prompt to the engineer.
2. **Session Serialization:**
   - Capture cookies, localStorage, session tokens, and headers.
   - Serialize state directly into \`.auth/user.json\` (secured with \`create-if-absent\` and strictly excluded from version control).
3. **CI Environment Alignment:**
   - For CI/CD runs, configure Service Account token injection via environment variables (\`process.env.AUTH_TOKEN\` / \`process.env.E2E_API_TOKEN\`).
4. **Fixture Integration:**
   - Generate or update authentication fixtures in the test project to preload \`.auth/user.json\` into browser context.
5. **Verification:**
   - Verify session validity by requesting a protected endpoint with the embedded \`ApiClient\` before proceeding.
`,
    },
    {
      name: 'scan-and-generate-pom',
      description:
        'Crawls a target page, synthesizes CPOM Page Objects, and verifies their liveness against the live DOM.',
      content: `# Skill: Scan and Generate POM (/scan-and-generate-pom)

## Purpose
Inspects live application DOM, extracts semantic elements, groups them into CPOM components, and validates their liveness.

## Workflow
1. **Target Inspection & Batch Worker Mode:**
   - Single Page: Navigate to target URL using Playwright MCP or reconnaissance engine.
   - Batch Swarm Mode: If processing multiple routes, run \`node scripts/orchestrate-swarm.mjs --phase=plan\` (add \`--routes=<a,b,c>\` to scope to a specific subset) and dispatch parallel 'pom-engineer' worker subagents per its Level 2 worker list (1 route per worker) for concurrent synthesis - do not enumerate routes/workers yourself.
   - Wait for network idle and main DOM stabilization.
2. **Semantic Hierarchy Extraction & Feed Guard:**
   - Extract elements using 3-Tier Locator Priority (getByTestId -> getByRole -> getByLabel/getByText).
   - Inspect and resolve Shadow DOM boundaries and embedded iframes via \`frameLocator()\`.
   - **Infinite Scroll & Dynamic Feed Guard:**
     * When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
     * Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
     * Immediately synthesize a CPOM Collection property via \`this.list(ItemComponent, spec)\` (returning Collection<ItemComponent>) and terminate page exploration.
3. **CPOM Synthesis & Shared Widget Reuse:**
   - Consult \`docs/site-map/site-map.json\` and \`components/widgets/\` for existing shared widgets (e.g. Navbar, Sidebar, Dialog) and compose them via \`this.child(WidgetClass, spec)\`.
   - Generate or update Page Object class inheriting from \`BasePage\`.
   - Group related interactive controls into CPOM primitives (Button, TextInput, Select, Table, Dialog) or collections (\`this.list(ItemComponent, spec)\`).
   - Enforce Method Safety Contract (Actions return Promise<void>, Snapshot readers suffixed with \`Now()\`).
4. **Live-DOM Liveness Verification:**
   - Verify every generated Page Object directly against the live application with Web-First assertions before treating it as complete. A raw DOM/accessibility-tree match found during extraction (Step 2) is NEVER sufficient evidence by itself that a real user can see or reach the element - an element present in the markup but hidden (\`display: none\`, off-screen, zero-size, \`opacity: 0\`, or covered by another element) MUST NOT become a CPOM property or method:
     * Tier 1 (Actionable Visibility, checked per element, not per page): (a) \`await locator.count() === 1\`; (b) \`await expect(locator).toBeVisible()\` (non-empty bounding box, not \`visibility:hidden\`/\`display:none\` - this alone does NOT catch \`opacity: 0\`); (c) \`await locator.evaluate(el => getComputedStyle(el).opacity !== '0')\`; (d) \`await locator.click({ trial: true })\` (or \`.fill({ trial: true })\` for text inputs) to run Playwright's full actionability pipeline (stable, receives pointer events i.e. not obscured, enabled) without performing the action - safe even for destructive controls. Any element failing (a)-(d) is a phantom: do not scaffold it, and remove it if an earlier pass already did.
     * Tier 2: State readers (\`valueNow()\`, \`optionsNow()\`, \`rowCountNow()\`).
     * Tier 3: Non-destructive triggers (tabs, accordions) without clicking mutating actions.
5. **Mandatory Execution & Self-Healing Loop:**
   - Immediately perform the liveness verification via the embedded Playwright MCP tools or an equivalent live check.
   - If failures occur due to locator drift or selector mismatch:
     * Inspect error traces, perform live DOM triage, adjust locators in the Page Object, and re-verify (Two-Strike Rule).
   - If failures are due to genuine application bugs (e.g. backend 500 error, unhandled JS exception, broken UI component):
     * Do NOT modify anything to hide the bug. Explicitly document and report the real product defect.
   - Batch Swarm Mode barrier: once every dispatched worker reports done, run \`node scripts/orchestrate-swarm.mjs --phase=verify --targets=<comma-separated Page Object paths each worker was expected to produce>\` to confirm every worker actually wrote its file before declaring the batch complete.
6. **Mandatory Handoff Report:**
   - Present a structured summary listing generated Page Objects, liveness verification status (pass/fail counts), and any detected real application defects.
   - PROHIBIT delivering unverified or red code to the user without explicit defect reporting.
`,
    },
    {
      name: 'automate-ticket',
      description: 'End-to-end automation from TMS ticket requirements to verified green test.',
      content: `# Skill: Automate Ticket (/automate-ticket)

## Purpose
Transforms an issue or test case from Jira, TestRail, Zephyr, or Azure DevOps into a fully verified automated test.

## Workflow
1. **Ingestion & DLP Masking:**
   - Fetch ticket details via \`mcp__tms__get_test_case({ caseId })\`.
   - Mask any PII, credentials, or proprietary tokens before processing.
2. **TMS Quality Validation (GIGO Protection):**
   - Delegate test case to 'tms-validator' to audit atomicity (steps <= 10), expected results verifiability, and TDM prerequisites.
   - If Quality Score < 80%, halt execution and present a structured Rejection Report with remediation recommendations for the test author.
3. **Component Resolution & Gap Analysis:**
   - Consult \`docs/site-map/site-map.json\` and \`components/pages/\` to resolve target routes, Page Objects, and shared widgets.
   - If components are missing, trigger \`/scan-and-generate-pom\` to generate and liveness-verify the required Page Objects.
4. **Human Sign-Off Gateway (Proposal Artifact & Batch Mode):**
   - Single Ticket: Present a concise Markdown automation proposal artifact with Ticket ID, Target Route, Page Objects used, Execution Plan, and TDM strategy.
   - Batch Mode: When automating multiple tickets, synthesize a unified **Batch Proposal Matrix** table enabling **1-Click Batch Approval** across all scenarios at once without chat fatigue.
   - BLOCKING GATE: Wait for explicit user confirmation before synthesizing test code.
5. **Linear Test Code Synthesis (SOTA 2026):**
   - Synthesize strictly linear ${frameworkName} (${language}) test code with ZERO branching (\`if/else\`, loops) in \`tests/TC-{id}-{feature}.spec.ts\`.
   - Use Fixture Dependency Injection via \`test.extend<{ ... }>()\` to supply Page Objects and ApiClient instances.
   - Embed metadata tags: \`test('TC-{id}: {title}', { tag: ['@TC-{id}', '@smoke'] }, async ({ ... }) => ...)\`.
   - Wrap every step in ${isCypress ? '`cy.step("Step N: ...")`' : '`await test.step("Step N: ...", async () => { ... })`'}.
   - Map every expected result to an auto-retrying Web-First assertion (\`expect.soft\` for non-blocking multi-field snapshots).
   - For popup, dialog, or navigation triggers, use Race-Free Event Synchronization: \`await Promise.all([page.waitForEvent('dialog'), triggerAction()])\`.
   - Register cleanup teardown in \`afterEach\` / \`afterAll\` hooks via \`apiClient\`.
6. **Assertion Audit & Side-Effect Verification:**
   - Audit test with \`assertion-auditor\` to eliminate fake-green patterns and verify UI + API dual-layer assertions.
7. **Execution & Self-Healing:**
   - Run the newly synthesized test via terminal.
   - If failure occurs, automatically trigger \`/heal-test\` under the Two-Strike Rule.
   - Publish execution results back to TMS via \`mcp__tms__post_test_result\`.
8. **Final Report:**
   - Present the resulting test diff, execution logs, and verification status to the user.
`,
    },

    {
      name: 'heal-test',
      description: 'Analyzes Playwright traces and logs to repair failing tests autonomously.',
      content: `# Skill: Heal Test (/heal-test)

## Purpose
Performs root-cause analysis on failing test executions and applies precision fixes under the Two-Strike Rule.

## Workflow
1. **Failure Artifact Ingestion:**
   - Ingest execution failure artifacts (\`trace.zip\`, screenshots, video, console logs).
2. **4-Point Trace Triage (Fail-Fast Real Bug Detection):**
   - Check Network Waterfall (HTTP 4xx/5xx) and Console Errors first. If a server crash or unhandled runtime exception occurred, classify as **REAL PRODUCT BUG**; do NOT alter Page Objects.
   - Action Timeline, DOM Snapshots & Visual Diff: Determine if target was obscured, animated, or detached. Perform **Visual Diff & Screenshot Overlay** comparing pre-failure and post-failure frames to distinguish **Semantic Text/Icon Shift** from a broken UI render and calculate **Visual Confidence**.
   - Locator State: Inspect element counts, visibility, and attachment.
3. **Classification & Targeted Fix:**
   - Selector drift -> update locator in CPOM component adhering to 3-Tier Locator Priority.
   - Timing / race condition -> add auto-retrying web-first assertion or state wait.
   - Test data collision -> switch to dynamic TDM via \`apiClient.createUniqueId()\` / \`createTestEmail()\`.
4. **Attempt 1 Fix & Isolated Execution:**
   - Apply targeted fix and execute ONLY the isolated failing test spec (e.g. \`npx playwright test tests/TC-XXX.spec.ts\`).
   - If Page Objects were modified, re-verify them against the live DOM to ensure neighbor components remain healthy.
5. **Attempt 2 Refined Fix:**
   - If still failing, analyze secondary trace and apply refined fix.
6. **Rollback & Escalation (Two-Strike Rule):**
   - If still failing after 2 attempts, immediately roll back all modified files: \`git checkout -- <modified_files>\`.
   - Report root cause under taxonomy: \`[FLAKY / TIMING]\`, \`[SELECTOR DRIFT]\`, or \`[PRODUCT BUG]\` with trace evidence.
`,
    },
    {
      name: 'bulk-rescan',
      description: 'Batch updates Page Object locators across the project when UI design changes.',
      content: `# Skill: Bulk Rescan (/bulk-rescan)

## Purpose
Performs page-level locator updates when application design system or layout changes, healing multiple dependent tests in one step.

## Workflow
1. **Impacted Target Identification:**
   - Run the existing test suite (\`npm test\`) to identify broken components, and map each failing test back to its route.
2. **Parallel Worker Swarm (Fan-Out / Fan-In):**
   - Run \`node scripts/orchestrate-swarm.mjs --phase=plan --routes=<comma-separated affected route paths from Step 1>\` and dispatch parallel 'pom-engineer' worker subagents (Worker Swarm) per its Level 2 worker list for high-speed concurrent rescanning - scoping via \`--routes\` keeps this to exactly the affected, non-overlapping routes rather than the whole site.
3. **Component Locator Update:**
   - Update component locators and selectors inside Page Object classes adhering to 3-Tier Locator Priority.
   - Preserve existing public Page Object method signatures to avoid breaking test spec contracts.
4. **Component Liveness Verification & Healing:**
   - Re-verify each updated Page Object against the live DOM to guarantee 100% component liveness.
   - If any component fails verification, apply targeted locator fix under the Two-Strike Rule until Green.
5. **Business Suite Regression Confirmation:**
   - Re-run dependent business test suites (\`npm test\`) to confirm all tests pass green without modifying any test spec files.
`,
    },
    {
      name: 'map-site',
      description:
        'Crawls application routes, builds site topology map, and identifies shared reusable widgets. Two modes: create (fresh crawl) and update (incremental, content-hash-gated). Also supports two further optional, explicit-request-only steps: Page Object generation for mapped routes, and read-only business-intent/criticality inference gated by mechanical validation and human sign-off.',
      arguments: ['mode'],
      argumentHint: '[create|update]',
      disableModelInvocation: true,
      content: `# Skill: Map Site (/map-site create, /map-site update)

## Purpose
Crawls the application page graph with authenticated session, builds the complete route topology in \`docs/site-map/site-map.json\`, and detects recurring UI components for shared widget deduplication. Two modes, chosen by the argument this skill was invoked with:
- \`create\` (default if no argument given): full fresh crawl of every route. **If \`docs/site-map/site-map.json\` already exists, this discards it entirely** - every route's \`routeId\` identity resets too (only \`update\` preserves \`routeId\` - see Mode Resolution below and Step 3b), so anything keyed by \`routeId\` in a downstream artifact (e.g. \`docs/analysis/business-intent.json\`) becomes orphaned.
- \`update\`: incremental pass over already-known routes plus discovery of new ones - see Step 3b. **If \`docs/site-map/site-map.json\` does not exist yet, there is nothing to update against** - see Mode Resolution below.

Playwright browser access for this crawl comes from this project's MCP configuration (\`.mcp.json\`, \`.agents/mcp_config.json\`, \`.codex/config.toml\`, or \`.vscode/mcp.json\`, whichever your assistant reads). **Windsurf is the one exception**: Cascade has no per-project MCP mechanism at all - its MCP servers are configured once, globally, via Windsurf's own Settings -> Cascade -> MCP Servers (or by editing \`~/.codeium/windsurf/mcp_config.json\` directly). If you're running this in Windsurf and browser tools aren't available, that one-time global step is what's missing, not something this repo can provide.

## Mode Resolution
- \`update\` requested but \`docs/site-map/site-map.json\` does not exist: print "No existing docs/site-map/site-map.json found - running a full create pass instead." and proceed exactly as \`create\` - never silently redirect without saying so.
- \`create\` requested and \`docs/site-map/site-map.json\` already exists and parses validly: before doing anything else, print "Found an existing site-map.json with <N> routes (last touched <lastUpdatedAt or generatedAt>). create starts fresh: routeId identity resets for every route, so any downstream artifact keyed by routeId (e.g. docs/analysis/business-intent.json) will need re-review. Use /map-site update instead to refresh in place and preserve routeId/history." Then proceed.

## Workflow
1. **Authenticated Session Loading:**
   - Load authenticated storage state from \`.auth/user.json\` (or fallback to \`auth.json\`).
   - If not authenticated, prompt engineer to execute \`/auth-setup\`.
2. **Concurrent Route Exploration & Pagination Normalization (Worker Pool):**
   - Execute parallel crawling with worker pool (\`concurrency = 4..6\`) and canonical URL normalization.
   - Automatically strip volatile pagination and cursor query parameters (\`page\`, \`offset\`, \`cursor\`, \`limit\`, \`per_page\`) to collapse dynamic feeds into single canonical routes and eliminate crawler loop traps.
   - Canonicalize dynamic path segments the same way: a numeric ID, UUID, or per-record slug collapses into a path template (\`/users/42\` and \`/users/43\` both become \`/users/{id}\`) instead of producing one route per record.
   - Discover internal application links within base domain origin.
   - Extract page routes, titles, and major structural DOM regions (\`header\`, \`nav\`, \`aside\`, \`main\`, \`footer\`, \`table\`, \`dialog\`).
   - Bound traversal with a maximum crawl depth of 6 hops from the start URL and a maximum of 500 pages visited, to prevent infinite loops. Limit live exploration scrolls to maximum 2 viewports.
   - If either bound is actually hit before the crawl naturally exhausted every discoverable link, record it - see the \`coverage\` field below. Do not silently return a partial route list as if it were complete.
3a. **Deterministic Site Topology Synthesis (create mode):**
   - Generate \`docs/site-map/site-map.json\` conforming exactly to \`docs/site-map/site-map.schema.json\`: an object with \`schemaVersion\` (2), \`generatedAt\`, \`baseUrl\`, and a \`routes\` object keyed by canonical path template (never an array) — each entry carrying a \`routeId\` stable across URL restructuring, \`sampleUrls\`, \`title\`, \`regions\`, \`components\`, \`discoveredAt\`, \`lastCheckedAt\` (same value as \`discoveredAt\` on first creation), \`contentHash\` (see below), and \`status: "active"\`. Serialize \`routes\` keys in sorted order so a re-run's diff only shows routes that actually changed.
   - \`routeId\`: generated once, at the moment a route is first discovered (by a \`create\` pass or by \`update\` finding a genuinely new route) - a fresh, globally-unique identifier (e.g. a UUID). Never derive it from the path template and never regenerate it later for the same logical route; see Step 3b for how \`update\` preserves it. Bad: \`routeId: "users-id"\` (derived from the path template \`/users/{id}\` - breaks the moment that route is renamed to \`/customers/{id}\`). Good: \`routeId: "3f9a2b7e-4c1d-4e8a-9f2b-1a7c6d5e4f3a"\` (a fresh UUID, independent of the path entirely).
   - If Step 2's crawl hit its own depth or page-count ceiling, set a top-level \`coverage: { "boundedBy": "maxDepth" | "maxPages", "pagesVisited": <n> }\` field so a human can tell the route list may be incomplete. Omit \`coverage\` entirely when the crawl exhausted every discoverable link on its own - its absence means completeness, the same idiom \`lastUpdatedAt\`'s absence already uses for "never updated."
   - If an existing \`docs/site-map/site-map.json\` is missing \`schemaVersion\` or does not parse under this schema, treat it as absent and regenerate fresh rather than attempting to migrate it in place. A from-scratch \`create\` pass prunes any \`status: "removed"\` entries from a prior file, and resets \`routeId\` for every route - it starts clean (see Mode Resolution above for the required warning before this happens).
   - \`contentHash\` is a hash (e.g. SHA-256) of the normalized structural signal for the route: \`title\` plus sorted \`regions\` plus sorted \`components\`, joined into one string - NOT raw HTML, which is too noisy (whitespace, analytics scripts, embedded timestamps cause false-positive "changed" signals). Compute it the same way every time; \`update\` mode's cheap-skip logic depends on that consistency.
3b. **Incremental Update Synthesis (update mode) - the reason this is cheaper than \`create\`:**
   - For every route already in \`docs/site-map/site-map.json\`: re-fetch just enough of that route's page shell to recompute \`title\`/\`regions\`/\`components\`, then recompute \`contentHash\`. This route's \`routeId\` MUST stay exactly as it already is - \`update\` never reassigns it; that stability across a URL restructure is the entire reason \`routeId\` exists separately from the path template.
     * Hash unchanged -> the route's real structure hasn't changed. Only bump \`lastCheckedAt\`; skip full component re-extraction and shared-widget re-mining for this route entirely.
     * Hash changed -> run the same full extraction \`create\` mode does for this one route (Steps 2-3a's per-route logic), and update \`lastCheckedAt\`/\`contentHash\`/\`discoveredAt\`-adjacent fields accordingly.
     * Route no longer resolves (404, vanished from nav) -> set \`status: "removed"\` rather than deleting the entry, so removal history is visible; do not include it in shared-widget mining.
   - Any link discovered during this pass that isn't already a known route -> add as a new entry with \`status: "active"\` and a freshly generated \`routeId\` per Step 3a's rule, same as a fresh \`create\` would.
   - Update the top-level \`coverage\` field the same way Step 3a does (set it if this pass hit a bound, omit it if this pass's crawl was exhaustive), rather than leaving a stale value from a prior run.
   - Set the file-level \`lastUpdatedAt\` to now. Leave \`generatedAt\` untouched - it's the original creation timestamp.
4. **Shared Widget Mining (Deduplication Engine):**
   - Identify recurring component structures appearing across >= 2 \`active\` routes (exclude \`removed\` routes from this analysis).
   - Synthesize reusable widgets in \`components/widgets/<name>.widget.ts\`.
   - Update Page Objects to compose shared widgets via \`this.child(WidgetClass, spec)\` rather than duplicating code.
   - Run \`node scripts/orchestrate-swarm.mjs --phase=reindex\` so \`components/widgets/index.ts\` picks up any newly-added widgets deterministically, without write collisions from parallel workers.
5. **Orchestrated Fan-Out to POM Engineers (Optional on User Request):**
   - If the user explicitly requested generating Page Objects for the mapped routes:
     * Run \`node scripts/orchestrate-swarm.mjs --phase=plan\` (this file's own \`docs/site-map/site-map.json\` output feeds it directly) and dispatch parallel 'pom-engineer' worker subagents per its Level 2 worker list (1 route per worker) - do not enumerate routes/workers yourself.
     * Ensure each 'pom-engineer' synthesizes 1:1 Page Objects in \`components/pages/\` AND verifies each one against the live DOM.
     * Execute a global barrier synchronization via \`node scripts/orchestrate-swarm.mjs --phase=verify --targets=<comma-separated Page Object paths each worker produced>\` - confirm 100% Green component liveness across all workers before completing.
6. **Business-Intent & Criticality Analysis (Optional on User Request, Strictly Read-Only):**
   - If the user explicitly requested business-intent analysis (this step NEVER runs automatically as part of a plain \`/map-site create\`/\`/map-site update\` invocation):
     * Run \`node scripts/orchestrate-swarm.mjs --phase=plan\` (add \`--routes=<a,b,c>\` to scope to a subset) and dispatch one read-only analysis worker per \`active\` route from its Level 2 worker list - do not enumerate routes/workers yourself.
     * **Strictly read-only. Allowlist, not denylist**: each worker may ONLY use non-mutating read operations against the target route - text/attribute reads (\`.textContent()\`, \`.getAttribute()\`, accessibility-tree snapshots, \`page.title()\`) after a single navigation (a GET-equivalent read) to the route's \`sampleUrls[0]\`. Never call \`.click()\`, \`.fill()\`, \`.check()\`, \`.selectOption()\`, or any other action method - not even a \`trial: true\` dry-run - and never focus or read the live *value* of a form field (a pre-filled field may hold real session/account data). Infer intent purely from static, non-user-specific signal: page title, heading text, form field LABELS (the label text, never the field's current value), button/link visible text, and ARIA roles/names.
     * **PII/session-data guard on evidence excerpts**: every \`evidence[].excerpt\` MUST be a short (<=100 char) fragment of static label/heading/button text only, never a copied value from page content that could carry the signed-in user's real account data - mask any email, phone number, token, or numeric-ID-shaped text - a run of 6 or more consecutive digits, or an alphanumeric token of 8+ characters where digits are the majority of its characters - as \`[REDACTED]\` before writing an excerpt.
     * For a route whose \`contentHash\` in \`docs/site-map/site-map.json\` is unchanged since that route's \`sourceContentHash\` in an existing \`docs/analysis/business-intent.json\`, skip re-inference for that route entirely and keep its existing entry - mirrors \`update\` mode's own cheap-skip logic in Step 3b.
     * For every other active route, infer \`businessFeature\` (a label, <=40 characters, e.g. "Checkout", "Account Settings") and \`criticalityTier\` (\`critical\`/\`high\`/\`medium\`/\`low\`), each wrapped as a \`Field<T>\` (\`value\`, \`confidence\`, \`source\`, \`evidence\`) per \`docs/analysis/business-intent.types.ts\` - every inference MUST carry at least one \`evidence\` entry naming the literal signal and text excerpt it came from; never emit a value with no evidence.
     * Write the result to \`docs/analysis/business-intent.json\` conforming to \`BusinessIntentReport\` (\`schemaVersion: 1\`, keyed by \`routeId\`), with every new/changed entry's \`reviewed\` set to \`false\`.
   - **Mechanical Gate (zero model involvement):** run \`node scripts/validate-business-intent.mjs\` and stop if it reports \`FAILED\` - fix the reported shape errors and re-run before proceeding. Do not present unvalidated output to the human.
   - **Human Sign-Off Gateway:** present a Business-Intent Review Artifact table (Route, Business Feature, Criticality Tier, Confidence, Evidence Excerpt) for every new/changed entry. State explicitly: this file is NOT authoritative until a human has reviewed it - no other skill or agent should treat an entry with \`reviewed: false\` as ground truth.

`,
    },
  ];
}

export function planAiOperationalSkills(
  aiAssistants?: readonly string[],
  automationTool: string = 'playwright',
  language: string = 'typescript',
): FileDescriptor[] {
  const assistants =
    aiAssistants === undefined
      ? ['antigravity', 'cursor', 'claude', 'windsurf', 'codex', 'copilot']
      : aiAssistants;

  if (!assistants || assistants.length === 0) {
    return [];
  }

  const descriptors: FileDescriptor[] = [];
  const skills = buildOperationalSkills(automationTool, language);

  for (const rawAssistant of assistants) {
    const assistant = rawAssistant.toLowerCase();

    if (assistant === 'antigravity') {
      for (const skill of skills) {
        descriptors.push({
          path: `.agents/skills/${skill.name}.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'claude') {
      for (const skill of skills) {
        descriptors.push({
          path: `.claude/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}${argumentFrontmatter(skill)}${skill.disableModelInvocation ? '\ndisable-model-invocation: true' : ''}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'cursor') {
      for (const skill of skills) {
        descriptors.push({
          path: `.cursor/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}${argumentFrontmatter(skill)}
disable-model-invocation: true
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'windsurf') {
      for (const skill of skills) {
        if (skill.name === 'map-site') {
          // Windsurf workflows have no confirmed argument-substitution mechanism - ship create
          // and update as two separate, self-contained files instead of relying on a shared
          // $mode variable the way Claude Code/Cursor/Codex CLI's `arguments` field allows.
          descriptors.push({
            path: `.windsurf/workflows/map-site.md`,
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: {
              kind: 'inline',
              text: `---
name: map-site
description: ${skill.description}
---

# Workflow: map-site (create mode)

This workflow always runs in CREATE mode: a fresh, full crawl. For an incremental update of an existing site map instead, use the separate \`/map-site-update\` workflow. (Windsurf workflows don't take arguments, unlike Claude Code/Cursor/Codex CLI - ignore the "chosen by the argument this skill was invoked with" line below; this file's mode is fixed by which workflow you ran, not a parameter.)

${skill.content}`,
            },
          });
          descriptors.push({
            path: `.windsurf/workflows/map-site-update.md`,
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: {
              kind: 'inline',
              text: `---
name: map-site-update
description: Incremental update of an existing docs/site-map/site-map.json using content-hash comparison - cheaper than a full re-crawl.
---

# Workflow: map-site-update (update mode)

This workflow always runs in UPDATE mode: the incremental, content-hash-gated pass (Step 3b below), not a full fresh crawl. For a full fresh crawl instead, use the separate \`/map-site\` workflow. (Windsurf workflows don't take arguments, unlike Claude Code/Cursor/Codex CLI - ignore the "chosen by the argument this skill was invoked with" line below; this file's mode is fixed by which workflow you ran, not a parameter.)

${skill.content}`,
            },
          });
          continue;
        }
        descriptors.push({
          path: `.windsurf/workflows/${skill.name}.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}
---

# Workflow: ${skill.name}

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'codex') {
      for (const skill of skills) {
        descriptors.push({
          path: `.codex/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}${argumentFrontmatter(skill)}${skill.disableModelInvocation ? '\ndisable-model-invocation: true' : ''}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'copilot') {
      for (const skill of skills) {
        descriptors.push({
          path: `.github/prompts/${skill.name}.prompt.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
description: ${skill.description}
---

${skill.content}`,
          },
        });
        descriptors.push({
          path: `.github/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}
---

${skill.content}`,
          },
        });
      }
    }
  }

  return descriptors;
}
