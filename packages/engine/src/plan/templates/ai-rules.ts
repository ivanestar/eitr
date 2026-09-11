// Centralized AI rules templates for all major coding assistants. create-if-absent.

import { yamlSafeScalar } from './yaml-frontmatter.js';

export function renderAiHarmonizeText(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const ext = language === 'python' ? 'py' : 'ts';
  const configFile =
    tool === 'cypress'
      ? `cypress.config.${ext}`
      : tool === 'pytest'
        ? 'pyproject.toml'
        : `playwright.config.${ext}`;

  return `# ${toolName} CPOM Framework - Harmonization Rules

You are modifying a ${toolName} CPOM framework setup.

## Constraints & Limits:
- **NO NEW FILES**: You must NOT create >0 new test files, folders, or Page Objects.
- **MODIFY ONLY**: You are permitted to modify exactly these files:
  - \`${configFile}\`, \`.env\`, \`package.json\`.
  - Base components under \`components/primitives/*\`.

## Verification Steps:
1. Read \`${configFile}\` to identify the target \`baseURL\`.
2. Inspect the application DOM.
3. If the application uses a different test-id attribute, update the configuration.
4. If the dev-server port is different, adjust the \`webServer\` port.

## Edge Cases:
- If the target \`baseURL\` cannot be determined, set it to \`http://localhost:3000\`.

## Examples

### Good Example
\`\`\`markdown
1. Read \`${configFile}\` and found \`data-testid\`.
2. Checked DOM and found \`data-qa\`.
3. Updated \`${configFile}\` test-id property to \`data-qa\`.
\`\`\`

### Bad Example
\`\`\`markdown
1. I created a new Page Object to test the new configuration.
*(Violation: Created >0 new files which is prohibited.)*
\`\`\`
`;
}

function resolveHydrationSnippet(language: string): string {
  if (language === 'python') {
    return 'From `shared/utils/react.py`, use `wait_for_react_hydration(page)` before interacting with hydration-dependent elements.';
  }
  if (language === 'java') {
    return 'From `shared.utils.ReactHelpers`, call `ReactHelpers.waitForReactHydration(page)` before interacting with hydration-dependent elements.';
  }
  if (language === 'csharp') {
    return 'From `Shared.Utils.ReactHelpers`, call `await ReactHelpers.WaitForReactHydrationAsync(page)` before interacting with hydration-dependent elements.';
  }
  return 'From `shared/utils/react.ts`, use `await waitForReactHydration(page)` before interacting with hydration-dependent elements.';
}

