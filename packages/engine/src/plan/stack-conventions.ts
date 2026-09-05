export interface StackConventions {
  language: string;
  automationTool: string;
  frameworkName: string;
  testRunCmd: string;
  testIsolatedCmd: (specPath: string) => string;
  cpomLintCmd: string;
  specDir: string;
  specExtension: string;
  specPath: (id: string, feature: string) => string;
  pagePath: (name: string) => string;
  widgetPath: (name: string) => string;
  stateReaderSuffix: string;
  actionReturnType: string;
  envAccess: (varName: string) => string;
  authStrategy: 'playwright-ts' | 'cypress' | 'pytest' | 'csharp' | 'java';
  stepDemarcation: (name: string, body?: string) => string;
  fixturePattern: string;
  asyncEventSync: string;
  assertionPattern: string;
  buildTool?: 'gradle' | 'maven';
}

export function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

export function toKebabCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

export function toPascalCase(s: string): string {
  return s.replace(/(^|[-_\s]+)([a-zA-Z0-9])/g, (_, __, char) => char.toUpperCase());
}

function formatSpecId(id: string, separator: '-' | '_'): string {
  if (
    id.startsWith('JR-') ||
    id.startsWith('JR_') ||
    id.startsWith('TC-') ||
    id.startsWith('TC_')
  ) {
    return id;
  }
  return `TC${separator}${id}`;
}

