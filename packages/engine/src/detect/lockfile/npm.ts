import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface NpmLockPackageEntry {
  version?: string;
}

interface NpmLockFile {
  lockfileVersion?: number;
  // npm lockfileVersion 2/3 shape: keyed by install path, e.g. 'node_modules/@mui/material'.
  // lockfileVersion 1 has no 'packages' key at all (it uses 'dependencies' instead) — its
  // absence is exactly the signal this reader uses to hand the caller a degrade.
  packages?: Record<string, NpmLockPackageEntry>;
}

// Parses package-lock.json as plain JSON; prefers packages['node_modules/<pkg>'].version.
// Returns undefined (never throws) whenever the lock can't answer confidently, so the
// caller (resolveVersion) degrades to the package.json range: missing file, unparseable
// JSON, absent 'packages' (lockfileVersion 1), or no entry for the requested package.
export function readNpmLock(cwd: string, pkgName: string): string | undefined {
  const path = resolve(cwd, 'package-lock.json');
  if (!existsSync(path)) return undefined;

  let data: NpmLockFile;
  try {
    data = JSON.parse(readFileSync(path, 'utf8')) as NpmLockFile;
  } catch {
    return undefined;
  }

  if (!data.packages) return undefined;
  return data.packages[`node_modules/${pkgName}`]?.version;
}
