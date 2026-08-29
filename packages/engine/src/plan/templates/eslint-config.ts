// Template for generating eslint.config.js in scaffolded TS/JS Playwright projects.
// create-if-absent. Complements scripts/lint-cpom.js (a narrow regex linter for CPOM-specific
// rules) rather than replacing it — this catches general JS/TS correctness issues lint-cpom.js
// was never meant to (floating promises, deprecated Playwright APIs) via the maintained
// eslint-plugin-playwright flat-config recommended ruleset.
export function renderEslintConfig(): string {
  return `import playwright from 'eslint-plugin-playwright';

export default [
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**'],
  },
];
`;
}
