import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runGenerate } from '../src/commands/generate.js';

const tmpDirs: string[] = [];
function makeTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-escape-'));
  tmpDirs.push(dir);
  return dir;
}
function writeInit(cwd: string, answers: object): void {
  mkdirSync(join(cwd, '.scaffold'), { recursive: true });
  writeFileSync(join(cwd, '.scaffold/init.json'), JSON.stringify(answers));
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
  tmpDirs.length = 0;
});

describe('eitr generate — escape safety', () => {
  it('refuses to write outside the project workspace root', async () => {
    const cwd = makeTempCwd();
    // Try to escape using a relative path that goes outside the cwd workspace directory
    writeInit(cwd, {
      schemaVersion: 1,
      startUrl: 'https://app.example.com/',
      outputDir: '../escaped-folder-path',
    });

    const code = await runGenerate(['--cwd', cwd, '--no-install']);
    expect(code).toBe(1);

    // Verify the escaped directory was not created or written into
    const escapedPath = resolve(cwd, '../escaped-folder-path');
    expect(existsSync(escapedPath)).toBe(false);
  });
});
