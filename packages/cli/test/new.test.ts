import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNew } from '../src/commands/new.js';
import type { InstallOutcome } from '../src/commands/install.js';

const tmpDirs: string[] = [];
function makeTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-new-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('eitr new (one command: questionnaire -> generate -> install)', () => {
  it('collects answers AND writes the project in one call (default folder PlaywrightTests, --no-install)', async () => {
    const cwd = makeTempCwd();
    const code = await runNew([
      '--yes',
      '--start-url',
      'app.example.com',
      '--framework',
      'react',
      '--ui-library',
      'mui',
      '--cwd',
      cwd,
      '--no-install',
    ]);
    expect(code).toBe(0);

    // init.json at project root
    const init = JSON.parse(readFileSync(join(cwd, '.eitr/init.json'), 'utf8'));
    expect(init.startUrl).toBe('https://app.example.com/');
    expect(init.outputDir).toBe('PlaywrightTests');
    expect(init.stackHints).toEqual({
      language: 'typescript',
      automationTool: 'playwright',
      framework: 'react',
      uiLibrary: 'mui',
    });

    // the project landed under the default folder
    const proj = join(cwd, 'PlaywrightTests');
    expect(existsSync(join(proj, 'components/base/component.ts'))).toBe(true);
    expect(existsSync(join(proj, 'package.json'))).toBe(true);
    expect(existsSync(join(proj, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(proj, 'shared/utils/react.ts'))).toBe(true);
  });

  it('forwards the injected install to generate (called with the project dir)', async () => {
    const cwd = makeTempCwd();
    const calls: string[] = [];
    const install = async (dir: string): Promise<InstallOutcome> => {
      calls.push(dir);
      return { installedDeps: true, installedBrowsers: true };
    };
    const code = await runNew(['--yes', '--start-url', 'x.io', '--cwd', cwd], { install });
    expect(code).toBe(0);
    expect(calls).toEqual([join(cwd, 'PlaywrightTests')]);
  });

  it('stops before generating when a required flag is missing', async () => {
    const cwd = makeTempCwd();
    const code = await runNew(['--yes', '--cwd', cwd]);
    expect(code).toBe(1);
    expect(existsSync(join(cwd, '.eitr/init.json'))).toBe(false);
  });
});
