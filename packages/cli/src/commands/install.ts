import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

// Runs the framework install as a side effect. Deliberately does NOT spawn `npm.cmd`/`npx.cmd`
// (ENOENT/EINVAL on current-Node Windows) or `npx` (its download prompt can hang): it invokes npm
// and the LOCAL Playwright CLI through `process.execPath`. The browser download is isolated after a
// JS-only `npm install` (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1) so an antivirus block hits only the
// browser step and degrades gracefully. The spawn is injectable (`run`) so tests never touch npm.

export interface InstallOutcome {
  installedDeps: boolean;
  installedBrowsers: boolean;
  message?: string;
}

// High-level install seam injected into generate/new/install commands so tests never spawn npm.
export type InstallFn = (projectDir: string) => Promise<InstallOutcome>;

export type SpawnRun = (
  file: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ code: number | null; error?: Error }>;

export interface InstallOptions {
  skipBrowsers?: boolean;
  run?: SpawnRun;
}

const TIMEOUT_MS = 10 * 60 * 1000;

const defaultRun: SpawnRun = (file, args, opts) =>
  new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const needsShell = isWindows && (file.endsWith('.cmd') || file.endsWith('.bat'));
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: 'inherit',
      shell: needsShell,
      timeout: TIMEOUT_MS,
    });
    child.on('error', (error) => resolve({ code: null, error }));
    child.on('close', (code) => resolve({ code }));
  });

// npm ships alongside the node binary, but the relative layout differs by platform:
// Windows installers put node.exe and node_modules/npm in the same flat directory, while the
// official POSIX (Linux/macOS) tarballs put node in bin/ and npm one level up in lib/node_modules/npm.
function findNpmCli(): string | undefined {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  return candidates.find((p) => existsSync(p));
}

function findPlaywrightCli(projectDir: string): string | undefined {
  const candidates = [
    'node_modules/playwright/cli.js',
    'node_modules/playwright-core/cli.js',
    'node_modules/@playwright/test/cli.js',
  ];
  for (const rel of candidates) {
    const p = path.join(projectDir, rel);
    if (existsSync(p)) return p;
  }
  return undefined;
}

function findCsproj(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  try {
    const files = readdirSync(dir);
    return files.find((f) => f.endsWith('.csproj'));
  } catch {
    return undefined;
  }
}

async function findDotnet(run: SpawnRun, cwd: string): Promise<string | undefined> {
  const res = await run('dotnet', ['--version'], { cwd, env: { ...process.env } });
  if (res.code === 0 && !res.error) {
    return 'dotnet';
  }
  return undefined;
}

async function findPython(run: SpawnRun, cwd: string): Promise<string | undefined> {
  for (const cmd of ['python', 'python3', 'py']) {
    const res = await run(cmd, ['--version'], { cwd, env: { ...process.env } });
    if (res.code === 0 && !res.error) {
      return cmd;
    }
  }
  return undefined;
}

async function findMaven(run: SpawnRun, cwd: string): Promise<string | undefined> {
  const isWindows = process.platform === 'win32';
  const cmds = isWindows ? ['mvn.cmd', 'mvn'] : ['mvn'];
  for (const cmd of cmds) {
    const res = await run(cmd, ['--version'], { cwd, env: { ...process.env } });
    if (res.code === 0 && !res.error) {
      return cmd;
    }
  }
  return undefined;
}

async function findGradle(run: SpawnRun, cwd: string): Promise<string | undefined> {
  const isWindows = process.platform === 'win32';
  const cmds = isWindows ? ['gradle.bat', 'gradle'] : ['gradle'];
  for (const cmd of cmds) {
    const res = await run(cmd, ['--version'], { cwd, env: { ...process.env } });
    if (res.code === 0 && !res.error) {
      return cmd;
    }
  }
  return undefined;
}

