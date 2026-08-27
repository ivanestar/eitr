import type { ScoreDeduction } from './cpom-grader.js';

export interface OrchestratorGradeResult {
  passed: boolean;
  score: number;
  score10: number; // 0.0 to 10.0
  routedToSubagents: string[];
  enforcedSharedPrimitivesFirst: boolean;
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Deterministic Grader for SDET Orchestrator Agent routing and workflow dispatch with 10-point scoring.
 */
export function gradeOrchestratorOutput(
  output: string,
  taskType: 'automate-ticket' | 'batch-pom' | 'debug-test',
): OrchestratorGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  let score10 = 10.0;
  const routedToSubagents: string[] = [];

  if (/tms-validator/i.test(output)) routedToSubagents.push('tms-validator');
  if (/pom-engineer/i.test(output)) routedToSubagents.push('pom-engineer');
  if (/test-automator/i.test(output)) routedToSubagents.push('test-automator');
  if (/assertion-auditor/i.test(output)) routedToSubagents.push('assertion-auditor');
  if (/trace-debugger/i.test(output)) routedToSubagents.push('trace-debugger');
  if (/sdet-architect/i.test(output)) routedToSubagents.push('sdet-architect');

  let enforcedSharedPrimitivesFirst = true;

  if (taskType === 'automate-ticket') {
    if (!routedToSubagents.includes('tms-validator')) {
      const pointsLost = 3.5;
      score10 -= pointsLost;
      violations.push(
        'Routing Violation: Failed to dispatch ticket to tms-validator for GIGO audit.',
      );
      deductions.push({
        pointsLost,
        category: 'ORCHESTRATION_ROUTING',
        reason: 'Orchestrator failed to route ticket to tms-validator before synthesizing tests.',
        recommendation:
          'Enforce mandatory GIGO gate: pass ticket to tms-validator before dispatching to pom-engineer.',
      });
    }
  }

  if (taskType === 'batch-pom') {
    if (!/shared primitives first|widgets/i.test(output)) {
      enforcedSharedPrimitivesFirst = false;
      const pointsLost = 2.0;
      score10 -= pointsLost;
      violations.push(
        'Architecture Violation: Batch POM generation did not enforce Shared Primitives First.',
      );
      deductions.push({
        pointsLost,
        category: 'SHARED_PRIMITIVES_FIRST',
        reason: 'Plan did not prioritize synthesizing shared widgets before worker subagents.',
        recommendation:
          'Identify recurring widgets (frequency >= 2) and synthesize them first before spawning parallel POM workers.',
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
    routedToSubagents,
    enforcedSharedPrimitivesFirst,
    violations,
    deductions,
  };
}
