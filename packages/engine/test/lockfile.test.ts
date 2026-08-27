import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readNpmLock } from '../src/detect/lockfile/npm.js';
import { detectPackageManager, resolveVersion } from '../src/detect/lockfile/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(__dirname, 'fixtures', name);

describe('readNpmLock', () => {
  it('resolves the exact version from packages[node_modules/<pkg>].version', () => {
    expect(readNpmLock(fixture('detect-npm-lock'), '@mui/material')).toBe('5.15.14');
  });

  it('returns undefined when the lockfile has no "packages" key (lockfileVersion 1)', () => {
    expect(readNpmLock(fixture('detect-lockfile-v1'), '@mui/material')).toBeUndefined();
  });

  it('returns undefined when the requested package has no entry', () => {
    expect(readNpmLock(fixture('detect-npm-lock'), '@mui/icons-material')).toBeUndefined();
  });

  it('returns undefined when the lockfile is absent', () => {
    expect(readNpmLock(fixture('detect-missing-lock'), '@mui/material')).toBeUndefined();
  });
});

describe('detectPackageManager', () => {
  it('detects npm from package-lock.json', () => {
    expect(detectPackageManager(fixture('detect-npm-lock'))).toBe('npm');
  });
  it('detects pnpm from pnpm-lock.yaml', () => {
    expect(detectPackageManager(fixture('detect-pnpm'))).toBe('pnpm');
  });
  it('detects yarn from yarn.lock', () => {
    expect(detectPackageManager(fixture('detect-yarn'))).toBe('yarn');
  });
  it('returns unknown when no lockfile is present', () => {
    expect(detectPackageManager(fixture('detect-missing-lock'))).toBe('unknown');
  });
});

describe('resolveVersion', () => {
  it('npm + lockfile hit -> high/lockfile', () => {
    const resolved = resolveVersion('npm', fixture('detect-npm-lock'), '@mui/material', '^5.14.0');
    expect(resolved).toEqual({
      value: '5.15.14',
      confidence: 'high',
      source: 'lockfile',
      evidence: [
        {
          file: 'package-lock.json',
          matchedPattern: 'packages["node_modules/@mui/material"].version',
        },
      ],
    });
  });

  it('npm + lockfile miss -> degrades to medium/package.json', () => {
    const resolved = resolveVersion(
      'npm',
      fixture('detect-lockfile-v1'),
      '@mui/material',
      '^5.14.0',
    );
    expect(resolved.value).toBe('^5.14.0');
    expect(resolved.confidence).toBe('medium');
    expect(resolved.source).toBe('package.json');
  });

  it('pnpm/yarn/unknown always degrade to medium/package.json (no external lockfile parser)', () => {
    for (const pm of ['pnpm', 'yarn', 'unknown'] as const) {
      const resolved = resolveVersion(pm, fixture('detect-npm-lock'), '@mui/material', '^5.14.0');
      expect(resolved.confidence).toBe('medium');
      expect(resolved.source).toBe('package.json');
    }
  });
});
