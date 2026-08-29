// Centralized AI rules templates for all major coding assistants. create-if-absent.

export function renderAiHarmonizeText(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'ts';
  const configFile =
    tool === 'cypress'
      ? `cypress.config.${ext}`
      : tool === 'pytest'
        ? 'pyproject.toml'
        : `playwright.config.${ext}`;
  const eitrConfig = tool === 'pytest' ? 'pytest.ini' : `eitr.config.${ext}`;

  return `# ${toolName} CPOM Framework - Harmonization Rules

You are modifying a ${toolName} CPOM framework setup.

## Constraints & Limits:
- **NO NEW FILES**: You must NOT create >0 new test files, folders, or Page Objects.
- **MODIFY ONLY**: You are permitted to modify exactly these files:
  - \`${eitrConfig}\`, \`${configFile}\`, \`.env.example\`, \`.env\`, \`package.json\`.
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
3. Updated \`${eitrConfig}\` test-id property to \`data-qa\`.
\`\`\`

### Bad Example
\`\`\`markdown
1. I created a new Page Object to test the new configuration.
*(Violation: Created >0 new files which is prohibited.)*
\`\`\`
`;
}

export function renderAiGenerateText(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'ts';
  const specExt = tool === 'cypress' ? `cy.${ext}` : language === 'python' ? 'py' : `spec.${ext}`;

  let componentSyntax = '';
  if (tool === 'cypress') {
    componentSyntax = `- Element properties MUST be declared using \`this.child(ComponentClass, selector)\` where selector is a string (e.g. \`this.child(TextInput, 'input[name="user"]')\`).`;
  } else if (language === 'typescript' || language === 'javascript') {
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
- Self-Healing vs Real Bugs:
  * If verification fails due to selector drift / timing, perform 4-Point Trace Triage with **Visual Diff & Screenshot Overlay** (comparing pre/post failure frames to distinguish semantic text/icon shifts from broken rendering), adjust locators and re-verify under the Two-Strike Rule.
  * If a genuine application defect is found (backend 500, broken UI), document the real bug clearly without masking.
- Mandatory Handoff Report: Always list created Page Objects, liveness verification results, test execution results (pass/fail counts), and any detected real application defects.
- Zero Unverified Code Policy: You MUST NOT hand off unverified or failing code to the user.

### 7. AST Linear Test Synthesis & TMS Tagging Rules
- **Strict Linearity (Zero Branching):** ABSOLUTELY NO conditional logic (\`if/else\`, \`switch\`), NO loops (\`for/while/forEach\`), and NO \`try/catch\` wrapping assertions inside test specs.
- **Step Demarcation:** Every step MUST be explicitly demarcated with \`await test.step('Step N: <action>', async () => { ... })\` (or \`cy.step()\`).
- **Dependency Injection via Fixtures:** Never instantiate Page Objects via constructor (\`new LoginPage(page)\`) inside test files. Always inject them through fixture extensions (\`test.extend<{ loginPage: LoginPage, apiClient: ApiClient }>()\`).
- **Metadata Tagging:** For every TMS scenario test, attach the ticket metadata tag: \`test('TC-{id}: {title}', { tag: ['@TC-{id}'] }, async ({ ... }) => ...)\`.
- **Test Runner Execution Command:** Run tests using \`${tool === 'cypress' ? 'npx cypress run' : language === 'python' ? 'pytest' : language === 'csharp' ? 'dotnet test' : language === 'java' ? 'mvn test' : 'npx playwright test'}\`.

### 8. Test Data Management (TDM) & Dual-Layer Validation
- **Dynamic TDM:** Never hardcode user emails, phone numbers, or entity IDs. Use zero-dependency generators from \`apiClient\`: \`createUniqueId()\`, \`createTestEmail()\`, \`createTestPhone()\`, \`createTestPassword()\`, \`createTestUuid()\`, \`createTestName()\`, \`createTestAmount()\`, \`createTestDate()\` for collision-free data isolation.
- **Teardown Lifecycle:** Register created backend resources via \`apiClient.registerTeardown(async () => { ... })\`. The \`apiClient\` fixture automatically cleans up all resources post-test.
- **Dual-Layer Assertions:** Validate UI DOM changes AND verify backend response codes (HTTP 200/201) via \`apiClient\` or \`page.waitForResponse()\`.
- **Web-First Auto-Retrying Assertions:** All assertions MUST use Web-First auto-retrying matchers: \`await expect(locator).toBeVisible()\`. Point-in-time snapshot readers (\`*Now()\` suffix) MUST NOT be used inside \`expect()\`.
- **Race-Free Event Synchronization:** Whenever handling asynchronous dialogs, downloads, or popup windows, ALWAYS set up the listener before the triggering action: \`await Promise.all([page.waitForEvent('dialog'), button.click()])\`.

### 9. Bounded DOM Exploration & Anti-Infinite-Scroll Protocol
- **Anti-Infinite-Scroll Guard:** When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
- **Max 2 Viewport Scrolls:** Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
- **Immediate Collection Synthesis:** Immediately synthesize a CPOM Collection property via \`this.list(ItemComponent, spec)\` (returning \`Collection<ItemComponent>\`) and terminate page exploration.
- **Bounded Exploration Loops:** All DOM exploration and scrolling loops MUST have a hard iteration ceiling (maximum 3 iterations); unbounded \`while(true)\` exploration is strictly prohibited.

### 10. Protocol 123 SDET Engineering Standard
Whenever tasked with automating tickets, establishing baselines, or refactoring code by Protocol 123 (e.g. "via 123", "automate via 123", "/123"):
- **Phase 0 (Baseline):** Confirm clean project state via \`${tool === 'cypress' ? 'npx cypress run' : language === 'python' ? 'pytest' : language === 'csharp' ? 'dotnet test' : language === 'java' ? 'mvn test' : 'npx playwright test'}\`.
- **Phase 1 (Recon & Web Search):** Inspect live DOM, site-map, and launch Web Search subagents to query official docs for target widgets.
- **Phase 2 (Spec Formulation):** Output the Automation Proposal Artifact before writing code.
- **Phase 3 (Plan Review & Arbiter):** Review swarm ('assertion-auditor', 'sdet-architect', 'flake-sentinel') audits plan; 'review-arbiter' filters false positives.
- **Phase 4 (Human Intent Lock):** Present Proposal to user; ZERO code until approved.
- **Phase 5 (TDD Dual Synthesis):** 'pom-engineer' synthesizes CPOM components and verifies each against the live DOM, then 'test-automator' writes linear test code.
- **Phase 6 (Code Review & Arbiter):** Reviewers inspect diff; 'review-arbiter' evaluates comments and approves.
- **Phase 7 (Two-Strike Self-Healing):** Isolated test run (\`${tool === 'cypress' ? 'npx cypress run' : language === 'python' ? 'pytest' : language === 'csharp' ? 'dotnet test' : language === 'java' ? 'mvn test' : 'npx playwright test'}\`); max 2 attempts, automatic rollback via \`git checkout -- <files>\` if red.
- **Phase 8 (Quality Gate & Handoff):** Run linters and the test suite, present Final Handoff Report with Protocol 123 Telemetry Summary table (Phase, Duration, Est. Tokens In/Out, Est. Cost, Status).

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
  const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'ts';
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
  return renderAgentsMd(tool, language).replace(
    'Project Rules & Agent Instructions',
    'Claude Code Project Instructions',
  );
}

export function renderConventionsMd(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'ts';
  const specExt = tool === 'cypress' ? `cy.${ext}` : language === 'python' ? 'py' : `spec.${ext}`;

  let componentSyntax = '';
  if (tool === 'cypress') {
    componentSyntax = `- Element properties MUST be declared using \`this.child(ComponentClass, selector)\` where selector is a string (e.g. \`this.child(TextInput, 'input[name="user"]')\`).`;
  } else if (language === 'typescript' || language === 'javascript') {
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

  return `# Project Coding Conventions

## Directory Architecture
| What | Where | Naming |
|---|---|---|
| Page Object class | \`components/pages/\` | \`{name}.page.${ext}\` |
| Shared reusable widgets | \`components/widgets/\` | \`{name}.widget.${ext}\` |
| Base smoke test | \`tests/\` | \`smoke.${specExt}\` |
| Full scenario / regression tests | \`tests/\` | \`{feature}.${specExt}\` |

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
- Self-Healing vs Real Bugs:
  * If verification fails due to selector drift / timing, adjust locators and re-verify under the Two-Strike Rule.
  * If a genuine application defect is found (backend 500, broken UI), document the real bug clearly without masking.
- Mandatory Handoff Report: Always list created Page Objects, liveness verification results, test execution results (pass/fail counts), and any detected real application defects.
- Zero Unverified Code Policy: You MUST NOT hand off unverified or failing code to the user.

### 7. Bounded DOM Exploration & Anti-Infinite-Scroll Protocol
- When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
- Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
- Immediately synthesize a CPOM Collection property via \`this.list(ItemComponent, spec)\` (returning \`Collection<ItemComponent>\`) and terminate page exploration.
- All DOM exploration and scrolling loops MUST have a hard iteration ceiling (maximum 3 iterations); unbounded \`while(true)\` exploration is strictly prohibited.

### 8. Web-First Assertions & Prohibition of *Now() in Expectations
- You MUST use Web-First auto-retrying assertions: \`await expect(component.locator).toBeVisible()\`.
- Point-in-time snapshot reader methods with \`Now()\` suffix (e.g. \`isVisibleNow()\`, \`valueNow()\`) MUST NOT be used inside \`expect()\` assertions.
- When waiting for asynchronous events (dialogs, popups), always synchronize via \`Promise.all([page.waitForEvent('dialog'), triggerAction()])\`.
- Use \`apiClient\` zero-dependency TDM generators: \`createUniqueId()\`, \`createTestEmail()\`, \`createTestPhone()\`, \`createTestPassword()\`, \`createTestUuid()\`, \`createTestName()\`, \`createTestAmount()\`, \`createTestDate()\`.

### 9. Protocol 123 SDET Engineering Standard
- Whenever tasked with automating tickets, establishing baselines, or refactoring code by Protocol 123:
  * Phase 0: Baseline Verification
  * Phase 1: Recon & Live Web Search
  * Phase 2: Spec Formulation (Automation Proposal Artifact)
  * Phase 3: Plan Review Swarm & review-arbiter Adjudication
  * Phase 4: Human Intent Lock (Approval Gateway)
  * Phase 5: TDD Dual Synthesis (Shared Primitives First -> Linear Test)
  * Phase 6: Code Review Swarm & review-arbiter Adjudication
  * Phase 7: Two-Strike Self-Healing (4-Point Trace Triage with Visual Diff & Screenshot Overlay + Rollback)
  * Phase 8: Quality Gate & Final Handoff Report with Telemetry Summary table
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

export function renderAgentsMd(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  return `# Project Rules & Agent Instructions

This project is configured with native rules for Cursor, Windsurf, Copilot, Aider, and Claude Code.

---

${renderAiHarmonizeText(tool, language)}

---

${renderAiGenerateText(tool, language)}

---

${renderAiDoctorText(tool)}

---

${renderAiUpdateText(tool, language)}

---

${renderAiLocatorStrategyText(tool, language)}

---

${renderAiAdapterBuilderText(tool)}

---

${renderAiFailureAnalystText(tool)}

---

${renderAiApiRulesText(tool)}
`;
}

export function renderCursorrulesHarmonize(tool?: string, language?: string): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'ts';
  const configFile =
    tool === 'cypress'
      ? `cypress.config.${ext}`
      : tool === 'pytest'
        ? 'pyproject.toml'
        : `playwright.config.${ext}`;
  const eitrConfig = tool === 'pytest' ? 'pytest.ini' : `eitr.config.${ext}`;
  return `---
description: Reconcile and align the ${toolName} CPOM framework configuration with the target app.
globs: ${eitrConfig}, ${configFile}, .env*, package.json, components/primitives/**/*
---
${renderAiHarmonizeText(tool, language)}
`;
}

export function renderCursorrulesGenerate(tool?: string, language?: string): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `---
description: Generate Page Objects and ${toolName} tests for new pages.
globs: tests/**/*, components/pages/**/*
---
${renderAiGenerateText(tool, language)}
`;
}

export function renderCursorrulesDoctor(tool?: string): string {
  return `---
description: Diagnose and repair broken selectors or failing assertions.
globs: components/**/*, tests/**/*
---
${renderAiDoctorText(tool)}
`;
}

export function renderCursorrulesUpdate(tool?: string, language?: string): string {
  return `---
description: Incrementally add new fields/properties/methods to an existing Page Object.
globs: components/pages/**/*
---
${renderAiUpdateText(tool, language)}
`;
}

export function renderCursorrulesLocatorStrategy(tool?: string, language?: string): string {
  return `---
description: Rules for choosing resilient, user-centric locators.
globs: components/**/*, tests/**/*, shared/utils/**/*
---
${renderAiLocatorStrategyText(tool, language)}
`;
}

export function renderCursorrulesAdapterBuilder(tool?: string): string {
  return `---
description: Develop custom primitives or component adapters following the Method Safety Contract.
globs: components/primitives/**/*, components/widgets/**/*
---
${renderAiAdapterBuilderText(tool)}
`;
}

export function renderCursorrulesFailureAnalyst(tool?: string): string {
  const isCypress = tool === 'cypress';
  const isPytest = tool === 'pytest';
  const reportGlobs = isCypress
    ? 'cypress/screenshots/**/*'
    : isPytest
      ? '.pytest_cache/**/*'
      : 'playwright-report/**/*, test-results/**/*';
  return `---
description: Inspect and resolve CI/CD test run errors and crash tracebacks.
globs: ${reportGlobs}, .github/workflows/**/*
---
${renderAiFailureAnalystText(tool)}
`;
}

export function renderCursorrulesApi(tool?: string): string {
  return `---
description: Perform API request testing or pre-test data setup using the ApiClient helper.
globs: tests/api/**/*, tests/**/*, shared/utils/api-client.*
---
${renderAiApiRulesText(tool)}
`;
}

export function renderWindsurfHarmonize(tool?: string, language?: string): string {
  return renderAiHarmonizeText(tool, language);
}

export function renderWindsurfGenerate(tool?: string, language?: string): string {
  return renderAiGenerateText(tool, language);
}

export function renderWindsurfDoctor(tool?: string): string {
  return renderAiDoctorText(tool);
}

export function renderWindsurfUpdate(tool?: string, language?: string): string {
  return renderAiUpdateText(tool, language);
}

export function renderWindsurfLocatorStrategy(tool?: string, language?: string): string {
  return renderAiLocatorStrategyText(tool, language);
}

export function renderWindsurfAdapterBuilder(tool?: string): string {
  return renderAiAdapterBuilderText(tool);
}

export function renderWindsurfFailureAnalyst(tool?: string): string {
  return renderAiFailureAnalystText(tool);
}

export function renderWindsurfApi(tool?: string): string {
  return renderAiApiRulesText(tool);
}

export function renderCopilotInstructions(tool?: string, language?: string): string {
  return `# GitHub Copilot Workspace Instructions

## Framework Harmonization
${renderAiHarmonizeText(tool, language)}

## Page Object & Test Generation
${renderAiGenerateText(tool, language)}

## Locator Selection Strategy
${renderAiLocatorStrategyText(tool)}

## Selector Self-Healing & Verification
${renderAiDoctorText(tool)}

## Page Object Incremental Updates
${renderAiUpdateText(tool, language)}

## Custom Adapter & Primitive Design
${renderAiAdapterBuilderText(tool)}

## CI Failure Analysis
${renderAiFailureAnalystText(tool)}

## API Testing & Setup Rules
${renderAiApiRulesText(tool)}`;
}

export function renderClaudeHarmonize(tool?: string, language?: string): string {
  return renderGeminiHarmonize(tool, language);
}

export function renderClaudeGenerate(tool?: string, language?: string): string {
  return renderGeminiGenerate(tool, language);
}

export function renderClaudeLocatorStrategy(tool?: string, language?: string): string {
  return renderGeminiLocatorStrategy(tool, language);
}

export function renderClaudeDoctor(tool?: string): string {
  return renderGeminiDoctor(tool);
}

export function renderClaudeUpdate(tool?: string, language?: string): string {
  return renderGeminiUpdate(tool, language);
}

export function renderClaudeAdapterBuilder(tool?: string): string {
  return renderGeminiAdapterBuilder(tool);
}

export function renderClaudeFailureAnalyst(tool?: string): string {
  return renderGeminiFailureAnalyst(tool);
}

export function renderClaudeApi(tool?: string): string {
  return renderGeminiApi(tool);
}

export function renderGeminiHarmonize(tool?: string, language?: string): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `---
name: framework-harmonizer
description: Reconciles and aligns the ${toolName} CPOM framework with the actual target application.
---
${renderAiHarmonizeText(tool, language)}
`;
}

export function renderGeminiGenerate(tool?: string, language?: string): string {
  const toolName = tool === 'cypress' ? 'Cypress' : tool === 'pytest' ? 'pytest' : 'Playwright';
  return `---
name: cpom-generator
description: Generates component-based Page Objects and ${toolName} tests.
---
${renderAiGenerateText(tool, language)}
`;
}

export function renderGeminiLocatorStrategy(tool?: string, language?: string): string {
  return `---
name: locator-strategy
description: Rules for choosing resilient, user-centric locators.
---
${renderAiLocatorStrategyText(tool, language)}
`;
}

export function renderGeminiDoctor(tool?: string): string {
  return `---
name: selector-doctor
description: Repairs broken selectors and assertions using live page DOM insights.
---
${renderAiDoctorText(tool)}
`;
}

export function renderGeminiUpdate(tool?: string, language?: string): string {
  return `---
name: cpom-updater
description: Performs incremental Page Object additions safely preserving manual code.
---
${renderAiUpdateText(tool, language)}
`;
}

export function renderGeminiAdapterBuilder(tool?: string): string {
  return `---
name: adapter-builder
description: Builds custom widget adapters complying with Method Safety rules.
---
${renderAiAdapterBuilderText(tool)}
`;
}

export function renderGeminiFailureAnalyst(tool?: string): string {
  return `---
name: ci-analyst
description: Diagnoses and debugs CI/CD failure tracebacks, screenshots, and logs.
---
${renderAiFailureAnalystText(tool)}
`;
}

export function renderGeminiApi(tool?: string): string {
  return `---
name: api-testing
description: Develops API tests and handles pre-test data preparation via HTTP/GraphQL.
---
${renderAiApiRulesText(tool)}
`;
}

export function renderCodexHarmonize(tool?: string, language?: string): string {
  return renderGeminiHarmonize(tool, language);
}

export function renderCodexGenerate(tool?: string, language?: string): string {
  return renderGeminiGenerate(tool, language);
}

export function renderCodexLocatorStrategy(tool?: string, language?: string): string {
  return renderGeminiLocatorStrategy(tool, language);
}

export function renderCodexDoctor(tool?: string): string {
  return renderGeminiDoctor(tool);
}

export function renderCodexUpdate(tool?: string, language?: string): string {
  return renderGeminiUpdate(tool, language);
}

export function renderCodexAdapterBuilder(tool?: string): string {
  return renderGeminiAdapterBuilder(tool);
}

export function renderCodexFailureAnalyst(tool?: string): string {
  return renderGeminiFailureAnalyst(tool);
}

export function renderCodexApi(tool?: string): string {
  return renderGeminiApi(tool);
}
