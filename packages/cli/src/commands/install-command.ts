import { parseArgs } from 'node:util';
import * as path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { runInstall, manualInstallHint, type InstallFn } from './install.js';

const INSTALL_USAGE = `Usage: eitr install [options]

(Re)installs an already-generated project: npm install + Playwright browsers. Useful to retry after
unblocking the browser download (e.g. antivirus). Point --cwd at the project folder (the one with
package.json).

Options:
  --cwd <dir>     The generated project directory (default: cwd)
  --no-browsers   Install JS dependencies only; skip the browser download
  -h, --help      Show this help
`;

const INSTALL_ARG_OPTIONS = {
  cwd: { type: 'string' },
  'no-browsers': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

export interface InstallCommandDeps {
  install?: InstallFn;
}

export async function runInstallCommand(
  argv: string[],
  deps: InstallCommandDeps = {},
): Promise<number> {
  const { values } = parseArgs({ args: argv, options: INSTALL_ARG_OPTIONS });
  if (values.help) {
    process.stdout.write(INSTALL_USAGE);
    return 0;
  }

  const dir = path.resolve(values.cwd ?? process.cwd());
  const hasPackageJson = existsSync(path.join(dir, 'package.json'));
  const hasPyproject = existsSync(path.join(dir, 'pyproject.toml'));
  const hasCsproj = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.csproj'));
  const hasPomXml = existsSync(path.join(dir, 'pom.xml'));
  const hasBuildGradle =
    existsSync(path.join(dir, 'build.gradle')) || existsSync(path.join(dir, 'build.gradle.kts'));
  const isJava = hasPomXml || hasBuildGradle;
  if (!hasPackageJson && !hasPyproject && !hasCsproj && !isJava) {
    process.stderr.write(
      `eitr install: no package.json, pyproject.toml, .csproj, pom.xml, or build.gradle in ${dir}. Point --cwd at a generated project.\n`,
    );
    return 1;
  }

  const isPython = hasPyproject;
  const isCsharp = hasCsproj;
  const skipBrowsers = Boolean(values['no-browsers']);
  const install: InstallFn =
    deps.install ?? ((projectDir) => runInstall(projectDir, { skipBrowsers }));

  process.stdout.write('Installing dependencies and browsers...\n');
  const outcome = await install(dir);

  if (outcome.installedDeps && (outcome.installedBrowsers || skipBrowsers)) {
    const isWindows = process.platform === 'win32';
    const testCmd = isCsharp
      ? 'dotnet test'
      : isPython
        ? isWindows
          ? '.\\test'
          : './test.sh'
        : isJava
          ? hasPomXml
            ? 'mvn test'
            : 'gradle test'
          : 'npm test';
    process.stdout.write(`\nDone. Run: ${testCmd}\n`);
    return 0;
  }
  const what = outcome.installedDeps ? 'browser install' : 'dependency install';
  const lang = isCsharp ? 'csharp' : isPython ? 'python' : isJava ? 'java' : 'typescript';
  process.stderr.write(
    `\n${what} did not complete${outcome.message ? ` (${outcome.message})` : ''}. Finish with:\n  ${manualInstallHint(values.cwd ?? '.', lang)}\n`,
  );
  return 2;
}
