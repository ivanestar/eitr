import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  runInstall,
  type SpawnRun,
  manualInstallHint,
  getPlannedInstallSteps,
} from '../src/commands/install.js';

const npmPresent = existsSync(
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
);

const tmpDirs: string[] = [];
function makeProject(withPlaywrightCli: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-install-'));
  tmpDirs.push(dir);
  if (withPlaywrightCli) {
    mkdirSync(join(dir, 'node_modules', 'playwright'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'playwright', 'cli.js'), '// fake\n', 'utf8');
  }
  return dir;
}

function makePythonProject(withVenvPython: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-install-python-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "test-python-app"\n', 'utf8');
  if (withVenvPython) {
    const isWindows = process.platform === 'win32';
    const sub = isWindows ? ['Scripts'] : ['bin'];
    mkdirSync(join(dir, '.venv', ...sub), { recursive: true });
    const exeName = isWindows ? 'python.exe' : 'python';
    writeFileSync(join(dir, '.venv', ...sub, exeName), '# fake python\n', 'utf8');
  }
  return dir;
}

function makeCsharpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-install-csharp-'));
  tmpDirs.push(dir);
  writeFileSync(
    join(dir, 'PlaywrightCsharpTests.csproj'),
    '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
    'utf8',
  );
  return dir;
}

function makeJavaProject(withGradle: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-install-java-'));
  tmpDirs.push(dir);
  if (withGradle) {
    writeFileSync(join(dir, 'build.gradle'), "plugins { id 'java' }\n", 'utf8');
  } else {
    writeFileSync(join(dir, 'pom.xml'), '<project></project>\n', 'utf8');
  }
  return dir;
}

interface Call {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}
function recorder(results: Array<{ code: number | null; error?: Error }>): {
  run: SpawnRun;
  calls: Call[];
} {
  const calls: Call[] = [];
  let i = 0;
  const run: SpawnRun = (file, args, opts) => {
    calls.push({ file, args, cwd: opts.cwd, env: opts.env });
    return Promise.resolve(results[i++] ?? { code: 0 });
  };
  return { run, calls };
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('runInstall (spawn injected) - Node.js', () => {
  it.skipIf(!npmPresent)(
    'runs npm install (browser download skipped) then the local playwright browser install',
    async () => {
      const proj = makeProject(true);
      const { run, calls } = recorder([{ code: 0 }, { code: 0 }]);
      const outcome = await runInstall(proj, { run });

      expect(outcome).toEqual({ installedDeps: true, installedBrowsers: true });
      expect(calls).toHaveLength(2);
      // step 1: node <npm-cli.js> install, with the browser download disabled
      expect(calls[0].file).toBe(process.execPath);
      expect(calls[0].args).toContain('install');
      expect(calls[0].args[0]).toMatch(/npm-cli\.js$/);
      expect(calls[0].cwd).toBe(proj);
      expect(calls[0].env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe('1');
      // step 2: node <playwright cli> install chromium
      expect(calls[1].file).toBe(process.execPath);
      expect(calls[1].args.slice(-2)).toEqual(['install', 'chromium']);
      expect(calls[1].args[0]).toMatch(/playwright[\\/]cli\.js$/);
    },
  );

  it.skipIf(!npmPresent)(
    'reports a browser-step failure as installedBrowsers:false (deps still ok)',
    async () => {
      const proj = makeProject(true);
      const { run } = recorder([{ code: 0 }, { code: 1 }]);
      const outcome = await runInstall(proj, { run });
      expect(outcome.installedDeps).toBe(true);
      expect(outcome.installedBrowsers).toBe(false);
      expect(outcome.message).toBeTruthy();
    },
  );

  it.skipIf(!npmPresent)(
    'a spawn error (ENOENT/EINVAL) on npm install fails deps and does not run browsers',
    async () => {
      const proj = makeProject(true);
      const { run, calls } = recorder([{ code: null, error: new Error('spawn ENOENT') }]);
      const outcome = await runInstall(proj, { run });
      expect(outcome.installedDeps).toBe(false);
      expect(calls).toHaveLength(1); // never reached the browser step
    },
  );

  it.skipIf(!npmPresent)('skipBrowsers installs deps only', async () => {
    const proj = makeProject(true);
    const { run, calls } = recorder([{ code: 0 }]);
    const outcome = await runInstall(proj, { run, skipBrowsers: true });
    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: false });
    expect(calls).toHaveLength(1);
  });
});

