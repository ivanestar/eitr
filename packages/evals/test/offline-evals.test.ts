import { describe, it, expect } from 'vitest';
import { gradeCpomCode } from '../src/graders/cpom-grader.js';
import { gradeSpecLinearity } from '../src/graders/spec-linearity-grader.js';
import { gradeTmsValidatorOutput } from '../src/graders/tms-validator-grader.js';
import { gradeTriageOutput } from '../src/graders/triage-grader.js';
import { GOLDEN_TMS_TICKETS } from '../src/datasets/tms-tickets.js';
import { GOLDEN_TRIAGE_TRACES } from '../src/datasets/triage-traces.js';
import {
  generateBenchmarkReportMarkdown,
  type EvalBenchmarkSummary,
} from '../src/runner/report-generator.js';

describe('Offline Deterministic Eval Suite (Contract & Quality Graders)', () => {
  describe('CPOM Grader', () => {
    it('approves complying CPOM component code with 100% score', () => {
      const validCode = `
import { Component, Button, TextInput } from '@components';

export class UserProfileCard extends Component {
  get editButton() {
    return this.child(Button, '[data-testid="btn-edit"]');
  }

  async clickEdit(): Promise<void> {
    await this.editButton.click();
  }

  async fullNameNow(): Promise<string> {
    return await this.locator('[data-testid="user-fullname"]').innerText();
  }

  async isAvatarVisibleNow(): Promise<boolean> {
    return await this.locator('[data-testid="user-avatar"]').isVisible();
  }
}
`;
      const result = gradeCpomCode(validCode);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.violations).toEqual([]);
    });

    it('rejects component code violating Now() suffix or containing assertions', () => {
      const invalidCode = `
import { Component } from '@components';

export class BadComponent extends Component {
  // Violation 1: missing Now() suffix
  async isAvatarVisible(): Promise<boolean> {
    return await this.locator('.avatar').isVisible();
  }

  // Violation 2: assertion inside component
  async verifyTitle(): Promise<void> {
    expect(true).toBe(true);
  }
}
`;
      const result = gradeCpomCode(invalidCode);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Spec Linearity Grader', () => {
    it('approves strictly linear test spec with test.step and fixtures', () => {
      const validSpec = `
import { test } from '@fixtures';
import { expect } from '@playwright/test';

test('TC-101: User Login with 2FA Authenticator Code', async ({ loginPage, dashboardPage }) => {
  await test.step('Step 1: Navigate to login page', async () => {
    await loginPage.open();
    await expect(loginPage.emailInput.locator).toBeVisible();
  });

  await test.step('Step 2: Fill credentials and submit', async () => {
    await loginPage.login('user@example.com', 'Pass123!');
  });

  await test.step('Step 3: Verify dashboard', async () => {
    await expect(dashboardPage.profileCard.locator).toBeVisible();
  });
});
`;
      const result = gradeSpecLinearity(validSpec);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.hasTestSteps).toBe(true);
      expect(result.hasNoConditionals).toBe(true);
      expect(result.hasNoLoops).toBe(true);
    });

    it('rejects test specs containing conditional branching (if/else) or loops', () => {
      const branchingSpec = `
import { test } from '@fixtures';

test('bad branching test', async ({ page }) => {
  await test.step('Step 1', async () => {
    if (await page.locator('.banner').isVisible()) {
      await page.locator('.close').click();
    }
    for (let i = 0; i < 3; i++) {
      await page.locator('.item').nth(i).click();
    }
  });
});
`;
      const result = gradeSpecLinearity(branchingSpec);
      expect(result.passed).toBe(false);
      expect(result.hasNoConditionals).toBe(false);
      expect(result.hasNoLoops).toBe(false);
      expect(result.violations.some((v) => v.includes('Conditional'))).toBe(true);
      expect(result.violations.some((v) => v.includes('Loops'))).toBe(true);
    });
  });

  describe('TMS Validator Grader', () => {
    it('verifies approval for high-quality golden tickets', () => {
      const ticket = GOLDEN_TMS_TICKETS.find((t) => t.id === 'TC-101-VALID')!;
      const simulatedAgentOutput = `
# TMS Quality Scorecard
- Overall Score: 95%
- Status: APPROVED
- Scenario Atomicity: PASS (3 steps <= 10)
- Expected Results: PASS (100% mapped)
`;
      const result = gradeTmsValidatorOutput(simulatedAgentOutput, ticket.expectedStatus);
      expect(result.passed).toBe(true);
      expect(result.actualStatus).toBe('APPROVED');
    });

    it('verifies rejection for monolithic golden tickets', () => {
      const ticket = GOLDEN_TMS_TICKETS.find((t) => t.id === 'TC-102-INVALID-MONOLITH')!;
      const simulatedAgentOutput = `
# TMS Quality Scorecard
- Overall Score: 35%
- Status: REJECTED
- Scenario Atomicity: FAIL (18 steps exceeds limit of 10)
- Recommendation: Decompose monolithic scenario into 4 atomic tickets.
`;
      const result = gradeTmsValidatorOutput(simulatedAgentOutput, ticket.expectedStatus);
      expect(result.passed).toBe(true);
      expect(result.actualStatus).toBe('REJECTED');
    });
  });

  describe('Trace Triage Grader', () => {
    it('verifies product bug identification without modifying Page Objects', () => {
      const trace = GOLDEN_TRIAGE_TRACES.find((t) => t.id === 'TRACE-01-SERVER-ERROR')!;
      const simulatedOutput = `
[PRODUCT BUG] Backend service returned HTTP 500 (Database lock timeout).
Action: File backend defect ticket. Do not alter Page Object locators.
`;
      const result = gradeTriageOutput(simulatedOutput, trace.expectedCategory);
      expect(result.passed).toBe(true);
      expect(result.actualCategory).toBe('[PRODUCT BUG]');
    });

    it('verifies selector drift identification for UI changes', () => {
      const trace = GOLDEN_TRIAGE_TRACES.find((t) => t.id === 'TRACE-02-SELECTOR-DRIFT')!;
      const simulatedOutput = `
[SELECTOR DRIFT] Target locator 'button.btn-checkout-legacy' no longer exists in DOM.
Action: Update locator in CheckoutPage to 3-tier priority (getByRole / getByTestId).
`;
      const result = gradeTriageOutput(simulatedOutput, trace.expectedCategory);
      expect(result.passed).toBe(true);
      expect(result.actualCategory).toBe('[SELECTOR DRIFT]');
    });
  });

  describe('Benchmark Report Generator', () => {
    it('generates formatted Markdown benchmark summary', () => {
      const summary: EvalBenchmarkSummary = {
        timestamp: '2026-08-25',
        totalEvals: 4,
        passedEvals: 4,
        failedEvals: 0,
        overallScore: 100,
        results: [
          {
            name: 'CPOM Component Safety',
            category: 'CPOM',
            passed: true,
            score: 100,
            details: '0 violations',
          },
          {
            name: 'Spec Linearity',
            category: 'Linear AST',
            passed: true,
            score: 100,
            details: '0 branching',
          },
          {
            name: 'TMS Validator GIGO',
            category: 'TMS',
            passed: true,
            score: 100,
            details: 'Correct approval/rejection',
          },
          {
            name: 'Trace Triage',
            category: 'Debugger',
            passed: true,
            score: 100,
            details: 'Accurate bug classification',
          },
        ],
      };

      const markdown = generateBenchmarkReportMarkdown(summary);
      expect(markdown).toContain('# EITR Prompt & Agent Evaluation Benchmark Report');
      expect(markdown).toContain('100%');
      expect(markdown).toContain('[PASS]');
    });
  });
});
