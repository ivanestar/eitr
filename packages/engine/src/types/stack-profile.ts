// the detect↔generate contract (ARCHITECTURE §4)
export type Confidence = 'high' | 'medium' | 'low';
export type DependencyKind = 'direct' | 'transitive';
export type ModuleSystem = 'ESM' | 'CJS';
export type SelectorStrategy = 'role-first' | 'testid-first';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'unknown';
export type ProfileSource = 'package.json' | 'lockfile' | 'live' | 'manual' | 'default'; // 'default' = defaulted/absence-derived field

export interface Evidence {
  file: string;
  matchedPattern: string;
}

// evidence MAY be [] iff source==='default'
export interface Field<T> {
  value: T;
  confidence: Confidence;
  source: ProfileSource;
  evidence: Evidence[];
}

export interface UiLibrary {
  id: 'mui' | 'antd' | 'radix' | 'chakra' | 'tailwind';
  version: string;
  dependencyKind: DependencyKind;
  confidence: Confidence;
  source: ProfileSource;
  evidence: Evidence[];
}

export type FrontendFramework = 'react' | 'vue' | 'angular' | 'svelte' | 'unknown';

export interface StackProfile {
  schemaVersion: 1;
  framework: Field<FrontendFramework>;
  uiLibraries: UiLibrary[];
  packageManager: Field<PackageManager>;
  playwrightVersion: Field<string>;
  moduleSystem: Field<ModuleSystem>;
  testIdAttribute: Field<string>; // default 'data-testid' → source 'default', evidence []
  // 'testid-first' when a @testing-library/* dep is present → source 'package.json', confidence
  // 'high', evidence [{file:'package.json',matchedPattern:'@testing-library/*'}]; else 'role-first'
  // → source 'default', evidence []
  selectorStrategy: Field<SelectorStrategy>;
  target: { kind: 'single'; root: string };
}
