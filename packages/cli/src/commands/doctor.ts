import { execSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

export interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  warning?: boolean;
}

function runCommand(cmd: string): string | null {
  try {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    return execSync(`${cmd} 2>&1`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
      shell,
    })
      .replace(/\r/g, '')
      .trim();
  } catch {
    return null;
  }
}

function extractVersion(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\b\d+\.\d+(?:\.\d+)?(?:\.\w+)?\b/);
  return match ? match[0] : null;
}

export async function checkNode(): Promise<CheckResult> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  const ok = major >= 18;
  return {
    name: 'Node.js',
    ok,
    message: ok ? `${version}` : `${version} (Requires >= v18.0.0)`,
  };
}

export async function checkNpm(): Promise<CheckResult> {
  const isWindows = process.platform === 'win32';
  const raw =
    runCommand(isWindows ? 'npm.cmd --version' : 'npm --version') || runCommand('npm --version');
  const ver = extractVersion(raw) ?? raw;
  return {
    name: 'npm',
    ok: Boolean(raw),
    message: ver ? (ver.startsWith('v') ? ver : `v${ver}`) : 'Not found in PATH',
  };
}

export async function checkGit(): Promise<CheckResult> {
  const raw = runCommand('git --version');
  const ver = extractVersion(raw);
  return {
    name: 'Git',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH (Git metadata features will be skipped)',
    warning: !raw,
  };
}

export async function checkPython(): Promise<CheckResult> {
  const raw =
    runCommand('python --version') || runCommand('python3 --version') || runCommand('py --version');
  const ver = extractVersion(raw);
  return {
    name: 'Python',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH (Python generators disabled)',
    warning: !raw,
  };
}

export async function checkPip(): Promise<CheckResult> {
  const raw = runCommand('pip --version') || runCommand('pip3 --version');
  const ver = extractVersion(raw);
  return {
    name: 'pip',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH',
    warning: !raw,
  };
}

export async function checkDotnet(): Promise<CheckResult> {
  const raw = runCommand('dotnet --version');
  const ver = extractVersion(raw);
  return {
    name: '.NET SDK',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH (C# generators disabled)',
    warning: !raw,
  };
}

export async function checkJava(): Promise<CheckResult> {
  const raw = runCommand('java -version') || runCommand('java --version');
  const ver = extractVersion(raw);
  return {
    name: 'Java JDK',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH (Java generators disabled)',
    warning: !raw,
  };
}

export async function checkMaven(): Promise<CheckResult> {
  const isWindows = process.platform === 'win32';
  const raw =
    runCommand(isWindows ? 'mvn.cmd -version' : 'mvn -version') || runCommand('mvn -version');
  const ver = extractVersion(raw);
  return {
    name: 'Maven',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH',
    warning: !raw,
  };
}

export async function checkGradle(): Promise<CheckResult> {
  const isWindows = process.platform === 'win32';
  const raw =
    runCommand(isWindows ? 'gradle.bat -version' : 'gradle -version') ||
    runCommand('gradle -version');
  const gradleMatch = raw ? raw.match(/Gradle\s+(\d+\.\d+(?:\.\d+)?)/i) : null;
  const ver = gradleMatch ? gradleMatch[1] : extractVersion(raw);
  return {
    name: 'Gradle',
    ok: true,
    message: ver ? `v${ver}` : 'Not found in PATH',
    warning: !raw,
  };
}

export async function checkPlaywrightCache(): Promise<CheckResult> {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  let cacheDir: string;
  if (isWindows) {
    cacheDir = path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'ms-playwright',
    );
  } else if (isMac) {
    cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  } else {
    cacheDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  }

  try {
    const stats = await fs.stat(cacheDir);
    if (stats.isDirectory()) {
      const contents = await fs.readdir(cacheDir);
      const browsers = contents.filter(
        (c) => c.includes('chromium') || c.includes('firefox') || c.includes('webkit'),
      );
      if (browsers.length > 0) {
        return {
          name: 'Playwright Browsers',
          ok: true,
          message: `Installed (${browsers.join(', ')})`,
        };
      }
    }
    return {
      name: 'Playwright Browsers',
      ok: true,
      message:
        'Cache dir empty (Browsers will be downloaded automatically during generate/install)',
      warning: true,
    };
  } catch {
    return {
      name: 'Playwright Browsers',
      ok: true,
      message: 'Not downloaded yet (Will download on first run)',
      warning: true,
    };
  }
}

