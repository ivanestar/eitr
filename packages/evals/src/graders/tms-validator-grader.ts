import type { ScoreDeduction } from './cpom-grader.js';

export interface TmsValidatorGradeResult {
  passed: boolean;
  score: number;
  score10: number; // 0.0 to 10.0
  actualStatus: 'APPROVED' | 'REJECTED';
  expectedStatus: 'APPROVED' | 'REJECTED';
  hasScorecard: boolean;
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Grader for TMS Validator Agent output with 10-point scoring.
 */
export function gradeTmsValidatorOutput(
  output: string,
  expectedStatus: 'APPROVED' | 'REJECTED',
): TmsValidatorGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  let score10 = 10.0;

  const isApproved = /status:\s*approved|quality\s+score\s*:\s*(?:8\d|9\d|100)%?/i.test(output);
  const isRejected = /status:\s*rejected|quality\s+score\s*:\s*(?:[0-7]\d)%?/i.test(output);

  let actualStatus: 'APPROVED' | 'REJECTED' = 'APPROVED';
  if (isRejected && !isApproved) {
    actualStatus = 'REJECTED';
  } else if (isApproved && !isRejected) {
    actualStatus = 'APPROVED';
  } else if (/rejected/i.test(output)) {
    actualStatus = 'REJECTED';
  }

  const hasScorecard = /scorecard|quality score|atomicity|expected results/i.test(output);

  if (actualStatus !== expectedStatus) {
    const pointsLost = 6.0;
    score10 -= pointsLost;
    violations.push(
      `Status Mismatch: Expected ${expectedStatus}, but agent classified as ${actualStatus}`,
    );
    deductions.push({
      pointsLost,
      category: 'GIGO_VERIFIABILITY',
      reason: `GIGO Evaluation Failure: Expected decision "${expectedStatus}", but agent evaluated as "${actualStatus}".`,
      recommendation:
        expectedStatus === 'REJECTED'
          ? 'Enforce strict 10-step atomicity limit and reject tickets with ambiguous expected results.'
          : 'Approve well-structured atomic tickets (steps <= 10) with concrete expected outcomes.',
    });
  }

  if (!hasScorecard) {
    const pointsLost = 2.0;
    score10 -= pointsLost;
    violations.push('Format Violation: Missing structured Scorecard in agent output.');
    deductions.push({
      pointsLost,
      category: 'SCORECARD_STRUCTURE',
      reason: 'Agent response lacks a structured Scorecard table/breakdown.',
      recommendation:
        'Include a markdown Scorecard detailing Atomicity, Preconditions, Verifiability, and TDM readiness.',
    });
  }

  score10 = Math.max(0.0, Number(score10.toFixed(1)));
  const passed = violations.length === 0;
  const score = passed ? 100 : Math.round(score10 * 10);

  return {
    passed,
    score,
    score10,
    actualStatus,
    expectedStatus,
    hasScorecard,
    violations,
    deductions,
  };
}