export async function runInstall(
  projectDir: string,
  opts: InstallOptions = {},
): Promise<InstallOutcome> {
  const run = opts.run ?? defaultRun;

  const isPython = existsSync(path.join(projectDir, 'pyproject.toml'));
  const isCsharp = Boolean(findCsproj(projectDir));
  const hasPom = existsSync(path.join(projectDir, 'pom.xml'));
  const hasGradle = existsSync(path.join(projectDir, 'build.gradle'));
  const isJava = hasPom || hasGradle;

  if (isJava) {
    if (hasGradle) {
      const gradleCmd = await findGradle(run, projectDir);
      if (!gradleCmd) {
        return {
          installedDeps: true,
          installedBrowsers: true,
          message: 'gradle executable not found in PATH',
        };
      }
      const buildRes = await run(gradleCmd, ['testClasses'], {
        cwd: projectDir,
        env: { ...process.env },
      });
      if (buildRes.error || buildRes.code !== 0) {
        const message = buildRes.error
          ? buildRes.error.message
          : `gradle testClasses exited with code ${buildRes.code}`;
        return { installedDeps: false, installedBrowsers: false, message };
      }
      if (opts.skipBrowsers) {
        return { installedDeps: true, installedBrowsers: false };
      }
      // The generated build.gradle registers a `playwrightInstall` JavaExec task (see
      // java/project.ts) - neither Maven nor Gradle downloads Playwright's browser binaries on
      // its own, unlike npm's postinstall hook, so this is a required, not optional, step.
      const browserRes = await run(gradleCmd, ['playwrightInstall'], {
        cwd: projectDir,
        env: { ...process.env },
      });
      if (browserRes.error || browserRes.code !== 0) {
        const message = browserRes.error
          ? browserRes.error.message
          : `gradle playwrightInstall exited with code ${browserRes.code}`;
        return { installedDeps: true, installedBrowsers: false, message };
      }
      return { installedDeps: true, installedBrowsers: true };
    } else {
      const mvnCmd = await findMaven(run, projectDir);
      if (!mvnCmd) {
        return {
          installedDeps: true,
          installedBrowsers: true,
          message: 'mvn executable not found in PATH',
        };
      }
      const buildRes = await run(mvnCmd, ['test-compile'], {
        cwd: projectDir,
        env: { ...process.env },
      });
      if (buildRes.error || buildRes.code !== 0) {
        const message = buildRes.error
          ? buildRes.error.message
          : `mvn test-compile exited with code ${buildRes.code}`;
        return { installedDeps: false, installedBrowsers: false, message };
      }
      if (opts.skipBrowsers) {
        return { installedDeps: true, installedBrowsers: false };
      }
      // mvn resolves the `exec` prefix to org.codehaus.mojo:exec-maven-plugin via Maven's
      // built-in plugin-prefix registry - no pom.xml plugin declaration needed. Verified live:
      // running this against a freshly generated project actually downloads the plugin and
      // installs Playwright's browser binaries.
      //
      // The -Dexec.args value needs OS-conditional quoting, not a fixed string - the two
      // platforms disagree on who tokenizes it:
      //  - Windows: mvnCmd is 'mvn.cmd', which defaultRun's needsShell routes through cmd.exe
      //    (shell: true). An UNQUOTED space inside one array element gets re-split by cmd.exe's
      //    own tokenizer, so 'install chromium' arrives at Maven as two separate arguments and
      //    "chromium" gets misread as a bogus lifecycle phase. Needs quotes.
      //  - Linux/macOS: mvnCmd is plain 'mvn', spawned with shell:false - array elements reach
      //    the process verbatim with no re-tokenization, so quotes would instead become LITERAL
      //    characters inside the property value. Must stay unquoted.
      // Both failure modes were caught live: the unquoted form broke local Windows dev, and the
      // fixed-quoted form then broke GitHub Actions' Ubuntu runner in CI on this exact line.
      const isWindowsMvn = mvnCmd.endsWith('.cmd');
      const execArgsValue = isWindowsMvn
        ? '-Dexec.args="install chromium"'
        : '-Dexec.args=install chromium';
      const browserRes = await run(
        mvnCmd,
        ['exec:java', '-e', '-Dexec.mainClass=com.microsoft.playwright.CLI', execArgsValue],
        { cwd: projectDir, env: { ...process.env } },
      );
      if (browserRes.error || browserRes.code !== 0) {
        const message = browserRes.error
          ? browserRes.error.message
          : `mvn exec:java (playwright install) exited with code ${browserRes.code}`;
        return { installedDeps: true, installedBrowsers: false, message };
      }
      return { installedDeps: true, installedBrowsers: true };
    }
  } else if (isCsharp) {
    const dotnetCmd = await findDotnet(run, projectDir);
    if (!dotnetCmd) {
      return {
        installedDeps: false,
        installedBrowsers: false,
        message: 'could not locate dotnet executable on the system',
      };
    }

    const buildRes = await run(dotnetCmd, ['build'], {
      cwd: projectDir,
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    });

    if (buildRes.error || buildRes.code !== 0) {
      const message = buildRes.error
        ? buildRes.error.message
        : `dotnet build exited with code ${buildRes.code}`;
      return { installedDeps: false, installedBrowsers: false, message };
    }

    if (opts.skipBrowsers) {
      return { installedDeps: true, installedBrowsers: false };
    }

    let browserRes: { code: number | null; error?: Error } = { code: 1 };
    const pwCli = findPlaywrightCli(projectDir);
    if (pwCli) {
      browserRes = await run(process.execPath, [pwCli, 'install', 'chromium'], {
        cwd: projectDir,
        env: { ...process.env },
      });
    } else {
      const psScript = path.join(projectDir, 'bin', 'Debug', 'net8.0', 'playwright.ps1');
      if (existsSync(psScript)) {
        browserRes = await run('pwsh', [psScript, 'install', 'chromium'], {
          cwd: projectDir,
          env: { ...process.env },
        });
        if (browserRes.code !== 0 || browserRes.error) {
          browserRes = await run(
            'powershell',
            ['-ExecutionPolicy', 'Bypass', '-File', psScript, 'install', 'chromium'],
            {
              cwd: projectDir,
              env: { ...process.env },
            },
          );
        }
      }
      if (browserRes.code !== 0 || browserRes.error) {
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        browserRes = await run(npxCmd, ['playwright', 'install', 'chromium'], {
          cwd: projectDir,
          env: { ...process.env },
        });
      }
    }

    if (browserRes.error || browserRes.code !== 0) {
      const message = browserRes.error
        ? browserRes.error.message
        : `playwright install exited with code ${browserRes.code}`;
      return { installedDeps: true, installedBrowsers: false, message };
    }

    return { installedDeps: true, installedBrowsers: true };
  } else if (isPython) {
    const pythonCmd = await findPython(run, projectDir);
    if (!pythonCmd) {
      return {
        installedDeps: false,
        installedBrowsers: false,
        message: 'could not locate python, python3, or py executable on the system',
      };
    }

    const venvDir = path.join(projectDir, '.venv');
    if (!existsSync(venvDir)) {
      const venvResult = await run(pythonCmd, ['-m', 'venv', '.venv'], {
        cwd: projectDir,
        env: { ...process.env },
      });
      if (venvResult.error || venvResult.code !== 0) {
        const msg = venvResult.error
          ? venvResult.error.message
          : `python -m venv failed with code ${venvResult.code}`;
        return {
          installedDeps: false,
          installedBrowsers: false,
          message: `failed to create virtual environment: ${msg}`,
        };
      }
    }

    const isWindows = process.platform === 'win32';
    const venvPython = isWindows
      ? path.join(projectDir, '.venv', 'Scripts', 'python.exe')
      : path.join(projectDir, '.venv', 'bin', 'python');

    const pythonBin = existsSync(venvPython) ? venvPython : pythonCmd;

    const deps = await run(pythonBin, ['-m', 'pip', 'install', '-e', '.[api]'], {
      cwd: projectDir,
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    });

    if (deps.error || deps.code !== 0) {
      const message = deps.error ? deps.error.message : `pip install exited with code ${deps.code}`;
      return { installedDeps: false, installedBrowsers: false, message };
    }

    if (opts.skipBrowsers) {
      return { installedDeps: true, installedBrowsers: false };
    }

    const browsers = await run(pythonBin, ['-m', 'playwright', 'install', 'chromium'], {
      cwd: projectDir,
      env: { ...process.env },
    });

    if (browsers.error || browsers.code !== 0) {
      const message = browsers.error
        ? browsers.error.message
        : `playwright install exited with code ${browsers.code}`;
      return { installedDeps: true, installedBrowsers: false, message };
    }

    return { installedDeps: true, installedBrowsers: true };
  } else {
    const npmCli = findNpmCli();
    if (!npmCli) {
      return {
        installedDeps: false,
        installedBrowsers: false,
        message: 'could not locate npm next to the node binary',
      };
    }

    // JS-only install (skip the AV-blocked browser download that @playwright/test's postinstall
    // triggers). --no-audit/--no-fund drop two network round-trips npm otherwise makes to
    // registry.npmjs.org purely for reporting (no effect on what gets installed); --prefer-offline
    // reuses npm's local package cache instead of re-validating already-cached metadata over the
    // network. Real, measured contributor to install latency for a heavy dependency tree
    // (React/MUI) on a cold CI cache - not a substitute for the E2E test's own generous timeout
    // budget, a genuine reduction in the actual work every real generated project also pays for.
    const deps = await run(
      process.execPath,
      [npmCli, 'install', '--no-audit', '--no-fund', '--prefer-offline'],
      {
        cwd: projectDir,
        env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
      },
    );
    if (deps.error || deps.code !== 0) {
      const message = deps.error ? deps.error.message : `npm install exited with code ${deps.code}`;
      return { installedDeps: false, installedBrowsers: false, message };
    }
    if (opts.skipBrowsers) {
      return { installedDeps: true, installedBrowsers: false };
    }

    const isCypress =
      existsSync(path.join(projectDir, 'cypress.config.ts')) ||
      existsSync(path.join(projectDir, 'cypress.config.js'));
    if (isCypress) {
      return { installedDeps: true, installedBrowsers: true };
    }

    const pwCli = findPlaywrightCli(projectDir);
    if (!pwCli) {
      return {
        installedDeps: true,
        installedBrowsers: false,
        message: 'Playwright CLI not found after install',
      };
    }
    const browsers = await run(process.execPath, [pwCli, 'install', 'chromium'], {
      cwd: projectDir,
      env: { ...process.env },
    });
    if (browsers.error || browsers.code !== 0) {
      const message = browsers.error
        ? browsers.error.message
        : `playwright install exited with code ${browsers.code}`;
      return { installedDeps: true, installedBrowsers: false, message };
    }
    return { installedDeps: true, installedBrowsers: true };
  }
}

