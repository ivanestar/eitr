import type { FileDescriptor } from '../../types/generation-plan.js';
import { yamlSafeScalar } from './yaml-frontmatter.js';
import { resolveStackConventions, type StackConventions } from '../stack-conventions.js';

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

// Applies uniformly to every skill regardless of assistant: absent an explicit instruction, a model
// tends to mirror whatever language recently appeared in its own context (terminal locale, a
// stray word) rather than genuinely defaulting - live-observed on a fresh /ground-zero-setup run
// that opened in Russian with no Russian anywhere in the user's own request. English is this
// project's own default; switching only on the user's own explicit signal (writing in another
// language, or asking for one) keeps that default from being silently overridden by ambient noise.
const LANGUAGE_DEFAULT_NOTE =
  'Default to English for every response, question, and written artifact in this skill - switch to a different language only once the user has written to you in it, or explicitly asked for it; never infer a language from anything else in the environment.';

// Reused at every point in this pipeline where the human is asked to choose among options (not a
// free-form review/correction, which stays plain conversation - a discrete choice specifically).
// Cited by name so a future skill added to this pipeline can rely on the same convention instead of
// reinventing wording - found drifting out of sync once already (this exact sentence used to be
// paraphrased only in /map-site's Core-Purpose Confirmation step, which claimed /ground-zero-setup's
// own mode-choice question already followed it, while that question's actual wording had drifted to
// argue the opposite).
const INTERACTIVE_CHOICE_NOTE =
  'Use a structured interactive choice tool if your assistant provides one (e.g. AskUserQuestion), so the human can select an option instead of typing free text; fall back to clearly-numbered plain text with the recommended default marked only when no such tool exists.';

// Found needed after a live final report narrated "CPOM architectural contract strictly followed:
// no assertions inside Page Objects, auto-waiting Web-First asserts in specs, strict scenario
// linearity (test.step), clean fixture injection" back to the user - self-referential compliance
// narration this project's own house style already bans (CLAUDE.md/AGENTS.md Section 7), but which
// had only ever been written into /map-site's own "Reporting to the User" section, not applied
// project-wide. Global now, same insertion point as the language-default note.
const NO_COMPLIANCE_NARRATION_NOTE =
  'When reporting what a step or the whole run did, describe outcomes in plain terms a non-technical reader would understand - never recite which internal rule, contract, or convention was followed (e.g. never say something like "CPOM contract strictly honored: no assertions in Page Objects, Web-First assertions used, fixture injection applied"). Adopt every convention silently in the code itself; only report real findings (what was generated, what passed or failed, what a human needs to decide), never the fact that a rule was followed.';

// Inserted once, as its own short paragraph right after the skill's H1 heading - every skill's
// content starts with `# Skill: ... (/command)\n\n`, so this lands before Purpose/Workflow content
// rather than depending on locating a specific later heading that could itself be renamed.
function withGlobalConventions(skill: SkillDefinition): SkillDefinition {
  const [heading, ...rest] = skill.content.split('\n\n');
  return {
    ...skill,
    content: `${heading}\n\n${LANGUAGE_DEFAULT_NOTE}\n\n${NO_COMPLIANCE_NARRATION_NOTE}\n\n${rest.join('\n\n')}`,
  };
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
    // guards against.
    lines.push(`argument-hint: ${yamlSafeScalar(skill.argumentHint)}`);
  }
  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

// Antigravity has no slash-command argument-substitution mechanism at all - live-verified
// 2026-09-03 via the installed Antigravity CLI's own bundled documentation: skills are
// autonomously activated by the agent from their `description`, or explicitly requested by name
// in chat, never invoked as `/name arg`. A skill whose shared `content` body talks about "the
// argument this skill was invoked with" (map-site's create/update mode selection) is therefore
// describing a mechanism that does not exist on this assistant - mirrors the same real gap
// Windsurf's map-site split already works around with its own inline caveat, generalized here for
// any current or future skill that declares `arguments` rather than special-cased per skill name.
function antigravityInvocationNote(skill: SkillDefinition): string {
  if (!skill.arguments) return '';
  return `> **Antigravity note:** this assistant has no slash-command argument mechanism - skills are activated autonomously from their description, or by explicitly asking for them in chat. Wherever the text below refers to "the argument this skill was invoked with," state the mode directly instead (e.g. "run ${skill.name} in create mode").

`;
}

function renderAuthSetupContent(sc: StackConventions): string {
  if (sc.authStrategy === 'cypress') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Establishes a reusable authenticated browser state for running tests and reconnaissance inside protected application zones using Cypress native session management.

## Workflow
1. **Execution Mode Decision:**
   - Primary: Execute authenticated session caching via \`cy.session('user-session', () => { ... }, { validate() { ... } })\`.
   - Mandatory Validate Callback: Always configure a \`validate\` callback (e.g. cookie/session check or \`cy.request()\`) to detect session expiration and prevent stale session reuse.
   - Interactive & MFA Fallback: If blocked by SSO (Okta, Keycloak, Azure AD), MFA, or TOTP:
     * If \`${sc.envAccess('TOTP_SECRET')}\` is provided, automatically generate TOTP 2FA code (RFC 6238).
     * If developer session cookies are available, import them directly into session setup.
     * Fallback to interactive browser session with manual prompt to the engineer.
2. **Session Architecture:**
   - Register custom authentication command in \`cypress/support/commands.ts\` (e.g. \`Cypress.Commands.add('login', ...)\`).
   - Wrap authentication logic in \`cy.session()\` so Cypress restores cookies, localStorage, and sessionStorage across spec files.
   - Prohibit external state files: do not write credentials or storageState to disk.
3. **CI Environment Alignment:**
   - For CI/CD runs, configure Service Account token injection via environment variables (\`${sc.envAccess('AUTH_TOKEN')}\` / \`${sc.envAccess('E2E_API_TOKEN')}\`).
4. **Fixture Integration:**
   - Call \`cy.login()\` inside \`beforeEach\` hooks across test specs in \`cypress/e2e/\`.
5. **Verification:**
   - Verify session validity by asserting a protected element or querying a protected API endpoint via \`cy.request()\` before proceeding.
`;
  }

  if (sc.authStrategy === 'pytest') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Establishes a reusable authenticated browser state for running tests and reconnaissance inside protected application zones in pytest.

## Workflow
1. **Execution Mode Decision:**
   - Primary (API Fast-Path Token Injection): Execute headless API authentication and write storageState directly to \`.auth/user.json\` via \`apiClient\` for instant zero-browser setup.
   - Dedicated Fixture Script: Run \`fixtures/auth_setup.py\` on-demand (e.g. \`pytest fixtures/auth_setup.py\`) to capture authenticated browser state.
   - Interactive & MFA Fallback: If blocked by SSO (Okta, Keycloak, Azure AD), MFA, or TOTP:
     * If \`${sc.envAccess('TOTP_SECRET')}\` is provided, automatically generate TOTP 2FA code (RFC 6238).
     * If developer session cookies are available, import them directly into storageState.
     * Fallback to headed browser session with manual prompt to the engineer.
2. **Session Serialization:**
   - Capture cookies, localStorage, session tokens, and headers.
   - Serialize state directly into \`.auth/user.json\` (secured with \`create-if-absent\` and strictly excluded from version control).
3. **CI Environment Alignment:**
   - For CI/CD runs, configure Service Account token injection via environment variables (\`${sc.envAccess('AUTH_TOKEN')}\` / \`${sc.envAccess('E2E_API_TOKEN')}\`).
4. **Fixture Integration:**
   - Configure session-scoped \`browser_context_args\` fixture in \`conftest.py\` to preload \`.auth/user.json\` into browser context when present.
5. **Verification:**
   - Verify session validity by requesting a protected endpoint with the embedded \`ApiClient\` before proceeding.
`;
  }

  if (sc.authStrategy === 'csharp') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Establishes a reusable authenticated browser state for running tests and reconnaissance inside protected application zones in C# Playwright.

## Workflow
1. **Execution Mode Decision:**
   - Primary (API Fast-Path Token Injection): Execute headless API authentication and write storageState directly to \`.auth/user.json\` via \`apiClient\` for instant zero-browser setup.
   - Interactive & MFA Fallback: If blocked by SSO (Okta, Keycloak, Azure AD), MFA, or TOTP:
     * If \`${sc.envAccess('TOTP_SECRET')}\` is provided, automatically generate TOTP 2FA code (RFC 6238).
     * If developer session cookies are available, import them directly into storageState.
     * Fallback to headed browser session with manual prompt to the engineer.
2. **Session Serialization:**
   - Capture cookies, localStorage, session tokens, and headers.
   - Serialize state directly into \`.auth/user.json\` (secured with \`create-if-absent\` and strictly excluded from version control).
3. **CI Environment Alignment:**
   - For CI/CD runs, configure Service Account token injection via environment variables (\`${sc.envAccess('AUTH_TOKEN')}\` / \`${sc.envAccess('E2E_API_TOKEN')}\`).
4. **Fixture Integration:**
   - Override \`ContextOptions()\` in the \`PageTest\` base class with \`StorageStatePath = ".auth/user.json"\` to preload authentication state.
5. **Verification:**
   - Verify session validity by requesting a protected endpoint with the embedded \`ApiClient\` before proceeding.
`;
  }

  if (sc.authStrategy === 'java') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Establishes a reusable authenticated browser state for running tests and reconnaissance inside protected application zones in Java Playwright.

## Workflow
1. **Execution Mode Decision:**
   - Primary (API Fast-Path Token Injection): Execute headless API authentication and write storageState directly to \`.auth/user.json\` via \`apiClient\` for instant zero-browser setup.
   - Interactive & MFA Fallback: If blocked by SSO (Okta, Keycloak, Azure AD), MFA, or TOTP:
     * If \`${sc.envAccess('TOTP_SECRET')}\` is provided, automatically generate TOTP 2FA code (RFC 6238).
     * If developer session cookies are available, import them directly into storageState.
     * Fallback to headed browser session with manual prompt to the engineer.
2. **Session Serialization:**
   - Capture cookies, localStorage, session tokens, and headers.
   - Serialize state directly into \`.auth/user.json\` (secured with \`create-if-absent\` and strictly excluded from version control).
3. **CI Environment Alignment:**
   - For CI/CD runs, configure Service Account token injection via environment variables (\`${sc.envAccess('AUTH_TOKEN')}\` / \`${sc.envAccess('E2E_API_TOKEN')}\`).
4. **Fixture Integration:**
   - Initialize browser context in test base class or \`@BeforeEach\` using \`Browser.NewContextOptions().setStorageStatePath(Paths.get(".auth/user.json"))\`.
5. **Verification:**
   - Verify session validity by requesting a protected endpoint with the embedded \`ApiClient\` before proceeding.
`;
  }

  // Default: TypeScript Playwright
  return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Establishes a reusable authenticated browser state for running tests and reconnaissance inside protected application zones.

## Workflow
1. **Execution Mode Decision:**
   - Primary (API Fast-Path Token Injection): Execute headless API authentication and write JWT/session token directly to \`.auth/user.json\` via \`apiClient\` for instant zero-browser setup.
   - Dedicated Setup Project: Execute \`fixtures/auth.setup.ts\` to generate storageState file in \`.auth/user.json\`.
   - Interactive & MFA Fallback: If blocked by SSO (Okta, Keycloak, Azure AD), MFA, or TOTP:
     * If \`${sc.envAccess('TOTP_SECRET')}\` is provided, automatically generate TOTP 2FA code (RFC 6238).
     * If developer session cookies are available, import them directly into storageState.
     * Fallback to headed browser session with manual prompt to the engineer.
2. **Session Serialization:**
   - Capture cookies, localStorage, session tokens, and headers.
   - Serialize state directly into \`.auth/user.json\` (secured with \`create-if-absent\` and strictly excluded from version control).
3. **CI Environment Alignment:**
   - For CI/CD runs, configure Service Account token injection via environment variables (\`${sc.envAccess('AUTH_TOKEN')}\` / \`${sc.envAccess('E2E_API_TOKEN')}\`).
4. **Fixture Integration:**
   - Generate or update authentication fixtures in \`fixtures/auth.setup.ts\` to preload \`.auth/user.json\` into browser context.
5. **Verification:**
   - Verify session validity by requesting a protected endpoint with the embedded \`ApiClient\` before proceeding.
`;
}

