import ts from 'typescript';
import type { ScoreDeduction } from './cpom-grader.js';

export interface SpecLinearityGradeResult {
  passed: boolean;
  score: number;
  score10: number; // 0.0 to 10.0
  hasTestSteps: boolean;
  hasNoConditionals: boolean;
  hasNoLoops: boolean;
  hasNoTryCatchAssertions: boolean;
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Deterministic AST Grader for Test Spec Linearity & Anti-Branching Rules with 10-point scale.
 */
export function gradeSpecLinearity(
  code: string,
  fileName = 'test.spec.ts',
): SpecLinearityGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  let score10 = 10.0;

  let hasTestSteps = false;
  let hasNoConditionals = true;
  let hasNoLoops = true;
  let hasNoTryCatchAssertions = true;

  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ES2022, true);

  // Check 1: Zero Emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  if (emojiRegex.test(code)) {
    const pointsLost = 1.0;
    score10 -= pointsLost;
    violations.push('Rule Violation: Zero Emoji Policy in test spec.');
    deductions.push({
      pointsLost,
      category: 'ZERO_EMOJI',
      reason: 'Detected emoji characters inside test spec code or descriptions.',
      recommendation: 'Remove emoji characters from test and step titles for clean reporting.',
    });
  }

  // Check 2: No raw constructors (e.g. new LoginPage(page))
  if (/new\s+[A-Z][a-zA-Z0-9]*(?:Page|Component)\s*\(/.test(code)) {
    const pointsLost = 2.0;
    score10 -= pointsLost;
    violations.push(
      'DI Violation: Direct Page Object instantiation detected; inject via fixtures instead.',
    );
    deductions.push({
      pointsLost,
      category: 'DEPENDENCY_INJECTION',
      reason: 'Instantiated Page Object with "new" keyword inside test spec.',
      recommendation:
        'Inject Page Objects as fixture arguments in test signature (e.g. async ({ loginPage }) => ...).',
    });
  }

  // AST Check for statements
  function visit(node: ts.Node) {
    // Check for test.step
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.expression.getText(sourceFile) === 'test' &&
        expr.name.text === 'step'
      ) {
        hasTestSteps = true;
      }
    }

    // Prohibit Conditionals (if, switch, conditional expressions)
    if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) {
      hasNoConditionals = false;
    }

    // Prohibit Loops (for, while, do-while, for-in, for-of)
    if (
      ts.isForStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node)
    ) {
      hasNoLoops = false;
    }

    // Prohibit try/catch inside test steps
    if (ts.isTryStatement(node)) {
      hasNoTryCatchAssertions = false;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!hasTestSteps) {
    const pointsLost = 1.5;
    score10 -= pointsLost;
    violations.push('Format Violation: Missing await test.step() step demarcation in test spec.');
    deductions.push({
      pointsLost,
      category: 'STEP_DEMARCATION',
      reason: 'Spec lacks "await test.step()" wrappers around individual user actions.',
      recommendation:
        'Wrap each action step in "await test.step(\'Step N: ...\', async () => { ... })" for structured triage.',
    });
  }

  if (!hasNoConditionals) {
    const pointsLost = 3.0;
    score10 -= pointsLost;
    violations.push(
      'Anti-Branching Violation: Found Conditionals (if/else/switch) inside test spec.',
    );
    deductions.push({
      pointsLost,
      category: 'LINEAR_AST',
      reason: 'Detected branching statements (if/else/switch) inside test specification.',
      recommendation:
        'Decompose branched logic into separate deterministic test cases with isolated preconditions.',
    });
  }

  if (!hasNoLoops) {
    const pointsLost = 2.5;
    score10 -= pointsLost;
    violations.push('Anti-Loop Violation: Found Loops (for/while) inside test spec.');
    deductions.push({
      pointsLost,
      category: 'LINEAR_AST',
      reason: 'Detected iterative loop (for/while) inside test specification.',
      recommendation:
        'Use parameterized test tables (test.describe.each / data-driven tests) instead of in-spec loops.',
    });
  }

  if (!hasNoTryCatchAssertions) {
    const pointsLost = 2.0;
    score10 -= pointsLost;
    violations.push(
      'Assertion Safety Violation: Found try/catch statement swallowing assertion failures in test spec.',
    );
    deductions.push({
      pointsLost,
      category: 'ASSERTION_SAFETY',
      reason: 'Found try/catch block that risks masking genuine assertion errors.',
      recommendation:
        'Remove try/catch around assertions and let Playwright Web-First assertions auto-retry natively.',
    });
  }

  score10 = Math.max(0.0, Number(score10.toFixed(1)));
  const passed = violations.length === 0;
  const score = passed ? 100 : Math.round(score10 * 10);

  return {
    passed,
    score,
    score10,
    hasTestSteps,
    hasNoConditionals,
    hasNoLoops,
    hasNoTryCatchAssertions,
    violations,
    deductions,
  };
}
