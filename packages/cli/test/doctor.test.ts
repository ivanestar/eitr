import { describe, it, expect, vi, afterEach } from 'vitest';
import * as cp from 'node:child_process';
import {
  checkNode,
  checkNpm,
  checkGit,
  checkGitHubCli,
  checkGitLabCli,
  runDoctor,
} from '../src/commands/doctor.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('eitr doctor command (Mocked Failure Paths)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('checkNode fails if version is < v18', async () => {
    const originalVersion = process.version;
    Object.defineProperty(process, 'version', { value: 'v16.14.2', configurable: true });

    const res = await checkNode();
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Requires >= v18.0.0');

    Object.defineProperty(process, 'version', { value: originalVersion, configurable: true });
  });

  it('checkNode succeeds if version is >= v18', async () => {
    const originalVersion = process.version;
    Object.defineProperty(process, 'version', { value: 'v20.5.0', configurable: true });

    const res = await checkNode();
    expect(res.ok).toBe(true);

    Object.defineProperty(process, 'version', { value: originalVersion, configurable: true });
  });

  it('checkNpm fails when not in PATH', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await checkNpm();
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Not found');
  });

  it('checkGit warns when not in PATH', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await checkGit();
    expect(res.ok).toBe(true); // Git is optional
    expect(res.warning).toBe(true);
    expect(res.message).toContain('Not found in PATH');
  });

  // Neither hosting CLI is needed to generate anything - they are what /auth-setup uses to push
  // CI secrets on the user's own say-so, so a missing one is a warning that names the manual path
  // rather than an error.
  it('checkGitHubCli warns when not in PATH and names the manual path', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await checkGitHubCli();
    expect(res.ok).toBe(true);
    expect(res.warning).toBe(true);
    expect(res.message).toContain('by hand');
  });

  it('checkGitLabCli warns when not in PATH and names the manual path', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await checkGitLabCli();
    expect(res.ok).toBe(true);
    expect(res.warning).toBe(true);
    expect(res.message).toContain('by hand');
  });

  // A toolchain nothing can generate has no business being reported on: a warning about a missing
  // JDK tells a reader something is wrong with their setup when nothing is.
  it('reports nothing about the frozen stacks', async () => {
    const doctor = await import('../src/commands/doctor.js');
    for (const gone of [
      'checkPython',
      'checkPip',
      'checkDotnet',
      'checkJava',
      'checkMaven',
      'checkGradle',
    ]) {
      expect(doctor, gone).not.toHaveProperty(gone);
    }
  });

  it('runs doctor command cleanly when help flag is passed', async () => {
    const exitCode = await runDoctor(['--help']);
    expect(exitCode).toBe(0);
  });
});
