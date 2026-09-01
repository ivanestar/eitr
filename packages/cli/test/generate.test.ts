import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../src/commands/generate.js';
import type { InstallOutcome } from '../src/commands/install.js';

const tmpDirs: string[] = [];
function makeTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-gen-'));
  tmpDirs.push(dir);
  return dir;
}
function writeInit(cwd: string, answers: object): void {
  mkdirSync(join(cwd, '.scaffold'), { recursive: true });
  writeFileSync(
    join(cwd, '.scaffold', 'init.json'),
    `${JSON.stringify(answers, null, 2)}\n`,
    'utf8',
  );
}
const fakeInstall =
  (outcome: InstallOutcome, calls?: string[]) =>
  async (dir: string): Promise<InstallOutcome> => {
    calls?.push(dir);
    return outcome;
  };

afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('eitr generate — emission (--no-install)', () => {
  it('writes a complete runnable project at the output root and leaves init.json (hints) intact', async () => {
    const cwd = makeTempCwd();
    writeInit(cwd, {
      schemaVersion: 1,
      startUrl: 'https://app.example.com/',
      outputDir: '.',
      stackHints: { framework: 'vue', uiLibrary: 'antd' },
    });

    expect(await runGenerate(['--cwd', cwd, '--no-install'])).toBe(0);

    // complete project at cwd root (no framework prefix), asset resolution crosses the engine boundary
    expect(existsSync(join(cwd, 'components/base/component.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'package.json'))).toBe(true);
    expect(existsSync(join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(cwd, 'tests/smoke.spec.ts'))).toBe(true);

    const pw = readFileSync(join(cwd, 'playwright.config.ts'), 'utf8');
    expect(pw).toContain('https://app.example.com/');

    const manifest = JSON.parse(readFileSync(join(cwd, '.scaffold/manifest.json'), 'utf8'));
    expect(manifest.pendingRecon).toBeUndefined();
    expect(manifest.profile.framework.value).toBe('vue');
    expect(manifest.profile.framework.confidence).toBe('high');

    const initAfter = JSON.parse(readFileSync(join(cwd, '.scaffold/init.json'), 'utf8'));
    expect(initAfter.stackHints).toEqual({ framework: 'vue', uiLibrary: 'antd' });
  });

  it('honors a nested outputDir: project lands directly at it (no PlaywrightTests suffix)', async () => {
    const cwd = makeTempCwd();
    writeInit(cwd, { schemaVersion: 1, startUrl: 'https://x.io/', outputDir: 'e2e' });
    expect(await runGenerate(['--cwd', cwd, '--no-install'])).toBe(0);
    expect(existsSync(join(cwd, 'e2e/package.json'))).toBe(true);
    expect(existsSync(join(cwd, 'e2e/.scaffold/manifest.json'))).toBe(true);
    expect(existsSync(join(cwd, 'e2e/PlaywrightTests'))).toBe(false);
    expect(existsSync(join(cwd, '.scaffold/init.json'))).toBe(true); // init.json stays at project root
  });

  it('errors clearly when init.json is missing / bad schema / bad url', async () => {
    const missing = makeTempCwd();
    expect(await runGenerate(['--cwd', missing, '--no-install'])).toBe(1);

    const badSchema = makeTempCwd();
    writeInit(badSchema, { schemaVersion: 2, startUrl: 'https://x.io/', outputDir: '.' });
    expect(await runGenerate(['--cwd', badSchema, '--no-install'])).toBe(1);

    const badUrl = makeTempCwd();
    writeInit(badUrl, { schemaVersion: 1, startUrl: 'ftp://nope', outputDir: '.' });
    expect(await runGenerate(['--cwd', badUrl, '--no-install'])).toBe(1);
  });

  it('errors when unsupported language or automation tool is configured', async () => {
    const badLang = makeTempCwd();
    writeInit(badLang, {
      schemaVersion: 1,
      startUrl: 'https://x.io/',
      outputDir: '.',
      stackHints: { language: 'python', automationTool: 'cypress' },
    });
    expect(await runGenerate(['--cwd', badLang, '--no-install'])).toBe(1);

    const badTool = makeTempCwd();
    writeInit(badTool, {
      schemaVersion: 1,
      startUrl: 'https://x.io/',
      outputDir: '.',
      stackHints: { language: 'typescript', automationTool: 'selenium' },
    });
    expect(await runGenerate(['--cwd', badTool, '--no-install'])).toBe(1);
  });
});

describe('eitr generate — install orchestration (injected)', () => {
  it('full install -> exit 0, install called with the output root', async () => {
    const cwd = makeTempCwd();
    writeInit(cwd, { schemaVersion: 1, startUrl: 'https://x.io/', outputDir: '.' });
    const calls: string[] = [];
    const code = await runGenerate(['--cwd', cwd], {
      install: fakeInstall({ installedDeps: true, installedBrowsers: true }, calls),
    });
    expect(code).toBe(0);
    expect(calls).toEqual([cwd]);
  });

  it('browsers blocked -> exit 2 (files valid, fallback commands printed)', async () => {
    const cwd = makeTempCwd();
    writeInit(cwd, { schemaVersion: 1, startUrl: 'https://x.io/', outputDir: '.' });
    const code = await runGenerate(['--cwd', cwd], {
      install: fakeInstall({
        installedDeps: true,
        installedBrowsers: false,
        message: 'antivirus blocked',
      }),
    });
    expect(code).toBe(2);
    expect(existsSync(join(cwd, 'package.json'))).toBe(true); // emission still succeeded
  });

  it('--no-install never calls install and exits 0', async () => {
    const cwd = makeTempCwd();
    writeInit(cwd, { schemaVersion: 1, startUrl: 'https://x.io/', outputDir: '.' });
    const calls: string[] = [];
    const code = await runGenerate(['--cwd', cwd, '--no-install'], {
      install: fakeInstall({ installedDeps: true, installedBrowsers: true }, calls),
    });
    expect(code).toBe(0);
    expect(calls).toEqual([]);
  });
});