// The manual commands we print whenever install doesn't fully complete.
export function manualInstallHint(
  projectDirOrRel: string,
  language?: string,
  opts?: { installedDeps?: boolean },
): string {
  const isWindows = process.platform === 'win32';
  const hasPyproject = existsSync(path.join(projectDirOrRel, 'pyproject.toml'));
  const hasCsproj = Boolean(findCsproj(projectDirOrRel));
  const hasCypress =
    existsSync(path.join(projectDirOrRel, 'cypress.config.ts')) ||
    existsSync(path.join(projectDirOrRel, 'cypress.config.js'));
  const hasPom = existsSync(path.join(projectDirOrRel, 'pom.xml'));
  const hasGradle = existsSync(path.join(projectDirOrRel, 'build.gradle'));

  const isCsharp = language === 'csharp' || (language === undefined && hasCsproj);
  const isPython = language === 'python' || (language === undefined && hasPyproject);
  const isJava = language === 'java' || (language === undefined && (hasPom || hasGradle));

  const cdLine = projectDirOrRel && projectDirOrRel !== '.' ? `cd ${projectDirOrRel}\n  ` : '';
  const depsDone = Boolean(opts?.installedDeps);

  if (isJava) {
    const runCmd = hasGradle ? 'gradle test' : 'mvn test';
    return `${cdLine}${runCmd}`;
  }
  if (isCsharp) {
    const buildPart = depsDone ? '' : 'dotnet build\n  ';
    return `${cdLine}${buildPart}npx playwright install chromium\n  dotnet test`;
  }
  if (isPython) {
    if (isWindows) {
      const setupPart = depsDone
        ? ''
        : 'python -m venv .venv\n  .\\.venv\\Scripts\\pip install -e .[api]\n  ';
      return `${cdLine}${setupPart}.\\.venv\\Scripts\\playwright install chromium\n  pytest`;
    }
    const setupPart = depsDone
      ? ''
      : 'python3 -m venv .venv\n  ./.venv/bin/pip install -e .[api]\n  ';
    return `${cdLine}${setupPart}./.venv/bin/playwright install chromium\n  pytest`;
  }
  if (hasCypress) {
    const npmPart = depsDone ? '' : 'npm install\n  ';
    return `${cdLine}${npmPart}npx cypress run`;
  }
  const npmPart = depsDone ? '' : 'npm install\n  ';
  return `${cdLine}${npmPart}npx playwright install chromium\n  npm test`;
}