export function renderAiGenerateText(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const ext = language === 'python' ? 'py' : 'ts';
  const specExt = tool === 'cypress' ? `cy.${ext}` : language === 'python' ? 'py' : `spec.${ext}`;
  const commentPrefix = language === 'python' ? '#' : '//';

  let componentSyntax = '';
  if (tool === 'cypress') {
    componentSyntax = `- Element properties MUST be declared using \`this.child(ComponentClass, selector)\` where selector is a string (e.g. \`this.child(TextInput, 'input[name="user"]')\`).`;
  } else if (language === 'typescript') {
    componentSyntax = `- Element properties MUST be declared as child components via \`this.child(ComponentClass, spec)\` (or \`this.list(ComponentClass, spec)\` for lists), where \`spec\` is a \`LocatorSpec\` object (e.g. \`{ kind: 'css', css: 'input[name="username"]' }\` or \`{ kind: 'role', role: 'button', name: 'Submit' }\`).`;
  } else if (language === 'python') {
    componentSyntax = `- Element properties MUST be exposed via \`@property\` decorators, returning components initialized with \`self._scope(ComponentClass, spec)\`.`;
  } else {
    // Java and C#
    componentSyntax = `- Element properties MUST be exposed as public getters or properties, initialized by passing a nested locator to the primitive's constructor (e.g. \`new TextInput(getLocator().locator("input"))\`).`;
  }

  const smokeName = language === 'python' ? 'test_smoke.py' : `smoke.${specExt}`;
  const featureName = language === 'python' ? 'test_{feature}.py' : `{feature}.${specExt}`;
  const pageName =
    language === 'python'
      ? '{name}_page.py'
      : language === 'csharp' || language === 'java'
        ? `{Name}Page.${ext}`
        : `{name}.page.${ext}`;
  const widgetName =
    language === 'python'
      ? '{name}_widget.py'
      : language === 'csharp' || language === 'java'
        ? `{Name}Widget.${ext}`
        : `{name}.widget.${ext}`;

  return `# ${toolName} CPOM Framework - Page Object & Test Generation Rules

You are generating Page Objects and tests for the ${toolName} CPOM framework.

## Project Architecture Map
| What | Where | Naming |
|---|---|---|
| Page Object class | \`components/pages/\` | \`${pageName}\` |
| Shared reusable widgets | \`components/widgets/\` | \`${widgetName}\` |
| Base smoke test | \`tests/\` | \`${smokeName}\` |
| Full scenario / regression tests | \`tests/\` | \`${featureName}\` |

## CPOM Architecture Rules

### 1. The "No Assertions" Rule
- You MUST NOT place >0 assertions (\`expect\`, \`assert\`) inside a Component or Page Object.
- Assertions belong ONLY in the test spec.

### 2. The Snapshot Rule (\`Now()\` suffix)
- Any method that reads state without waiting MUST be suffixed with \`Now()\`.
- If it waits, it MUST NOT have the \`Now()\` suffix.

### 3. Component Decomposition
- If a BasePage has >10 locators, decompose it into >0 \`Container\` components.

### 4. Primitives
${componentSyntax}

### 5. API-First Test Setup
- If test data setup requires >3 UI clicks, use \`ApiClient\` instead.

### 6. Execution-First SDET Protocol & Mandatory Live-DOM Liveness Parity
- Every Page Object in \`components/pages/<name>.page.${ext}\` MUST be verified directly against the live DOM before being treated as complete (1:1 strict parity between Page Objects and verified pages).
- Autonomous Execution: Whenever creating or modifying Page Objects, you MUST immediately verify them against the live application (via the embedded Playwright MCP tools or the direct test runner).
- Actionable Visibility, Not Mere DOM Presence: an element existing in the DOM/accessibility tree is NEVER sufficient evidence to scaffold a property or method for it - a hidden nav search input becoming a phantom \`searchInput\`/\`search()\` is exactly this failure mode. Before scaffolding a locator, confirm per element: (a) it resolves uniquely; (b) \`await expect(locator).toBeVisible()\` (note this does NOT catch \`opacity: 0\`); (c) an explicit opacity check (\`getComputedStyle(el).opacity !== '0'\`); (d) \`await locator.click({ trial: true })\` (or \`.fill({ trial: true })\`) to run Playwright's full actionability pipeline (stable, not obscured by another element, enabled) without performing the action. Remove any already-scaffolded property that fails this check.
- Self-Healing vs Real Bugs:
  * If verification fails due to selector drift / timing, perform 4-Point Trace Triage with **Visual Diff & Screenshot Overlay** (comparing pre/post failure frames to distinguish semantic text/icon shifts from broken rendering), adjust locators and re-verify under the Two-Strike Rule.
  * If a genuine application defect is found (backend 500, broken UI), document the real bug clearly without masking.
- Mandatory Handoff Report: Always list created Page Objects, liveness verification results, test execution results (pass/fail counts), and any detected real application defects.
- Zero Unverified Code Policy: You MUST NOT hand off unverified or failing code to the user.

### 7. AST Linear Test Synthesis & TMS Tagging Rules
- **Strict Linearity (Zero Branching):** ABSOLUTELY NO conditional logic (\`if/else\`, \`switch\`), NO loops (\`for/while/forEach\`), and NO \`try/catch\` wrapping assertions inside test specs.
- **Step Demarcation:** Every step MUST be explicitly demarcated with \`await test.step('Step N: <action>', async () => { ... })\` (or \`cy.step()\`).
- **Dependency Injection via Fixtures:** Never instantiate Page Objects via constructor (\`new LoginPage(page)\`) inside test files. Always inject them through fixture extensions (\`test.extend<{ loginPage: LoginPage, apiClient: ApiClient }>()\`).
- **Anti-Over-Mocking Guard:** NEVER register a network route mock/interception (\`page.route()\`/\`context.route()\`/\`browserContext.route()\`/\`routeFromHAR()\`, or \`cy.intercept()\`) to force a failing test to pass - fix the real defect the test is exposing instead. The CPOM linter rejects any unannotated route mock found in a test spec; if isolating unrelated 3rd-party traffic (analytics, Sentry) is genuinely required, annotate the exact line with \`${commentPrefix} @allow-mock: <reason>\` stating why.
- **Metadata Tagging:** For every TMS scenario test, attach the ticket metadata tag: \`test('TC-{id}: {title}', { tag: ['@TC-{id}'] }, async ({ ... }) => ...)\`.
- **Test Runner Execution Command:** Run tests using \`${tool === 'cypress' ? 'npx cypress run' : language === 'python' ? 'pytest' : language === 'csharp' ? 'dotnet test' : language === 'java' ? 'mvn test' : 'npx playwright test'}\`.

### 8. Test Data Management (TDM) & Multi-Source Verification
- **Dynamic TDM:** Never hardcode user emails, phone numbers, or entity IDs. Use zero-dependency generators from \`apiClient\`: \`createUniqueId()\`, \`createTestEmail()\`, \`createTestPhone()\`, \`createTestPassword()\`, \`createTestUuid()\`, \`createTestName()\`, \`createTestAmount()\`, \`createTestDate()\` for collision-free data isolation.
- **Teardown Lifecycle:** Register created backend resources via \`apiClient.registerTeardown(async () => { ... })\`. The \`apiClient\` fixture automatically cleans up all resources post-test.
- **Multi-Source Corroboration:** Validate UI DOM changes AND verify backend response codes/data (HTTP 200/201, matched against the actual submitted values) via \`apiClient\` or \`page.waitForResponse()\` - this pair is the floor, not the ceiling. When a state-changing action has another independently observable signal (a success toast, a related list/detail endpoint, an unambiguous page-state change), assert that too rather than stopping at the first two.
- **Web-First Auto-Retrying Assertions:** All assertions MUST use Web-First auto-retrying matchers: \`await expect(locator).toBeVisible()\`. Point-in-time snapshot readers (\`*Now()\` suffix) MUST NOT be used inside \`expect()\`.
- **Race-Free Event Synchronization:** Whenever handling asynchronous dialogs, downloads, or popup windows, ALWAYS set up the listener before the triggering action: \`await Promise.all([page.waitForEvent('dialog'), button.click()])\`.

### 9. Bounded DOM Exploration & Anti-Infinite-Scroll Protocol
- **Anti-Infinite-Scroll Guard:** When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
- **Max 2 Viewport Scrolls:** Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
- **Immediate Collection Synthesis:** Immediately synthesize a CPOM Collection property via \`this.list(ItemComponent, spec)\` (returning \`Collection<ItemComponent>\`) and terminate page exploration.
- **Bounded Exploration Loops:** All DOM exploration and scrolling loops MUST have a hard iteration ceiling (maximum 3 iterations); unbounded \`while(true)\` exploration is strictly prohibited.

### 10. Frontend Framework Hydration Helpers
- When testing applications built with React, Next.js, or hydration-dependent SPA frameworks, wait for hydration before interacting with elements to eliminate synthetic click misses and state resets.
- ${resolveHydrationSnippet(language)}

## Authenticated Pages Edge Cases
- If \`.auth/user.json\` exists, you MUST NOT automate the login flow.
- If it exists, extract the DOM context locally using a scratch script.

## Examples

### Good Example
\`\`\`markdown
1. Checked for \`.auth/user.json\`. Found it.
2. Bypassed login UI.
3. Created Page Object with 0 assertions.
\`\`\`

### Bad Example
\`\`\`markdown
1. Wrote \`expect(await loginPage.isVisible()).toBe(true)\` inside the Page Object.
*(Violation: Placed 1 assertion inside the Page Object.)*
\`\`\`
`;
}

export function renderAiDoctorText(tool: string = 'playwright'): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `# ${toolName} CPOM Framework - Selector Self-Healing

You are an AI Agent tasked with repairing broken selectors, assertions, and test flakes in a ${toolName} CPOM framework. 
Your goal is to perform root-cause analysis on test failures and patch the Page Object with locators.

## 1. Zero-Guessing Protocol
- **NO GUESSING**: If a test fails, you MUST request the DOM snapshot, HTML dump, or ${toolName} trace before writing the fix.
- If the target element lacks unique attributes, find >0 stable parent anchors.

## 2. Failure Classification
Before changing any code, classify the failure from the test logs:
- **Strict Mode Violation**: If >1 elements are found, you MUST NOT change to XPath. Add exactly 1 text filter or semantic role.
- **Timeout / Element Not Found**: Find the new element in the DOM dump and update the locator.
- **Element Not Visible**: If the locator is correct but element is obscured, you MUST NOT change the locator. Add wait logic.

## 3. Resilience Hierarchy
Craft locators using this hierarchy:
1. Semantic Roles (e.g., \`getByRole('button', { name: 'Save' })\`).
2. QA Data Attributes (\`data-testid\`, \`data-qa\`).
3. Text Content (\`getByText('String')\`).
4. CSS Selectors (If 1, 2, and 3 yield 0 results).

## 4. Boundary Constraints & Edge Cases
- **NO XPATH**: You MUST NOT use absolute XPath.
- **SHADOW DOM**: If elements are inside a Web Component, ensure the locator pierces the shadow root.
- **IFRAMES**: If the element is inside an iframe, use FrameLocator.

## Examples

### Good Example
\`\`\`markdown
1. Test failed with Strict Mode Violation (found 2 elements).
2. I added a text filter \`{ name: 'Submit' }\` to the locator.
3. Fix applied to the Page Object.
\`\`\`

### Bad Example
\`\`\`markdown
1. Test timed out.
2. I guessed the new locator is \`/html/body/div/span[2]\`.
*(Violation: Used absolute XPath and guessed without requesting DOM snapshot.)*
\`\`\`
`;
}

