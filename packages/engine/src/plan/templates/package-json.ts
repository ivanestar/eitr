// package.json for the generated project. create-if-absent — never regenerated, so a user's added
// deps/scripts survive. Pins @playwright/test to the engine's version; typescript + @types/node are
// dev-only (Playwright bundles its own transform to RUN tests; tsc is for the `typecheck` gate).
export function renderPackageJson(projectName: string): string {
  const pkg = {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      pretest: 'npm run lint:cpom',
      test: 'playwright test --project=chromium',
      'test:all': 'playwright test',
      'test:ui': 'playwright test --ui',
      'lint:cpom': 'node scripts/lint-cpom.js',
      'lint:eslint': 'eslint .',
      report: 'playwright show-report',
      typecheck: 'tsc --noEmit',
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
    },
    engines: { node: '>=18.18.0' },
    devDependencies: {
      '@playwright/test': '1.62.1',
      '@types/node': '^20.14.0',
      dotenv: '^16.4.5',
      eslint: '^9.9.0',
      'eslint-plugin-playwright': '^1.6.2',
      prettier: '^3.3.0',
      typescript: '^5.5.0',
    },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
