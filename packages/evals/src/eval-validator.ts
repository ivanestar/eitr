import ts from 'typescript';

export interface ValidationResult {
  passed: boolean;
  errors: string[];
}

/**
 * Validate a Page Object or Component TS file against Eitr's Method Safety Contract
 */
export function validateMethodSafetyContract(
  fileContent: string,
  fileName = 'temp.ts',
): ValidationResult {
  const errors: string[] = [];

  // Create AST
  const sourceFile = ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.ES2022, true);

  // Helper to walk AST
  function visit(node: ts.Node) {
    // 1. Check for assertions in component file
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === 'expect') {
        errors.push(
          `Line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}: Assertions (expect) are forbidden inside component/page classes. Assertions belong in tests.`,
        );
      }
    }

    // 2. Check class methods and getters
    if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

      // Check Actions/Mutations vs Snapshot Reads
      const isAction = /select|fill|click|type|choose|submit|toggle|open|close/i.test(name);
      const isSnapshotRead = /value|text|state|title|status|count/i.test(name);

      if (isSnapshotRead) {
        if (!name.endsWith('Now')) {
          errors.push(
            `Method/getter "${name}" looks like a snapshot read but does not end with "Now" suffix (e.g. valueNow(), textNow()).`,
          );
        }
      }

      if (isAction) {
        if (!isAsync) {
          errors.push(
            `Action method "${name}" must be asynchronous (async) and return Promise<void>.`,
          );
        }
      }

      // Check getters (should not have side-effects)
      if (ts.isGetAccessorDeclaration(node)) {
        if (isAsync) {
          errors.push(
            `Getter "${name}" must not be async. Producers/getters must return components/locators lazily without side effects.`,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    passed: errors.length === 0,
    errors,
  };
}