export function renderAiUpdateText(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const ext = language === 'python' ? 'py' : 'ts';
  return `# ${toolName} CPOM Framework - Page Object Incremental Updates

You are updating a Page Object to reflect new elements on a page.

## Rules of Incremental Update:
1. Locate the target Page Object file under \`components/pages/{name}.page.${ext}\`.
2. Inspect the new page HTML to identify exactly the new elements.
3. You MUST NOT delete or overwrite >0 manual custom helper methods.
4. Add new elements as typed getters at the end of the element declaration block.

## Edge Cases:
- If a new element conflicts with an existing getter name, prefix the new getter with its parent container name.

## Examples

### Good Example
\`\`\`markdown
1. Located \`login.page.${ext}\`.
2. Appended 1 new getter for the \`Remember Me\` checkbox.
3. Did not modify any existing custom methods.
\`\`\`

### Bad Example
\`\`\`markdown
1. I replaced the entire \`login.page.${ext}\` with the new generated code.
*(Violation: Overwrote existing custom methods instead of appending.)*
\`\`\`
`;
}

export function renderAiFailureAnalystText(tool: string = 'playwright'): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const reportDir =
    tool === 'cypress'
      ? 'cypress/screenshots'
      : tool === 'pytest'
        ? '.pytest_cache'
        : 'playwright-report/index.html';
  return `# ${toolName} CPOM Framework - CI Failure Analysis

You are analyzing a test suite failure.

## Failure Classification:
- **Product Bug**: API returned >= 500, or element is missing.
- **Flaky Test**: Test failed due to timeout > 30s.
- **Selector/Framework Stale**: Selector matched 0 elements.

## Investigation Steps:
1. Locate the test traceback in the CI logs.
2. Read the error message.
3. Inspect artifacts under \`${reportDir}\`.

## Edge Cases:
- If logs are truncated, you MUST ask the user to provide the full log.

## Examples

### Good Example
\`\`\`markdown
1. Read traceback. Found "Timeout exceeded".
2. Checked report. Found 0 elements matched selector.
3. Updated Page Object selector.
\`\`\`

### Bad Example
\`\`\`markdown
1. I assume the network is slow. I will increase timeout to 100s.
*(Violation: Did not investigate logs before changing timeout.)*
\`\`\`
`;
}

export function renderAiAdapterBuilderText(tool: string = 'playwright'): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `# ${toolName} CPOM Framework - Custom Adapter Design

You are building a custom component primitive.

## Rules:
1. You MUST extend \`Component\` or \`Container\`.
2. You MUST NOT add >0 assertions to the adapter.

## Edge Cases:
- If the widget uses Shadow DOM, ensure locators pierce the shadow root.

## Examples

### Good Example
\`\`\`markdown
1. Extended \`Component\`.
2. Added \`selectOption()\` method.
\`\`\`

### Bad Example
\`\`\`markdown
1. Extended \`Component\`.
2. Added \`expect(isVisible).toBeTruthy()\` in adapter.
*(Violation: Placed 1 assertion in the adapter.)*
\`\`\`
`;
}

export function renderAiApiRulesText(tool: string = 'playwright'): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `# ${toolName} CPOM Framework - API Testing Rules

You are writing API tests using \`ApiClient\`.

## Rules:
1. You MUST NOT duplicate client configuration.
2. If an endpoint returns >= 400, your test MUST handle the error.

## Edge Cases:
- If the endpoint requires an auth token, read it from \`.auth/user.json\`.

## Examples

### Good Example
\`\`\`markdown
1. Used \`ApiClient\` to fetch users.
2. Asserted status == 200.
\`\`\`

### Bad Example
\`\`\`markdown
1. I created a new \`fetch\` wrapper inside the test.
*(Violation: Duplicated client configuration.)*
\`\`\`
`;
}

export function renderAiLocatorStrategyText(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';

  let exRole, exLabel, exTestId, exText, exCss;
  if (tool === 'cypress') {
    exRole = `this.child(Button, '[role="button"]:contains("Submit")')`;
    exLabel = `this.child(TextInput, 'label:contains("Username")')`;
    exTestId = `this.child(Component, '[data-testid="success-banner"]')`;
    exText = `this.child(Component, ':contains("Welcome back")')`;
    exCss = `this.child(Component, 'form.login-form input[type="email"]')`;
  } else if (language === 'python') {
    exRole = `self._scope(Button, self._root.get_by_role("button", name="Submit"))`;
    exLabel = `self._scope(TextInput, self._root.get_by_label("Username"))`;
    exTestId = `self._scope(Component, self._root.get_by_test_id("success-banner"))`;
    exText = `self._scope(Component, self._root.get_by_text("Welcome back"))`;
    exCss = `self._scope(Component, self._root.locator("form.login-form input[type='email']"))`;
  } else if (language === 'java') {
    exRole = `new Button(getLocator().getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Submit")))`;
    exLabel = `new TextInput(getLocator().getByLabel("Username"))`;
    exTestId = `new Component(getLocator().getByTestId("success-banner"))`;
    exText = `new Component(getLocator().getByText("Welcome back"))`;
    exCss = `new Component(getLocator().locator("form.login-form input[type='email']"))`;
  } else if (language === 'csharp') {
    exRole = `new Button(Locator.GetByRole(AriaRole.Button, new() { Name = "Submit" }))`;
    exLabel = `new TextInput(Locator.GetByLabel("Username"))`;
    exTestId = `new Component(Locator.GetByTestId("success-banner"))`;
    exText = `new Component(Locator.GetByText("Welcome back"))`;
    exCss = `new Component(Locator.Locator("form.login-form input[type='email']"))`;
  } else {
    exRole = `this.child(Button, { kind: 'role', role: 'button', name: 'Submit' })`;
    exLabel = `this.child(TextInput, { kind: 'label', label: 'Username' })`;
    exTestId = `this.child(Component, { kind: 'testid', testId: 'success-banner' })`;
    exText = `this.child(Component, { kind: 'text', text: 'Welcome back' })`;
    exCss = `this.child(Component, { kind: 'css', css: 'form.login-form input[type="email"]' })`;
  }

  return `# ${toolName} CPOM Framework - Locator Selection Strategy

You are choosing locators to define elements in Page Objects.

## Locator Priority Hierarchy:
1. User-Visible Semantic Roles (e.g., \`${exRole}\`).
2. Form Label (e.g., \`${exLabel}\`).
3. Explicit Test Attributes (e.g., \`${exTestId}\`).
4. Text Content (e.g., \`${exText}\`).
5. Semantic CSS Selectors (e.g., \`${exCss}\`).

## Constraints & Limits:
- You MUST NOT target classes generated by bundlers (e.g. \`.css-1abc99\`).
- You MUST NOT use absolute HTML paths (e.g. \`div > div > span > button\`).
- You MUST NOT use index chaining (e.g. \`.nth(3)\`) unless targeting structured collections.
- You MUST NOT perform >0 assertions inside element getters.

## Edge Cases:
- If 0 semantic roles and 0 test attributes exist, use CSS selectors.

## Examples

### Good Example
\`\`\`markdown
1. Used ARIA role for button.
2. Fallback to \`data-testid\` for container.
\`\`\`

### Bad Example
\`\`\`markdown
1. Used locator \`.css-1abc99 > div > span\`.
*(Violation: Used generated class and absolute path.)*
\`\`\`
`;
}

