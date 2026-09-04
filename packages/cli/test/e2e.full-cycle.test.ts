import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runNew } from '../src/commands/new.js';
import { toProjectName } from '../src/commands/generate.js';

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
    '1/7: E2E Full Cycle — Python + Playwright (questionnaire -> generate -> pytest run -> cleanup)',
    { timeout: 180000 },
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

      // runInstall() installs pytest into a project-local .venv, not into the system python -
      // invoke that venv's interpreter directly rather than relying on a system-wide pytest.
      const venvPython =
        process.platform === 'win32'
          ? join(cwd, '.venv', 'Scripts', 'python.exe')
          : join(cwd, '.venv', 'bin', 'python');
      const pythonBin = existsSync(venvPython) ? venvPython : 'python';

      let output: string;
      try {
        output = execSync(`"${pythonBin}" -m pytest`, {
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
  );

  // 2. TypeScript + Playwright
  it(
    '2/7: E2E Full Cycle — TypeScript + Playwright (questionnaire -> generate -> real playwright test run -> cleanup)',
    // Real measured breakdown from a diagnostic GitHub Actions run (PR #63, run 33863150532,
    // console.time instrumentation since removed): runNew (generate + npm install + playwright
    // install chromium) took 3:42.806 on a cold CI cache; tsc --noEmit and the playwright test run
    // itself took 1.676s and 2.130s respectively - negligible. Not a hang: npm install for this
    // fixture's React+MUI+Playwright+TypeScript dependency tree, plus the chromium binary download,
    // is genuinely ~223s of real work on a fresh runner - but real CI network/registry variance is
    // wide enough that even 360000 (6 min, ~1.6x headroom over that measurement) measurably failed
    // once too (run 33867086542). A single wall-clock ceiling can't absorb that much run-to-run
    // variance without becoming absurd - `retry` gives the install a genuinely fresh attempt instead
    // (same principle already used for this project's own generated Python tests via
    // pytest-rerunfailures, not a new pattern). installDeps() also now passes npm --no-audit
    // --no-fund --prefer-offline (see packages/cli/src/commands/install.ts) to cut real install
    // latency, not just tolerate it.
    { timeout: 360000, retry: 2 },
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

      // runNew() (no --no-install passed) already ran `npm install` + `playwright install
      // chromium` as a side effect - this actually launches a real browser and runs the
      // generated `tests/smoke.spec.ts`'s network-free 'harness boots' test (page.setContent +
      // a real assertion), not just a compile/typecheck check.
      const output = execSync('npx playwright test --project=chromium', {
        cwd,
        encoding: 'utf8',
      });
      expect(output).toMatch(/1 passed/);
    },
  );

  // 3. javascript is a removed language target (Track 11) - --language javascript must be
  // rejected up front by the questionnaire's own choice validation, not silently misgenerate.
  it(
    '3/7: E2E Full Cycle — javascript is rejected as an unsupported --language (Track 11)',
    { timeout: 60000 },
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

      expect(exitCode).toBe(1);
      expect(existsSync(join(cwd, 'package.json'))).toBe(false);
    },
  );

  // 4. TypeScript + Cypress - withheld from release (see SUPPORTED comment in generate.ts);
  // verifies the withhold-gate actually blocks generation rather than that Cypress still works.
  it(
    '4/7: E2E Full Cycle — TypeScript + Cypress (withheld: gate rejects, generates nothing)',
    { timeout: 60000 },
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

      expect(exitCode).toBe(1);
      expect(existsSync(join(cwd, 'cypress.config.ts'))).toBe(false);
      expect(existsSync(join(cwd, 'package.json'))).toBe(false);
    },
  );

  // 5. C# + Playwright
  it(
    '5/7: E2E Full Cycle — C# + Playwright (questionnaire -> generate -> real dotnet test run -> cleanup)',
    { timeout: 120000 },
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
      // The generator derives the project name via toProjectName() - PascalCase for csharp,
      // not the raw temp-dir basename - matching that here avoids a case-sensitive-filesystem
      // mismatch (masked on Windows by its case-insensitive FS, real on Linux CI).
      const csprojName = `${toProjectName(cwd, 'csharp')}.csproj`;
      expect(existsSync(join(cwd, csprojName))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'BasePage.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'primitives', 'Button.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'components', 'widgets', 'Table.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'tests', 'SmokeTest.cs'))).toBe(true);
      expect(existsSync(join(cwd, 'shared', 'utils', 'ApiClient.cs'))).toBe(true);

      execSync('dotnet build', { cwd, stdio: 'ignore' });

      // runNew() (no --no-install passed) already ran `dotnet build` + a real Playwright
      // browser install as a side effect - run the generated NUnit suite for real. SmokeTest.cs's
      // LocalPageTest is network-free (Page.SetContentAsync), so this is deterministic.
      //
      // `dotnet test` exits non-zero on any test failure - execSync throws in that case, and that
      // throw alone is the real pass/fail signal. Deliberately not string-matching the summary
      // line: `dotnet test`'s console output is localized to the OS UI language (verified live -
      // this machine prints "Пройдено: 1", not "Passed: 1"), so any English-only regex here would
      // be a false negative on a real, passing run, not a real check.
      execSync('dotnet test', { cwd, stdio: 'inherit' });
    },
  );

  // 6. Java + Playwright (Maven)
  it(
    '6/7: E2E Full Cycle — Java + Playwright Maven (questionnaire -> generate -> real mvn test run -> cleanup)',
    { timeout: 180000 },
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

      // runNew() (no --no-install passed) already ran `mvn test-compile` + a real Playwright
      // CLI browser install as a side effect (see install.ts) - run the generated JUnit 5 suite
      // for real. SmokeTest.java navigates to the real https://example.com (a stable IANA
      // domain chosen for exactly this purpose) - DO_NOT_TRACK suppresses an unrelated telemetry
      // ping some sandboxes' egress rules block, which otherwise prints scary-looking but
      // harmless ETIMEDOUT noise around the real (passing) assertion.
      const output = execSync('mvn test', {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, DO_NOT_TRACK: '1' },
      });
      expect(output).toMatch(/Tests run: 1, Failures: 0, Errors: 0/);
    },
  );

  // 7. Java + Playwright (Gradle)
  it(
    '7/7: E2E Full Cycle — Java + Playwright Gradle (questionnaire -> generate -> real gradle test run -> cleanup)',
    // 300s, not 180s like the other combinations: this path pays 3 separate cold Gradle JVM/daemon
    // startups (testClasses, playwrightInstall, test) plus first-ever resolution of the pinned
    // Playwright artifact version from Maven Central and an uncached Chromium download - on a fresh
    // CI runner this is measurably slower than Maven's single-process model even though both build
    // the same generated project (observed: run 33639210399 hit the 180000ms wall still executing,
    // not near completion). Deliberately not caching ~/.cache/ms-playwright (see ci.yml) means the
    // browser download itself is never avoidable, so the timeout - not the cache strategy - is what
    // needs to absorb this tool's inherent cold-start variance.
    { timeout: 300000 },
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

      // runNew() (no --no-install passed) already ran `gradle testClasses` + the generated
      // playwrightInstall task as a side effect (see install.ts) - run the generated JUnit 5
      // suite for real.
      // A failing test makes `gradle test` exit non-zero, which execSync throws on - that
      // failure alone is the real signal. BUILD SUCCESSFUL is a redundant positive check.
      const output = execSync('gradle test --console=plain', {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, DO_NOT_TRACK: '1' },
      });
      expect(output).toMatch(/BUILD SUCCESSFUL/);
    },
  );
});
