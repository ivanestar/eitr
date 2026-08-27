import type { ScoreDeduction } from './cpom-grader.js';

export interface AssertionAuditorGradeResult {
  passed: boolean;
  score: number;
  score10: number; // 0.0 to 10.0
  detectedUnawaitedPromise: boolean;
  fixedToWebFirst: boolean;
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Deterministic Grader for Assertion Auditor Agent & Anti-Fake-Green Rules with 10-point scoring.
 */
export function gradeAssertionAuditorOutput(output: string): AssertionAuditorGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  let score10 = 10.0;

  const detectedUnawaitedPromise = /unawaited promise|always truthy|promise<boolean>/i.test(output);

  const fixedToWebFirst =
    /await expect\([^)]+\)\.toBeVisible\(\)|await expect\([^)]+\)\.toHave/i.test(output);

  if (!detectedUnawaitedPromise) {
    const pointsLost = 5.0;
    score10 -= pointsLost;
    violations.push(
      'Detection Failure: Agent failed to identify unawaited promise in expect(loc.isVisible()).toBeTruthy()',
    );
    deductions.push({
      pointsLost,
      category: 'FAKE_GREEN_DETECTION',
      reason:
        'Failed to detect that expect(Promise<boolean>).toBeTruthy() is always truthy (Fake-Green risk).',
      recommendation:
        'Highlight that Playwright locator.isVisible() returns a Promise, causing unawaited truthy assertions.',
    });
  }

  if (!fixedToWebFirst) {
    const pointsLost = 4.0;
    score10 -= pointsLost;
    violations.push(
      'Correction Failure: Agent failed to provide web-first auto-retrying replacement (await expect(locator).toBeVisible())',
    );
    deductions.push({
      pointsLost,
      category: 'WEB_FIRST_ASSERTIONS',
      reason:
        'Did not provide auto-retrying Web-First assertion (await expect(locator).toBeVisible()).',
      recommendation:
        'Replace non-retrying boolean checks with "await expect(locator).toBeVisible()".',
    });
  }

  score10 = Math.max(0.0, Number(score10.toFixed(1)));
  const passed = violations.length === 0;
  const score = passed ? 100 : Math.round(score10 * 10);

  return {
    passed,
    score,
    score10,
    detectedUnawaitedPromise,
    fixedToWebFirst,
    violations,
    deductions,
  };
}