export function renderClaudeMd(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  return `# Claude Code Project Instructions

@CONVENTIONS.md

**Before inferring anything about the application itself, read \`artifacts/\` first.** It is this project's own memory - what the analysis workflows established and what a human confirmed, written down so it is not rediscovered every time. \`CONVENTIONS.md\` above lists what each file holds and the script that reads it. An entry marked \`reviewed: false\` is a draft, not a fact; a missing file means nobody established that yet, never that the answer is no. This applies to any task, not only the stages that write those files: if you are about to ask about the application or guess at it, look there first.

---

${renderSharedRuleBlocks(tool, language)}
`;
}

export function renderConventionsMd(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const ext = language === 'python' ? 'py' : 'ts';
  const specExt = tool === 'cypress' ? `cy.${ext}` : language === 'python' ? 'py' : `spec.${ext}`;
  const commentPrefix = language === 'python' ? '#' : '//';

  let componentSyntax = '';
  if (tool === 'cypress') {
    componentSyntax = `- Element properties MUST be declared using \`this.child(ComponentClass, selector)\` where selector is a string (e.g. \`this.child(TextInput, 'input[name="user"]')\`).`;
  } else if (language === 'typescript') {
    componentSyntax = `- Element properties MUST be declared as child components via \`this.child(ComponentClass, spec)\` (or \`this.list(ComponentClass, spec)\` for lists), where \`spec\` is a \`LocatorSpec\` object (e.g. \`{ kind: 'css', css: 'input[name="username"]' }\` or \`{ kind: 'role', role: 'button', name: 'Submit' }\`).`;
  } else if (language === 'python') {
    componentSyntax = `- Element properties MUST be exposed via \`@property\` decorators, returning components initialized with \`self._scope(ComponentClass, spec)\`.`;
  } else {
    // Java and C#
    componentSyntax = `- Element properties MUST be exposed as public getters or properties, initialized by passing a nested locator to the primitive's constructor (e.g. \`new TextInput(getLocator().locator("input"))\`).`;
  }

  let exRole, exLabel, exTestId, exText, exCss;
  if (tool === 'cypress') {
    exRole = `this.child(Button, '[role="button"]:contains("Submit")')`;
    exLabel = `this.child(TextInput, 'label:contains("Username")')`;
    exTestId = `this.child(Component, '[data-testid="success-banner"]')`;
    exText = `this.child(Component, ':contains("Welcome back")')`;
    exCss = `this.child(Component, 'form.login-form input[type="email"]')`;
  } else if (language === 'python') {
    exRole = `self._scope(Button, self._root.get_by_role("button", name="Submit"))`;
    exLabel = `self._scope(TextInput, self._root.get_by_label("Username"))`;
    exTestId = `self._scope(Component, self._root.get_by_test_id("success-banner"))`;
    exText = `self._scope(Component, self._root.get_by_text("Welcome back"))`;
    exCss = `self._scope(Component, self._root.locator("form.login-form input[type='email']"))`;
  } else if (language === 'java') {
    exRole = `new Button(getLocator().getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Submit")))`;
    exLabel = `new TextInput(getLocator().getByLabel("Username"))`;
    exTestId = `new Component(getLocator().getByTestId("success-banner"))`;
    exText = `new Component(getLocator().getByText("Welcome back"))`;
    exCss = `new Component(getLocator().locator("form.login-form input[type='email']"))`;
  } else if (language === 'csharp') {
    exRole = `new Button(Locator.GetByRole(AriaRole.Button, new() { Name = "Submit" }))`;
    exLabel = `new TextInput(Locator.GetByLabel("Username"))`;
    exTestId = `new Component(Locator.GetByTestId("success-banner"))`;
    exText = `new Component(Locator.GetByText("Welcome back"))`;
    exCss = `new Component(Locator.Locator("form.login-form input[type='email']"))`;
  } else {
    exRole = `this.child(Button, { kind: 'role', role: 'button', name: 'Submit' })`;
    exLabel = `this.child(TextInput, { kind: 'label', label: 'Username' })`;
    exTestId = `this.child(Component, { kind: 'testid', testId: 'success-banner' })`;
    exText = `this.child(Component, { kind: 'text', text: 'Welcome back' })`;
    exCss = `this.child(Component, { kind: 'css', css: 'form.login-form input[type="email"]' })`;
  }

  // -- Section 6-8 language-native API snippets -----------------------------
  // Section 7: Collection / list API per language
  let listSyntax: string;
  if (language === 'python') {
    listSyntax = '`self._list(ItemComponent, spec)` (returning a list of `ItemComponent`)';
  } else if (language === 'java') {
    listSyntax =
      '`new Collection<>(getLocator().locator(itemSelector))` (returning `Collection<ItemComponent>`)';
  } else if (language === 'csharp') {
    listSyntax =
      '`new Collection<ItemComponent>(Locator.Locator(itemSelector))` (returning `Collection<ItemComponent>`)';
  } else {
    listSyntax = '`this.list(ItemComponent, spec)` (returning `Collection<ItemComponent>`)';
  }

  // Section 6: liveness check examples
  let s6Liveness: string;
  if (language === 'python') {
    s6Liveness =
      '(b) `expect(locator).to_be_visible()`; (c) explicit opacity check via `page.evaluate("el => getComputedStyle(el).opacity", el) != \'0\'`; (d) `locator.click(trial=True)`';
  } else if (language === 'java') {
    s6Liveness =
      '(b) `assertThat(locator).isVisible()`; (c) explicit opacity check via `(String) page.evaluate("el => getComputedStyle(el).opacity", locator.elementHandle())`; (d) `locator.click(new Locator.ClickOptions().setTrial(true))`';
  } else if (language === 'csharp') {
    s6Liveness =
      '(b) `await Expect(locator).ToBeVisibleAsync()`; (c) explicit opacity check via `await Page.EvaluateAsync<string>("el => getComputedStyle(el).opacity", handle)`; (d) `await locator.ClickAsync(new() { Trial = true })`';
  } else {
    s6Liveness =
      "(b) `await expect(locator).toBeVisible()` (note this does NOT catch `opacity: 0`); (c) an explicit opacity check (`getComputedStyle(el).opacity !== '0'`); (d) `await locator.click({ trial: true })` (or `.fill({ trial: true })`)";
  }

  // Section 8: web-first assertion syntax
  let s8Assertion: string;
  if (language === 'python') {
    s8Assertion = '`expect(component.locator).to_be_visible()`';
  } else if (language === 'java') {
    s8Assertion = '`assertThat(component.getLocator()).isVisible()`';
  } else if (language === 'csharp') {
    s8Assertion = '`await Expect(component.Locator).ToBeVisibleAsync()`';
  } else {
    s8Assertion = '`await expect(component.locator).toBeVisible()`';
  }

  // Section 8: async event synchronization
  let s8AsyncSync: string;
  if (language === 'python') {
    s8AsyncSync =
      '- When waiting for asynchronous events (dialogs, popups), always synchronize via `with page.expect_event("dialog") as dialog_info: trigger_action(); dialog = dialog_info.value`.';
  } else if (language === 'java') {
    s8AsyncSync =
      "- When waiting for asynchronous events (dialogs, popups), always synchronize via `page.onDialog(dialog -> { /* handle */ }); triggerAction();` using Playwright Java's event handler pattern.";
  } else if (language === 'csharp') {
    s8AsyncSync =
      '- When waiting for asynchronous events (dialogs, popups), always synchronize via `var dialogTask = Page.WaitForEventAsync(PageEvent.Dialog); await triggerActionAsync(); var dialog = await dialogTask;`.';
  } else {
    s8AsyncSync =
      "- When waiting for asynchronous events (dialogs, popups), always synchronize via `Promise.all([page.waitForEvent('dialog'), triggerAction()])`.";
  }

  // Section 8: route mock API names
  let s8RouteMocks: string;
  if (language === 'python') {
    s8RouteMocks = '`page.route()`/`context.route()`/`browser_context.route()`';
  } else if (language === 'java') {
    s8RouteMocks = '`page.route()`/`context.route()`/`browserContext.route()`';
  } else if (language === 'csharp') {
    s8RouteMocks =
      '`await Page.RouteAsync()`/`await Context.RouteAsync()`/`await BrowserContext.RouteAsync()`';
  } else {
    s8RouteMocks =
      '`page.route()`/`context.route()`/`browserContext.route()`/`routeFromHAR()`, or `cy.intercept()`';
  }

  return `# Project Coding Conventions

## Directory Architecture
| What | Where | Naming |
|---|---|---|
| Page Object class | \`components/pages/\` | \`{name}.page.${ext}\` |
| Shared reusable widgets | \`components/widgets/\` | \`{name}.widget.${ext}\` |
| Base smoke test | \`tests/\` | \`smoke.${specExt}\` |
| Full scenario / regression tests | \`tests/\` | \`{feature}.${specExt}\` |

## What This Project Already Knows

Before asking a question or inferring something about this application, check whether it is already
recorded. These files are written by the analysis workflows and are the project's own memory:

| Artifact | Holds | Read it with |
|---|---|---|
| \`artifacts/analysis/app-profile.json\` | Everything established about the application as a whole: what kind of application it is (production / sandbox-demo / internal tool), its confirmed core purpose, what each role is for, how it talks to its backend (\`apiStyle\`), the crawl boundary a human set, domain knowledge a person volunteered (\`domainNotes\`, including what they wrote under "Your notes" in a review), the pages a person left out of testing (\`leftOutRoutes\` - never map or test one), which test types are in scope | \`node scripts/app-profile.mjs\` |
| \`artifacts/site-map/site-map.json\` | Every known route, its structure, screenshot, HTTP status, per-role access, and the overlays met on it - each with what raised it, what it contains, its own screenshot, and how it was closed | \`node scripts/validate-site-map.mjs\` to check shape |
| \`artifacts/site-map/inventory/<routeId>.json\` | Every control on one page, collected from the live DOM including open shadow roots and same-origin frames - role, accessible name, type, HTML5 constraints, options, whether it sends a result elsewhere (copy, export, download), and where it sits (\`inShadow\`, \`frame\`) - plus its headings, its landmark regions, the frames and drawing surfaces it could not read into, and whether the page was the application at all (\`access\`). Controls marked \`classifiedBy: "assistant"\` have their role only here, not in the markup, so \`getByRole\` cannot find them. \`shared.json\` beside them names the header, navigation, footer and sidebar regions that recur across routes, \`foundBy\` markup or by repetition | \`node scripts/page-inventory.mjs\` (\`record\` writes one, \`classify\` answers what only a reader can place, \`shared\` compares them) |
| \`artifacts/site-map/api-contracts.json\` | Operations actually observed in traffic - method, path template, the operation name for a GraphQL or RPC call, and the response shape | \`node scripts/validate-api-contracts.mjs\` |
| \`artifacts/analysis/feature-map.json\` | Features and the routes they span, the entities this application works with, what can happen to each one, its lifecycle, and the links between them | \`node scripts/derive-feature-map.mjs\` to draft, \`node scripts/validate-feature-map.mjs\` to check shape |
| \`artifacts/analysis/test-conditions.json\` | Per reviewed feature: what it is for, what every field means and should obey (with where that comes from), the research behind it, and its ranked test conditions - each with its layer (field, rule, behaviour, frame), where its expected result comes from (so whether it checks correctness or guards against regression), what it rests on, and its risk and priority. \`artifacts/analysis/field-probes.json\` holds what fields did with typed values, \`artifacts/analysis/research/\` the research per kind of feature | \`node scripts/test-analysis-plan.mjs\` (where the stage is), \`node scripts/validate-test-conditions.mjs\`, \`node scripts/generate-test-conditions.mjs\` (builds and ranks) |
| \`artifacts/test-cases/test-cases.json\` | Drafted test cases, and which are already automated | \`node scripts/validate-journeys.mjs\` |
| \`artifacts/review/<kind>-review.md\` | The current view of the site map, feature map or test conditions, rendered from the JSON. A person may review right in it - tick \`[x]\` what they approve, delete an entry to take it out (a route or page is left out of every later stage, with its test conditions and test cases; a test condition is cut), write a verdict or an answer on its line, correct text in place, add anything else under "Your notes". \`.base/\` beside it keeps the exact rendering each file was made from; \`.pending/\` holds corrections read from it and not applied yet. A file with edits nobody read back is never redrawn | \`node scripts/render-review-artifact.mjs --kind=<kind>\` to render, \`node scripts/apply-review.mjs --kind=<kind>\` to read a person's edits back, \`--done\` once its corrections are applied |
| \`artifacts/analysis/sensor-journal.jsonl\` | Every time the independent records about a page disagreed - the server's status, the page's markup, the screenshot, its traffic, what each role reached, the assistant's own judgment - and how it was settled | \`node scripts/corroboration.mjs --stage=<site-map\\|feature-map>\` to check, \`node scripts/corroboration.mjs report\` for how often each kind of record turned out right |

Three rules govern all of them:

- **Nothing is authoritative until a human reviewed it.** An entry with \`reviewed: false\` is a draft.
  Never treat one as an established fact, and never set \`reviewed: true\` yourself without a person
  actually approving it - in conversation, or by ticking it in the review file.
- **Where independent records disagree, say so rather than pick one.** A conclusion drawn from one
  reading - a screenshot, a label, your own judgment - is checked against what the project records
  independently about the same thing, and a disagreement goes to the person with both sides named.
- **Absence is normal, not an error.** Each file exists only once the workflow that writes it has
  run. A missing file or an empty field means "nobody established this yet" - ask, or proceed
  without it. Never infer that something is false because its record is absent.

Other deterministic helpers worth knowing about, so you never re-derive by hand what a script
already computes: \`scripts/pipeline-status.mjs\` (which analysis stage this project is at and what
runs next), \`scripts/coverage-status.mjs\` (whether the suite meets its exit criteria, and exactly
which routes, test cases or endpoints are still uncovered - a drafted test case counts as automated
only once a spec file carries its \`@journey:\` tag, so keep that tag through every edit),
\`scripts/auth-status.mjs\` (saved
sessions, declared vs captured roles, configured CI provider), \`scripts/auth-questions.mjs\`
(which question the auth flow asks next given the answers so far, and what those answers add up
to - the questions are computed, not composed at the point of asking),
\`scripts/ground-zero-questions.mjs\` (the same for the guided pipeline: the run mode, sessions still
missing for declared roles, and the one question at each stage's gate),
\`scripts/map-site-status.mjs\`
(crawl mode resolution, screenshot pruning and start-of-pass reset), \`scripts/crawl-budget.mjs\`
(whether a given URL may be crawled, what its canonical path template is, and the crawl's own
progress line), \`scripts/visual-copilot.mjs\` (marks a page's navigation candidates with numbered
overlays, then grades what a vision worker says about them - a mark the page never had is dropped,
a proposed URL still goes through the frontier gatekeeper, and "wait, it is still loading" runs
out after two retakes), \`scripts/overlay-ledger.mjs\` (every modal, drawer, banner and native dialog
the crawl meets: which dismissal the crawl boundary permits, how many attempts are left, and what is
still open - an overlay left open makes every later click land on a backdrop with no error at all),
\`scripts/page-inventory.mjs\` (what is on each page, collected in the browser rather than read off by
eye - inside open shadow roots and same-origin frames too - whether the page is the application at
all or a bot check or block page standing in for it, which elements only a reader can place
(\`classify\` checks every answer against what it asked), and which frame regions recur across routes
as shared widgets, marked up or not), \`scripts/test-analysis-plan.mjs\` (which test basis the
condition stage works from, the one question about what a person already knows, and which feature
is at which of its steps - understand, research, extract, write the ideas, generate), \`scripts/field-probe.mjs\` (what a field does with a typed
value, read back and recorded - only when the crawl boundary allows interaction, and a submit only
where it allows any action on an application a person said is not production),
\`scripts/test-research.mjs\` (research on how a kind of feature is tested, kept per kind of feature,
with at least five sources from four sites and no query that names the application),
\`scripts/skill-briefing.mjs\` (what a given skill is about to do,
how, why, and what is worth knowing before agreeing to it - printed verbatim by every skill before
it runs anything, and by the pipeline at each stage gate),
\`scripts/render-review-artifact.mjs\` (renders any
review artifact from its own stored JSON), \`scripts/apply-review.mjs\` (reads back what a person ticked,
answered, cut or corrected in a review file - exactly, against the rendering they edited, refusing a
file made from an older JSON and handing every edit it cannot apply itself back as a correction),
\`scripts/corroboration.mjs\` (whether what a stage concluded about a page agrees with the independent
records about it, and a journal of every disagreement and who turned out right),
\`scripts/env-role-stubs.mjs\` (per-role credential slots
in \`.env\`), and \`scripts/orchestrate-swarm.mjs\` (parallel work-unit planning).

**A stage that produces many units of work commits them one at a time.** \`scripts/artifact-journal.mjs\`
is the shared mechanism: \`begin --stage=<slug>\` opens an append-only journal,
\`record --stage=<slug> --id=<unit> --file=<json>\` commits one finished unit to disk immediately, and
\`fold --stage=<slug> --into=<artifact> --key=<field>\` assembles the final artifact from what was
recorded. Never hold a whole collection in memory and write it once at the end - a run that dies
part-way then loses everything it had already done, and a long crawl or a large test-condition pass
dies part-way more often than it finishes cleanly. Because the journal survives, \`begin\` also tells
you what a previous interrupted run already finished, so the work resumes instead of restarting;
recording the same id again supersedes the earlier record rather than duplicating it. Discard a
journal only after the stage's own validator has passed on the folded artifact.

Put \`E2E_DEBUG=1\` in \`.env\` (or export it in the shell for a single run - a real environment
variable overrides the file) to have the helper scripts record what they were asked and what they
answered to \`artifacts/.debug/<script>.ndjson\`; \`node scripts/debug-log.mjs tail\` reads it back,
and \`node scripts/debug-log.mjs status\` says whether it is currently on. It is off by default and
is for diagnosing a finished run without paying for another one - not something to leave on.

Ask \`coverage-status\` before claiming a suite is finished, and order any large batch of test
work by route impact (each route's own \`criticality\` in feature-map.json, \`high\` first) - a batch that
runs out of room mid-way leaves whatever the ordering put first.

A relation in \`feature-map.json\` is a precondition, not a note: \`references\` means the target has
to exist before this entity can be created, so a test that creates one has to create the other
first. \`contains\` means the two live and die together and needs no separate setup. Check the
relation's \`confidence\` before leaning on it - \`inferred\` means it was read off a field name, and a
human confirmed it at sign-off rather than a machine observing it.

An entry in \`api-contracts.json\` whose \`operation.style\` is \`opaque\` means the call was seen and
could not be decoded - a server action, a form post, a binary payload. It names no operation on
purpose. Treat it as a known limit rather than a hole to fill: never write a test against an
endpoint reconstructed from what an opaque call's path looked like it probably meant.

## CPOM Architecture Rules

### 1. The "No Assertions" Rule
- You MUST NOT place assertions (\`expect\`, \`assert\`) inside a Component or Page Object.
- Assertions belong ONLY in the test spec.

### 2. Point-in-time Reads (\`Now()\` suffix)
- Any method that reads state without waiting MUST be suffixed with \`Now()\`.
- If it waits, it MUST NOT have the \`Now()\` suffix.

### 3. Component Decomposition
- If a BasePage has >10 locators, decompose it into reusable \`Container\` components.

### 4. Scoped Locators & Primitives
${componentSyntax}

### 5. Scoped Locators Priority Hierarchy
1. User-Visible Semantic Roles (e.g., \`${exRole}\`).
2. Form Label (e.g., \`${exLabel}\`).
3. Explicit Test Attributes (e.g., \`${exTestId}\`).
4. Text Content (e.g., \`${exText}\`).
5. Semantic CSS Selectors (e.g., \`${exCss}\`).

- You MUST NOT target classes generated by bundlers (e.g. \`.css-1abc99\`).
- You MUST NOT use absolute HTML paths (e.g. \`div > div > span > button\`).
- You MUST NOT use index chaining unless targeting structured collections.

### 6. Execution-First SDET Protocol & Mandatory Live-DOM Liveness Parity
- Every Page Object in \`components/pages/<name>.page.${ext}\` MUST be verified directly against the live DOM before being treated as complete (1:1 strict parity between Page Objects and verified pages).
- Autonomous Execution: Whenever creating or modifying Page Objects, you MUST immediately verify them against the live application (via the embedded Playwright MCP tools or the direct test runner).
- Actionable Visibility, Not Mere DOM Presence: an element existing in the DOM/accessibility tree is NEVER sufficient evidence to scaffold a property or method for it - a hidden nav search input becoming a phantom \`searchInput\`/\`search()\` is exactly this failure mode. Before scaffolding a locator, confirm per element: (a) it resolves uniquely; ${s6Liveness} to run Playwright's full actionability pipeline (stable, not obscured by another element, enabled) without performing the action. Remove any already-scaffolded property that fails this check.
- Self-Healing vs Real Bugs:
  * If verification fails due to selector drift / timing, perform 4-Point Trace Triage with **Visual Diff & Screenshot Overlay** (comparing pre/post failure frames to distinguish semantic text/icon shifts from broken rendering), adjust locators and re-verify under the Two-Strike Rule.
  * If a genuine application defect is found (backend 500, broken UI), document the real bug clearly without masking.
- Mandatory Handoff Report: Always list created Page Objects, liveness verification results, test execution results (pass/fail counts), and any detected real application defects.
- Zero Unverified Code Policy: You MUST NOT hand off unverified or failing code to the user.

### 7. Bounded DOM Exploration & Anti-Infinite-Scroll Protocol
- When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
- Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
- Immediately synthesize a CPOM Collection property via ${listSyntax} and terminate page exploration.
- All DOM exploration and scrolling loops MUST have a hard iteration ceiling (maximum 3 iterations); unbounded \`while(true)\` exploration is strictly prohibited.

### 8. Web-First Assertions & Prohibition of *Now() in Expectations
- You MUST use Web-First auto-retrying assertions: ${s8Assertion}.
- Point-in-time snapshot reader methods with \`Now()\` suffix (e.g. \`isVisibleNow()\`, \`valueNow()\`) MUST NOT be used inside assertions.
${s8AsyncSync}
- Use \`apiClient\` zero-dependency TDM generators: \`createUniqueId()\`, \`createTestEmail()\`, \`createTestPhone()\`, \`createTestPassword()\`, \`createTestUuid()\`, \`createTestName()\`, \`createTestAmount()\`, \`createTestDate()\`.
- NEVER register a network route mock/interception (${s8RouteMocks}) to force a failing test to pass - fix the real defect the test is exposing instead. The CPOM linter rejects any unannotated route mock found in a test spec; if isolating unrelated 3rd-party traffic (analytics, Sentry) is genuinely required, annotate the exact line with \`${commentPrefix} @allow-mock: <reason>\` stating why.

### 9. Frontend Framework Hydration Helpers
- When testing applications built with React, Next.js, or hydration-dependent SPA frameworks, wait for hydration before interacting with elements to eliminate synthetic click misses and state resets.
- ${resolveHydrationSnippet(language)}
`;
}

