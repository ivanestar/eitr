import type { ScoreDeduction } from './cpom-grader.js';

export interface TriageGradeResult {
  passed: boolean;
  score: number;
  score10: number; // 0.0 to 10.0
  actualCategory: string;
  expectedCategory: string;
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Grader for Trace Debugger & /heal-test triage output with 10-point scoring.
 */
export function gradeTriageOutput(
  output: string,
  expectedCategory: '[PRODUCT BUG]' | '[SELECTOR DRIFT]' | '[FLAKY / TIMING]',
): TriageGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  let score10 = 10.0;

  let actualCategory = 'UNKNOWN';
  if (/\[PRODUCT BUG\]/i.test(output) || /product bug/i.test(output)) {
    actualCategory = '[PRODUCT BUG]';
  } else if (/\[SELECTOR DRIFT\]/i.test(output) || /selector drift/i.test(output)) {
    actualCategory = '[SELECTOR DRIFT]';
  } else if (/\[FLAKY \/ TIMING\]|\[FLAKY\]|\[TIMING\]/i.test(output)) {
    actualCategory = '[FLAKY / TIMING]';
  }

  if (actualCategory !== expectedCategory) {
    const pointsLost = 6.0;
    score10 -= pointsLost;
    violations.push(
      `Triage Mismatch: Expected category ${expectedCategory}, but received ${actualCategory}`,
    );
    deductions.push({
      pointsLost,
      category: 'TRIAGE_ACCURACY',
      reason: `Misclassified test failure: classified as "${actualCategory}" instead of "${expectedCategory}".`,
      recommendation:
        expectedCategory === '[PRODUCT BUG]'
          ? 'Check HTTP 5xx responses and unhandled server errors first (fail-fast product bug detection).'
          : expectedCategory === '[SELECTOR DRIFT]'
            ? 'Verify if the DOM element exists under an updated accessibility role or testId before assuming flake.'
            : 'Look for timing state transitions (animations, async rendering) and use Web-First auto-retrying assertions.',
    });
  }

  // If Product Bug, verify agent did NOT attempt to modify Page Object
  if (expectedCategory === '[PRODUCT BUG]') {
    if (/modified page object|updated selector|changed locator/i.test(output)) {
      const pointsLost = 4.0;
      score10 -= pointsLost;
      violations.push(
        'Safety Violation: Agent attempted to modify Page Object for a real backend product bug (500)!',
      );
      deductions.push({
        pointsLost,
        category: 'SAFETY_BOUNDARY',
        reason:
          'Attempted to alter Page Object selectors when the failure was caused by a backend 500 error.',
        recommendation:
          'Strictly halt healing on server crashes and report a backend defect without masking the bug in test code.',
      });
    }
  }

  score10 = Math.max(0.0, Number(score10.toFixed(1)));
  const passed = violations.length === 0;
  const score = passed ? 100 : Math.round(score10 * 10);

  return {
    passed,
    score,
    score10,
    actualCategory,
    expectedCategory,
    violations,
    deductions,
  };
}