export interface InstallStep {
  readonly description: string;
  readonly command: string;
}

export function getPlannedInstallSteps(
  language?: string,
  automationTool?: string,
  projectDirOrRel: string = '.',
): InstallStep[] {
  const isWindows = process.platform === 'win32';
  const hasPyproject = existsSync(path.join(projectDirOrRel, 'pyproject.toml'));
  const hasCsproj = Boolean(findCsproj(projectDirOrRel));
  const hasCypress =
    automationTool?.includes('cypress') ||
    existsSync(path.join(projectDirOrRel, 'cypress.config.ts')) ||
    existsSync(path.join(projectDirOrRel, 'cypress.config.js'));
  const hasPom =
    automationTool?.includes('maven') || existsSync(path.join(projectDirOrRel, 'pom.xml'));
  const hasGradle =
    automationTool?.includes('gradle') || existsSync(path.join(projectDirOrRel, 'build.gradle'));

  const isCsharp = language === 'csharp' || (language === undefined && hasCsproj);
  const isPython = language === 'python' || (language === undefined && hasPyproject);
  const isJava = language === 'java' || (language === undefined && (hasPom || hasGradle));

  if (isJava) {
    if (hasGradle) {
      return [
        {
          description: 'Download Playwright Java dependencies via Gradle & compile tests',
          command: 'gradle testClasses',
        },
        {
          description: 'Download Playwright Chromium browser binary',
          command: 'gradle playwrightInstall',
        },
      ];
    }
    return [
      {
        description: 'Download Playwright Java dependencies via Maven & compile tests',
        command: 'mvn test-compile',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command:
          'mvn exec:java -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install chromium"',
      },
    ];
  }
  if (isCsharp) {
    return [
      {
        description: 'Download Playwright .NET NuGet packages & build C# assembly',
        command: 'dotnet build',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command: 'npx playwright install chromium',
      },
    ];
  }
  if (isPython) {
    if (isWindows) {
      return [
        {
          description: 'Create Python virtual environment',
          command: 'python -m venv .venv',
        },
        {
          description: 'Install Playwright Python framework & test dependencies',
          command: '.\\.venv\\Scripts\\pip install -e .[api]',
        },
        {
          description: 'Download Playwright Chromium browser binary',
          command: '.\\.venv\\Scripts\\playwright install chromium',
        },
      ];
    }
    return [
      {
        description: 'Create Python virtual environment',
        command: 'python3 -m venv .venv',
      },
      {
        description: 'Install Playwright Python framework & test dependencies',
        command: './.venv/bin/pip install -e .[api]',
      },
      {
        description: 'Download Playwright Chromium browser binary',
        command: './.venv/bin/playwright install chromium',
      },
    ];
  }
  if (hasCypress) {
    return [
      {
        description: 'Install Cypress framework & Node.js dependencies',
        command: 'npm install',
      },
      {
        description: 'Verify Cypress test runner installation',
        command: 'npx cypress verify',
      },
    ];
  }
  return [
    {
      description: 'Install Playwright framework & Node.js dependencies',
      command: 'npm install',
    },
    {
      description: 'Download Playwright Chromium browser binary',
      command: 'npx playwright install chromium',
    },
  ];
}