export function renderAiderConf(automationTool: string = 'playwright', language?: string): string {
  const isCypress = automationTool.toLowerCase().includes('cypress');
  const isPython = language === 'python';
  const isDotnet = language === 'csharp';
  const isJava = language === 'java';

  const testCmd = isCypress
    ? 'npx cypress run'
    : isPython
      ? 'pytest'
      : isDotnet
        ? 'dotnet test'
        : isJava
          ? 'mvn test'
          : 'npx playwright test';

  const hasCpomLinter = !isPython && !isDotnet && !isJava;

  return `read:
  - CONVENTIONS.md
test-cmd: ${testCmd}
auto-test: false
${hasCpomLinter ? 'lint-cmd: npm run lint:cpom\nauto-lint: false\n' : ''}`;
}

// The 7 task-workflow blocks shared verbatim by AGENTS.md and CLAUDE.md (Locator Strategy is
// deliberately excluded here - CONVENTIONS.md already carries the canonical CPOM locator contract,
// and duplicating it into every always-loaded root file wastes context for zero benefit; a reader
// that needs it is pointed at CONVENTIONS.md instead, per each file's own header line/import).
function renderSharedRuleBlocks(tool: string, language: string): string {
  return `${renderAiHarmonizeText(tool, language)}

---

${renderAiGenerateText(tool, language)}

---

${renderAiDoctorText(tool)}

---

${renderAiUpdateText(tool, language)}

---

${renderAiAdapterBuilderText(tool)}

---

${renderAiFailureAnalystText(tool)}

---

${renderAiApiRulesText(tool)}`;
}

