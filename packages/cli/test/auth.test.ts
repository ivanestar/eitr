import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAuth, resolveTargetUrl } from '../src/commands/auth.js';

// Mock child_process to avoid actual browser launches in unit tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs to avoid real disk writes
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
  },
}));

describe('eitr auth command', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['E2E_API_TOKEN'];
    delete process.env['E2E_BASE_URL'];
    delete process.env['BASE_URL'];
  });

  it('returns 0 and prints usage for --help', async () => {
    const code = await runAuth(['--help']);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: eitr auth');
    expect(output).toContain('--url');
    expect(output).toContain('--mode');
  });

  it('returns 0 and prints usage for -h', async () => {
    const code = await runAuth(['-h']);
    expect(code).toBe(0);
  });

  it('returns 1 when headed mode is used without --url and no auto-detection succeeds', async () => {
    const code = await runAuth(['--mode', 'headed']);
    expect(code).toBe(1);
    const err = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(err).toContain('could not resolve target URL');
  });

  it('auto-resolves URL from E2E_BASE_URL environment variable in headed mode', async () => {
    process.env['E2E_BASE_URL'] = 'https://app.example.com';
    const code = await runAuth(['--mode', 'headed']);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain(
      'Auto-detected target URL from environment variable: https://app.example.com',
    );
  });

  it('auto-resolves URL from .scaffold/init.json when available', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).includes('init.json')) {
        return JSON.stringify({ startUrl: 'https://init.example.com/login' });
      }
      throw new Error('ENOENT');
    });

    const code = await runAuth(['--mode', 'headed']);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain(
      'Auto-detected target URL from .scaffold/init.json: https://init.example.com/login',
    );
  });

  it('auto-resolves URL from playwright.config.ts when available', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).includes('playwright.config.ts')) {
        return `export default defineConfig({ use: { baseURL: 'https://config.example.com' } });`;
      }
      throw new Error('ENOENT');
    });

    const code = await runAuth(['--mode', 'headed']);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain(
      'Auto-detected target URL from playwright.config.ts: https://config.example.com',
    );
  });

  it('returns 1 for unknown --mode value', async () => {
    const code = await runAuth(['--mode', 'magic']);
    expect(code).toBe(1);
    const err = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(err).toContain('unknown mode');
  });

  it('returns 1 in token mode when no token is provided', async () => {
    const code = await runAuth(['--mode', 'token']);
    expect(code).toBe(1);
    const err = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(err).toContain('no token provided');
  });

  it('returns 0 in token mode when E2E_API_TOKEN env var is set', async () => {
    process.env['E2E_API_TOKEN'] = 'test-bearer-token';
    const code = await runAuth(['--mode', 'token']);
    expect(code).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('token-based storage state');
  });

  it('returns 0 in token mode when --token flag is passed directly', async () => {
    const code = await runAuth(['--mode', 'token', '--token', 'my-secret-token']);
    expect(code).toBe(0);
  });

  it('uses default output path .auth/user.json when --output is not specified (token mode)', async () => {
    process.env['E2E_API_TOKEN'] = 'test-token';
    const { promises: fs } = await import('node:fs');
    const writeFileSpy = vi.mocked(fs.writeFile);
    await runAuth(['--mode', 'token']);
    expect(writeFileSpy).toHaveBeenCalled();
    const writtenPath = String(writeFileSpy.mock.calls[0][0]);
    expect(writtenPath).toContain('.auth');
    expect(writtenPath).toContain('user.json');
  });

  it('uses custom --token-header value in output message', async () => {
    process.env['E2E_API_TOKEN'] = 'my-token';
    await runAuth(['--mode', 'token', '--token-header', 'X-Custom-Auth']);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('X-Custom-Auth');
  });

  describe('resolveTargetUrl', () => {
    it('returns CLI argument if valid http/https URL passed', async () => {
      const res = await resolveTargetUrl('/some/dir', 'https://cli.example.com');
      expect(res).toEqual({ url: 'https://cli.example.com/', source: 'CLI argument (--url)' });
    });

    it('rejects invalid or non-http protocols in passedUrl', async () => {
      const res = await resolveTargetUrl('/some/dir', 'ftp://malicious.com');
      expect(res).toBeUndefined();
    });

    it('falls back to environment variable when passedUrl is undefined', async () => {
      process.env['BASE_URL'] = 'https://env.example.com';
      const res = await resolveTargetUrl('/some/dir');
      expect(res).toEqual({ url: 'https://env.example.com/', source: 'environment variable' });
    });
  });
});