export function resolveStackConventions(
  tool: string = 'playwright',
  language: string = 'typescript',
  buildTool?: 'gradle' | 'maven',
): StackConventions {
  const lang = (language || '').toLowerCase();
  const t = (tool || '').toLowerCase();

  if (lang === 'python') {
    return {
      language: 'python',
      automationTool: t || 'playwright',
      frameworkName: 'Playwright',
      testRunCmd: 'pytest',
      testIsolatedCmd: (s) => `pytest ${s}`,
      cpomLintCmd: 'python scripts/lint_cpom.py',
      specDir: 'tests',
      specExtension: '.py',
      specPath: (id, f) => `tests/test_${formatSpecId(id, '_')}_${toSnakeCase(f)}.py`,
      pagePath: (n) => `components/pages/${toSnakeCase(n)}_page.py`,
      widgetPath: (n) => `components/widgets/${toSnakeCase(n)}_widget.py`,
      stateReaderSuffix: '_now()',
      actionReturnType: 'None',
      envAccess: (v) => `os.getenv('${v}')`,
      authStrategy: 'pytest',
      stepDemarcation: (name) => `# Step: ${name}`,
      fixturePattern: '@pytest.fixture',
      asyncEventSync: 'with page.expect_event("event"):',
      assertionPattern: 'expect(locator).to_be_visible()',
    };
  }

  if (lang === 'csharp') {
    return {
      language: 'csharp',
      automationTool: t || 'playwright',
      frameworkName: 'Playwright',
      testRunCmd: 'dotnet test',
      testIsolatedCmd: (s) => {
        const cls = s.replace(/^.*[\\/]/, '').replace(/\.cs$/, '');
        return `dotnet test --filter "FullyQualifiedName~${cls}"`;
      },
      cpomLintCmd: 'dotnet build -t:LintCpom',
      specDir: 'tests',
      specExtension: '.cs',
      specPath: (id, f) => `tests/${formatSpecId(id, '_')}_${toPascalCase(f)}.cs`,
      pagePath: (n) => `components/pages/${toPascalCase(n)}Page.cs`,
      widgetPath: (n) => `components/widgets/${toPascalCase(n)}Widget.cs`,
      stateReaderSuffix: 'NowAsync()',
      actionReturnType: 'Task',
      envAccess: (v) => `Environment.GetEnvironmentVariable("${v}")`,
      authStrategy: 'csharp',
      stepDemarcation: (name) => `// Step: ${name}`,
      fixturePattern: 'PageTest inheritance',
      asyncEventSync: 'await Page.RunAndWaitForEventAsync(...)',
      assertionPattern: 'await Expect(locator).ToBeVisibleAsync()',
    };
  }

  if (lang === 'java') {
    const isGradle = buildTool === 'gradle' || t.includes('gradle');
    return {
      language: 'java',
      automationTool: t || (isGradle ? 'playwright-gradle' : 'playwright-maven'),
      frameworkName: 'Playwright',
      buildTool: isGradle ? 'gradle' : 'maven',
      testRunCmd: isGradle ? './gradlew test' : 'mvn test',
      testIsolatedCmd: (s) => {
        const cls = s.replace(/^.*[\\/]/, '').replace(/\.java$/, '');
        return isGradle ? `./gradlew test --tests *${cls}*` : `mvn test -Dtest=${cls}`;
      },
      cpomLintCmd: 'java scripts/LintCpom.java',
      specDir: 'src/test/java/tests',
      specExtension: '.java',
      specPath: (id, f) => `src/test/java/tests/${formatSpecId(id, '_')}_${toPascalCase(f)}.java`,
      pagePath: (n) => `src/main/java/components/pages/${toPascalCase(n)}Page.java`,
      widgetPath: (n) => `src/main/java/components/widgets/${toPascalCase(n)}Widget.java`,
      stateReaderSuffix: 'Now()',
      actionReturnType: 'void',
      envAccess: (v) => `System.getenv("${v}")`,
      authStrategy: 'java',
      stepDemarcation: (name) => `// Step: ${name}`,
      fixturePattern: '@BeforeEach setup method',
      asyncEventSync: 'page.waitForDialog(() -> trigger())',
      assertionPattern: 'assertThat(locator).isVisible()',
    };
  }

  if (t.includes('cypress')) {
    return {
      language: 'typescript',
      automationTool: 'cypress',
      frameworkName: 'Cypress',
      testRunCmd: 'npm test',
      testIsolatedCmd: (s) => `npx cypress run --spec ${s}`,
      cpomLintCmd: 'npm run lint:cpom',
      specDir: 'cypress/e2e',
      specExtension: '.cy.ts',
      specPath: (id, f) => `cypress/e2e/${formatSpecId(id, '-')}-${toKebabCase(f)}.cy.ts`,
      pagePath: (n) => `components/pages/${toKebabCase(n)}.page.ts`,
      widgetPath: (n) => `components/widgets/${toKebabCase(n)}.widget.ts`,
      stateReaderSuffix: 'Now()',
      actionReturnType: 'Cypress.Chainable<void>',
      envAccess: (v) => `Cypress.env('${v}')`,
      authStrategy: 'cypress',
      stepDemarcation: (name) => `cy.log('STEP: ${name}');`,
      fixturePattern: 'cy.fixture() / custom Cypress commands',
      asyncEventSync: 'cy.intercept() / cy.wait()',
      assertionPattern: 'cy.get(selector).should("be.visible")',
    };
  }

  // Default: TypeScript + Playwright
  return {
    language: 'typescript',
    automationTool: 'playwright',
    frameworkName: 'Playwright',
    testRunCmd: 'npm test',
    testIsolatedCmd: (s) => `npx playwright test ${s}`,
    cpomLintCmd: 'npm run lint:cpom',
    specDir: 'tests',
    specExtension: '.spec.ts',
    specPath: (id, f) => `tests/${formatSpecId(id, '-')}-${toKebabCase(f)}.spec.ts`,
    pagePath: (n) => `components/pages/${toKebabCase(n)}.page.ts`,
    widgetPath: (n) => `components/widgets/${toKebabCase(n)}.widget.ts`,
    stateReaderSuffix: 'Now()',
    actionReturnType: 'Promise<void>',
    envAccess: (v) => `process.env.${v}`,
    authStrategy: 'playwright-ts',
    stepDemarcation: (name, body) => `await test.step('${name}', async () => { ${body || ''} });`,
    fixturePattern: 'test.extend<{ pageObject: PageObject }>()',
    asyncEventSync: "Promise.all([page.waitForEvent('event'), trigger()])",
    assertionPattern: 'await expect(locator).toBeVisible()',
  };
}
