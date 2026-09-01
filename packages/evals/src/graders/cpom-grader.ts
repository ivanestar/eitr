import ts from 'typescript';

export interface ScoreDeduction {
  pointsLost: number;
  category: string;
  reason: string;
  recommendation: string;
}

export interface CpomGradeResult {
  passed: boolean;
  score: number; // 0 to 100
  score10: number; // 0.0 to 10.0
  violations: string[];
  deductions: ScoreDeduction[];
}

/**
 * Deterministic AST Grader for CPOM Component & Page Object code with 10-point scoring.
 */
export function gradeCpomCode(code: string, fileName = 'component.ts'): CpomGradeResult {
  const violations: string[] = [];
  const deductions: ScoreDeduction[] = [];
  let score10 = 10.0;

  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ES2022, true);

  // Check 1: Zero Emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  if (emojiRegex.test(code)) {
    const pointsLost = 1.0;
    score10 -= pointsLost;
    violations.push('Rule Violation: Zero Emoji Policy (detected emoji character in code)');
    deductions.push({
      pointsLost,
      category: 'ZERO_EMOJI',
      reason: 'Detected emoji characters in code or comments.',
      recommendation: 'Remove all emoji icons to maintain clean, professional SDET standards.',
    });
  }

  // Check 2: Zero Mentions of EITR (Zero Lock-in)
  if (/\beitr\b/i.test(code) && !code.includes('@eitr')) {
    const pointsLost = 1.0;
    score10 -= pointsLost;
    violations.push('Rule Violation: Zero Lock-in (detected mention of EITR/Eitr in code)');
    deductions.push({
      pointsLost,
      category: 'ZERO_LOCKIN',
      reason: 'Detected proprietary creator references in generated component.',
      recommendation:
        'Replace "EITR" with generic terms ("Component", "Page Object") to guarantee Zero Lock-in.',
    });
  }

  // Check 3: AST Checks (no expect, Now() getters, async actions)
  let foundExpect = false;
  const missingNowMethods: string[] = [];
  const syncActionMethods: string[] = [];

  function visit(node: ts.Node) {
    // Prohibit assertions (expect) in component
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'expect') {
        foundExpect = true;
      }
    }

    // Check methods and getters
    if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) {
      const methodName = node.name.getText(sourceFile);
      const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

      // Snapshot reader methods
      if (/^(is|has)[A-Z]/.test(methodName) && !methodName.startsWith('isAttached')) {
        if (!methodName.endsWith('Now')) {
          missingNowMethods.push(methodName);
        }
      }

      // Action methods must be async (only for regular methods, not getters)
      if (
        ts.isMethodDeclaration(node) &&
        /^(click|fill|submit|select|check|uncheck|press|type)[A-Z]?/.test(methodName)
      ) {
        if (!isAsync) {
          syncActionMethods.push(methodName);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (foundExpect) {
    const pointsLost = 3.5;
    score10 -= pointsLost;
    violations.push(
      'CPOM Violation: Assertions (expect) are strictly prohibited inside components.',
    );
    deductions.push({
      pointsLost,
      category: 'CPOM_CONTRACT',
      reason: 'Component encapsulates expect() assertions directly inside methods.',
      recommendation:
        'Expose Element Locators or snapshot readers instead; move expect() into test specs (*.spec.ts).',
    });
  }

  if (missingNowMethods.length > 0) {
    const pointsLost = Number(Math.min(2.0, missingNowMethods.length * 0.8).toFixed(1));
    score10 -= pointsLost;
    violations.push(
      `CPOM Violation: Snapshot state readers [${missingNowMethods.join(', ')}] must end with "Now" suffix.`,
    );
    deductions.push({
      pointsLost,
      category: 'SNAPSHOT_SAFETY',
      reason: `Point-in-time readers [${missingNowMethods.join(', ')}] lack the mandatory Now() suffix.`,
      recommendation: `Append "Now()" suffix (e.g. ${missingNowMethods[0]}Now()) to clearly mark non-retrying reads.`,
    });
  }

  if (syncActionMethods.length > 0) {
    const pointsLost = Number(Math.min(1.5, syncActionMethods.length * 0.5).toFixed(1));
    score10 -= pointsLost;
    violations.push(
      `CPOM Violation: Action methods [${syncActionMethods.join(', ')}] must be async returning Promise<void>.`,
    );
    deductions.push({
      pointsLost,
      category: 'ASYNC_SAFETY',
      reason: `Action methods [${syncActionMethods.join(', ')}] are declared synchronously.`,
      recommendation:
        'Prefix action methods with async and return Promise<void> for Playwright actionability checks.',
    });
  }

  score10 = Math.max(0.0, Number(score10.toFixed(1)));
  const passed = violations.length === 0;
  const score = passed ? 100 : Math.round(score10 * 10);

  return {
    passed,
    score,
    score10,
    violations,
    deductions,
  };
}