export function renderAgentsMd(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  return `# Project Rules & Agent Instructions

This project is configured with native rules for Cursor, Devin Desktop, Copilot, Aider, and Claude Code. For the full CPOM component/locator contract (directory layout, assertion rules, locator priority, TDM helpers), see \`CONVENTIONS.md\`.

**Before inferring anything about the application itself - what it is for, what its pages are, who its users are, what its API looks like - read \`artifacts/\` first.** That directory is this project's own memory: everything the analysis workflows established, and everything a human confirmed, is written down there rather than being rediscovered each time. \`CONVENTIONS.md\` lists what each file holds and the script that reads it. Two rules govern all of it: an entry marked \`reviewed: false\` is a draft and not a fact, and a missing file means nobody has established that yet - never that the answer is no.

This applies to any task, not only to the analysis stages that write those files. If you are about to ask the human something about their application, or guess at it, check there first - the answer may already be recorded.

---

${renderSharedRuleBlocks(tool, language)}
`;
}

// Path/glob-scoped rule files: Cursor (.cursor/rules/*.mdc), Devin Desktop (.devin/rules/*.md),
// and GitHub Copilot (.github/instructions/*.instructions.md) each support the same underlying
// idea - full rule content delivered only when a matching file is actually being touched - through
// 3 different native frontmatter shapes. One task table plus one renderer per assistant replaces
// what used to be ~23 near-duplicate one-off functions with no shared source of truth.
export type RuleTaskKey =
  | 'harmonize'
  | 'generate'
  | 'doctor'
  | 'update'
  | 'locator-strategy'
  | 'adapter-builder'
  | 'failure-analyst'
  | 'api';

