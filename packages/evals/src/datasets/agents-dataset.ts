/**
 * Golden Dataset for evaluating all 6 EITR AI Agents.
 */

export interface GoldenAgentCase {
  agentName:
    | 'sdet-orchestrator'
    | 'tms-validator'
    | 'sdet-architect'
    | 'pom-engineer'
    | 'test-data-engineer'
    | 'assertion-auditor';
  description: string;
  inputPrompt: string;
  expectedOutputs: {
    targetRoleOrCategory?: string;
    mustContainPatterns: string[];
    forbiddenPatterns: string[];
  };
}

export const GOLDEN_AGENTS_DATASET: GoldenAgentCase[] = [
  // 1. sdet-orchestrator
  {
    agentName: 'sdet-orchestrator',
    description:
      "Dispatches user request to automate Jira ticket to tms-validator, then synthesizes the test directly following /automate-test's own process",
    inputPrompt: 'User wants to automate ticket JIRA-404: "User Reset Password Flow"',
    expectedOutputs: {
      mustContainPatterns: ['tms-validator', 'GIGO', '/automate-test', 'Human Sign-Off'],
      forbiddenPatterns: ['new LoginPage(page)', 'sleep('],
    },
  },
  // 2. tms-validator
  {
    agentName: 'tms-validator',
    description: 'Rejects monolithic unverified ticket with structured Scorecard',
    inputPrompt:
      'Audit ticket: "Full system checkout and account management" with 18 steps and vague outcomes.',
    expectedOutputs: {
      targetRoleOrCategory: 'REJECTED',
      mustContainPatterns: ['Scorecard', 'Status: REJECTED', 'Atomicity', 'Decompose'],
      forbiddenPatterns: ['Status: APPROVED'],
    },
  },
  // 3. sdet-architect
  {
    agentName: 'sdet-architect',
    description: 'Enforces CPOM boundaries, zero assertions in components, and zero lock-in',
    inputPrompt: 'Audit candidate component code containing expect(title).toBe("Dashboard")',
    expectedOutputs: {
      mustContainPatterns: [
        'CPOM Violation',
        'Assertions (expect) are strictly prohibited inside components',
        'assertions belong in test specs',
      ],
      forbiddenPatterns: ['EITR', 'Eitr'],
    },
  },
  // 4. pom-engineer
  {
    agentName: 'pom-engineer',
    description: 'Synthesizes Page Object with 3-tier locators and Now() snapshot getters',
    inputPrompt:
      'Generate LoginPage component with username, password, submit button, and isErrorVisible state',
    expectedOutputs: {
      mustContainPatterns: ['class LoginPage', 'extends', 'isErrorVisibleNow', 'async clickSubmit'],
      forbiddenPatterns: ['expect(', 'waitForTimeout'],
    },
  },
  // 5. test-data-engineer
  {
    agentName: 'test-data-engineer',
    description: 'Synthesizes a bulk/structured dataset on request, never a single scalar value',
    inputPrompt:
      'Generate 20 rows of product catalog data (SKU, price, stock count) for a pagination test',
    expectedOutputs: {
      mustContainPatterns: ['fixtures/synthetic-data/', 'SKU'],
      forbiddenPatterns: ['createTestEmail', 'createUniqueId'],
    },
  },
  // 6. assertion-auditor
  {
    agentName: 'assertion-auditor',
    description: 'Detects unawaited promise in assertion and fixes to web-first auto-retry',
    inputPrompt: 'Audit assertion: expect(loginPage.banner.isVisible()).toBeTruthy()',
    expectedOutputs: {
      mustContainPatterns: [
        'Unawaited Promise Guard',
        'await expect(loginPage.banner.locator).toBeVisible()',
      ],
      forbiddenPatterns: ['expect(locator.isVisible()).toBeTruthy()'],
    },
  },
];