describe('runInstall (spawn injected) - C# / Playwright', () => {
  it('runs dotnet build and browser install for C# project', async () => {
    const proj = makeCsharpProject();
    const { run, calls } = recorder([
      { code: 0 }, // dotnet --version -> ok
      { code: 0 }, // dotnet build -> ok
      { code: 0 }, // npx playwright install chromium -> ok
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: true });
    expect(calls.length).toBeGreaterThanOrEqual(3);

    expect(calls[0].file).toBe('dotnet');
    expect(calls[0].args).toEqual(['--version']);

    expect(calls[1].file).toBe('dotnet');
    expect(calls[1].args).toEqual(['build']);
    expect(calls[1].env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe('1');
  });

  it('fails if dotnet build fails', async () => {
    const proj = makeCsharpProject();
    const { run } = recorder([
      { code: 0 }, // dotnet --version
      { code: 1 }, // dotnet build fails
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome.installedDeps).toBe(false);
    expect(outcome.installedBrowsers).toBe(false);
    expect(outcome.message).toContain('dotnet build exited with code 1');
  });
});

describe('runInstall (spawn injected) - Java / Maven', () => {
  it('runs mvn test-compile then the Playwright CLI browser install', async () => {
    const proj = makeJavaProject(false);
    const { run, calls } = recorder([
      { code: 0 }, // mvn --version -> ok
      { code: 0 }, // mvn test-compile -> ok
      { code: 0 }, // mvn exec:java (playwright CLI install) -> ok
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: true });
    expect(calls).toHaveLength(3);

    expect(calls[1].args).toEqual(['test-compile']);

    // The -Dexec.args value is quoted only on Windows (mvn.cmd goes through cmd.exe, which
    // re-splits an unquoted space) and unquoted everywhere else (plain 'mvn' has no shell to
    // re-split it, and quotes would instead become literal characters) - both forms were caught
    // breaking live (Windows unquoted, Linux quoted), so this test pins the platform-correct one
    // rather than a single hardcoded string that would only ever validate one OS.
    const expectedExecArgs =
      process.platform === 'win32'
        ? '-Dexec.args="install chromium"'
        : '-Dexec.args=install chromium';
    expect(calls[2].args).toEqual([
      'exec:java',
      '-e',
      '-Dexec.mainClass=com.microsoft.playwright.CLI',
      expectedExecArgs,
    ]);
  });

  it('reports a browser-install failure as installedBrowsers:false (deps still ok)', async () => {
    const proj = makeJavaProject(false);
    const { run } = recorder([
      { code: 0 }, // mvn --version
      { code: 0 }, // mvn test-compile
      { code: 1 }, // mvn exec:java fails
    ]);
    const outcome = await runInstall(proj, { run });
    expect(outcome.installedDeps).toBe(true);
    expect(outcome.installedBrowsers).toBe(false);
    expect(outcome.message).toContain('mvn exec:java');
  });

  it('does not attempt the browser step if mvn test-compile fails', async () => {
    const proj = makeJavaProject(false);
    const { run, calls } = recorder([
      { code: 0 }, // mvn --version
      { code: 1 }, // mvn test-compile fails
    ]);
    const outcome = await runInstall(proj, { run });
    expect(outcome.installedDeps).toBe(false);
    expect(outcome.installedBrowsers).toBe(false);
    expect(calls).toHaveLength(2); // never reached the browser step
  });

  it('skipBrowsers compiles only, does not install browsers', async () => {
    const proj = makeJavaProject(false);
    const { run, calls } = recorder([
      { code: 0 }, // mvn --version
      { code: 0 }, // mvn test-compile
    ]);
    const outcome = await runInstall(proj, { run, skipBrowsers: true });
    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: false });
    expect(calls).toHaveLength(2);
  });
});

