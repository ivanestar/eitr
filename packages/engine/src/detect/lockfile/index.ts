import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  PackageManager,
  Confidence,
  ProfileSource,
  Evidence,
} from '../../types/stack-profile.js';
import { readNpmLock } from './npm.js';

// packageManager is detected by lockfile filename; presence of more than one lockfile is not
// disambiguated further in Slice 1 (npm > pnpm > yarn priority is arbitrary but deterministic).
export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(resolve(cwd, 'package-lock.json'))) return 'npm';
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
  return 'unknown';
}

export interface ResolvedVersion {
  value: string;
  confidence: Confidence;
  source: ProfileSource;
  evidence: Evidence[];
}

// npm -> readNpmLock (degrade on miss, e.g. lockfileVersion 1); pnpm/yarn/unknown -> degrade
// straight to the package.json range. No external lockfile parser in Slice 1 (per plan D-note:
// pnpm-lock.yaml/yarn.lock are never parsed — their mere presence only decides packageManager).
export function resolveVersion(
  pm: PackageManager,
  cwd: string,
  pkgName: string,
  fallbackRange: string,
): ResolvedVersion {
  if (pm === 'npm') {
    const version = readNpmLock(cwd, pkgName);
    if (version !== undefined) {
      return {
        value: version,
        confidence: 'high',
        source: 'lockfile',
        evidence: [
          {
            file: 'package-lock.json',
            matchedPattern: `packages["node_modules/${pkgName}"].version`,
          },
        ],
      };
    }
  }
  return {
    value: fallbackRange,
    confidence: 'medium',
    source: 'package.json',
    evidence: [{ file: 'package.json', matchedPattern: pkgName }],
  };
}
