import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const tmpDirs: string[] = [];

function makeTempCwd(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'eitr-terminal-e2e-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore OS file lock cleanups on Windows
    }
  }
});

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeout = 60000,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const child = spawn(command, args, {
      cwd,
      shell: isWindows,
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ code: -1, stdout, stderr: stderr + '\n[TIMEOUT after ' + timeout + 'ms]' });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

describe('Real Terminal CLI E2E Suite (Production Verification)', () => {
  const rootDir = path.resolve(process.cwd());
  const cliPath = path.join(rootDir, 'dist/bin/eitr.js');

  beforeAll(() => {
    expect(existsSync(cliPath)).toBe(true);
  });

  // ── Scenario 1: TypeScript Playwright Full Lifecycle ─────────────────────────
  it(
    '1. Real CLI Scaffolding — TypeScript Playwright + CPOM Linter & Typecheck',
    { timeout: 60000 },
    async () => {
      const cwd = makeTempCwd();

      // 1. Run "eitr new --yes" in real terminal subprocess
      const res = await runProcess(
        'node',
        [
          cliPath,
          'new',
          '--yes',
          '--no-install',
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
          '--ci-cd',
          'github',
          '--ai-assistants',
          'antigravity,cursor,claude',
          '--tms-providers',
          'azure-devops',
        ],
        cwd,
        60000,
      );

      expect(res.code).toBe(0);
      expect(res.stdout).toContain('E2E Integration & Test Rig');

      // 2. Physical directory tree verification on disk
      expect(existsSync(path.join(cwd, 'package.json'))).toBe(true);
      expect(existsSync(path.join(cwd, 'playwright.config.ts'))).toBe(true);
      expect(existsSync(path.join(cwd, 'eitr.config.ts'))).toBe(false);
      expect(existsSync(path.join(cwd, 'tsconfig.json'))).toBe(true);
      expect(existsSync(path.join(cwd, 'scripts', 'lint-cpom.js'))).toBe(true);
      expect(existsSync(path.join(cwd, 'tests', 'fixtures.ts'))).toBe(true);
      expect(existsSync(path.join(cwd, 'tests', 'smoke.spec.ts'))).toBe(true);
      expect(existsSync(path.join(cwd, 'components', 'base', 'base-page.ts'))).toBe(true);
      expect(existsSync(path.join(cwd, 'components', 'primitives', 'button.ts'))).toBe(true);
      expect(existsSync(path.join(cwd, '.github', 'workflows', 'playwright.yml'))).toBe(true);
      expect(existsSync(path.join(cwd, '.mcp.json'))).toBe(true);
      expect(existsSync(path.join(cwd, '.agents', 'agents', 'sdet-orchestrator', 'agent.md'))).toBe(
        true,
      );
      expect(existsSync(path.join(cwd, '.agents', 'skills', 'automate-ticket', 'SKILL.md'))).toBe(
        true,
      );

      // 3. Run real "node scripts/lint-cpom.js" in generated project
      const linterRes = await runProcess('node', [path.join(cwd, 'scripts/lint-cpom.js')], cwd);
      expect(linterRes.code).toBe(0);
      expect(linterRes.stdout).toContain('[PASS] CPOM Contract & Anti-Fake-Green Audit Passed');

      // 4. Run "tsc --noEmit" in generated project
      try {
        symlinkSync(path.join(rootDir, 'node_modules'), path.join(cwd, 'node_modules'), 'junction');
      } catch {}

      const isWindows = process.platform === 'win32';
      const npxCmd = isWindows ? 'npx.cmd' : 'npx';
      const tscRes = await runProcess(npxCmd, ['tsc', '--noEmit'], cwd);
      expect(tscRes.code).toBe(0);
    },
  );

  // ── Scenario 2: Modular Pipeline Execution ──────────────────────────────────
  it('2. Modular Pipeline — init -> generate -> doctor', { timeout: 60000 }, async () => {
    const cwd = makeTempCwd();

    // Step A: eitr init
    const initRes = await runProcess(
      'node',
      [
        cliPath,
        'init',
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
      ],
      cwd,
    );
    expect(initRes.code).toBe(0);
    expect(existsSync(path.join(cwd, '.scaffold', 'init.json'))).toBe(true);

    // Step B: eitr generate
    const genRes = await runProcess(
      'node',
      [cliPath, 'generate', '--cwd', cwd, '--no-install'],
      cwd,
    );
    expect(genRes.code).toBe(0);
    expect(existsSync(path.join(cwd, 'package.json'))).toBe(true);
    expect(existsSync(path.join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(path.join(cwd, 'scripts', 'lint-cpom.js'))).toBe(true);

    // Step C: eitr doctor
    const doctorRes = await runProcess('node', [cliPath, 'doctor', '--cwd', cwd], cwd);
    expect(doctorRes.code).toBe(0);
    expect(doctorRes.stdout).toContain('Node.js');
  });

  // ── Scenario 3: Negative CPOM Contract Linter Tests ─────────────────────────
  it('3. CPOM Contract Linter Negative Tests — catches violations with exit code 1', async () => {
    const cwd = makeTempCwd();

    // Scaffold project
    const newRes = await runProcess(
      'node',
      [
        cliPath,
        'new',
        '--yes',
        '--no-install',
        '--cwd',
        cwd,
        '--output-dir',
        '.',
        '--start-url',
        'https://app.example.com/',
        '--language',
        'typescript',
      ],
      cwd,
    );
    expect(newRes.code).toBe(0);

    const smokeSpecPath = path.join(cwd, 'tests', 'smoke.spec.ts');
    const basePagePath = path.join(cwd, 'components', 'base', 'base-page.ts');
    const originalSmoke = readFileSync(smokeSpecPath, 'utf8');
    const originalBasePage = readFileSync(basePagePath, 'utf8');

    // Test 3.1: Violate Rule 1 (Arbitrary Delay)
    writeFileSync(smokeSpecPath, originalSmoke + '\nawait page.waitForTimeout(5000);\n', 'utf8');
    const r1 = await runProcess('node', [path.join(cwd, 'scripts/lint-cpom.js')], cwd);
    expect(r1.code).toBe(1);
    expect(r1.stderr).toContain('Rule 1: Zero Arbitrary Delays');

    // Test 3.2: Violate Rule 3 (Assertion in Component)
    writeFileSync(smokeSpecPath, originalSmoke, 'utf8');
    writeFileSync(basePagePath, originalBasePage + '\nexpect(true).toBe(true);\n', 'utf8');
    const r3 = await runProcess('node', [path.join(cwd, 'scripts/lint-cpom.js')], cwd);
    expect(r3.code).toBe(1);
    expect(r3.stderr).toContain('Rule 3: Zero Assertions in Components');

    // Test 3.3: Violate Rule 4 (Unawaited Promise in Assertion)
    writeFileSync(basePagePath, originalBasePage, 'utf8');
    writeFileSync(
      smokeSpecPath,
      originalSmoke + '\nexpect(page.locator("button").isVisible()).toBeTruthy();\n',
      'utf8',
    );
    const r4 = await runProcess('node', [path.join(cwd, 'scripts/lint-cpom.js')], cwd);
    expect(r4.code).toBe(1);
    expect(r4.stderr).toContain('Rule 4: Unawaited Promise Guard');

    // Test 3.4: Violate Rule 5 (Direct Page Object Instantiation in test)
    writeFileSync(
      smokeSpecPath,
      originalSmoke + '\nconst pageObj = new DashboardPage(page);\n',
      'utf8',
    );
    const r5 = await runProcess('node', [path.join(cwd, 'scripts/lint-cpom.js')], cwd);
    expect(r5.code).toBe(1);
    expect(r5.stderr).toContain('Rule 5: Fixture Dependency Injection');

    // Restore and verify Clean state returns code 0
    writeFileSync(smokeSpecPath, originalSmoke, 'utf8');
    const rClean = await runProcess('node', [path.join(cwd, 'scripts/lint-cpom.js')], cwd);
    expect(rClean.code).toBe(0);
    expect(rClean.stdout).toContain('[PASS]');
  });

  // ── Scenario 4: Polyglot Matrix Verification (Python, C#, Java) ─────────────
  it(
    '4. Polyglot Matrix — Python, C#, and Java scaffolds verify successfully',
    { timeout: 60000 },
    async () => {
      // Python Playwright
      const pyCwd = makeTempCwd();
      const pyRes = await runProcess(
        'node',
        [
          cliPath,
          'new',
          '--yes',
          '--no-install',
          '--cwd',
          pyCwd,
          '--output-dir',
          '.',
          '--start-url',
          'https://app.example.com/',
          '--language',
          'python',
        ],
        pyCwd,
      );
      expect(pyRes.code).toBe(0);
      expect(existsSync(path.join(pyCwd, 'pyproject.toml'))).toBe(true);
      expect(existsSync(path.join(pyCwd, 'conftest.py'))).toBe(true);

      // C# Playwright
      const csCwd = makeTempCwd();
      const csRes = await runProcess(
        'node',
        [
          cliPath,
          'new',
          '--yes',
          '--no-install',
          '--cwd',
          csCwd,
          '--output-dir',
          '.',
          '--start-url',
          'https://app.example.com/',
          '--language',
          'csharp',
        ],
        csCwd,
      );
      expect(csRes.code).toBe(0);
      expect(existsSync(path.join(csCwd, 'tests', 'SmokeTest.cs'))).toBe(true);
      expect(existsSync(path.join(csCwd, 'test.runsettings'))).toBe(true);

      // Java Playwright
      const javaCwd = makeTempCwd();
      const javaRes = await runProcess(
        'node',
        [
          cliPath,
          'new',
          '--yes',
          '--no-install',
          '--cwd',
          javaCwd,
          '--output-dir',
          '.',
          '--start-url',
          'https://app.example.com/',
          '--language',
          'java',
          '--automation-tool',
          'playwright-maven',
        ],
        javaCwd,
      );
      expect(javaRes.code).toBe(0);
      expect(existsSync(path.join(javaCwd, 'pom.xml'))).toBe(true);
    },
  );
});
