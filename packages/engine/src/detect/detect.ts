import type { StackProfile, UiLibrary, Field, PackageManager } from '../types/stack-profile.js';
import { readPackageJson, detectPresence, type PackageJson } from './package-json.js';
import { detectPackageManager, resolveVersion } from './lockfile/index.js';
import { applyManual, loadProfileFile } from './manual.js';
import { baselineStackProfile } from './baseline.js';

// NO prompt flags — detect() is non-interactive; the CLI owns confirmation.
export interface DetectOptions {
  cwd: string;
  profilePath?: string;
  manual?: Record<string, string>;
}

// packageManager: lockfile filename is authoritative; the package.json "packageManager" field
// is only a tiebreak when no lockfile is present.
function resolvePackageManager(pm: PackageManager, pkg: PackageJson): Field<PackageManager> {
  if (pm !== 'unknown') {
    const lockFileName =
      pm === 'npm' ? 'package-lock.json' : pm === 'pnpm' ? 'pnpm-lock.yaml' : 'yarn.lock';
    return {
      value: pm,
      confidence: 'high',
      source: 'lockfile',
      evidence: [{ file: lockFileName, matchedPattern: lockFileName }],
    };
  }
  const tiebreak = pkg.packageManager?.split('@')[0];
  if (tiebreak === 'npm' || tiebreak === 'pnpm' || tiebreak === 'yarn') {
    return {
      value: tiebreak,
      confidence: 'medium',
      source: 'package.json',
      evidence: [{ file: 'package.json', matchedPattern: 'packageManager' }],
    };
  }
  return { value: 'unknown', confidence: 'high', source: 'default', evidence: [] };
}

// IO: reads target files; NO stdin, NO network, NO LLM, NO '@playwright/test' import.
export async function detect(opts: DetectOptions): Promise<StackProfile> {
  const pkg = readPackageJson(opts.cwd);
  if (pkg === undefined) {
    return baselineStackProfile(opts.cwd);
  }
  const presence = detectPresence(pkg);
  const pm = detectPackageManager(opts.cwd);

  const uiLibraries: UiLibrary[] = [];
  if (presence.mui) {
    const resolved = resolveVersion(pm, opts.cwd, '@mui/material', presence.muiRange ?? '');
    uiLibraries.push({
      id: 'mui',
      version: resolved.value,
      dependencyKind: 'direct',
      confidence: resolved.confidence,
      source: resolved.source,
      evidence: resolved.evidence,
    });
  }
  if (presence.antd) {
    const resolved = resolveVersion(pm, opts.cwd, 'antd', presence.antdRange ?? '');
    uiLibraries.push({
      id: 'antd',
      version: resolved.value,
      dependencyKind: 'direct',
      confidence: resolved.confidence,
      source: resolved.source,
      evidence: resolved.evidence,
    });
  }
  if (presence.radix && presence.radixDepName) {
    const resolved = resolveVersion(pm, opts.cwd, presence.radixDepName, presence.radixRange ?? '');
    uiLibraries.push({
      id: 'radix',
      version: resolved.value,
      dependencyKind: 'direct',
      confidence: resolved.confidence,
      source: resolved.source,
      evidence: resolved.evidence,
    });
  }
  if (presence.chakra && presence.chakraDepName) {
    const resolved = resolveVersion(
      pm,
      opts.cwd,
      presence.chakraDepName,
      presence.chakraRange ?? '',
    );
    uiLibraries.push({
      id: 'chakra',
      version: resolved.value,
      dependencyKind: 'direct',
      confidence: resolved.confidence,
      source: resolved.source,
      evidence: resolved.evidence,
    });
  }
  if (presence.tailwind) {
    const resolved = resolveVersion(pm, opts.cwd, 'tailwindcss', presence.tailwindRange ?? '');
    uiLibraries.push({
      id: 'tailwind',
      version: resolved.value,
      dependencyKind: 'direct',
      confidence: resolved.confidence,
      source: resolved.source,
      evidence: resolved.evidence,
    });
  }

  const profile: StackProfile = {
    schemaVersion: 1,
    framework: presence.framework
      ? {
          value: presence.framework,
          confidence: 'high',
          source: 'package.json',
          evidence: [{ file: 'package.json', matchedPattern: presence.framework }],
        }
      : { value: 'unknown', confidence: 'low', source: 'default', evidence: [] },
    uiLibraries,
    packageManager: resolvePackageManager(pm, pkg),
    playwrightVersion: presence.playwright
      ? {
          value: presence.playwrightRange ?? '',
          confidence: 'high',
          source: 'package.json',
          evidence: [{ file: 'package.json', matchedPattern: '@playwright/test' }],
        }
      : { value: '', confidence: 'low', source: 'default', evidence: [] },
    moduleSystem: {
      value: presence.moduleSystem,
      confidence: 'high',
      source: presence.moduleSystemDetected ? 'package.json' : 'default',
      evidence: presence.moduleSystemDetected
        ? [{ file: 'package.json', matchedPattern: 'type' }]
        : [],
    },
    // default 'data-testid' -> source 'default', evidence []
    testIdAttribute: { value: 'data-testid', confidence: 'high', source: 'default', evidence: [] },
    // 'testid-first' iff any @testing-library/* present -> source 'package.json', confidence
    // 'high', evidence naming the dep; else 'role-first' -> source 'default', evidence []
    selectorStrategy: presence.testingLibraryDep
      ? {
          value: 'testid-first',
          confidence: 'high',
          source: 'package.json',
          evidence: [{ file: 'package.json', matchedPattern: presence.testingLibraryDep }],
        }
      : { value: 'role-first', confidence: 'high', source: 'default', evidence: [] },
    target: { kind: 'single', root: opts.cwd },
  };

  let result = profile;
  if (opts.profilePath) {
    result = applyManual(result, loadProfileFile(opts.profilePath), opts.profilePath);
  }
  if (opts.manual) {
    result = applyManual(result, opts.manual);
  }
  return result;
}