export const RULE_TASK_KEYS: readonly RuleTaskKey[] = [
  'harmonize',
  'generate',
  'doctor',
  'update',
  'locator-strategy',
  'adapter-builder',
  'failure-analyst',
  'api',
];

function ruleTaskGlobs(task: RuleTaskKey, tool: string, language: string): string {
  const ext = language === 'python' ? 'py' : 'ts';
  switch (task) {
    case 'harmonize': {
      const configFile =
        tool === 'cypress'
          ? `cypress.config.${ext}`
          : tool === 'pytest'
            ? 'pyproject.toml'
            : `playwright.config.${ext}`;
      return `${configFile}, .env*, package.json, components/primitives/**/*`;
    }
    case 'generate':
      return 'tests/**/*, components/pages/**/*';
    case 'doctor':
      return 'components/**/*, tests/**/*';
    case 'update':
      return 'components/pages/**/*';
    case 'locator-strategy':
      return 'components/**/*, tests/**/*, shared/utils/**/*';
    case 'adapter-builder':
      return 'components/primitives/**/*, components/widgets/**/*';
    case 'failure-analyst': {
      const reportGlobs =
        tool === 'cypress'
          ? 'cypress/screenshots/**/*'
          : tool === 'pytest'
            ? '.pytest_cache/**/*'
            : 'playwright-report/**/*, test-results/**/*';
      return `${reportGlobs}, .github/workflows/**/*`;
    }
    case 'api':
      return 'tests/api/**/*, tests/**/*, shared/utils/api-client.*';
  }
}

