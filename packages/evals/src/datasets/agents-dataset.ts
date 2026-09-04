/**
 * Golden Dataset for evaluating all 7 EITR AI Agents.
 */

export interface GoldenAgentCase {
  agentName:
    | 'sdet-orchestrator'
    | 'tms-validator'
    | 'sdet-architect'
    | 'pom-engineer'
    | 'test-automator'
    | 'assertion-auditor'
    | 'trace-debugger';
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
      'Dispatches user request to automate Jira ticket to tms-validator and test-automator',
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
  // 5. test-automator
  {
    agentName: 'test-automator',
    description: 'Synthesizes linear AST test spec with test.step and fixtures',
    inputPrompt: 'Automate valid ticket TC-101 (Login with 2FA) into Playwright spec',
    expectedOutputs: {
      mustContainPatterns: ["await test.step('Step 1", '({ loginPage', 'await expect('],
      forbiddenPatterns: ['if (', 'for (', 'while (', 'try {', 'new LoginPage'],
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
  // 7. trace-debugger
  {
    agentName: 'trace-debugger',
    description: 'Detects backend HTTP 500 error and triages strictly as [PRODUCT BUG]',
    inputPrompt: 'Triage trace: POST /api/v1/payment -> 500 Internal Server Error (Database lock)',
    expectedOutputs: {
      targetRoleOrCategory: '[PRODUCT BUG]',
      mustContainPatterns: [
        '[PRODUCT BUG]',
        'Do not alter Page Object locators',
        'Backend service',
      ],
      forbiddenPatterns: ['updated selector', 'modified Page Object'],
    },
  },
];
