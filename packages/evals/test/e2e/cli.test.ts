import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEST_COMBINATIONS, verifyFullCoverage } from '../../src/pairwise.js';
import { startServer, stopServer, type ServerInstance } from './server.js';
import { toProjectName } from '../../../cli/src/commands/generate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

let testServer: ServerInstance;
const createdSandboxDirs: string[] = [];

function scanDirectoryForEitr(dir: string): string[] {
  const foundIn: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryName = String(entry.name);
      const fullPath = join(dir, entryName);

      if (entry.isDirectory()) {
        if (
          [
            'node_modules',
            '.git',
            'dist',
            'bin',
            'obj',
            '.eitr',
            '.gradle',
            '.venv',
            'target',
            'build',
            '.pytest_cache',
            '__pycache__',
          ].includes(entryName)
        ) {
          continue;
        }
        foundIn.push(...scanDirectoryForEitr(fullPath));
      } else if (entry.isFile()) {
        const ext = extname(entryName).toLowerCase();
        if (
          [
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.ico',
            '.jar',
            '.dll',
            '.exe',
            '.pyc',
            '.zip',
          ].includes(ext)
        ) {
          continue;
        }
        try {
          const rawContent = readFileSync(fullPath, 'utf8');
          // Ignore internal framework config filenames (eitr.config.*) and internal folder references (.eitr / .eitr-tmp)
          const content = rawContent
            .replace(/\.?eitr[\./_-](config|json|tmp|manifest)?/gi, '')
            .replace(/\.eitr\/?/gi, '');

          // Check for word boundary "eitr" (case-insensitive)
          if (/\beitr\b/i.test(content)) {
            foundIn.push(fullPath);
          }
        } catch {
          // Skip binary or unreadable files
        }
      }
    }
  } catch {
    return foundIn;
  }

  return foundIn;
}

beforeAll(async () => {
  testServer = await startServer();
});

afterAll(async () => {
  if (testServer) {
    await stopServer(testServer.server);
  }
});

afterEach(() => {
  for (const dir of createdSandboxDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors for OS locked files
    }
  }
});

describe('E2E Pair-Wise CLI Testing Suite', () => {
  it('guarantees 100% pairwise option coverage across schema.ts', () => {
    const coverage = verifyFullCoverage();
    expect(coverage.ok, `Missing coverage for options: ${coverage.missing.join(', ')}`).toBe(true);
  });

  const cliBin = resolve(__dirname, '../../../cli/dist/index.js');

  for (const combo of TEST_COMBINATIONS) {
    it(
      `E2E Combination [${combo.id}]: ${combo.language} + ${combo.automationTool} (${combo.framework} / ${combo.uiLibrary} / ${combo.ciCd})`,
      async () => {
        const hash = Math.random().toString(36).substring(2, 8);
        const sandboxDir = resolve(__dirname, 'sandbox', `run-${hash}-${combo.id}`);
        createdSandboxDirs.push(sandboxDir);

        const cliResult = spawnSync(
          process.execPath,
          [
            cliBin,
            'new',
            '--start-url',
            testServer.url,
            '--language',
            combo.language,
            '--automation-tool',
            combo.automationTool,
            '--framework',
            combo.framework,
            '--ui-library',
            combo.uiLibrary,
            '--ci-cd',
            combo.ciCd,
            '--yes',
            '--cwd',
            sandboxDir,
            '--output-dir',
            '.',
          ],
          {
            encoding: 'utf8',
            env: process.env,
          },
        );

        // Cypress is withheld from release pending a native CPOM redesign (see the SUPPORTED
        // matrix comment in packages/cli/src/commands/generate.ts) - the withhold gate rejects
        // it with exit code 1 and generates nothing, same as e2e.full-cycle.test.ts asserts.
        if (combo.automationTool === 'cypress') {
          expect(cliResult.status).toBe(1);
          expect(cliResult.stderr).toContain('not one of the available choices');
          expect(existsSync(join(sandboxDir, 'package.json'))).toBe(false);
          return;
        }

        expect(
          cliResult.status,
          `CLI execution failed (exit code ${cliResult.status}).\nSTDOUT: ${cliResult.stdout}\nSTDERR: ${cliResult.stderr}`,
        ).toBe(0);

        // 1. Static verification of scaffolded files per stack
        if (combo.language === 'python') {
          expect(existsSync(join(sandboxDir, 'pyproject.toml'))).toBe(true);
          expect(existsSync(join(sandboxDir, 'conftest.py'))).toBe(true);
        } else if (combo.language === 'csharp') {
          // The generator derives the project name via toProjectName() - PascalCase for csharp
          // (see the 0.5.1 CHANGELOG entry) - not the raw sandbox directory basename.
          const csprojName = `${toProjectName(sandboxDir, 'csharp')}.csproj`;
          expect(existsSync(join(sandboxDir, csprojName))).toBe(true);
        } else if (combo.language === 'java') {
          if (combo.automationTool.includes('gradle')) {
            expect(existsSync(join(sandboxDir, 'build.gradle'))).toBe(true);
          } else {
            expect(existsSync(join(sandboxDir, 'pom.xml'))).toBe(true);
          }
        } else {
          expect(existsSync(join(sandboxDir, 'package.json'))).toBe(true);
        }

        // 2. Zero Lock-in Verification: Assert EITR is NOT mentioned anywhere in generated code
        const eitrViolations = scanDirectoryForEitr(sandboxDir);
        expect(
          eitrViolations,
          `EITR references found in scaffolded files:\n${eitrViolations.join('\n')}`,
        ).toEqual([]);

        // 3. Dynamic execution / dry-run check where applicable
        if (combo.language === 'python') {
          // `eitr new`'s auto-install (runInstall in packages/cli/src/commands/install.ts)
          // creates a project-local .venv and installs pytest/pytest-playwright into it -
          // dependencies never land in the system python, so verification must go through the
          // same .venv, not a bare `python` from PATH (which has no reason to have pytest).
          const isWindows = process.platform === 'win32';
          const venvPython = join(
            sandboxDir,
            '.venv',
            isWindows ? 'Scripts' : 'bin',
            isWindows ? 'python.exe' : 'python',
          );
          expect(
            existsSync(venvPython),
            `Expected eitr new's auto-install to create a .venv at ${venvPython}`,
          ).toBe(true);
          const output = execSync(`"${venvPython}" -m pytest --collect-only`, {
            cwd: sandboxDir,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          expect(output).toContain('collected');
        } else if (combo.language === 'csharp') {
          execSync('dotnet build', { cwd: sandboxDir, stdio: 'ignore' });
        } else if (combo.language === 'java') {
          if (combo.automationTool.includes('gradle')) {
            execSync('gradle classes', { cwd: sandboxDir, stdio: 'ignore' });
          } else {
            execSync('mvn compile', { cwd: sandboxDir, stdio: 'ignore' });
          }
        } else if (combo.language === 'typescript') {
          execSync('npx tsc --noEmit', { cwd: sandboxDir, stdio: 'ignore' });
        }

        if (
          combo.automationTool === 'playwright' &&
          (combo.language === 'typescript' || combo.language === 'javascript')
        ) {
          const configFile =
            combo.language === 'typescript' ? 'playwright.config.ts' : 'playwright.config.js';
          expect(existsSync(join(sandboxDir, configFile))).toBe(true);
        } else if (combo.automationTool === 'cypress') {
          const configFile =
            combo.language === 'typescript' ? 'cypress.config.ts' : 'cypress.config.js';
          expect(existsSync(join(sandboxDir, configFile))).toBe(true);
        }
      },
      { timeout: 60000 },
    );
  }
});