describe('runInstall (spawn injected) - Java / Gradle', () => {
  it('runs gradle testClasses then the playwrightInstall task', async () => {
    const proj = makeJavaProject(true);
    const { run, calls } = recorder([
      { code: 0 }, // gradle --version -> ok
      { code: 0 }, // gradle testClasses -> ok
      { code: 0 }, // gradle playwrightInstall -> ok
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: true });
    expect(calls).toHaveLength(3);
    expect(calls[1].args).toEqual(['testClasses']);
    expect(calls[2].args).toEqual(['playwrightInstall']);
  });

  it('reports a browser-install failure as installedBrowsers:false (deps still ok)', async () => {
    const proj = makeJavaProject(true);
    const { run } = recorder([
      { code: 0 }, // gradle --version
      { code: 0 }, // gradle testClasses
      { code: 1 }, // gradle playwrightInstall fails
    ]);
    const outcome = await runInstall(proj, { run });
    expect(outcome.installedDeps).toBe(true);
    expect(outcome.installedBrowsers).toBe(false);
    expect(outcome.message).toContain('playwrightInstall');
  });
});

describe('runInstall (spawn injected) - Python / pytest', () => {
  it('creates venv (if absent), runs pip install, and installs playwright browsers', async () => {
    const proj = makePythonProject(false); // venv python executable is absent initially
    // 1. check python --version -> ok
    // 2. run python -m venv .venv -> ok (creates .venv)
    // 3. run pip install -> ok
    // 4. run playwright install chromium -> ok
    const { run, calls } = recorder([
      { code: 0 }, // python --version
      { code: 0 }, // python -m venv .venv
      { code: 0 }, // system python -m pip install -e .[api] (since venv exe doesn't exist yet during check)
      { code: 0 }, // system python -m playwright install chromium
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: true });
    expect(calls).toHaveLength(4);

    expect(calls[0].file).toBe('python');
    expect(calls[0].args).toEqual(['--version']);

    expect(calls[1].file).toBe('python');
    expect(calls[1].args).toEqual(['-m', 'venv', '.venv']);

    expect(calls[2].file).toBe('python');
    expect(calls[2].args).toEqual(['-m', 'pip', 'install', '-e', '.[api]']);
    expect(calls[2].env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe('1');

    expect(calls[3].file).toBe('python');
    expect(calls[3].args).toEqual(['-m', 'playwright', 'install', 'chromium']);
  });

  it('uses the venv python if .venv python executable exists', async () => {
    const proj = makePythonProject(true); // venv python exists
    // 1. check python --version -> ok
    // 2. venv creation skipped (already exists)
    // 3. venv python -m pip install -> ok
    // 4. venv python -m playwright install chromium -> ok
    const { run, calls } = recorder([
      { code: 0 }, // python --version
      { code: 0 }, // venv pip install
      { code: 0 }, // venv playwright install
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: true });
    expect(calls).toHaveLength(3);

    expect(calls[0].file).toBe('python');

    const isWindows = process.platform === 'win32';
    const expectedVenvPython = isWindows
      ? join(proj, '.venv', 'Scripts', 'python.exe')
      : join(proj, '.venv', 'bin', 'python');

    expect(calls[1].file).toBe(expectedVenvPython);
    expect(calls[1].args).toEqual(['-m', 'pip', 'install', '-e', '.[api]']);
    expect(calls[1].env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe('1');

    expect(calls[2].file).toBe(expectedVenvPython);
    expect(calls[2].args).toEqual(['-m', 'playwright', 'install', 'chromium']);
  });

  it('fails if no python interpreter is found', async () => {
    const proj = makePythonProject(false);
    // python, python3, and py all fail to spawn
    const { run, calls } = recorder([
      { code: null, error: new Error('spawn ENOENT') }, // python
      { code: null, error: new Error('spawn ENOENT') }, // python3
      { code: null, error: new Error('spawn ENOENT') }, // py
    ]);
    const outcome = await runInstall(proj, { run });

    expect(outcome.installedDeps).toBe(false);
    expect(outcome.installedBrowsers).toBe(false);
    expect(outcome.message).toContain('could not locate python');
    expect(calls).toHaveLength(3);
  });

  it('skipBrowsers installs python deps only', async () => {
    const proj = makePythonProject(true);
    const { run, calls } = recorder([
      { code: 0 }, // python --version
      { code: 0 }, // venv pip install
    ]);
    const outcome = await runInstall(proj, { run, skipBrowsers: true });

    expect(outcome).toEqual({ installedDeps: true, installedBrowsers: false });
    expect(calls).toHaveLength(2);
  });
});

describe('manualInstallHint', () => {
  it('returns appropriate commands for Node.js', () => {
    expect(manualInstallHint('.', 'typescript')).toBe(
      'npm install\n  npx playwright install chromium\n  npm test',
    );
    expect(manualInstallHint('my-dir', 'typescript')).toBe(
      'cd my-dir\n  npm install\n  npx playwright install chromium\n  npm test',
    );
  });

  it('returns appropriate commands for C#', () => {
    expect(manualInstallHint('.', 'csharp')).toBe(
      'dotnet build\n  npx playwright install chromium\n  dotnet test',
    );
    expect(manualInstallHint('my-dir', 'csharp')).toBe(
      'cd my-dir\n  dotnet build\n  npx playwright install chromium\n  dotnet test',
    );
  });

  it('returns appropriate commands for Python / pytest', () => {
    const isWindows = process.platform === 'win32';
    const winCmd =
      'python -m venv .venv\n  .\\.venv\\Scripts\\pip install -e .[api]\n  .\\.venv\\Scripts\\playwright install chromium\n  pytest';
    const unixCmd =
      'python3 -m venv .venv\n  ./.venv/bin/pip install -e .[api]\n  ./.venv/bin/playwright install chromium\n  pytest';
    const expected = isWindows ? winCmd : unixCmd;

    expect(manualInstallHint('.', 'python')).toBe(expected);
    expect(manualInstallHint('my-dir', 'python')).toBe(`cd my-dir\n  ${expected}`);
  });
});

describe('getPlannedInstallSteps', () => {
  it('returns human-readable steps for TypeScript/JavaScript Playwright', () => {
    const steps = getPlannedInstallSteps('typescript', 'playwright');
    expect(steps).toEqual([
      {
        description: 'Install Playwright framework & Node.js dependencies',
        command: 'npm install',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command: 'npx playwright install chromium',
      },
    ]);
  });

  it('returns human-readable steps for Cypress', () => {
    const steps = getPlannedInstallSteps('typescript', 'cypress');
    expect(steps).toEqual([
      { description: 'Install Cypress framework & Node.js dependencies', command: 'npm install' },
      { description: 'Verify Cypress test runner installation', command: 'npx cypress verify' },
    ]);
  });

  it('returns human-readable steps for C#', () => {
    const steps = getPlannedInstallSteps('csharp', 'playwright');
    expect(steps).toEqual([
      {
        description: 'Download Playwright .NET NuGet packages & build C# assembly',
        command: 'dotnet build',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command: 'npx playwright install chromium',
      },
    ]);
  });

  it('returns human-readable steps for Java (Maven)', () => {
    const steps = getPlannedInstallSteps('java', 'playwright-maven');
    expect(steps).toEqual([
      {
        description: 'Download Playwright Java dependencies via Maven & compile tests',
        command: 'mvn test-compile',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command:
          'mvn exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install chromium"',
      },
    ]);
  });

  it('returns human-readable steps for Java (Gradle)', () => {
    const steps = getPlannedInstallSteps('java', 'playwright-gradle');
    expect(steps).toEqual([
      {
        description: 'Download Playwright Java dependencies via Gradle & compile tests',
        command: 'gradle testClasses',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command: 'gradle playwrightInstall',
      },
    ]);
  });
});
