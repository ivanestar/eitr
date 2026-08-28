import type { FileDescriptor } from '../../types/generation-plan.js';

interface SkillDefinition {
  name: string;
  description: string;
  content: string;
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
   - Consult \`docs/site-map.json\`, \`components/pages/\`, and \`components/widgets/\`.
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
      name: 'auth-bootstrap',
      description:
        'Captures, validates, and manages authenticated browser sessions for testing (/auth-setup, /auth-bootstrap).',
      content: `# Skill: Auth Bootstrap (/auth-bootstrap)

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
   - Batch Swarm Mode: If processing multiple routes from \`docs/site-map.json\`, dispatch parallel 'pom-engineer' worker subagents (1 route per worker) for concurrent synthesis.
   - Wait for network idle and main DOM stabilization.
2. **Semantic Hierarchy Extraction & Feed Guard:**
   - Extract elements using 3-Tier Locator Priority (getByTestId -> getByRole -> getByLabel/getByText).
   - Inspect and resolve Shadow DOM boundaries and embedded iframes via \`frameLocator()\`.
   - **Infinite Scroll & Dynamic Feed Guard:**
     * When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
     * Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
     * Immediately synthesize a CPOM Collection property via \`this.list(ItemComponent, spec)\` (returning Collection<ItemComponent>) and terminate page exploration.
3. **CPOM Synthesis & Shared Widget Reuse:**
   - Consult \`docs/site-map.json\` and \`components/widgets/\` for existing shared widgets (e.g. Navbar, Sidebar, Dialog) and compose them via \`this.child(WidgetClass, spec)\`.
   - Generate or update Page Object class inheriting from \`BasePage\`.
   - Group related interactive controls into CPOM primitives (Button, TextInput, Select, Table, Dialog) or collections (\`this.list(ItemComponent, spec)\`).
   - Enforce Method Safety Contract (Actions return Promise<void>, Snapshot readers suffixed with \`Now()\`).
4. **Live-DOM Liveness Verification:**
   - Verify every generated Page Object directly against the live application with Web-First assertions before treating it as complete:
     * Tier 1: Uniqueness (\`count === 1\`), bounding box, visibility, hit-test readiness.
     * Tier 2: State readers (\`valueNow()\`, \`optionsNow()\`, \`rowCountNow()\`).
     * Tier 3: Non-destructive triggers (tabs, accordions) without clicking mutating actions.
5. **Mandatory Execution & Self-Healing Loop:**
   - Immediately perform the liveness verification via the embedded Playwright MCP tools or an equivalent live check.
   - If failures occur due to locator drift or selector mismatch:
     * Inspect error traces, perform live DOM triage, adjust locators in the Page Object, and re-verify (Two-Strike Rule).
   - If failures are due to genuine application bugs (e.g. backend 500 error, unhandled JS exception, broken UI component):
     * Do NOT modify anything to hide the bug. Explicitly document and report the real product defect.
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
   - Consult \`docs/site-map.json\` and \`components/pages/\` to resolve target routes, Page Objects, and shared widgets.
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
   - Run the existing test suite (\`npm test\`) to identify broken components.
2. **Parallel Worker Swarm (Fan-Out / Fan-In):**
   - Orchestrator dispatches parallel 'pom-engineer' worker subagents (Worker Swarm) across affected non-overlapping routes for high-speed concurrent rescanning.
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
        'Crawls application routes, builds site topology map, and identifies shared reusable widgets.',
      content: `# Skill: Map Site (/map-site)

## Purpose
Crawls the application page graph with authenticated session, builds the complete route topology in \`docs/site-map.json\`, and detects recurring UI components for shared widget deduplication.

## Workflow
1. **Authenticated Session Loading:**
   - Load authenticated storage state from \`.auth/user.json\` (or fallback to \`auth.json\`).
   - If not authenticated, prompt engineer to execute \`/auth-bootstrap\`.
2. **Concurrent Route Exploration & Pagination Normalization (Worker Pool):**
   - Execute parallel crawling with worker pool (\`concurrency = 4..6\`) and canonical URL normalization.
   - Automatically strip volatile pagination and cursor query parameters (\`page\`, \`offset\`, \`cursor\`, \`limit\`, \`per_page\`) to collapse dynamic feeds into single canonical routes and eliminate crawler loop traps.
   - Discover internal application links within base domain origin.
   - Extract page routes, titles, and major structural DOM regions (\`header\`, \`nav\`, \`aside\`, \`main\`, \`footer\`, \`table\`, \`dialog\`).
   - Bound traversal with maximum depth and page count to prevent infinite loops. Limit live exploration scrolls to maximum 2 viewports.
3. **Deterministic Site Topology Synthesis:**
   - Generate or update \`docs/site-map.json\` with deterministically sorted route inventory and metadata.
   - Generate human-readable \`docs/APP_GRAPH.md\` with Mermaid route graph and summary.
4. **Shared Widget Mining (Deduplication Engine):**
   - Identify recurring component structures appearing across >= 2 routes.
   - Synthesize reusable widgets in \`components/widgets/<name>.widget.ts\`.
   - Update Page Objects to compose shared widgets via \`this.child(WidgetClass, spec)\` rather than duplicating code.
5. **Orchestrated Fan-Out to POM Engineers (Optional on User Request):**
   - If the user explicitly requested generating Page Objects for the mapped routes:
     * Dispatch parallel 'pom-engineer' worker subagents across discovered routes (1 route per worker).
     * Ensure each 'pom-engineer' synthesizes 1:1 Page Objects in \`components/pages/\` AND verifies each one against the live DOM.
     * Execute a global barrier synchronization: confirm 100% Green component liveness across all workers before completing.
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

    if (assistant === 'gemini' || assistant === 'antigravity') {
      for (const skill of skills) {
        descriptors.push({
          path: `.agents/skills/${skill.name}/SKILL.md`,
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
    } else if (assistant === 'claude' || assistant === 'claude-code') {
      for (const skill of skills) {
        descriptors.push({
          path: `.claude/skills/${skill.name}/SKILL.md`,
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
    } else if (assistant === 'cursor') {
      for (const skill of skills) {
        descriptors.push({
          path: `.cursor/rules/${skill.name}.mdc`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
description: ${skill.description}
globs: **/*
alwaysApply: false
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'windsurf') {
      for (const skill of skills) {
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
description: ${skill.description}
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