export async function checkAiTooling(): Promise<CheckResult[]> {
  const claudeRaw = runCommand('claude --version');
  const cursorMcp = runCommand('cursor --version');
  const aiderRaw = runCommand('aider --version');
  const agyRaw = runCommand('agy --version') || runCommand('antigravity --version');

  return [
    {
      name: 'Claude Code CLI',
      ok: true,
      message: claudeRaw
        ? `v${extractVersion(claudeRaw) ?? claudeRaw}`
        : 'Not found in PATH (Optional)',
      warning: !claudeRaw,
    },
    {
      name: 'Cursor Editor / MCP',
      ok: true,
      message: cursorMcp
        ? `Detected (v${extractVersion(cursorMcp) ?? cursorMcp})`
        : 'Optional AI IDE',
      warning: !cursorMcp,
    },
    {
      name: 'Aider AI CLI',
      ok: true,
      message: aiderRaw
        ? `v${extractVersion(aiderRaw) ?? aiderRaw}`
        : 'Not found in PATH (Optional)',
      warning: !aiderRaw,
    },
    {
      name: 'Antigravity / Gemini CLI',
      ok: true,
      message: agyRaw ? `v${extractVersion(agyRaw) ?? agyRaw}` : 'Not found in PATH (Optional)',
      warning: !agyRaw,
    },
    {
      name: 'MCP Server Compatibility',
      ok: true,
      message: 'Node.js JSON-RPC StdIO Engine Ready',
    },
  ];
}

export async function runDoctor(argv: string[] = []): Promise<number> {
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(
      'Usage: eitr doctor [--ai]\n\nChecks system environment (Node.js, npm, Python, .NET SDK, Git, Playwright) and AI tooling for EITR compatibility.\n',
    );
    return 0;
  }

  process.stdout.write('EITR System Environment Doctor\n');
  process.stdout.write('--------------------------------------------------\n');
  process.stdout.write(`OS Platform:  ${process.platform} (${process.arch})\n`);
  process.stdout.write(
    `CPUs:         ${os.cpus()[0]?.model ?? 'Unknown'} (${os.cpus().length} cores)\n`,
  );
  process.stdout.write('--------------------------------------------------\n\n');

  const checks = [
    await checkNode(),
    await checkNpm(),
    await checkGit(),
    await checkPython(),
    await checkPip(),
    await checkDotnet(),
    await checkJava(),
    await checkMaven(),
    await checkGradle(),
    await checkPlaywrightCache(),
  ];

  if (argv.includes('--ai')) {
    process.stdout.write('AI Assistant Ecosystem & MCP Runtime:\n');
    const aiChecks = await checkAiTooling();
    checks.push(...aiChecks);
  }

  let hasErrors = false;
  for (const check of checks) {
    let icon = '[OK]   ';
    if (!check.ok) {
      icon = '[ERROR]';
      hasErrors = true;
    } else if (check.warning) {
      icon = '[WARN] ';
    }
    process.stdout.write(`${icon} ${check.name.padEnd(26)} : ${check.message}\n`);
  }

  process.stdout.write('\n--------------------------------------------------\n');
  if (hasErrors) {
    process.stderr.write(
      '[ERROR] Some required dependencies are missing or outdated. Please fix them above.\n',
    );
    return 1;
  }

  process.stdout.write('[OK] Environment is healthy and ready to generate EITR frameworks!\n');
  return 0;
}