function buildOperationalSkills(tool: string, language: string): SkillDefinition[] {
  const sc = resolveStackConventions(tool, language);
  const isCypress = sc.automationTool === 'cypress';
  const frameworkName = sc.frameworkName;

  return [
    {
      name: 'protocol-123',
      description:
        'Executes the rigorous 8-phase SDET Protocol 123 for full-lifecycle test automation, baseline establishment, or maintenance with multi-agent review and adjudicated false-positive filtering.',
      content: `# Skill: Protocol 123 SDET Engineering (/protocol-123, /123)

## Purpose
Executes the deterministic, production-grade 8-phase SDET workflow for test automation, Page Object refactoring, and test suite maintenance with multi-agent review and adjudicated false-positive filtering.

## 8-Phase SDET Lifecycle

### Phase 0: Pre-Flight Baseline
- Execute baseline verification via terminal: \`${sc.testRunCmd}\` to confirm clean initial state.

### Phase 1: Recon, Live Web Search & Ingestion
1. Requirements Ingestion & GIGO Gate:
   - Ingest TMS case via 'tms-validator' (Quality Score >= 80%, atomicity <= 10 steps, concrete expected results).
2. Live DOM & Site Map Reconnaissance:
   - Consult \`artifacts/site-map/site-map.json\`, \`components/pages/\`, and \`components/widgets/\`.
   - Inspect live DOM (3-Tier Locator Priority, shadow DOM, iframes).
3. Live Web Search & Recommendations:
   - Launch Web Search subagents to query official ${frameworkName} and UI library documentation for the target components.
   - Formulate concrete task-specific recommendations for architectural design and test synchronization.

### Phase 2: Invariants Discovery & Spec Formulation (SDD Automation Proposal)
1. Step 2a (Invariants Discovery):
   - Uncover critical positive requirements and negative boundary invariants directly, across the 9 closed taxonomy categories (\`invalid_input\`, \`boundary\`, \`missing_precondition\`, \`concurrent_conflict\`, \`state_violation\`, \`permission_denied\`, \`external_failure\`, \`data_integrity\`, \`error_path\`), grounded in the TMS case and Phase 1's own DOM reconnaissance - the same investigation, continued, not a separate persona's job.
2. Step 2b (Defensive Automation Proposal):
   - 'sdet-architect' embeds explicit protections against those invariants into the deterministic Automation Proposal Artifact before writing code:
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
| Invariants & Defenses | [Discovered boundary conditions and architectural defenses] |
| Step-by-Step Matrix | Step 1..N -> Expected Results -> Web-First Assertions |
\`\`\`

### Phase 3: Plan Review & Adjudication
1. Lead Review: 'sdet-architect' audits the proposal against CPOM contracts, fixture DI, Web-First assertions, and invariant defenses.
2. Adjudication: cross-examine every raw finding directly against Ground Truth (CONVENTIONS.md, AGENTS.md, actual DOM and codebase) - no separate arbiter persona needed, this is a mechanical cross-check anyone doing the review can perform. Classify each finding into exactly one of: \`ACCEPTED [CRITICAL / MAJOR]\` (a real defect - CPOM violation, race condition, unawaited promise, missing teardown), \`DISMISSED: FALSE_POSITIVE\` (the code is actually correct), \`DISMISSED: HALLUCINATED_RULE\` (the finding invents a non-existent rule), or \`DISMISSED: OUT_OF_SCOPE\` (nitpick or refactor outside this task). Output the official Review Verdict Artifact:
\`\`\`markdown
### Review Verdict Artifact
- Status: [APPROVED | REQUIRES_REFINEMENT]
- Findings Processed: N total (M accepted, K dismissed)
- Actionable Fixes: [Exact Line + Concrete Fix]
- Dismissed Findings: [Claimed Issue + Dismissal Reason: FALSE_POSITIVE / HALLUCINATED_RULE / OUT_OF_SCOPE]
\`\`\`

### Phase 4: Human Intent Lock (Sign-off)
- Present Proposal Artifact and Arbiter Verdict to the human engineer.
- BLOCKING GATE: ZERO code is written until explicitly approved by the user.

### Phase 5: TDD Dual Synthesis
1. Step 5a (Shared Primitives First):
   - 'pom-engineer' synthesizes CPOM Page Objects in \`${sc.language === 'java' ? 'src/main/java/components/pages/' : 'components/pages/'}\` and verifies each one against the live DOM.
2. Step 5b (Linear Test Synthesis):
   - Synthesize strictly linear test code directly in \`${sc.specPath('{id}', '{feature}')}\`, following the exact content-fidelity and bracket-grounding process \`/automate-test\`'s own Step 5 defines - never a looser paraphrase.
   - Wrap steps in \`${sc.stepDemarcation('Step N: ...')}\`, inject fixtures via \`${sc.fixturePattern}\`, and register teardown via \`apiClient.registerTeardown()\`.

### Phase 6: Code Review & Adjudication
1. Reviewers inspect \`git diff\` for Web-First matchers, zero sleep, and no assertions inside Page Objects.
2. Cross-examine every diff comment directly against Ground Truth the same way Phase 3 does, and approve final code changes once every finding is ACCEPTED-and-resolved or correctly DISMISSED.

### Phase 7: Two-Strike Self-Healing
- Execute isolated test: \`${sc.testIsolatedCmd(sc.specPath('XXX', 'feature'))}\`.
- If failure occurs, apply \`/heal-test\`'s own 4-Point Trace Triage process directly (network/console first, action timeline + visual diff, locator state, isolated execution) in ${isCypress ? 'screenshots and video' : '\`trace.zip\`'}. Max 2 attempts.
- If still red after 2 attempts, execute Two-Strike rollback: \`git checkout -- <files>\` and output Two-Strike Triage Report:
\`\`\`markdown
### Two-Strike Triage Report
- Triage Category: [FLAKY / TIMING] | [SELECTOR DRIFT] | [PRODUCT BUG]
- Root Cause Evidence: Network status / Console log / DOM screenshot
- Action Taken: Two-Strike rollback executed via git checkout -- <files>
\`\`\`

### Phase 8: Quality Gate & Final Handoff
- Run contract audit: \`${sc.cpomLintCmd}\` and \`${sc.testRunCmd}\`.
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
| Phase 3: Plan Review & Adjudication | 6.2s | 8.4k / 2.2k | $0.016 | PASSED |
| Phase 4: Human Intent Lock | User | 0 / 0 | $0.000 | APPROVED |
| Phase 5: TDD Dual Synthesis | 7.1s | 5.2k / 3.4k | $0.015 | PASSED |
| Phase 6: Code Review & Adjudication | 5.4s | 7.1k / 1.9k | $0.014 | PASSED |
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
      content: renderAuthSetupContent(sc),
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
   - Consult \`artifacts/site-map/site-map.json\` and \`components/widgets/\` for existing shared widgets (e.g. Navbar, Sidebar, Dialog) and compose them via \`this.child(WidgetClass, spec)\`.
   - Generate or update Page Object class inheriting from \`BasePage\`.
   - Group related interactive controls into CPOM primitives (Button, TextInput, Select, Table, Dialog) or collections (\`this.list(ItemComponent, spec)\`).
   - Enforce Method Safety Contract (Actions return ${sc.actionReturnType}, Snapshot readers suffixed with \`${sc.stateReaderSuffix}\`).
4. **Live-DOM Liveness Verification:**
   - Verify every generated Page Object directly against the live application with Web-First assertions before treating it as complete. A raw DOM/accessibility-tree match found during extraction (Step 2) is NEVER sufficient evidence by itself that a real user can see or reach the element - an element present in the markup but hidden (\`display: none\`, off-screen, zero-size, \`opacity: 0\`, or covered by another element) MUST NOT become a CPOM property or method:
     * Tier 1 (Actionable Visibility, checked per element, not per page): (a) \`await locator.count() === 1\`; (b) \`await expect(locator).toBeVisible()\` (non-empty bounding box, not \`visibility:hidden\`/\`display:none\` - this alone does NOT catch \`opacity: 0\`); (c) \`await locator.evaluate(el => getComputedStyle(el).opacity !== '0')\`; (d) \`await locator.click({ trial: true })\` (or \`.fill({ trial: true })\` for text inputs) to run Playwright's full actionability pipeline (stable, receives pointer events i.e. not obscured, enabled) without performing the action - safe even for destructive controls. Any element failing (a)-(d) is a phantom: do not scaffold it, and remove it if an earlier pass already did.
     * Tier 2: State readers (\`valueNow()\`, \`optionsNow()\`, \`rowCountNow()\`).
     * Tier 3: Trigger conditionally-rendered UI non-destructively - not just tabs/accordions, but
       dialogs/drawers (\`Dialog\`), dropdown/select menus, tooltips/popovers, expandable "show more"
       sections, date pickers, and context/overflow menus. If \`site-map.json\` flagged this route's
       \`regions\`/\`components\` with one of these, treat it as a lead to actively trigger, not just
       confirm if already visible. Revealed content still goes through Tier 1 before becoming a
       CPOM property - never click a mutating action to reveal something.
5. **Mandatory Execution & Self-Healing Loop:**
   - Immediately perform the liveness verification via the embedded Playwright MCP tools or an equivalent live check.
   - If failures occur due to locator drift or selector mismatch:
     * Inspect error traces, perform live DOM triage, adjust locators in the Page Object, and re-verify (Two-Strike Rule).
   - If failures are due to genuine application bugs (e.g. backend 500 error, unhandled JS exception, broken UI component):
     * Do NOT modify anything to hide the bug. Explicitly document and report the real product defect.
   - Batch Swarm Mode barrier: ${sc.language === 'typescript' ? 'once every dispatched worker reports done, run `node scripts/orchestrate-swarm.mjs --phase=verify --targets=<comma-separated Page Object paths each worker was expected to produce>` to confirm every worker actually wrote its file before declaring the batch complete.' : 'once every dispatched worker reports done, confirm each target Page Object was produced before declaring the batch complete.'}
6. **Mandatory Handoff Report:**
   - Present a structured summary listing generated Page Objects, liveness verification status (pass/fail counts), and any detected real application defects.
   - PROHIBIT delivering unverified or red code to the user without explicit defect reporting.
`,
    },
    {
      name: 'automate-test',
      description:
        'End-to-end automation from a TMS ticket or a locally-drafted test case to a verified green test.',
      content: `# Skill: Automate Test (/automate-test)

## Purpose
Transforms a test case - from Jira, TestRail, Zephyr, Azure DevOps, or drafted locally by \`/design-test-cases\` - into a fully verified automated test.

## Workflow
1. **Intake (source resolution, before anything else):**
   * Compute, deterministically, before asking anything: whether the user named an explicit case/ticket ID; whether at least one TMS/task-tracker provider is available right now (the \`mcp__tms__*\` tools are present in this conversation); whether \`artifacts/test-cases/test-cases.json\` exists with at least one journey carrying a \`testCase\` and \`reviewed: false\`.
   * **General principle governing every branch below**: ask a clarifying question only when at least two genuinely different sources are actually possible. When exactly one source could plausibly be meant, proceed with it directly instead of asking a question with only one real answer - a question that cannot change the outcome only adds friction.
   * **Arrived directly from \`/ground-zero-setup\`'s own chain**: skip every question below entirely - it already established there is nothing else to automate but the test cases \`/design-test-cases\` just drafted. Use them directly.
   * **An explicit case/ticket ID was named** (e.g. "automate T001", "automate AZURE-789"):
     - No TMS/task-tracker is configured: say so plainly - that ID can't be resolved without one - and ask whether the human meant a locally-drafted test instead (name how many exist, if any), or wants to configure a TMS connection first. Do not guess which one they meant.
     - Exactly one provider is configured: confirm once, briefly, naming it before fetching anything - e.g. "Take {id} for automation from {provider}?" - since a bare ID alone doesn't yet confirm intent. ${INTERACTIVE_CHOICE_NOTE}
     - More than one provider is configured: if the ID's own format already names a provider unambiguously, proceed without asking; otherwise ask which provider it belongs to. ${INTERACTIVE_CHOICE_NOTE}
     - Once the source is settled, fetch ticket details via \`mcp__tms__get_test_case({ caseId, provider })\`.
   * **No explicit ID was named:**
     - No un-automated local drafts exist (the file is missing, or every entry is already \`reviewed: true\`):
       - No TMS/task-tracker is configured either: refuse plainly - print exactly: "Nothing to automate yet. Run /design-test-cases to draft test cases locally, or name a specific TMS ticket ID." Do not proceed.
       - A TMS/task-tracker is configured: ask which test(s) to automate and from where - there is no local default to offer. ${INTERACTIVE_CHOICE_NOTE}
     - Un-automated local drafts exist:
       - No TMS/task-tracker is configured: proceed directly with every un-automated local draft - it is the only source that could possibly exist, so a question here would have only one real answer.
       - A TMS/task-tracker is configured too: ask one short question offering the local drafts as the recommended default, with a TMS ticket ID named as the alternative - e.g. "Automate the N test cases drafted locally? (or name a TMS ticket ID instead)". ${INTERACTIVE_CHOICE_NOTE}
   * For the locally-sourced path (whichever branch above led here): read \`artifacts/test-cases/test-cases.json\`, scoped to every journey with a \`testCase\` and \`reviewed: false\` unless the human named a narrower subset. Treat each selected journey's \`testCase\` (\`title\`/\`preconditions\`/\`steps\`) as this ticket's content for every step below - Steps 2-8 apply identically regardless of source, except where a step below says otherwise.
   * Mask any PII, credentials, or proprietary tokens before processing, regardless of source.
2. **TMS Quality Validation (GIGO Protection):**
   - Delegate test case to 'tms-validator' to audit atomicity (steps <= 10), expected results verifiability, and TDM prerequisites.
   - If Quality Score < 80%, halt execution and present a structured Rejection Report with remediation recommendations for the test author.
3. **Component Resolution & Gap Analysis:**
   - Consult \`artifacts/site-map/site-map.json\` and \`components/pages/\` to resolve target routes, Page Objects, and shared widgets.
   - If components are missing, trigger \`/scan-and-generate-pom\` to generate and liveness-verify the required Page Objects.
   - If a step needs a file-upload fixture (image, PDF, CSV, or a deliberately-wrong-format file for a negative case) or a bulk/structured dataset beyond \`ApiClient\`'s scalar synthetic-data helpers (\`createTestEmail()\`, \`createTestUuid()\`, etc.), delegate to \`test-data-engineer\` rather than inventing one inline.
4. **Human Sign-Off Gateway (Proposal Artifact & Batch Mode):**
   - Single Ticket: Present a concise Markdown automation proposal artifact with Ticket ID, Target Route, Page Objects used, Execution Plan, and TDM strategy.
   - Batch Mode: When automating multiple tickets, synthesize a unified **Batch Proposal Matrix** table enabling **1-Click Batch Approval** across all scenarios at once without chat fatigue.
   - BLOCKING GATE: Wait for explicit user confirmation before synthesizing test code. ${INTERACTIVE_CHOICE_NOTE}
5. **Linear Test Code Synthesis (SOTA 2026):**
   - **Content fidelity is mandatory, not just structural compliance (found violated in live use - a test with correct step demarcation, fixture DI, and linear structure that still asserted nothing real).** Every step's body must perform the literal action its \`description\` names, using a real Page Object interaction (\`.selectOption()\`, \`.check()\`, \`.fill()\`, \`.click()\` on the actual child element - never a generic visibility check on an unrelated container standing in for it), and assert the literal value its \`expectedResult\` names (the actual text/value/status code mentioned - never a content-free assertion like \`toBeDefined()\` or \`toBeVisible()\` on something the step never touched). If the target Page Object has no child element for what a step needs to interact with, that is a real gap: fix it via Step 3's \`/scan-and-generate-pom\` trigger first - never paper over the gap by writing a step that quietly checks something else instead.
      - **Bad** (real code from an earlier run - structurally compliant, semantically empty): step titled \`Verify baseline workflow: enter language="en"\` whose body is only \`await expect(rootPage.primaryContainer.locator).toBeVisible()\` - never touches the language control, would pass identically if language selection were completely broken.
      - **Good**: \`await rootPage.languageSelect.selectOption('en'); await expect(rootPage.languageSelect.locator).toHaveValue('en');\` - the code does what the step says, and the assertion would actually fail if selection stopped working.
   - **Bracketed step text is the locator's name, verbatim.** When a drafted step references a bracketed literal (\`Click the [Place Order] button\`, \`Select the [Card] payment method\`), the synthesized locator targets exactly that accessible name (\`page.getByRole('button', { name: 'Place Order' })\`, or the matching Page Object child) - never a paraphrase, a different label spotted on the live page, or a role-only locator that drops the name entirely. If a bracketed name doesn't resolve to anything in the target Page Object, that's the same real gap Step 3's \`/scan-and-generate-pom\` trigger exists for - fix the Page Object, never quietly substitute a different element.
   - **Corroborate state-changing steps with every genuinely available independent signal, not just one.** For a step whose action creates, updates, or removes something, UI-visible-change + API-response validation (matched against the actual submitted values, not just a 2xx status) is the floor, not the ceiling: also assert whatever else this specific app actually surfaces for that change, when it's genuinely discoverable - a success toast/notification if the app shows one, a related list/detail endpoint or UI table that should now include (or exclude) the entity, an unambiguous page-state transition. Example: a test that creates a plan via a form also asserts the create response's data matches the submitted fields, then queries or navigates to the plans list and asserts the new plan is present there - not only that the creating request returned success. Never assert a signal the app doesn't actually provide - corroboration is bounded by what's genuinely there to check, not an invented one.
   - Synthesize strictly linear ${frameworkName} (${language}) test code with ZERO branching (\`if/else\`, loops) in \`${sc.specPath('{id}', '{feature}')}\` for both a TMS-sourced ticket (\`{id}\` is the real ticket ID) and a locally-sourced journey (\`{id}\` is \`TC-{seq}\`, a 3-digit zero-padded sequence number). For \`{seq}\`: scan the directory this spec is written into for the highest existing \`TC-NNN\` prefix from any source and use NNN+1 - never reuse a number, never restart the counter per run, and never derive it from \`journeyId\` (illegible and unnecessary once it's not doing filename duty). Carry the journey's full traceability identity as a tag instead of in the filename: add \`@journey:{first 12 characters of journeyId}\` to this test's tag/attribute list (alongside the \`@smoke\`-style tag below) so a human or another agent can still trace the file back to its source journey without a hash in the visible name.
   - Use Fixture Dependency Injection via \`${sc.fixturePattern}\` to supply Page Objects and ApiClient instances.
   - Embed metadata tags per language conventions (e.g. \`${sc.language === 'python' ? '@pytest.mark.smoke' : sc.language === 'csharp' ? '[Category("smoke")]' : sc.language === 'java' ? '@Tag("smoke")' : "{ tag: ['@smoke'] }"}\`).
   - Wrap every step in \`${sc.stepDemarcation('Step N: ...')}\` - the step's own body is exactly where content fidelity above applies.
   - Map every expected result to an auto-retrying Web-First assertion (\`${sc.assertionPattern}\`) that names the concrete expected value, never a bare truthy/definedness check.
   - For popup, dialog, or navigation triggers, use Race-Free Event Synchronization: \`${sc.asyncEventSync}\`.
   - Register cleanup teardown ${sc.language === 'python' ? 'via fixture yield or `api_client` register_teardown' : 'in teardown hooks or fixture teardown via `apiClient`'}.
6. **Assertion Audit & Side-Effect Verification:**
   - Audit test with \`assertion-auditor\` to eliminate fake-green patterns and verify multi-source corroboration (the UI + API floor, plus whatever else was genuinely available and wired up) - explicitly including the content-fidelity and bracket-grounding checks above: flag any step whose assertion doesn't reference something the step's own action actually touched, or whose locator doesn't match the drafted step's bracketed name.
   - Verify CPOM contract compliance via \`${sc.cpomLintCmd}\`.
7. **Execution & Self-Healing:**
   - Run the newly synthesized test via terminal: \`${sc.testIsolatedCmd(sc.specPath('{id}', '{feature}'))}\` (or run full suite via \`${sc.testRunCmd}\`).
   - If failure occurs, automatically trigger \`/heal-test\` under the Two-Strike Rule.
   - **TMS-sourced ticket:** publish execution results back to TMS via \`mcp__tms__post_test_result\`.
   - **Locally-sourced journey:** once the test passes, set that journey's \`reviewed: true\` and \`reviewedBy: 'human'\` in \`artifacts/test-cases/test-cases.json\` - this skill's own Step 4 confirmation already is the human sign-off; there is no TMS entry to publish results to. Also set that file's top-level \`lastUpdatedAt\` to now, the same idiom \`artifacts/site-map/site-map.json\` already uses for its own updates - this is what lets \`scripts/pipeline-status.mjs\` report Stage 4's own completion time instead of leaving it blank.
8. **Final Report:**
   - Present the resulting test diff, execution logs, and verification status to the user.
   - For a locally-sourced batch, also state how many \`artifacts/test-cases/test-cases.json\` entries were marked \`reviewed: true\` this run.
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
   - Ingest execution failure artifacts (${isCypress ? 'screenshots, video, console logs' : '\`trace.zip\`, screenshots, video, console logs'}).
2. **4-Point Trace Triage (Fail-Fast Real Bug Detection):**
   - Check Network Waterfall (HTTP 4xx/5xx) and Console Errors first. If a server crash or unhandled runtime exception occurred, classify as **REAL PRODUCT BUG**; do NOT alter Page Objects.
   - Action Timeline, DOM Snapshots & Visual Diff: Determine if target was obscured, animated, or detached. Perform **Visual Diff & Screenshot Overlay** comparing pre-failure and post-failure frames to distinguish **Semantic Text/Icon Shift** from a broken UI render and calculate **Visual Confidence**${isCypress ? ' using screenshots and video recordings' : ' in \`trace.zip\`'}.
   - Locator State: Inspect element counts, visibility, and attachment.
3. **Classification & Targeted Fix:**
   - Selector drift -> update locator in CPOM component adhering to 3-Tier Locator Priority.
   - Timing / race condition -> add auto-retrying web-first assertion or state wait.
   - Test data collision -> switch to dynamic TDM via \`apiClient.createUniqueId()\` / \`createTestEmail()\`.
4. **Attempt 1 Fix & Isolated Execution:**
   - Apply targeted fix and execute ONLY the isolated failing test spec (e.g. \`${sc.testIsolatedCmd(sc.specPath('XXX', 'spec'))}\`).
   - If Page Objects were modified, re-verify them against the live DOM to ensure neighbor components remain healthy.
5. **Attempt 2 Refined Fix:**
   - If still failing, analyze secondary ${isCypress ? 'screenshots and logs' : 'trace'} and apply refined fix.
6. **Rollback & Escalation (Two-Strike Rule):**
   - If still failing after 2 attempts, immediately roll back all modified files: \`git checkout -- <modified_files>\`.
   - Report root cause under taxonomy: \`[FLAKY / TIMING]\`, \`[SELECTOR DRIFT]\`, or \`[PRODUCT BUG]\` with ${isCypress ? 'screenshot and log' : 'trace'} evidence.
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
   - Run the existing test suite (\`${sc.testRunCmd}\`) to identify broken components, and map each failing test back to its route.
2. **Parallel Worker Swarm (Fan-Out / Fan-In):**
   - Run \`node scripts/orchestrate-swarm.mjs --phase=plan --routes=<comma-separated affected route paths from Step 1>\` and dispatch parallel 'pom-engineer' worker subagents (Worker Swarm) per its Level 2 worker list for high-speed concurrent rescanning - scoping via \`--routes\` keeps this to exactly the affected, non-overlapping routes rather than the whole site.
3. **Component Locator Update:**
   - Update component locators and selectors inside Page Object classes adhering to 3-Tier Locator Priority.
   - Preserve existing public Page Object method signatures to avoid breaking test spec contracts.
4. **Component Liveness Verification & Healing:**
   - Re-verify each updated Page Object against the live DOM to guarantee 100% component liveness.
   - If any component fails verification, apply targeted locator fix under the Two-Strike Rule until Green.
5. **Business Suite Regression Confirmation:**
   - Re-run dependent business test suites (\`${sc.testRunCmd}\`) to confirm all tests pass green without modifying any test spec files.
`,
    },
    {
      name: 'map-site',
      description:
        'Crawls application routes, builds site topology map, and identifies shared reusable widgets. Two modes: create (fresh crawl) and update (incremental, content-hash-gated). Also automatically performs read-only business-intent/criticality inference (gated by mechanical validation and human sign-off) as part of every pass, and supports one further optional, explicit-request-only step: Page Object generation for mapped routes.',
      arguments: ['mode'],
      argumentHint: '[create|update]',
      disableModelInvocation: true,
      content: `# Skill: Map Site (/map-site create, /map-site update)

## Purpose
Crawls the application page graph with authenticated session, builds the complete route topology in \`artifacts/site-map/site-map.json\`, and detects recurring UI components for shared widget deduplication. Two modes, chosen by the argument this skill was invoked with:
- \`create\` (default if no argument given): full fresh crawl of every route. **If \`artifacts/site-map/site-map.json\` already exists, this discards it entirely** - every route's \`routeId\` identity resets too (only \`update\` preserves \`routeId\` - see Mode Resolution below and Step 3b), so anything keyed by \`routeId\` in a downstream artifact (e.g. \`artifacts/analysis/business-intent.json\`) becomes orphaned.
- \`update\`: incremental pass over already-known routes plus discovery of new ones - see Step 3b. **If \`artifacts/site-map/site-map.json\` does not exist yet, there is nothing to update against** - see Mode Resolution below.

Playwright browser access for this crawl comes from this project's MCP configuration (\`.mcp.json\`, \`.agents/mcp_config.json\`, \`.codex/config.toml\`, or \`.vscode/mcp.json\`, whichever your assistant reads). **Windsurf is the one exception**: Cascade has no per-project MCP mechanism at all - its MCP servers are configured once, globally, via Windsurf's own Settings -> Cascade -> MCP Servers (or by editing \`~/.codeium/windsurf/mcp_config.json\` directly). If you're running this in Windsurf and browser tools aren't available, that one-time global step is what's missing, not something this repo can provide.

## Mode Resolution
- \`update\` requested but \`artifacts/site-map/site-map.json\` does not exist: print "No existing artifacts/site-map/site-map.json found - running a full create pass instead." and proceed exactly as \`create\` - never silently redirect without saying so.
- \`create\` requested and \`artifacts/site-map/site-map.json\` already exists and parses validly: before doing anything else, print "Found an existing site-map.json with <N> routes (last touched <lastUpdatedAt or generatedAt>). create starts fresh: routeId identity resets for every route, so any downstream artifact keyed by routeId (e.g. artifacts/analysis/business-intent.json) will need re-review. Use /map-site update instead to refresh in place and preserve routeId/history." Then proceed.

## Reporting to the User
Every mechanical gate in this skill (\`validate-site-map.mjs\`, \`validate-business-intent.mjs\`, the coverage cross-check) is implementation detail, not user-facing signal - it exists so a malformed artifact never reaches a human or a downstream skill, not to be narrated. When summarizing what this run did, describe outcomes in plain terms a non-technical reader would understand ("site crawled - 28 routes found", "business-intent analysis complete, ready for your review") - never name an internal script file or report that something "passed validation" as if that fact means something to the person reading it. If a gate actually fails, that's a real problem to surface and fix per its own step below - this rule is about routine success, not about hiding real failures.

## Workflow
1. **Authenticated Session Loading:**
   - ${isCypress ? 'Load authenticated session via cy.session() or developer cookies.' : 'Load authenticated storage state from \`.auth/user.json\` (or fallback to \`auth.json\`).'}
   - If not authenticated, prompt engineer to execute \`/auth-setup\`.
2. **Concurrent Route Exploration & Pagination Normalization (Worker Pool):**
   - Execute parallel crawling with worker pool (\`concurrency = 4..6\`) and canonical URL normalization.
   - Automatically strip volatile pagination and cursor query parameters (\`page\`, \`offset\`, \`cursor\`, \`limit\`, \`per_page\`) to collapse dynamic feeds into single canonical routes and eliminate crawler loop traps.
   - Canonicalize dynamic path segments the same way: a numeric ID, UUID, or per-record slug collapses into a path template (\`/users/42\` and \`/users/43\` both become \`/users/{id}\`) instead of producing one route per record.
   - Discover internal application links within base domain origin. **Track how each link was actually found, per link, not per route**: \`nav-reachable\` when the anchor is visible and interactable (\`locator.isVisible()\`) on a page you've actually rendered - part of what a real user could click through; \`href-scan-only\` when the only evidence is a raw \`href\` attribute with no visible/clickable counterpart on any page you visited (hidden via \`display: none\`, zero-size, or never rendered at all). A route reached by at least one \`nav-reachable\` link gets \`discoveryMethod: "navigation"\`; a route reached ONLY by \`href-scan-only\` links gets \`discoveryMethod: "href-scan-only"\` - record this on the route entry in Step 3a/3b, it feeds the Generic Error-Shell Detection check below.
   - Extract page routes, titles, and major structural DOM regions (\`header\`, \`nav\`, \`aside\`, \`main\`, \`footer\`, \`table\`, \`dialog\`).
   - Bound traversal with a maximum crawl depth of 6 hops from the start URL and a maximum of 500 pages visited, to prevent infinite loops. Limit live exploration scrolls to maximum 2 viewports.
   - If either bound is actually hit before the crawl naturally exhausted every discoverable link, record it - see the \`coverage\` field below. Do not silently return a partial route list as if it were complete.
   - **In-situ Viewport Screenshot Capture (Visual Baseline):**
     Immediately upon arrival at each active route (1280x800 viewport), capture an initial viewport snapshot:
     * Format & Size: \`type: 'jpeg', quality: 75\` (or \`type: 'webp', quality: 75\`), \`scale: 'css'\` (prevents Retina 4x memory explosion), \`caret: 'hide'\`, \`fullPage: false\`. Never capture unbounded full-page screenshots.
     * Security & Context Guard: NEVER inline base64 image strings into prompts, tool calls, context, docstrings, or artifacts. Save only compressed binary files (.jpg/.webp) directly to disk at \`artifacts/site-map/screenshots/<routeId>.(webp|jpg|jpeg)\` and reference only the relative filesystem path.
     * Readiness Gate (max aggregate budget: 3000ms): wrap the capture block in an enclosing timeout ceiling (e.g. \`Promise.race([captureBlock(), timeout(3000)])\`). Await \`domcontentloaded\`; pass non-mutating CSS zeroing in the screenshot call (\`style: '*, *::before, *::after { transition: none !important; animation: none !important; }'\`); execute font readiness and loader detachment concurrently via \`Promise.allSettled([page.evaluate(() => Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1200))])), page.locator('.spinner, [aria-busy="true"], .skeleton, .loading').first().waitFor({ state: 'detached', timeout: 1200 })]).catch(() => {})\`; flush rendering via double \`requestAnimationFrame\`.
     * Safe-Fail Boundary: wrap the entire capture routine in a non-fatal \`try/catch\` with an aggregate 3000ms ceiling. If capture fails or times out, log a warning and proceed without \`screenshot\` or \`visualTriage\` fields for that route — never fail or abort the crawl on screenshot failure.
     * Save to: \`artifacts/site-map/screenshots/<routeId>.jpg\` (or \`.webp\`).
   - **Selective Visual Triage Gate (Heuristic Trigger):**
     Evaluate lightweight heuristics on the initial page state:
     * Check for suspicious URL/title tokens: \`login\`, \`signin\`, \`auth\`, \`forbidden\`, \`unauthorized\`, \`403\`, \`404\`, \`500\`, \`error\`, \`maintenance\`.
     * Check interactive element density: fewer than 3 interactive elements (\`button\`, \`a[href]\`, \`input\`, \`select\`, \`textarea\`) in \`<main>\` or \`<body>\`.
     * Check modal/overlay presence: high z-index overlay, backdrop, or dialog obscuring >50% of the viewport.
     * If any heuristic triggers, synthesize a \`visualTriage\` object: \`state\` (\`ready\` | \`auth_wall\` | \`access_denied\` | \`error_page\` | \`empty_state\`), optional \`blockingOverlay\` (boolean), optional \`confidence\` (\`high\` | \`medium\` | \`low\`), and optional \`flags\` (array of up to 10 alphanumeric/kebab-case tokens, <=50 chars, e.g. \`['no-interactive-elements', 'suspicious-title-403']\`). If no heuristic triggers, omit \`visualTriage\` or emit \`state: "ready"\`.
3a. **Deterministic Site Topology Synthesis (create mode):**
   - Generate \`artifacts/site-map/site-map.json\` conforming exactly to \`.scaffold/schemas/site-map.schema.json\`: an object with \`schemaVersion\` (2), \`generatedAt\`, \`baseUrl\`, and a \`routes\` object keyed by canonical path template (never an array) — each entry carrying a \`routeId\` stable across URL restructuring, \`sampleUrls\`, \`title\`, \`regions\`, \`components\`, \`discoveredAt\`, \`lastCheckedAt\` (same value as \`discoveredAt\` on first creation), \`contentHash\` (see below), \`status: "active"\`, and optionally \`screenshot\` and \`visualTriage\` when captured in Step 2. Serialize \`routes\` keys in sorted order so a re-run's diff only shows routes that actually changed.
   - \`routeId\`: generated once, at the moment a route is first discovered (by a \`create\` pass or by \`update\` finding a genuinely new route) - a fresh, globally-unique identifier (e.g. a UUID). Never derive it from the path template and never regenerate it later for the same logical route; see Step 3b for how \`update\` preserves it. Bad: \`routeId: "users-id"\` (derived from the path template \`/users/{id}\` - breaks the moment that route is renamed to \`/customers/{id}\`). Good: \`routeId: "3f9a2b7e-4c1d-4e8a-9f2b-1a7c6d5e4f3a"\` (a fresh UUID, independent of the path entirely).
   - Write \`discoveryMethod\` (\`"navigation"\` | \`"href-scan-only"\`) per Step 2's tracking onto every route entry.
   - **Generic Error-Shell Detection (cross-route, mechanical, zero model involvement):** once every route in this pass has a \`contentHash\`, group routes carrying \`empty_state\` or \`no-interactive-elements\` in \`visualTriage.flags\` (from Step 2) by identical \`contentHash\`. A hash shared by >= 2 such routes is almost certainly the application's own generic empty/error shell rendered identically regardless of the requested path (a 404/blank fallback), not distinct real content - this needs no literal \`404\`/\`error\` token in the title or URL, since a generic-shell app never puts one there. For every route in that group whose \`discoveryMethod\` is \`"href-scan-only"\`, set \`visualTriage.state: "error_page"\` and add \`likely-phantom-route\` to \`visualTriage.flags\`. Never apply this downgrade to a \`"navigation"\`-discovered route sharing the same hash - a real, nav-reachable page can legitimately render sparse content that happens to match another page's structure, and being reachable through actual navigation is independent evidence it is a real route.
   - If Step 2's crawl hit its own depth or page-count ceiling, set a top-level \`coverage: { "boundedBy": "maxDepth" | "maxPages", "pagesVisited": <n> }\` field so a human can tell the route list may be incomplete. Omit \`coverage\` entirely when the crawl exhausted every discoverable link on its own - its absence means completeness, the same idiom \`lastUpdatedAt\`'s absence already uses for "never updated."
   - If an existing \`artifacts/site-map/site-map.json\` is missing \`schemaVersion\` or does not parse under this schema, treat it as absent and regenerate fresh rather than attempting to migrate it in place. A from-scratch \`create\` pass prunes any \`status: "removed"\` entries from a prior file, and resets \`routeId\` for every route - it starts clean (see Mode Resolution above for the required warning before this happens).
   - \`contentHash\` is a hash (e.g. SHA-256) of the normalized structural signal for the route: \`title\` plus sorted \`regions\` plus sorted \`components\`, joined into one string - NOT raw HTML, which is too noisy (whitespace, analytics scripts, embedded timestamps cause false-positive "changed" signals). Compute it the same way every time; \`update\` mode's cheap-skip logic depends on that consistency.
3b. **Incremental Update Synthesis (update mode) - the reason this is cheaper than \`create\`:**
   - For every route already in \`artifacts/site-map/site-map.json\`: re-fetch just enough of that route's page shell to recompute \`title\`/\`regions\`/\`components\`, then recompute \`contentHash\`. This route's \`routeId\` MUST stay exactly as it already is - \`update\` never reassigns it; that stability across a URL restructure is the entire reason \`routeId\` exists separately from the path template.
     * Hash unchanged -> the route's real structure hasn't changed. Check self-healing: if \`screenshot\` is missing from the route entry OR the referenced file is absent on disk (\`!fs.existsSync(path.resolve(process.cwd(), screenshot))\`), re-capture the screenshot and triage per Step 2, setting \`screenshot\`/\`visualTriage\` accordingly. Otherwise, preserve the existing \`screenshot\` and \`visualTriage\`. Only bump \`lastCheckedAt\`; skip full component re-extraction and shared-widget re-mining for this route entirely.
     * Hash changed -> run the same full extraction \`create\` mode does for this one route (Steps 2-3a's per-route logic, including fresh screenshot and visual triage), and update \`lastCheckedAt\`/\`contentHash\`/\`discoveredAt\`-adjacent fields accordingly.
     * Route no longer resolves (404, vanished from nav) -> set \`status: "removed"\` rather than deleting the entry, so removal history is visible; do not include it in shared-widget mining.
   - Any link discovered during this pass that isn't already a known route -> add as a new entry with \`status: "active"\` and a freshly generated \`routeId\` per Step 3a's rule, same as a fresh \`create\` would.
   - Update the top-level \`coverage\` field the same way Step 3a does (set it if this pass hit a bound, omit it if this pass's crawl was exhaustive), rather than leaving a stale value from a prior run.
   - Set the file-level \`lastUpdatedAt\` to now. Leave \`generatedAt\` untouched - it's the original creation timestamp.
3c. **Mechanical Shape Gate:**
   - Run \`node scripts/validate-site-map.mjs\` immediately after writing \`artifacts/site-map/site-map.json\` (either mode). If it exits non-zero, fix the reported errors before proceeding to Step 4 - never hand off a malformed site map to shared-widget mining, the swarm dispatcher, or \`artifacts/analysis/business-intent.json\`'s Step 6, all of which key off it.
3d. **Coverage Cross-Check (Optional Signal, Read-Only):**
   - Run \`node scripts/check-sitemap-coverage.mjs\`. This looks for the target site's own published \`sitemap.xml\` (via \`robots.txt\`'s \`Sitemap:\` directive, or the conventional \`/sitemap.xml\` path) and compares it against the routes this crawl actually found - most sites don't publish a sitemap.xml at all, so \`status: "SKIPPED"\` is a normal, silent outcome, never an error to fix.
   - If it reports \`status: "CHECKED"\` with a non-empty \`gaps\` array, add one short informational note to this step's summary (not a blocking gate, not part of the Human Sign-Off Gateway below): "Coverage note: the site's sitemap.xml lists <N> route(s) this crawl didn't reach: <canonicalPath list>. Consider /map-site update or a manual look." State plainly that a listed gap can be a false positive for a per-record-slug route the crawl already templated differently (the checker mirrors this skill's numeric-ID/UUID canonicalization, not its slug judgment) - it's a prompt to double-check, not a proven miss.
4. **Shared Widget Mining (Deduplication Engine):**
   - Identify recurring component structures appearing across >= 2 \`active\` routes (exclude \`removed\` routes from this analysis).
   - Synthesize reusable widgets in \`${sc.widgetPath('<name>')}\`.
   - Update Page Objects to compose shared widgets via \`this.child(WidgetClass, spec)\` rather than duplicating code.
   - ${sc.language === 'typescript' ? 'Run `node scripts/orchestrate-swarm.mjs --phase=reindex` so `components/widgets/index.ts` picks up any newly-added widgets deterministically, without write collisions from parallel workers.' : 'Ensure any newly added widgets in components/widgets/ are registered and exported per project conventions.'}
5. **Orchestrated Fan-Out to POM Engineers (Optional on User Request):**
   - If the user explicitly requested generating Page Objects for the mapped routes:
     * ${sc.language === 'typescript' ? "Run `node scripts/orchestrate-swarm.mjs --phase=plan` (this file's own `artifacts/site-map/site-map.json` output feeds it directly) and dispatch parallel 'pom-engineer' worker subagents per its Level 2 worker list (1 route per worker) - do not enumerate routes/workers yourself." : "Dispatch parallel 'pom-engineer' worker subagents (1 route per worker) to synthesize Page Objects for each mapped route."}
     * Ensure each 'pom-engineer' synthesizes 1:1 Page Objects in \`${sc.language === 'java' ? 'src/main/java/components/pages/' : 'components/pages/'}\` AND verifies each one against the live DOM.
     * ${sc.language === 'typescript' ? 'Execute a global barrier synchronization via `node scripts/orchestrate-swarm.mjs --phase=verify --targets=<comma-separated Page Object paths each worker produced>` - confirm 100% Green component liveness across all workers before completing.' : 'Confirm 100% Green component liveness across all workers before completing.'}
6. **Business-Intent & Criticality Analysis (Automatic, Strictly Read-Only):**
   - Runs automatically for every active route, as part of both \`create\` and \`update\`, immediately after Step 4 - no separate request needed, unless the user explicitly asked to skip it (e.g. "just map the site, skip business-intent"):
     * Run \`node scripts/orchestrate-swarm.mjs --phase=plan\` (add \`--routes=<a,b,c>\` to scope to a subset) and dispatch one read-only analysis worker per \`active\` route from its Level 2 worker list - do not enumerate routes/workers yourself.
     * **Strictly read-only. Allowlist, not denylist**: each worker may ONLY use non-mutating read operations against the target route - text/attribute reads (\`.textContent()\`, \`.getAttribute()\`, accessibility-tree snapshots, \`page.title()\`) after a single navigation (a GET-equivalent read) to the route's \`sampleUrls[0]\`. Never call \`.click()\`, \`.fill()\`, \`.check()\`, \`.selectOption()\`, or any other action method - not even a \`trial: true\` dry-run - and never focus or read the live *value* of a form field (a pre-filled field may hold real session/account data). Infer intent purely from static, non-user-specific signal: page title, heading text, form field LABELS (the label text, never the field's current value), button/link visible text, and ARIA roles/names.
     * **PII/session-data guard on evidence excerpts**: every \`evidence[].excerpt\` MUST be a short (<=100 char) fragment of static label/heading/button text only, never a copied value from page content that could carry the signed-in user's real account data - mask any email, phone number, token, or numeric-ID-shaped text - a run of 6 or more consecutive digits, or an alphanumeric token of 8+ characters where digits are the majority of its characters - as \`[REDACTED]\` before writing an excerpt.
     * For a route whose \`contentHash\` in \`artifacts/site-map/site-map.json\` is unchanged since that route's \`sourceContentHash\` in an existing \`artifacts/analysis/business-intent.json\`, skip re-inference for that route entirely and keep its existing entry - mirrors \`update\` mode's own cheap-skip logic in Step 3b.
     * For every other active route, infer \`businessFeature\` (a label, <=40 characters, e.g. "Checkout", "Account Settings") and \`criticalityTier\` (\`critical\`/\`high\`/\`medium\`/\`low\`), each wrapped as a \`Field<T>\` (\`value\`, \`confidence\`, \`source\`, \`reasoning\`, \`evidence\`) per \`.scaffold/schemas/business-intent.types.ts\`.
     * **Criticality checklist (evidence-anchored, not free inference)** - assign \`criticalityTier\` by matching the route's evidence against these criteria, most severe match wins: \`critical\` - route path or any evidence excerpt matches a payment/checkout/billing keyword, or an auth-lifecycle keyword (login, password, 2fa, mfa, delete-account), or a \`form-labels\` evidence entry names a password-type field. \`high\` - the route appears in a \`nav\`/\`header\` region in \`artifacts/site-map/site-map.json\`, or its path/heading matches a core-flow keyword (dashboard, account, profile, settings, orders, create/new/edit-*). \`medium\` - functional but secondary (tools, search, filters, secondary settings sub-pages) and matches neither of the above. \`low\` - static/informational content (about, terms, privacy, contact, help, FAQ, marketing) with no interactive form. If a route mixes functionality of different criticality (e.g. a low-value settings page with an embedded account-deletion action), \`criticalityTier\` is the MAXIMUM tier found on the route, never an average or the majority.
     * **Confidence is computed from evidence signal strength, never chosen freely**: \`confidence\` is \`high\` when any evidence entry's \`signal\` is \`heading-text\`, \`aria-roles\`, or \`manual\`; \`medium\` when the strongest signal present is \`form-labels\` or \`button-link-text\`; \`low\` when only \`route-path\` evidence exists. \`scripts/validate-business-intent.mjs\` mechanically checks this - do not guess a value the evidence doesn't support.
     * **\`criticalityTier.reasoning\` must read like an explanation for a human, not a mechanism trace**: one plain-language sentence naming the concrete functionality or content actually found on the route, and why that matters for this kind of application (e.g. "This route lets a user permanently delete their account, which the system treats as critical because an irreversible destructive action needs the highest test priority.") - never reference the checklist or confidence rule by name ("matches medium checklist", "per the criticality rubric", "matches critical checklist criteria") and never restate the evidence excerpt verbatim; the validator rejects a \`reasoning\` that exactly equals its own evidence excerpt. \`businessFeature.reasoning\` follows the same non-empty, not-a-restatement rule but can be terser - the label is usually self-evident from its own evidence.
     * Every inference MUST carry at least one \`evidence\` entry naming the literal signal and text excerpt it came from; never emit a value with no evidence.
     * Write the result to \`artifacts/analysis/business-intent.json\` conforming to \`BusinessIntentReport\` (\`schemaVersion: 1\`, keyed by \`routeId\`), with every new/changed entry's \`reviewed\` set to \`false\`.
     * **Self-verification pass (before Core-Purpose Inference, zero new tooling)**: for every entry just drafted or changed, re-check its \`criticalityTier.value\` against the checklist above - does the cited evidence actually match the claimed bucket's criteria? If not, downgrade it to the tier the evidence genuinely supports before writing the file. This is a checklist-conformance check, not a substitute for the Human Sign-Off Gateway below, which stays mandatory and unchanged - it exists to catch the most obvious rubric mismatches before a human has to.
     * **Core-Purpose Inference (app-level, once per crawl, after every route has been drafted above)**: synthesize one plausible one-sentence description of the application's primary purpose per genuinely distinct interpretation the evidence actually supports - the home route's heading/title carries the most weight, corroborated or contrasted by patterns across other routes' headings and nav labels - never invent a candidate with no evidence entry behind it. **Distinctness test, applied before writing any candidate down**: two candidates are the same interpretation, not two, if choosing between them would never change a route's criticality in the Criticality Re-Derivation step below - reword one as a test ("does this route directly deliver X?") and check whether the other candidate would ever answer that question differently for any route on the site; if not, they are one interpretation, not two, no matter how differently worded. If the evidence only genuinely supports one interpretation, write exactly one candidate - a single well-evidenced candidate is a stronger result than padding the count with reworded restatements of the same reading, and the human can still describe it differently in their own words at confirmation time regardless. Only write 2-4 candidates when the evidence is actually ambiguous between distinct interpretations that would answer the distinctness test above differently. Mark the index of the candidate the evidence most strongly supports as \`mostLikelyIndex\` (always \`0\` when there is only one candidate). Write \`corePurpose.candidates\` and \`corePurpose.mostLikelyIndex\` to \`artifacts/analysis/business-intent.json\` per \`.scaffold/schemas/business-intent.types.ts\`'s \`CorePurpose\` shape, \`reviewed: false\`.
     * **Core-Purpose Confirmation (a separate, lightweight exchange, before the Human Sign-Off Gateway below)**: present the candidates in conversation with the most-likely one marked as the recommended default, and ask the human to pick one or describe the application's purpose in their own words if none fit well. ${INTERACTIVE_CHOICE_NOTE} Interpret the human's answer into \`corePurpose.selected\` (a \`Field<string>\`): picking an offered candidate carries that candidate's own evidence forward with \`source\` matching its strongest evidence signal; free text gets \`source: 'manual'\` and one \`evidence\` entry quoting the human's own words (still subject to the same <=100 char / PII-guard rule as every other evidence excerpt). Set \`corePurpose.reviewed: true\` and \`reviewedBy: 'human'\`.
     * **Criticality Re-Derivation (using the now-confirmed purpose, before the Mechanical Gate)**: re-examine every route's \`criticalityTier\` against one more criterion alongside the checklist above - does this route's functionality directly deliver \`corePurpose.selected.value\`? If the checklist alone placed a route at \`medium\` or \`low\` and it genuinely delivers the confirmed core purpose, raise it to \`high\` - never automatically to \`critical\`, which stays reserved for its own payment/auth/destructive-action criteria regardless of purpose alignment. When this raises a tier, rewrite that entry's \`reasoning\` to say so in plain language (e.g. "Directly delivers the application's confirmed core purpose - pairwise test-case generation - not just a supporting utility, so it's treated as high rather than the generic medium a standalone utility would get.").
   - **Mechanical Gate (zero model involvement):** run \`node scripts/validate-business-intent.mjs\` and stop if it reports \`FAILED\` - fix the reported shape errors and re-run before proceeding. Do not present unvalidated output to the human.
   - **Human Sign-Off Gateway:** present a Business-Intent Review Artifact as one labeled block per new/changed entry, never a Markdown table - a wide table with variable-length Cyrillic/Unicode text and long evidence excerpts renders unreadably in a plain terminal, which has no Markdown rendering. Open with one line recapping the already-confirmed purpose: \`Confirmed core purpose: <corePurpose.selected.value>\`. Resolve each \`routeId\` to its \`artifacts/site-map/site-map.json\` path/title first - never show the raw \`routeId\` to the human. \`confidence\` is an internal, mechanically-checked signal only - it is never shown to the human here; do not print a \`Confidence:\` line at all. If any reviewed-this-pass route carries \`likely-phantom-route\` in \`visualTriage.flags\`, open with a **Possibly not real routes** subsection first: one line per such route naming its path and a one-sentence reason (e.g. "found only via a hidden DOM link, not reachable by clicking through the app; content is identical to N other empty/error pages") - never mix these into the numbered list below as if they were equally-confirmed active routes. Number each remaining route block (\`1.\`, \`2.\`, \`3.\`...) in the same sorted-by-path order \`artifacts/site-map/site-map.json\` itself already uses for serialization, so the numbering stays stable across a re-print of this same artifact and the human can reference a route by number in their reply. Separate every route block from the next with exactly one blank line - a run of many routes back-to-back with no visual break is illegible; the blank line is not optional formatting, it is part of this artifact's required shape. Per route: one **bold** numbered heading line with the resolved path and title (e.g. \`**1. /checkout - Checkout**\`), then \`Feature: <businessFeature.value>\`, then a **bold** \`Route criticality (draft): <TIER>\` line with the tier value printed in uppercase and nothing else on that line (e.g. \`**Route criticality (draft): CRITICAL**\`) - bold and uppercase and undiluted by anything else so the one value that drives later automation (test-condition volume in \`/define-test-conditions\`) reads at a glance; "draft" stays in the label because this value is exactly as unapproved as everything else in this artifact until the human signs off. Its own reasoning goes on the next line instead of sharing the criticality line: \`Reasoning: <criticalityTier.reasoning>\`. Evidence is deduplicated across both fields and printed as ONE consolidated line per route, never one line per entry: collect \`businessFeature.evidence\` and \`criticalityTier.evidence\`, drop exact duplicate (\`signal\`, \`excerpt\`) pairs, then print \`Evidences: "<excerpt>", "<excerpt>", ...\` - the remaining excerpts, quoted and comma-separated on one line in the order collected, never a separate \`Evidence (<signal>):\` line per entry. State explicitly: this file is NOT authoritative until a human has reviewed it - no other skill or agent should treat an entry with \`reviewed: false\` as ground truth. Close with a short correction hint naming the route numbers, not full paths: \`You can correct multiple routes at once by tier, e.g. "high: 1, 4, 5-8, 15; critical: 2-3, 9" - list numbers/ranges per tier; anything unlisted keeps its current draft value.\` This is a convenience, not the only way to reply - plain prose ("route 5 should be critical") works too; interpret either. Once the human actually approves an entry (individually, via the shorthand, or by approving the whole artifact as-is) in conversation, set that entry's \`reviewed\` to \`true\` and \`reviewedBy\` to \`'human'\` in \`artifacts/analysis/business-intent.json\` before continuing - never set \`reviewed: true\` without also setting \`reviewedBy\`.
   - **Next step:** run \`node scripts/pipeline-status.mjs\` and follow its \`nextCommand\` - do not hardcode what runs next here, since new pipeline stages can be added later without this skill needing to change.

`,
    },
    {
      name: 'define-test-conditions',
      description:
        'Test Analysis: defines typed test conditions (parameter equivalence partitions, 2-way combinatorial coverage, 3-value boundary conditions) per route from artifacts/analysis/business-intent.json, gated by mechanical validation and human sign-off.',
      disableModelInvocation: true,
      content: `# Skill: Test Analysis (/define-test-conditions)

## Purpose
Second stage of the app-analysis pipeline, run after \`/map-site\`'s automatic business-intent analysis (Step 6) - defines and prioritizes test conditions from the test basis. Consumes \`artifacts/analysis/business-intent.json\` and \`artifacts/site-map/site-map.json\`, defines typed test conditions per route - equivalence-partitioned parameters, 2-way combinatorial coverage, 3-value boundary conditions - into \`artifacts/analysis/test-conditions.json\` per \`.scaffold/schemas/test-conditions.types.ts\`, gated by a mechanical validator and a Human Sign-Off Gateway before any downstream stage may treat it as ground truth. This skill performs live DOM reads (plus a narrow, bounded, always-reset set of non-submitting probes - see Step 2) and writes an analysis artifact - at least the same risk profile as \`/map-site\`, if not slightly more given the probing exception - so it should never run from autonomous model judgment, only an explicit user command. Only Claude Code, Cursor, and Codex have a frontmatter mechanism for this at all (\`disable-model-invocation: true\`, present in this skill's own frontmatter on those three) - and even there treat it as a strong hint, not a guarantee: this exact field has open, live 2026 reliability bugs on more than one of them (ignored in some configurations, or requiring extra assistant-specific config this project doesn't generate). Windsurf, Copilot, and Antigravity have no such mechanism whatsoever - every skill there can be triggered by the model's own judgment based on its description alone, with no way to distinguish that from an explicit user ask. On every assistant, honoring "explicit command only" here is the model's own responsibility, not something the tooling reliably enforces.

## Workflow
1. **Preconditions:**
   * Default scope: every route in \`artifacts/analysis/business-intent.json\` with \`reviewed: true\`. If none exist, refuse and print exactly: "No reviewed business-intent entries found. Run /map-site Step 6 and complete its Human Sign-Off Gateway before defining test conditions." Do not proceed.
2. **Parameter & Partition Extraction (Read-Only, With One Narrow Reveal Exception):**
   * Compute the target route set: Step 1's default, or the routes named by an explicit \`--routes=<a,b,c>\` argument intersected with \`reviewed:true\` entries.
   * Run \`node scripts/orchestrate-swarm.mjs --phase=plan --routes=<the computed comma-separated routeId list>\` and dispatch one read-only worker per route from its Level 2 worker list - do not enumerate routes/workers yourself. The dispatcher itself has no knowledge of \`business-intent.json\`'s \`reviewed\` flag; this skill computes the reviewed-route subset itself before invoking it.
   * **Allowlist, not denylist, one narrow exception to \`/map-site\` Step 6's posture.** Read-only for attribute/text inspection stays identical to \`/map-site\` Step 6: element tag name, the \`type\` attribute, associated \`<label>\` text, HTML5 constraint attributes (\`required\`/\`min\`/\`max\`/\`maxlength\`/\`minlength\`/\`pattern\`/\`step\`), \`<select>\` option text, and static ARIA relationship attributes (\`aria-controls\`, \`aria-expanded\`) already present on initial page load. Never read or write the \`value\`, \`checked\`, or \`selected\` attribute of any element the worker did not itself just set (a pre-filled field may hold real session/account data) - the exception below controls the field, it never reads what was already there.
     - **The one allowed action class, added after live use under-extracted parameters (progressive-disclosure forms where a checkbox, radio, dropdown, or filled field reveals more fields the read-only pass could never see):** \`.check()\`/\`.uncheck()\` on checkboxes and radio buttons, \`.selectOption()\` on \`<select>\` elements, and \`.fill()\` on text/textarea inputs with a synthesized, illustrative value (never a real one) are allowed, specifically to observe what newly appears - never to explore an app's behavior for its own sake.
     - **Absolute ban, no exception, ever:** \`.click()\` on a \`<button>\`, an \`input[type=submit]\`/\`input[type=button]\`, or anything carrying a submit/create/delete/send-shaped ARIA role or accessible name. Buttons are what actually mutate or persist state; checkboxes/radios/selects/fields toggled without ever reaching a submit action are what this exception exists for, and that boundary is exactly the button/non-button line, not a judgment call to make per app. Never a \`trial: true\` dry-run on a forbidden action either - that still exercises real event handlers on some components.
     - **Bounded and reset**: probe one optional-reveal control at a time - toggle/select/fill it, read whatever newly appeared under the same attribute-only allowlist above, then reset it (\`.uncheck()\`, select back to its original option, clear the fill) before probing the next one. Never combine multiple togglings at once - that's both unbounded in combination count and makes it unclear which toggle revealed what.
     - **Disclosed, not hidden, residual risk**: on most applications, none of this reaches the backend before an actual submit action - but a minority of apps do wire individual field changes to a live autosave or telemetry call. This is a deliberate, informed trade-off for parameter-extraction completeness, not an oversight; if a route is known to autosave on every keystroke, skip the fill-based probe for it and rely on static markup alone.
   * **PII/session-data guard**, identical thresholds to \`/map-site\` Step 6's rule, applied to every \`evidence[].excerpt\` AND every \`EquivalencePartition.sampleValues[]\` entry: mask any run of 6+ consecutive digits or any 8+-character token where digits are the majority as \`[REDACTED]\`. Treat a \`<select>\`'s option-text list as live-data-sourced (not static markup) whenever its options are not a small closed enum an evidence excerpt can name individually (e.g. "choose your saved address") - redact the same way. \`scripts/generate-test-conditions.mjs\` also applies this same redaction mechanically as a backstop before writing output, regardless of what this step wrote.
   * \`sampleValues\` MUST be synthesized illustrative examples (e.g. \`"user@example.com"\`, \`""\`, \`"123"\`) - never copied from any attribute, placeholder, or content observed on the live page.
   * Infer \`parameters[]\` (per \`Parameter\`'s shape in \`.scaffold/schemas/test-conditions.types.ts\` - \`kind\` from the closed \`ParameterKind\` set, \`partitions[]\` each with >=1 \`evidence\` entry, \`boundaries[]\` only for numeric/length-constrained fields with >=1 \`'valid'\`-kind partition already present) and \`constraints[]\` (only a directly-visible static ARIA relationship - never inferred from behavior you didn't observe).
   * **Route-level invariant conditions (\`technique: 'architectural-invariant'\`) are where this skill's actual judgment lives - everything in Step 4 is deterministic pairwise/boundary/checklist generation, so this is the only place a genuine functional/business-logic defect gets a chance to be found before code exists. Treat it accordingly: this is not a template to fill in, it is an investigation.** Before writing a single condition, read this route's \`businessFeature.value\`, \`criticalityTier.value\` + \`.reasoning\`, and the confirmed \`corePurpose.selected.value\` from \`artifacts/analysis/business-intent.json\` - the condition set for a "Checkout" route and a "Reset Password" route must not read like the same fill-in-the-blank exercise with different nouns swapped in.
     - **Required thinking sequence per route (internal reasoning, not itself written to the artifact):** (1) What does this feature actually DO, concretely, in terms of state it reads or changes? (2) What would a user, a malicious actor, or simple bad timing plausibly do that this feature's own logic - not just its input fields - would need to defend against? (3) What does this specific application kind (e-commerce, auth, content, dashboard, etc., inferred from \`corePurpose\`) imply about what "wrong" looks like here that a generic web app wouldn't share? (4) Which of the 9 negative categories below does each hypothesis actually belong to, if any - never force a hypothesis into a category it doesn't fit, and never manufacture a condition just to fill a category that genuinely doesn't apply to this route.
     - **Self-questioning heuristics - actually ask these, don't skip to an answer:** If this route accepts a file, what happens with a wrong-but-plausible format (e.g. an .mp3 renamed to .jpg, a genuinely-corrupt file of the right extension)? If this route writes something to persistent storage, what happens if that write is interrupted or repeated? If this route depends on another feature's data (a cart before checkout, a session before a dashboard), what happens when that dependency is missing or stale? If two users or two tabs could plausibly act on the same resource at once, what does this route do about it? What is the single worst real-world consequence of this specific route breaking (data loss, money lost, PII exposed, account takeover), and does at least one condition target exactly that?
     - **Scale depth to \`criticalityTier\`, never to a fixed count**: \`critical\`/\`high\` routes get as many genuinely distinct, evidence-grounded conditions as the feature's actual complexity supports (commonly 4-8+ for a route with real business logic - never padded with reworded duplicates just to hit a number); \`medium\` routes get a focused 2-4 covering the most plausible failure modes; \`low\` routes get 1-2, or legitimately zero if the route is purely static/informational with no state or logic to violate - zero is a correct answer for a route with nothing to investigate, not a failure to fill a quota.
     - Each condition still has \`technique: 'architectural-invariant'\`, \`scenario: 'negative'\`, a valid \`negativeCategory\`, \`parameters: {}\`, \`isSpeculative: true\`, \`reviewed: false\`, an empty \`verification: {}\`, and a \`description\` naming the concrete business consequence, not a restated category label.
       - **Bad** (the exact anti-pattern this rule exists to prevent - generic, category-shaped, ignores what the route actually does): \`Verify unauthenticated access is redirected to login\` applied identically to a checkout route, a profile-settings route, and a public marketing page.
       - **Good** (grounded in this route's own \`businessFeature\`/\`corePurpose\`, names the actual consequence): for a checkout route whose \`corePurpose\` is an e-commerce storefront - \`Verify that submitting payment twice in rapid succession (double-click / network retry) does not create two separate orders or charge the customer twice\` (\`concurrent_conflict\`); for an account-deletion route flagged \`critical\` - \`Verify that a partially-completed account deletion (interrupted mid-request) leaves the account in a consistent state rather than a half-deleted record inaccessible to both the user and support\` (\`data_integrity\`).
      - **Negative categories semantic guidance:**
        - \`missing_precondition\`: access without required prior state, missing session, unauthenticated access to restricted routes.
        - \`permission_denied\`: insufficient role/privilege, cross-tenant resource access, or exceeded resource quotas and throttling limits.
        - \`concurrent_conflict\`: simultaneous mutations, double-click submissions, optimistic locking collisions.
        - \`state_violation\`: illegal lifecycle transitions (e.g. refunding an unpaid invoice), submitting while already submitting.
        - \`external_failure\`: 3rd-party dependency outage, HTTP 429 rate limiting, network timeouts, or client-side offline states.
        - \`data_integrity\`: ensuring partial failures do not corrupt data or leave orphaned records; form drafts remain intact.
        - \`error_path\`: user-initiated cancellation or abort flows resetting view without corrupting state.
        - \`invalid_input\` and \`boundary\`: payload and length edge cases not already captured by field partitions - including format-confusion cases (a wrong-but-plausible file type/extension) when this route accepts uploads.
   * Write \`artifacts/analysis/test-conditions.json\` (\`schemaVersion: 1\`) with these drafted \`architectural-invariant\` conditions in \`conditions[]\` and \`unsatisfiedPairs: []\` left empty for every new/changed entry.
3. **Mechanical Gate 1 (parameters shape, zero model involvement):**
   * Run \`node scripts/validate-test-conditions.mjs --stage=parameters\`. If it reports \`FAILED\`, fix the reported errors and re-run before proceeding to Step 4. Do not present unvalidated output to the human.
4. **Deterministic Condition Generation (zero model involvement):**
   * Run \`node scripts/generate-test-conditions.mjs\`. For every route whose \`parameters\`/\`constraints\` changed since the last run (tracked via \`sourceParamsHash\`), this deterministically computes 2-way combinatorial coverage plus 3-value boundary conditions and writes them into \`conditions[]\`, recording any parameter-pair the constraint set made impossible to cover into \`unsatisfiedPairs[]\` rather than failing. A route with fewer than 2 parameters has nothing to pair, so it falls back to one condition per partition instead (\`technique: 'equivalence-partition'\`) - never silently zero conditions just because pairwise had nothing to combine. It also probes a closed, deterministic checklist of well-known malformed-format/injection-class values per parameter kind (\`technique: 'checklist-based'\`) - complementary to boundary-value, not a replacement for it - scaled to the route's \`artifacts/analysis/business-intent.json\` criticality: full checklist on \`critical\`/\`high\` routes or when criticality is unknown, skipped on \`medium\`/\`low\` routes to avoid drowning low-value pages in noise. Every condition also gets a \`description\` (one plain sentence, e.g. \`Verify the page accepts language="en" (positive)\`) and a \`scenario\` (\`positive\`/\`negative\`), both synthesized deterministically from the vector's own resolved partition sample values or literal boundary/checklist probe - zero model involvement, same as everything else in this step - so what a human reviews at sign-off is never invented. Every generated condition gets \`isSpeculative: true\`, \`reviewed: false\`, an empty \`verification\` contract.
5. **Mechanical Gate 2 (full shape, zero model involvement):**
   * Run \`node scripts/validate-test-conditions.mjs\` (no flag). If it reports \`FAILED\`, fix the reported errors and re-run before proceeding to Step 6. Do not present unvalidated output to the human.
6. **Human Sign-Off Gateway:**
   * Present a Test-Conditions Review Artifact the same way \`/map-site\` Step 6 does - one labeled block per new/changed route, never a Markdown table (unreadable in a plain terminal against variable-length content), and never the parameter-level statistics dump (\`Parameter: ... Technique: ... Conditions: <count> Speculative: <count>\`) an earlier version of this artifact used - a human cannot approve or correct what they cannot see, and a count is not a condition. Resolve each \`routeId\` to its \`artifacts/site-map/site-map.json\` path/title first - never show the raw \`routeId\`. Separate every route block from the next with exactly one blank line - required shape, not optional formatting. Per route: one **bold** heading line with the resolved path and title; a \`Constraints:\` line only when \`constraints[]\` is non-empty, one per rule in plain language resolving both sides' partition ids to their \`sampleValues[0]\` (e.g. \`Constraints: shippingMethod="Express" excludes paymentMethod="PayPal"\`) - this is the only cross-field dependency this stage tracks (within one route's own parameters); it does not model a route depending on another route or feature (e.g. an auth prerequisite, data seeded elsewhere) at all yet. Then every condition in \`conditions[]\`, one numbered line each: \`<n>. <condition.description>  [<technique>]\` - the description already states positive/negative, so do not repeat \`scenario\` separately on the line. Close with an \`Unsatisfied pairs: <count>\` line only when it's greater than 0. State explicitly: this file is NOT authoritative until a human has reviewed it, and every condition's \`verification\` contract is an empty stub a human must fill in. **Defensive Oracle Polarity**: when specifying \`verification\` contracts (\`ui\`, \`state\`, \`network\`), assert system defense, graceful error feedback, and state preservation — NEVER assert unhandled defects, server crashes, or unhandled 5xx codes (any \`verification.network.status >= 500\` will fail mechanical validation). Any \`unsatisfiedPairs\` entries mean the constraint set made full 2-way coverage impossible for that route - a human should confirm whether that's expected (mutually exclusive fields) or a sign the extracted constraints themselves are wrong. Once the human actually approves a condition in conversation (individually, by route, or the whole artifact as-is), set that condition's \`reviewed\` to \`true\` and \`reviewedBy\` to \`'human'\` in \`artifacts/analysis/test-conditions.json\` before continuing - never set \`reviewed: true\` without also setting \`reviewedBy\`.
`,
    },
    {
      name: 'design-test-cases',
      description:
        'Test Design: bridges test-conditions.json to a drafted, TMS-shaped test case: deterministically classifies each condition onto a test level (e2e/api/ui-only), then drafts one test case per route. No blocking Human Sign-Off Gateway - writes the draft, reviewable anytime.',
      disableModelInvocation: true,
      content: `# Skill: Test Design (/design-test-cases)

## Purpose
Elaborates Stage 2's test conditions into test cases. Consumes \`artifacts/analysis/test-conditions.json\`'s reviewed conditions, classifies each deterministically onto a test level (\`e2e\`/\`api\`/\`ui-only\` - zero model involvement, zero dependency on \`criticalityTier\` or any other LLM-derived signal, which is too unstable to gate a structural decision on even with fixed tier definitions), then drafts one test case per route from that classification. This is explicitly a v0 skeleton: journeys are single-route only (no cross-route flow detection yet), and unlike every earlier stage in this pipeline, this skill does NOT pause for a blocking Human Sign-Off Gateway - it writes the draft and moves on, since the draft is cheap to review and correct at any later point rather than needing to be right before the pipeline can proceed.

## Workflow
1. **Preconditions:**
   * Default scope: every route in \`artifacts/analysis/test-conditions.json\` with at least one \`reviewed: true\` condition. If none exist, refuse and print exactly: "No reviewed test conditions found. Run /define-test-conditions and complete its Human Sign-Off Gateway before designing test cases." Do not proceed.
2. **Deterministic Classification (zero model involvement):**
   * Run \`node scripts/compose-journeys.mjs\`. For every route with reviewed conditions, this deterministically groups them into one journey and assigns each condition a test level - \`e2e\` for the route's single all-valid vector if one exists, \`ui-only\` for any probe a client-side HTML5 constraint would block before it ever reaches the network, \`api\` for everything else (see \`scripts/compose-journeys.mjs\`'s own header comment for the exact rule). Writes \`artifacts/test-cases/test-cases.json\`.
3. **Mechanical Gate 1 (structural shape, zero model involvement):**
   * Run \`node scripts/validate-journeys.mjs --stage=structural\`. If it reports \`FAILED\`, fix the reported errors and re-run before proceeding to Step 4. Do not present unvalidated output to the human.
4. **Test-Case Drafting:**
   * For every journey with no \`testCase\` yet, read its \`conditionAssignments\` (resolving each \`conditionId\` back to the actual condition and parameters in \`test-conditions.json\`) and draft a \`testCase\`: a title, preconditions, and ordered steps with expected results.
    * **One atomic action per step, each with its own concrete expected result - never a step that bundles multiple actions behind one blanket result at the end.** This is not a style preference: \`/automate-test\` wraps each drafted step in its own step block (\`${sc.stepDemarcation('Step N: ...')}\`), so a step with no verifiable expected result gives it nothing to assert on, and a step bundling several actions forces one step block to silently cover several unrelated behaviors. Lean on each condition's own \`description\` and \`scenario\` fields (already written by Stage 2) as the step's source material rather than inventing new prose: a \`scenario: 'positive'\` condition's expected result states the concrete success signal (a specific confirmation message, a field's new displayed value, a status code) - a \`scenario: 'negative'\` condition's expected result states the concrete rejection/handling signal (a specific validation message, a disabled control, an error status code) following **Defensive Oracle Polarity** (asserting system defense, rejection, and state preservation, never a crash or unhandled defect) - never a vague blanket result like "works correctly" or "is handled" that could not tell a passing run from a subtly broken one. When a condition defines a \`negativeCategory\`, align the expected result with its category:
      - \`invalid_input\` / \`boundary\`: field displays inline validation message, submission blocked.
      - \`missing_precondition\` / \`permission_denied\`: redirect to login or display forbidden alert (401/403), resource state unmodified.
      - \`concurrent_conflict\`: conflict notification displayed, stale update rejected (409), initial state intact.
      - \`state_violation\`: illegal operation blocked, duplicate request deduplicated.
      - \`external_failure\`: graceful degradation banner displayed, offline retry prompt available.
      - \`data_integrity\`: error alert displayed, unsaved form draft preserved without corruption.
      - \`error_path\`: cancellation completes cleanly, view restored without side effects.
   * **Bracket every literal on-screen name.** Any specific, literal name a step references - a button's or link's visible label, a page/screen name, a checkbox/radio/dropdown option's label, a field's label, a toast/notification's message, a table/list's name - goes in square brackets, using a fixed small vocabulary of action verbs so every step reads the same way no matter who or what wrote it:
     - \`Click the [X] button\` / \`Click the [X] link\`
     - \`Navigate to the [X] page\`
     - \`Check the [X] checkbox\` / \`Uncheck the [X] checkbox\`
     - \`Select the [X] radio button\`
     - \`Select the [X] dropdown > [Y] option\`
     - \`Fill the [X] field with <value>\`
     - \`Verify the [X] toast/notification appears\`
     - \`Verify the [X] table/list contains [Y]\`
     This is not cosmetic: \`/automate-test\`'s Step 5 grounds its locators directly in this bracketed text (\`getByRole(..., { name: '<bracketed text>' })\` / \`getByText('<bracketed text>')\`), so an unbracketed or paraphrased name breaks that handoff rather than merely reading less consistently. Bracket only names that actually appear as literal text/labels on screen - never bracket a synthesized value you're inventing to fill a field (an email, a quantity number), and never bracket a generic noun with no literal on-screen counterpart.
   * Describe every \`'api'\`-level step generically ("call the project's API client with...") rather than naming a language-specific class - actual code generation is \`/automate-test\`'s job, not this skill's.
   * **Good example** (atomic steps, each with a concrete expected result and bracketed literal names, drawn from the conditions' own \`description\`/\`scenario\`):
     \`\`\`
     Title: Checkout accepts a standard-shipping order and rejects an over-limit quantity
     Preconditions: ["User is authenticated", "Cart contains at least 1 eligible item"]
     Steps:
     1. Select the [Standard] shipping method -> Selected shipping method is [Standard] and the order summary's shipping line updates to match.
     2. Select the [Card] payment method -> Selected payment method is [Card] and the card-specific fields become visible.
     3. Fill the [Quantity] field with 5 (within the valid 1-10 range) -> [Quantity] field shows 5, no validation error is shown.
     4. Click the [Place Order] button -> Order confirmation page shows a confirmation number and the message "Order confirmed", cart is cleared.
     5. Fill the [Quantity] field with 11 (one above the max boundary of 10) -> [Quantity] field shows the validation message "Maximum quantity is 10" and the [Place Order] button stays disabled.
     \`\`\`
   * **Bad example** (the exact anti-pattern this rule exists to prevent - real text from an earlier version of this artifact):
     \`\`\`
     Title: Checkout succeeds with valid data
     Steps:
     1. Submit the checkout form with valid data -> Order confirmed
     \`\`\`
     This collapses navigation, three separate field selections, and submission into one step, never states which concrete values were used, and gives \`/automate-test\` nothing to assert on beyond the page not crashing - a subtly wrong shipping method or an unconfirmed quantity would still "pass."
   * Write the result into that journey's \`testCase\` field, leaving \`reviewed: false\`.
5. **Mechanical Gate 2 (full shape, zero model involvement):**
   * Run \`node scripts/validate-journeys.mjs\` (no flag). If it reports \`FAILED\`, fix the reported errors and re-run before finishing.
6. **Test-Cases Review Artifact (informational, never blocking):**
   * Present every newly-drafted \`testCase\` as its own labeled block - the same "one block per entry, never a Markdown table" convention every earlier stage's review artifact already uses. Resolve each journey's \`routeId\` to its \`artifacts/site-map/site-map.json\` path/title first. Separate every journey block from the next with exactly one blank line - required shape, not optional formatting. Per journey: one **bold** heading line with the resolved path and title, then \`Title: <testCase.title>\`, then \`Preconditions: <testCase.preconditions, comma-separated>\`, then every step numbered as \`<n>. <step.description> -> <step.expectedResult>\`. This is what a human actually reviews - a stage that drafts real content and reports only a count defeats the point of drafting it.
   * Run \`node scripts/pipeline-status.mjs\` and print its \`roadmap\` field so the human sees Stage 3 marked done and Stage 4 (\`/automate-test\`) next.
   * If at least one TMS/task-tracker provider is configured (the \`mcp__tms__*\` tools are present in this conversation), ask one short, easily-skippable question naming it: "<Provider> is configured - want these also recorded there as test cases?" ${INTERACTIVE_CHOICE_NOTE} A "no," or no answer at all, is a completely normal outcome here - never re-ask automatically on a later run just because it went unanswered once. If the user answers yes, record the drafted test cases into the configured TMS via \`mcp__tms__create_issue({ summary: testCase.title, description: formatSteps(testCase), issueType: 'Test' })\`.
   * Do not ask for approval of the drafts themselves before finishing: this stage's draft is deliberately reviewable-later, not gate-blocking, a departure specific to this stage only - every earlier stage in this pipeline keeps its own blocking Human Sign-Off Gateway unchanged. Showing the drafts is not the same as gating on them.
`,
    },
    {
      name: 'ground-zero-setup',
      description:
        'Guided orchestrator for a brand-new application: runs the currently-built app-analysis pipeline (/map-site create, then /define-test-conditions, then /design-test-cases) end-to-end, pausing for human sign-off after each stage by default (except /design-test-cases, which has no blocking gate of its own), or fully unattended in auto-pilot mode.',
      disableModelInvocation: true,
      content: `# Skill: Greenfield Guided Setup (/ground-zero-setup)

## Purpose
A thin orchestrator for a brand-new application, not a new analysis engine of its own: it sequences the full app-analysis-and-automation pipeline (\`/map-site create\`, including its automatic Step 6 business-intent inference, then \`/define-test-conditions\`, then \`/design-test-cases\`, then \`/automate-test\`) end to end - from nothing to verified working automated tests, after one single invocation - so a user does not have to remember which command follows which or separately trigger the final stage themselves. It adds zero duplicated crawling, inference, generation, or code-synthesis logic; every actual decision about what stage comes next is read from \`scripts/pipeline-status.mjs\`, never hardcoded here, so a future pipeline stage only ever requires extending that one script, not rewriting this skill's own sequencing. \`/automate-test\` is a normal in-chain stage like the three before it, not a special case this orchestrator refuses to reach - but code is never written without its own human decision point: \`/automate-test\`'s own Human Sign-Off Gateway (its Step 4, a BLOCKING GATE before any test code is synthesized) still applies exactly as that skill defines it and is never bypassed, in Guided mode or Auto-pilot.

## Workflow
1. **Pre-Flight Confirmation (mandatory, before anything runs):**
   * Run \`node scripts/pipeline-status.mjs\` first and resume from whatever stage it reports - never restart a pipeline that is already partway done.
   * Print its \`preFlightNotice\` field to the human VERBATIM, before asking anything else - do not paraphrase, shorten, summarize, or skip any part of it. This field already contains the roadmap, the cost warning, and the human-gates disclosure, authored once in the script itself rather than composed fresh by the model each run, specifically so none of it can be silently dropped by the model's own judgment on a given pass. Add one sentence naming \`/automate-test\` (Stage 4) as a normal part of this same chain, not a separate command the user needs to remember to run afterward - its own Human Sign-Off Gateway still gates actual code synthesis (see Purpose).
   * **Mode choice**, asked at the same point, with a clearly-marked recommended default:
     - **Guided (Recommended):** pause at every stage's Human Sign-Off Gateway, exactly as described above.
     - **Auto-pilot:** skip every pause for LOCAL artifact review only and proceed straight through every analysis/drafting stage, using the model's own judgment, on the user's own explicit pre-authorization given right here. Still writes \`reviewed: true\` on every new/changed entry, but as \`reviewedBy: 'auto-pilot'\` rather than \`'human'\`, so a later audit can always tell which entries a human actually looked at. This pre-authorization still does NOT extend to \`/automate-test\`'s own Human Sign-Off Gateway (see Step 3/4) - that gate is a decision about writing and executing real code, not local artifact review, and stays a hard stop in both modes. Still produces the same deterministic Final Report described below.
   * ${INTERACTIVE_CHOICE_NOTE} If the user's response does not clearly select a mode, ask again rather than guessing, and never silently default to Auto-pilot - Guided is the only safe default to fall back to.
2. **Stage Loop (Guided mode; repeats once per pipeline stage, now including Stage 4):**
   * Run the stage by invoking its own skill exactly as documented there (\`/map-site create\` first, then later \`/define-test-conditions\`, then \`/design-test-cases\`, then \`/automate-test\`) - never reimplement, shortcut, or paraphrase any of that skill's own steps.
   * Present that stage's own existing Human Sign-Off Gateway (or, for \`/design-test-cases\`, its Test-Cases Review Artifact; for \`/automate-test\`, its own Step 4 Proposal Artifact) exactly as its own skill defines it, preceded by the current \`roadmap\` from \`pipeline-status.mjs\` so the human always sees stage position alongside the content - this skill does not invent a different review format or shorten the one that already exists.
   * **\`/automate-test\` (Stage 4) is handled entirely by its own skill, not by this step's merged gate below:** its Step 4 Human Sign-Off Gateway is already the human decision point for writing code - do not additionally ask this skill's own merged question before or after it. Once \`/automate-test\` finishes a batch (tests passing, \`reviewed: true\` set), go straight to End of Chain below.
   * **Single merged gate, one question instead of two (every stage except \`/automate-test\`, per the exception above):** run \`node scripts/pipeline-status.mjs\` to read the current \`nextCommand\`, then ask ONE question that combines approving this stage's own output with deciding what happens next - never a separate "approve?" exchange followed by a separate "continue?" exchange for what is a single human decision. ${INTERACTIVE_CHOICE_NOTE} Offer: **"(Recommended) Approve and continue to \`<nextCommand>\`"**, "Approve and pause here" (the project is left in a valid, resumable state; resume later via \`nextCommand\` directly or by re-invoking \`/ground-zero-setup\`, which always resumes from whatever \`pipeline-status.mjs\` currently reports rather than restarting), "Reject with comments", "Stop for now". \`/design-test-cases\` has no approval half (per its own Step 6, no blocking gate) - for it, ask only the continue-or-pause half of this same merged question. If the human's single reply already combines corrections to specific entries with a continue/pause signal (e.g. "route 5 should be critical, and yes continue"), act on both parts of that one message - never ask a separate follow-up purely to re-confirm intent the human already stated.
     - **Approve and continue:** follow that stage's own instruction to set \`reviewed: true\` and \`reviewedBy: 'human'\` on every entry just approved, then proceed directly to \`nextCommand\` with no further question.
     - **Approve and pause / Stop for now:** set \`reviewed: true\`/\`reviewedBy: 'human'\` (approve cases only) and stop here - see the resumability note above.
     - **Reject with comments:** apply the requested edits to the affected entries, then re-present the updated review artifact and ask again - this is a loop, not a one-shot gate, and repeats until the human approves.
3. **Auto-pilot mode:**
   * Skip step 2's merged gate for LOCAL artifact review only (Stages 1-3) - run each stage, then instead of pausing, autonomously approve every new/changed entry from that stage by setting \`reviewed: true\` and \`reviewedBy: 'auto-pilot'\` on it (for \`/design-test-cases\`, still present its Test-Cases Review Artifact and TMS-recording question exactly as that skill defines them - "skip the gate" governs approval, not whether informational content is shown), then immediately continue to the next stage per \`pipeline-status.mjs\`'s \`nextCommand\`, without asking at each stage.
   * **Stage 4 is different even in Auto-pilot:** once \`nextCommand\` is \`/automate-test\`, invoke it the same as Guided mode would - Auto-pilot's own local-artifact-review pre-authorization does NOT extend to \`/automate-test\`'s Step 4 Human Sign-Off Gateway, which stays a hard blocking stop before any code is synthesized, in both modes, no exception. This is the one point in the whole pipeline where a real, consequential decision (writing and running code) still needs the human, deliberately - see Purpose.
   * The blanket pre-authorization given at the Pre-Flight Confirmation screen covers only this: proceeding through this pipeline's own local file writes for Stages 1-3. It does NOT extend to any action with a real external side effect - the Test-Cases Review Artifact's own TMS-recording question (if asked) still requires its own explicit answer even in auto-pilot, and neither does it extend to \`/automate-test\`'s own gate per the bullet above.
4. **End of Chain (reached once the stage is \`complete\`):**
   * This is never a silent stop - the human already knows the pipeline ends here from the Pre-Flight roadmap; End of Chain is where that gets confirmed, not a surprise dead end.
   * Print the current \`roadmap\` and \`routeCoverage\` from \`pipeline-status.mjs\` so the human sees exactly how much of the pipeline is done and how many routes reached each stage.
   * Tell the user every drafted test case has been automated (or, if this run stopped earlier - e.g. the human chose "Stop for now" before reaching \`/automate-test\`, or its own gate is still pending an answer - say so plainly and name the exact resume command instead).
5. **Final Report (every run, both modes, before finishing):**
   * Print a deterministic summary: which stage(s) actually ran this session; which files were written or changed (e.g. \`artifacts/site-map/site-map.json\`, \`artifacts/analysis/business-intent.json\`, \`artifacts/analysis/test-conditions.json\`, \`artifacts/test-cases/test-cases.json\`, and the synthesized test file(s) if \`/automate-test\` ran); each mechanical gate's result (PASSED/FAILED) for every gate that ran; how many entries were approved this session and by whom (\`reviewedBy: 'human'\` vs \`'auto-pilot'\` counts, if both occurred); \`pipeline-status.mjs\`'s \`stageTimings\` (per-stage wall-clock time, derived from each artifact's own timestamp - not a guess) and \`routeCoverage\` (routes mapped/reviewed/automated, and any flagged \`likelyPhantomRoutes\`); and the current \`pipeline-status.mjs\` stage plus its \`nextCommand\`, so the user always knows exactly what to do next without re-reading this skill.
   * Do not attempt to report token or cost usage here - that telemetry is not available to a skill's own instructions from inside a session. If the user wants that, point them at their assistant's own session-level reporting instead (for example Claude Code's \`/cost\` or \`/context\`).
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
  const skills = buildOperationalSkills(automationTool, language).map(withGlobalConventions);

  for (const rawAssistant of assistants) {
    const assistant = rawAssistant.toLowerCase();

    if (assistant === 'antigravity') {
      for (const skill of skills) {
        descriptors.push({
          // Folder-per-skill with a SKILL.md file, not a flat <name>.md file - live-verified
          // 2026-09-03 against the exact installed Antigravity CLI's own bundled documentation
          // (`agy --print`, its built-in `agy-customizations` skill): "A skill cannot be a single
          // standalone file placed directly in .agents/skills/. It must be placed inside its own
          // subfolder and named SKILL.md." A flat file is silently never discovered at all - not
          // a parsing error, just invisible - which is a stricter failure than the YAML-escaping
          // bug already fixed for this same block (that fix was necessary but not sufficient).
          path: `.agents/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${yamlSafeScalar(skill.description)}
---

${antigravityInvocationNote(skill)}${skill.content}`,
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
description: ${yamlSafeScalar(skill.description)}${argumentFrontmatter(skill)}${skill.disableModelInvocation ? '\ndisable-model-invocation: true' : ''}
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
description: ${yamlSafeScalar(skill.description)}${argumentFrontmatter(skill)}
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
description: ${yamlSafeScalar(skill.description)}
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
description: ${yamlSafeScalar('Incremental update of an existing artifacts/site-map/site-map.json using content-hash comparison - cheaper than a full re-crawl.')}
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
description: ${yamlSafeScalar(skill.description)}
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
description: ${yamlSafeScalar(skill.description)}${argumentFrontmatter(skill)}${skill.disableModelInvocation ? '\ndisable-model-invocation: true' : ''}
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
description: ${yamlSafeScalar(skill.description)}
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
description: ${yamlSafeScalar(skill.description)}
---

${skill.content}`,
          },
        });
      }
    }
  }

  return descriptors;
}
