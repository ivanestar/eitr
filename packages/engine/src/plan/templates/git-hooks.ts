// Template for generating .githooks/pre-commit and husky pre-commit hooks. create-if-absent.

export function renderGitHooks(): string {
  return `#!/bin/sh
# Pre-Commit Quality & Eval Gate
# Ensures zero broken linters or regressions before commit

echo "Running code quality & prompt evaluation checks..."

# 1. Run Prettier / Formatter checks
npm run lint || {
  echo "Linting failed. Run 'npm run format' to fix formatting."
  exit 1
}

# 2. Run isolated evals and tests
npm run eval || {
  echo "Prompt evaluation benchmarks failed."
  exit 1
}

echo "All pre-commit checks passed successfully!"
exit 0
`;
}
