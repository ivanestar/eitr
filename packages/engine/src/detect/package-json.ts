import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal shape of a target's package.json — only the fields the detector reads.
export interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPackageJson(cwd: string): PackageJson | undefined {
  const filePath = resolve(cwd, 'package.json');
  try {
    const text = readFileSync(filePath, 'utf8');
    return JSON.parse(text) as PackageJson;
  } catch {
    return undefined;
  }
}

export interface PresenceResult {
  framework?: 'react' | 'vue' | 'angular' | 'svelte';
  frameworkRange?: string;
  mui: boolean; // '@mui/material' present
  muiRange?: string;
  antd: boolean; // 'antd' present
  antdRange?: string;
  radix: boolean; // '@radix-ui/*' present
  radixDepName?: string;
  radixRange?: string;
  chakra: boolean; // '@chakra-ui/*' present
  chakraDepName?: string;
  chakraRange?: string;
  tailwind: boolean; // 'tailwindcss' present
  tailwindRange?: string;
  playwright: boolean; // '@playwright/test' present
  playwrightRange?: string;
  testingLibraryDep?: string; // the matched '@testing-library/*' dep name, if any
  moduleSystem: 'ESM' | 'CJS'; // from package.json "type"
  moduleSystemDetected: boolean; // true iff package.json declared a "type" field
  packageManagerField?: string; // raw "packageManager" field (e.g. 'npm@10.5.0'), tiebreak only
}

// Presence from target package.json deps+devDeps (dependencyKind is always 'direct' downstream —
// Slice 1 does not walk the dependency graph to distinguish transitive deps).
export function detectPresence(pkg: PackageJson): PresenceResult {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const testingLibraryDep = Object.keys(deps).find((name) => name.startsWith('@testing-library/'));
  const radixDep = Object.keys(deps).find((name) => name.startsWith('@radix-ui/'));
  const chakraDep = Object.keys(deps).find((name) => name.startsWith('@chakra-ui/'));

  // Built incrementally (rather than via an object literal with possibly-undefined values)
  // because exactOptionalPropertyTypes forbids assigning `undefined` into an optional field —
  // an absent dep must leave the property un-set, not set-to-undefined.
  let framework: 'react' | 'vue' | 'angular' | 'svelte' | undefined = undefined;
  let frameworkRange: string | undefined = undefined;

  if ('react' in deps) {
    framework = 'react';
    frameworkRange = deps['react'];
  } else if ('vue' in deps) {
    framework = 'vue';
    frameworkRange = deps['vue'];
  } else if ('@angular/core' in deps) {
    framework = 'angular';
    frameworkRange = deps['@angular/core'];
  } else if ('svelte' in deps) {
    framework = 'svelte';
    frameworkRange = deps['svelte'];
  }

  const result: PresenceResult = {
    mui: '@mui/material' in deps,
    antd: 'antd' in deps,
    radix: radixDep !== undefined,
    chakra: chakraDep !== undefined,
    tailwind: 'tailwindcss' in deps,
    playwright: '@playwright/test' in deps,
    moduleSystem: pkg.type === 'module' ? 'ESM' : 'CJS',
    moduleSystemDetected: pkg.type !== undefined,
  };
  if (framework !== undefined) result.framework = framework;
  if (frameworkRange !== undefined) result.frameworkRange = frameworkRange;
  if (deps['@mui/material'] !== undefined) result.muiRange = deps['@mui/material'];
  if (deps['antd'] !== undefined) result.antdRange = deps['antd'];
  if (radixDep !== undefined) {
    result.radixDepName = radixDep;
    result.radixRange = deps[radixDep];
  }
  if (chakraDep !== undefined) {
    result.chakraDepName = chakraDep;
    result.chakraRange = deps[chakraDep];
  }
  if (deps['tailwindcss'] !== undefined) result.tailwindRange = deps['tailwindcss'];
  if (deps['@playwright/test'] !== undefined) result.playwrightRange = deps['@playwright/test'];
  if (testingLibraryDep !== undefined) result.testingLibraryDep = testingLibraryDep;
  if (pkg.packageManager !== undefined) result.packageManagerField = pkg.packageManager;
  return result;
}
