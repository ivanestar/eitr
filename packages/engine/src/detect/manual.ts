import { readFileSync } from 'node:fs';
import type {
  StackProfile,
  UiLibrary,
  Field,
  PackageManager,
  ModuleSystem,
  SelectorStrategy,
} from '../types/stack-profile.js';

// The fixed --manual key vocabulary (D-note). Unknown keys throw — both from a raw --manual
// flag and from a --profile file, since loadProfileFile's output is applied through the same
// applyManual() gate.
const MANUAL_KEYS = new Set([
  'framework',
  'mui.version',
  'playwrightVersion',
  'packageManager',
  'moduleSystem',
  'testIdAttribute',
  'selectorStrategy',
]);

const PACKAGE_MANAGERS: readonly PackageManager[] = ['npm', 'pnpm', 'yarn', 'unknown'];
const MODULE_SYSTEMS: readonly ModuleSystem[] = ['ESM', 'CJS'];
const SELECTOR_STRATEGIES: readonly SelectorStrategy[] = ['role-first', 'testid-first'];

function manualField<T>(value: T, evidenceFile: string, key: string): Field<T> {
  return {
    value,
    confidence: 'high',
    source: 'manual',
    evidence: [{ file: evidenceFile, matchedPattern: key }],
  };
}

function applyManualKey(
  profile: StackProfile,
  key: string,
  value: string,
  evidenceFile: string,
): StackProfile {
  switch (key) {
    case 'framework': {
      const allowed = ['react', 'vue', 'angular', 'svelte', 'unknown'];
      if (!allowed.includes(value)) {
        throw new Error(`--manual framework must be one of ${allowed.join('|')}, got "${value}"`);
      }
      return { ...profile, framework: manualField(value as any, evidenceFile, key) };
    }
    case 'mui.version': {
      const existingIndex = profile.uiLibraries.findIndex((u) => u.id === 'mui');
      const entry: UiLibrary = {
        id: 'mui',
        version: value,
        dependencyKind: 'direct',
        confidence: 'high',
        source: 'manual',
        evidence: [{ file: evidenceFile, matchedPattern: key }],
      };
      const uiLibraries =
        existingIndex === -1
          ? [...profile.uiLibraries, entry]
          : profile.uiLibraries.map((u, i) => (i === existingIndex ? entry : u));
      return { ...profile, uiLibraries };
    }
    case 'playwrightVersion':
      return { ...profile, playwrightVersion: manualField(value, evidenceFile, key) };
    case 'packageManager': {
      if (!PACKAGE_MANAGERS.includes(value as PackageManager)) {
        throw new Error(
          `--manual packageManager must be one of ${PACKAGE_MANAGERS.join('|')}, got "${value}"`,
        );
      }
      return {
        ...profile,
        packageManager: manualField(value as PackageManager, evidenceFile, key),
      };
    }
    case 'moduleSystem': {
      if (!MODULE_SYSTEMS.includes(value as ModuleSystem)) {
        throw new Error(
          `--manual moduleSystem must be one of ${MODULE_SYSTEMS.join('|')}, got "${value}"`,
        );
      }
      return { ...profile, moduleSystem: manualField(value as ModuleSystem, evidenceFile, key) };
    }
    case 'testIdAttribute':
      return { ...profile, testIdAttribute: manualField(value, evidenceFile, key) };
    case 'selectorStrategy': {
      if (!SELECTOR_STRATEGIES.includes(value as SelectorStrategy)) {
        throw new Error(
          `--manual selectorStrategy must be one of ${SELECTOR_STRATEGIES.join('|')}, got "${value}"`,
        );
      }
      return {
        ...profile,
        selectorStrategy: manualField(value as SelectorStrategy, evidenceFile, key),
      };
    }
    /* c8 ignore next 2 -- unreachable: every key reaching here already passed the MANUAL_KEYS guard */
    default:
      throw new Error(`unknown --manual key: "${key}"`);
  }
}

// Applies the fixed --manual key vocabulary (and, via the same gate, a --profile file's
// key/value overrides) onto a detected StackProfile. Every touched field gets source:'manual',
// confidence:'high', and non-empty evidence naming the originating file (default '--manual',
// or the --profile path when called from loadProfileFile's caller). Unknown keys throw.
export function applyManual(
  profile: StackProfile,
  manual: Record<string, string>,
  evidenceFile = '--manual',
): StackProfile {
  let next = profile;
  for (const [key, value] of Object.entries(manual)) {
    if (!MANUAL_KEYS.has(key)) throw new Error(`unknown --manual key: "${key}"`);
    next = applyManualKey(next, key, value, evidenceFile);
  }
  return next;
}

// Reads a --profile JSON file: a flat object using the SAME fixed key vocabulary as --manual.
// Only shape validation happens here (must be an object of string values); vocabulary/enum
// validation happens once, in applyManual, when the caller applies these overrides.
export function loadProfileFile(path: string): Record<string, string> {
  const text = readFileSync(path, 'utf8');
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`invalid --profile file (expected a JSON object of string keys): ${path}`);
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      throw new Error(`--profile file "${path}": key "${key}" must be a string value`);
    }
    result[key] = value;
  }
  return result;
}
