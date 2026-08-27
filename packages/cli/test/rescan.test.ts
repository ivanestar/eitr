import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { parseRescanOptions, runRescan } from '../src/commands/rescan.js';

describe('eitr rescan & recon CLI command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), '.tmp-rescan-test-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('parses CLI arguments correctly with default verify=true', async () => {
    const opts = await parseRescanOptions(['--page', 'login', '--url', 'https://example.com']);
    expect(opts).not.toBeNull();
    expect(opts?.page).toBe('login');
    expect(opts?.url).toBe('https://example.com');
    expect(opts?.verify).toBe(true);
  });

  it('handles --no-verify flag correctly', async () => {
    const opts = await parseRescanOptions(['--page', 'dashboard', '--no-verify']);
    expect(opts).not.toBeNull();
    expect(opts?.page).toBe('dashboard');
    expect(opts?.verify).toBe(false);
  });

  it('returns null and prints help on -h / --help', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const opts = await parseRescanOptions(['--help']);
    expect(opts).toBeNull();
    expect(stdoutSpy).toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('executes rescan gracefully when no Page Objects are found', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runRescan(['--cwd', tempDir, '--no-verify']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('detects and preserves existing Page Objects during rescan', async () => {
    const pagesDir = path.join(tempDir, 'components/pages');
    await fs.mkdir(pagesDir, { recursive: true });
    await fs.writeFile(
      path.join(pagesDir, 'login.page.ts'),
      `import { BasePage } from '../base/base-page.js';\nexport class LoginPage extends BasePage { readonly path = '/login'; }`,
      'utf8',
    );

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runRescan(['--cwd', tempDir, '--no-verify']);
    expect(code).toBe(0);
    stdoutSpy.mockRestore();
  });
});
