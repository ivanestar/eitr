// Template for generating .githooks/pre-commit. create-if-absent.
// Parameterised by language and tool so the commands actually exist in the generated project.

export function renderGitHooks(
  language: string = 'typescript',
  tool: string = 'playwright',
): string {
  const isGradle = tool === 'playwright-gradle';
  const isMaven = language === 'java' && !isGradle;

  let lintStep: string;
  let testStep: string;

  if (language === 'python') {
    lintStep = `PYTHON="\${PYTHON:-python3}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON="python"
"$PYTHON" scripts/lint_cpom.py || {
  echo "CPOM linter failed."
  exit 1
}`;
    testStep = `"$PYTHON" -m pytest --tb=short -q || {
  echo "Tests failed."
  exit 1
}`;
  } else if (language === 'csharp') {
    lintStep = `dotnet build -t:LintCpom || {
  echo "CPOM linter failed."
  exit 1
}`;
    testStep = `dotnet test || {
  echo "Tests failed."
  exit 1
}`;
  } else if (language === 'java' && isGradle) {
    lintStep = `./gradlew check -q || {
  echo "CPOM linter / check failed."
  exit 1
}`;
    testStep = `./gradlew test -q || {
  echo "Tests failed."
  exit 1
}`;
  } else if (language === 'java' && isMaven) {
    lintStep = `mvn validate -q || {
  echo "CPOM linter / validate failed."
  exit 1
}`;
    testStep = `mvn test -q || {
  echo "Tests failed."
  exit 1
}`;
  } else {
    // TypeScript / JavaScript (default)
    lintStep = `npm run lint:cpom && npm run lint:eslint || {
  echo "Linting failed. Run 'npm run lint:cpom' or 'npm run lint:eslint' to inspect."
  exit 1
}`;
    testStep = `npm test || {
  echo "Tests failed."
  exit 1
}`;
  }

  return `#!/bin/sh
# Pre-Commit Quality Gate
# Ensures zero CPOM violations and no regressions before commit.

echo "Running pre-commit quality checks..."

# 1. CPOM lint & static checks
${lintStep}

# 2. Test suite
${testStep}

echo "All pre-commit checks passed."
exit 0
`;
}
