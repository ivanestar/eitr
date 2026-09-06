import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeEveningTimestamp,
  normalizeTag,
  validatePreconditions,
  executeTagRelease,
} from '../../../scripts/tag-release.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scriptPath = path.resolve(repoRoot, 'scripts/tag-release.mjs');

function runScript(args: string[]) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: res.status,
    stdout: (res.stdout || '').replace(/\r\n/g, '\n'),
    stderr: (res.stderr || '').replace(/\r\n/g, '\n'),
  };
}

describe('tag-release helper functions', () => {
  it('normalizes version strings to v-prefixed tag names', () => {
    expect(normalizeTag('0.33.0')).toBe('v0.33.0');
    expect(normalizeTag('v0.33.0')).toBe('v0.33.0');
    expect(normalizeTag('1.0.0-rc.1')).toBe('v1.0.0-rc.1');
  });

  it('rejects invalid or empty tag inputs', () => {
    expect(() => normalizeTag('')).toThrow('Tag or version cannot be empty');
    expect(() => normalizeTag(null as any)).toThrow('Tag or version string is required');
  });

  it('computes valid evening OpSec timestamp with 23:00', () => {
    const ts = computeEveningTimestamp(new Date('2026-09-05T12:00:00Z'));
    expect(ts).toContain('23:00:00');
  });

  it('validates branch requirement when not on main', () => {
    expect(() =>
      validatePreconditions({
        targetTag: 'v99.99.99',
        cwd: repoRoot,
        allowDirty: true,
        allowBranch: false,
        currentBranch: 'feature/not-main',
      }),
    ).toThrow("Release tags must be created on 'main' branch");
  });

  it('does not throw the branch error when actually on main', () => {
    expect(() =>
      validatePreconditions({
        targetTag: 'v99.99.99',
        cwd: repoRoot,
        allowDirty: true,
        allowBranch: false,
        currentBranch: 'main',
      }),
    ).not.toThrow();
  });

  it('allows simulation via dryRun', () => {
    const res = executeTagRelease({
      targetTag: 'v99.99.99',
      push: false,
      dryRun: true,
      cwd: repoRoot,
    });
    expect(res.dryRun).toBe(true);
    expect(res.targetTag).toBe('v99.99.99');
    expect(res.eveningDate).toContain('23:00:00');
  });
});

describe('tag-release CLI execution', () => {
  // A version string that will never collide with a real, already-published release tag -
  // v0.33.0 was used here previously and broke the moment that version actually shipped, since
  // validatePreconditions' remote-tag-exists check runs unconditionally regardless of
  // --allow-branch/--allow-dirty.
  const DRY_RUN_TAG = 'v99.99.98';

  it('supports dry-run via CLI with allow-branch and allow-dirty flags', () => {
    const { status, stdout } = runScript([
      DRY_RUN_TAG,
      '--dry-run',
      '--allow-branch',
      '--allow-dirty',
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain(`[tag-release] Target tag: ${DRY_RUN_TAG}`);
    expect(stdout).toContain('[tag-release] [DRY RUN]');
    expect(stdout).toContain('23:00:00');
  });

  it('fails safely if invoked on non-main branch without allow-branch', () => {
    const actualBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim();
    // This CLI path has no way to inject a fake branch the way the unit-level
    // validatePreconditions tests above do - it genuinely reads real git state. The Nightly
    // workflow checks out 'main' directly, which makes this test's own premise ("we are NOT on
    // main") false in that one environment; every other context (local dev, PR branches) is
    // unaffected.
    if (actualBranch === 'main') {
      return;
    }
    const { status, stderr } = runScript([DRY_RUN_TAG, '--dry-run', '--allow-dirty']);
    expect(status).toBe(1);
    expect(stderr).toContain("Release tags must be created on 'main' branch");
  });
});
