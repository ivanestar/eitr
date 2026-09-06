import { describe, it, expect } from 'vitest';
import { gradeOrchestratorOutput } from '../src/graders/orchestrator-grader.js';
import { gradeTmsValidatorOutput } from '../src/graders/tms-validator-grader.js';
import { gradeCpomCode } from '../src/graders/cpom-grader.js';
import { gradeSpecLinearity } from '../src/graders/spec-linearity-grader.js';
import { gradeAssertionAuditorOutput } from '../src/graders/assertion-auditor-grader.js';
import { gradeTriageOutput } from '../src/graders/triage-grader.js';

describe('All 7 Core SDET Capabilities Evaluation Benchmark', () => {
  // Agent 1: sdet-orchestrator
  it('1. Evaluates sdet-orchestrator dispatch and routing matrix', () => {
    const simulatedOutput = `
Parsed intent: Automate ticket JIRA-404.
Step 1: Dispatch to tms-validator for GIGO requirements quality check.
Step 2: Run /automate-test workflow and present Markdown proposal for Human Sign-Off.
Step 3: Dispatch to pom-engineer, then synthesize linear test code directly following /automate-test's own Step 5.
`;
    const grade = gradeOrchestratorOutput(simulatedOutput, 'automate-test');
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
    expect(grade.routedToSubagents).toContain('tms-validator');
    expect(grade.violations).toEqual([]);
  });

  // Agent 2: tms-validator
  it('2. Evaluates tms-validator GIGO quality gate and scorecard', () => {
    const simulatedOutput = `
# TMS Quality Scorecard
- Overall Score: 30%
- Status: REJECTED
- Scenario Atomicity: FAIL (18 steps exceeds maximum limit of 10)
- Expected Results: FAIL (Ambiguous generic assertions)
- Recommendation: Decompose monolithic scenario into 4 atomic tickets.
`;
    const grade = gradeTmsValidatorOutput(simulatedOutput, 'REJECTED');
    expect(grade.passed).toBe(true);
    expect(grade.actualStatus).toBe('REJECTED');
    expect(grade.hasScorecard).toBe(true);
  });

  // Agent 3: sdet-architect
  it('3. Evaluates sdet-architect architectural boundaries and CPOM guard', () => {
    const invalidComponent = `
import { Component } from '@components';
export class BadCard extends Component {
  async verify() {
    expect(true).toBe(true);
  }
}
`;
    const grade = gradeCpomCode(invalidComponent);
    expect(grade.passed).toBe(false);
    expect(grade.violations.some((v) => v.includes('Assertion'))).toBe(true);
  });

  // Agent 4: pom-engineer
  it('4. Evaluates pom-engineer Page Object synthesis with 3-tier locators', () => {
    const validPom = `
import { Component, Button, TextInput } from '@components';

export class LoginPage extends Component {
  get usernameInput() {
    return this.child(TextInput, '[data-testid="input-username"]');
  }

  get submitButton() {
    return this.child(Button, '[data-testid="btn-submit"]');
  }

  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
  }

  async isErrorVisibleNow(): Promise<boolean> {
    return await this.locator('[data-testid="error-banner"]').isVisible();
  }
}
`;
    const grade = gradeCpomCode(validPom);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
    expect(grade.violations).toEqual([]);
  });

  // Capability 5: Linear Test Code Synthesis (now /automate-test's own Step 5, not a separate agent)
  it('5. Evaluates linear AST test synthesis quality', () => {
    const validSpec = `
import { test } from '@fixtures';
import { expect } from '@playwright/test';

test('TC-101: User Login with 2FA Authenticator Code', async ({ loginPage, dashboardPage }) => {
  await test.step('Step 1: Open login', async () => {
    await loginPage.open();
  });
  await test.step('Step 2: Submit credentials', async () => {
    await loginPage.login('user@test.com', 'Pass123!');
  });
  await test.step('Step 3: Verify dashboard', async () => {
    await expect(dashboardPage.profileCard.locator).toBeVisible();
  });
});
`;
    const grade = gradeSpecLinearity(validSpec);
    expect(grade.passed).toBe(true);
    expect(grade.hasTestSteps).toBe(true);
    expect(grade.hasNoConditionals).toBe(true);
    expect(grade.hasNoLoops).toBe(true);
  });

  // Agent 6: assertion-auditor
  it('6. Evaluates assertion-auditor anti-fake-green guard', () => {
    const simulatedAuditOutput = `
[AUDIT FINDING] Detected unawaited promise: expect(loginPage.banner.isVisible()).toBeTruthy()
Root Cause: isVisible() returns Promise<boolean> which is always truthy.
Fix Applied: await expect(loginPage.banner.locator).toBeVisible()
`;
    const grade = gradeAssertionAuditorOutput(simulatedAuditOutput);
    expect(grade.passed).toBe(true);
    expect(grade.detectedUnawaitedPromise).toBe(true);
    expect(grade.fixedToWebFirst).toBe(true);
  });

  // Capability 7: 4-Point Trace Triage (now /heal-test's own process, not a separate agent)
  it('7. Evaluates 4-point triage and fail-fast bug detection quality', () => {
    const simulatedTriageOutput = `
[PRODUCT BUG] Backend service returned HTTP 500 (Database lock timeout).
Action: File backend defect ticket. Do not alter Page Object locators.
`;
    const grade = gradeTriageOutput(simulatedTriageOutput, '[PRODUCT BUG]');
    expect(grade.passed).toBe(true);
    expect(grade.actualCategory).toBe('[PRODUCT BUG]');
  });
});
