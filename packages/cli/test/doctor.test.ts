import { describe, it, expect, vi, afterEach } from 'vitest';
import * as cp from 'node:child_process';
import {
  checkNode,
  checkNpm,
  checkGit,
  checkPython,
  checkPip,
  checkDotnet,
  checkJava,
  checkMaven,
  checkGradle,
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

  it('checkPython warns when not in PATH', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await checkPython();
    expect(res.warning).toBe(true);
  });

  it('checkJava warns when not in PATH', async () => {
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await checkJava();
    expect(res.warning).toBe(true);
  });

  it('runs doctor command cleanly when help flag is passed', async () => {
    const exitCode = await runDoctor(['--help']);
    expect(exitCode).toBe(0);
  });
});
