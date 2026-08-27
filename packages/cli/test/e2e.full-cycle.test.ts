import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { runNew } from '../src/commands/new.js';

const tmpDirs: string[] = [];

function makeTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-e2e-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore OS file lock cleanups
    }
  }
});

describe('EITR Full-Cycle End-to-End Test Suite (Covering 100% of Target Generators)', () => {
  // 1. Python + Playwright
  it(
    '1/5: E2E Full Cycle — Python + Playwright (questionnaire -> generate -> pytest run -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://test.com/',
        '--language',
        'python',
        '--automation-tool',
        'playwright',
        '--framework',
        'unknown',
        '--ui-library',
        'unknown',
        '--ci-cd',
        'none',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'pyproject.toml'))).toBe(true);
      expect(existsSync(join(cwd, 'conftest.py'))).toBe(true);
      expect(existsSync(join(cwd, 'components', '__init__.py'))).toBe(true);
      expect(existsSync(join(cwd, 'tests', 'test_smoke.py'))).toBe(true);

      let output: string;
      try {
        output = execSync('python -m pytest', {
          cwd,
          encoding: 'utf8',
          timeout: 90000,
        });
      } catch (e: any) {
        console.error('PYTEST FAILED WITH STDOUT:');
        console.error(e.stdout);
        console.error('PYTEST FAILED WITH STDERR:');
        console.error(e.stderr);
        throw e;
      }
      expect(output).toContain('passed');
    },
    { timeout: 180000 },
  );

  // 2. TypeScript + Playwright
  it(
    '2/5: E2E Full Cycle — TypeScript + Playwright (questionnaire -> generate -> structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'typescript',
        '--automation-tool',
        'playwright',
        '--framework',
        'react',
        '--ui-library',
        'mui',
        '--ci-cd',
        'github',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'playwright.config.ts'))).toBe(true);
      expect(existsSync(join(cwd, 'package.json'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'base', 'base-page.ts'))).toBe(true);
      expect(existsSync(join(cwd, 'tests', 'smoke.spec.ts'))).toBe(true);

      execSync('npx tsc --noEmit', { cwd, stdio: 'inherit' });
    },
    { timeout: 60000 },
  );

  // 3. JavaScript + Playwright
  it(
    '3/5: E2E Full Cycle — JavaScript + Playwright (questionnaire -> generate -> structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'javascript',
        '--automation-tool',
        'playwright',
        '--framework',
        'vue',
        '--ui-library',
        'antd',
        '--ci-cd',
        'github',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'playwright.config.js'))).toBe(true);
      expect(existsSync(join(cwd, 'package.json'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'base', 'base-page.js'))).toBe(true);
      expect(existsSync(join(cwd, 'tests', 'smoke.spec.js'))).toBe(true);
    },
    { timeout: 60000 },
  );

  // 4. TypeScript + Cypress
  it(
    '4/5: E2E Full Cycle — TypeScript + Cypress (questionnaire -> generate -> structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'typescript',
        '--automation-tool',
        'cypress',
        '--framework',
        'react',
        '--ui-library',
        'unknown',
        '--ci-cd',
        'gitlab',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'cypress.config.ts'))).toBe(true);
      expect(existsSync(join(cwd, 'package.json'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'base', 'base-page.ts'))).toBe(true);
      expect(existsSync(join(cwd, 'cypress', 'e2e', 'smoke.cy.ts'))).toBe(true);

      if (existsSync(join(process.cwd(), 'node_modules', 'cypress'))) {
        execSync('npx tsc --noEmit', { cwd, stdio: 'inherit' });
      }
    },
    { timeout: 60000 },
  );

  // 5. JavaScript + Cypress
  it(
    '5/5: E2E Full Cycle — JavaScript + Cypress (questionnaire -> generate -> structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'javascript',
        '--automation-tool',
        'cypress',
        '--framework',
        'vue',
        '--ui-library',
        'unknown',
        '--ci-cd',
        'gitlab',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'cypress.config.js'))).toBe(true);
      expect(existsSync(join(cwd, 'package.json'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'base', 'base-page.js'))).toBe(true);
      expect(existsSync(join(cwd, 'cypress', 'e2e', 'smoke.cy.js'))).toBe(true);
    },
    { timeout: 60000 },
  );

  // 6. C# + Playwright
  it(
    '6/6: E2E Full Cycle — C# + Playwright (questionnaire -> generate -> .csproj/C# structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'csharp',
        '--automation-tool',
        'playwright',
        '--framework',
        'react',
        '--ui-library',
        'unknown',
        '--ci-cd',
        'github',
      ]);

      expect(exitCode).toBe(0);
      const csprojName = `${basename(cwd)}.csproj`;
      expect(existsSync(join(cwd, csprojName))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'BasePage.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'primitives', 'Button.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'widgets', 'Table.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'tests', 'SmokeTest.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'shared', 'utils', 'ApiClient.cs'))).toBe(true);

      execSync('dotnet build', { cwd, stdio: 'ignore' });
    },
    { timeout: 60000 },
  );

  // 7. Java + Playwright (Maven)
  it(
    '7/8: E2E Full Cycle — Java + Playwright Maven (questionnaire -> generate -> pom.xml/Java structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'java',
        '--automation-tool',
        'playwright-maven',
        '--framework',
        'react',
        '--ui-library',
        'unknown',
        '--ci-cd',
        'github',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'pom.xml'))).toBe(true);
      expect(existsSync(join(cwd, 'src', 'main', 'java', 'components', 'BasePage.java'))).toBe(
        true,
      );
      expect(
        existsSync(join(cwd, 'src', 'main', 'java', 'components', 'primitives', 'Button.java')),
      ).toBe(true);
      expect(
        existsSync(join(cwd, 'src', 'main', 'java', 'components', 'widgets', 'Table.java')),
      ).toBe(true);
      expect(existsSync(join(cwd, 'src', 'test', 'java', 'tests', 'SmokeTest.java'))).toBe(true);
      expect(
        existsSync(join(cwd, 'src', 'main', 'java', 'shared', 'utils', 'ApiClient.java')),
      ).toBe(true);

      execSync('mvn compile', { cwd, stdio: 'ignore' });
    },
    { timeout: 60000 },
  );

  // 8. Java + Playwright (Gradle)
  it(
    '8/8: E2E Full Cycle — Java + Playwright Gradle (questionnaire -> generate -> build.gradle/Java structure check -> cleanup)',
    async () => {
      const cwd = makeTempCwd();

      const exitCode = await runNew([
        '--yes',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'java',
        '--automation-tool',
        'playwright-gradle',
        '--framework',
        'react',
        '--ui-library',
        'unknown',
        '--ci-cd',
        'gitlab',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(cwd, 'build.gradle'))).toBe(true);
      expect(existsSync(join(cwd, 'src', 'main', 'java', 'components', 'BasePage.java'))).toBe(
        true,
      );
      expect(
        existsSync(join(cwd, 'src', 'main', 'java', 'components', 'primitives', 'Button.java')),
      ).toBe(true);
      expect(
        existsSync(join(cwd, 'src', 'main', 'java', 'components', 'widgets', 'Table.java')),
      ).toBe(true);
      expect(existsSync(join(cwd, 'src', 'test', 'java', 'tests', 'SmokeTest.java'))).toBe(true);
      expect(
        existsSync(join(cwd, 'src', 'main', 'java', 'shared', 'utils', 'ApiClient.java')),
      ).toBe(true);

      execSync('gradle classes', { cwd, stdio: 'ignore' });
    },
    { timeout: 60000 },
  );
});