function ruleTaskDescription(task: RuleTaskKey, toolName: string): string {
  switch (task) {
    case 'harmonize':
      return `Reconcile and align the ${toolName} CPOM framework configuration with the target app.`;
    case 'generate':
      return `Generate Page Objects and ${toolName} tests for new pages.`;
    case 'doctor':
      return 'Diagnose and repair broken selectors or failing assertions.';
    case 'update':
      return 'Incrementally add new fields/properties/methods to an existing Page Object.';
    case 'locator-strategy':
      return 'Rules for choosing resilient, user-centric locators.';
    case 'adapter-builder':
      return 'Develop custom primitives or component adapters following the Method Safety Contract.';
    case 'failure-analyst':
      return 'Inspect and resolve CI/CD test run errors and crash tracebacks.';
    case 'api':
      return 'Perform API request testing or pre-test data setup using the ApiClient helper.';
  }
}

function ruleTaskBody(task: RuleTaskKey, tool: string, language: string): string {
  switch (task) {
    case 'harmonize':
      return renderAiHarmonizeText(tool, language);
    case 'generate':
      return renderAiGenerateText(tool, language);
    case 'doctor':
      return renderAiDoctorText(tool);
    case 'update':
      return renderAiUpdateText(tool, language);
    case 'locator-strategy':
      return renderAiLocatorStrategyText(tool, language);
    case 'adapter-builder':
      return renderAiAdapterBuilderText(tool);
    case 'failure-analyst':
      return renderAiFailureAnalystText(tool);
    case 'api':
      return renderAiApiRulesText(tool);
  }
}

// Cursor: .cursor/rules/<task>.mdc - live-verified 2026: the .mdc extension is mandatory (a plain
// .md file in .cursor/rules is silently ignored, no frontmatter parsed), frontmatter is
// description/globs/alwaysApply. alwaysApply: false because every one of these is scoped to a
// specific glob, never meant to load into every chat session regardless of what's open.
export function renderCursorRuleFile(
  task: RuleTaskKey,
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `---
description: ${yamlSafeScalar(ruleTaskDescription(task, toolName))}
globs: ${yamlSafeScalar(ruleTaskGlobs(task, tool, language))}
alwaysApply: false
---
${ruleTaskBody(task, tool, language)}
`;
}

// Devin Desktop (Windsurf's 2026 rebrand): .devin/rules/<task>.md - live-verified 2026: plain .md
// (not .mdc), frontmatter is trigger/globs/description. trigger: glob activates the rule only when
// a matching file is open/edited, mirroring Cursor's own glob-scoping via a different field name.
export function renderDevinRuleFile(
  task: RuleTaskKey,
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `---
trigger: glob
globs: ${yamlSafeScalar(ruleTaskGlobs(task, tool, language))}
description: ${yamlSafeScalar(ruleTaskDescription(task, toolName))}
---
${ruleTaskBody(task, tool, language)}
`;
}

// GitHub Copilot: .github/instructions/<task>.instructions.md - live-verified 2026: the confirmed
// required field is applyTo (one or more path globs); repo-wide .github/copilot-instructions.md
// stays the always-loaded overview, these are the path-scoped supplements.
export function renderCopilotPathInstructions(
  task: RuleTaskKey,
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  return `---
applyTo: ${yamlSafeScalar(ruleTaskGlobs(task, tool, language))}
---
${ruleTaskBody(task, tool, language)}
`;
}

export function renderCopilotInstructions(tool?: string, language?: string): string {
  const t = tool ?? 'playwright';
  const l = language ?? 'typescript';
  return `# GitHub Copilot Workspace Instructions

For the full CPOM component/locator contract (directory layout, assertion rules, locator priority, TDM helpers), see \`CONVENTIONS.md\`. Path-scoped rules for specific tasks (harmonize, generate, locator strategy, etc.) live under \`.github/instructions/*.instructions.md\`.

## Framework Harmonization
${renderAiHarmonizeText(t, l)}

## Page Object & Test Generation
${renderAiGenerateText(t, l)}

## Selector Self-Healing & Verification
${renderAiDoctorText(t)}

## Page Object Incremental Updates
${renderAiUpdateText(t, l)}

## Custom Adapter & Primitive Design
${renderAiAdapterBuilderText(t)}

## CI Failure Analysis
${renderAiFailureAnalystText(t)}

## API Testing & Setup Rules
${renderAiApiRulesText(t)}`;
}
