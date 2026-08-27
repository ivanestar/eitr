import type { ScoreDeduction } from './cpom-grader.js';

export interface SkillGradeResult {
  passed: boolean;
  score: number;
  score10: number; // 0.0 to 10.0
  matchedRequiredSteps: string[];
  missingRequiredSteps: string[];
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Deterministic Grader for Operational Skills Execution & Compliance with 10-point scoring.
 */
export function gradeSkillCompliance(
  output: string,
  requiredSteps: string[],
  forbiddenPatterns: string[] = [],
): SkillGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  const matchedRequiredSteps: string[] = [];
  const missingRequiredSteps: string[] = [];
  let score10 = 10.0;

  for (const step of requiredSteps) {
    const escaped = step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    if (regex.test(output)) {
      matchedRequiredSteps.push(step);
    } else {
      missingRequiredSteps.push(step);
      const pointsLost = Number((10.0 / Math.max(requiredSteps.length, 1)).toFixed(1));
      score10 -= pointsLost;
      violations.push(`Workflow Violation: Output missing mandatory step/artifact: "${step}"`);
      deductions.push({
        pointsLost,
        category: 'SKILL_WORKFLOW_COMPLIANCE',
        reason: `Skill response omitted mandatory operational step or artifact: "${step}".`,
        recommendation: `Include explicit execution instructions for "${step}" in the skill workflow.`,
      });
    }
  }

  for (const pattern of forbiddenPatterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    if (regex.test(output)) {
      const pointsLost = 2.0;
      score10 -= pointsLost;
      violations.push(
        `Security / Quality Violation: Output contained forbidden pattern: "${pattern}"`,
      );
      deductions.push({
        pointsLost,
        category: 'SAFETY_VIOLATION',
        reason: `Output contained forbidden anti-pattern or secret reference: "${pattern}".`,
        recommendation: `Purge all occurrences of "${pattern}" and enforce Zero Lock-in / clean security standards.`,
      });
    }
  }

  score10 = Math.max(0.0, Number(score10.toFixed(1)));
  const passed = violations.length === 0;
  const score = Math.round((matchedRequiredSteps.length / Math.max(requiredSteps.length, 1)) * 100);

  return {
    passed,
    score,
    score10,
    matchedRequiredSteps,
    missingRequiredSteps,
    violations,
    deductions,
  };
}
