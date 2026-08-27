import type { StackProfile } from '../src/types/stack-profile.js';
import type { PlanOptions } from '../src/plan/plan.js';

// Shared, login-free MUI profile + plan options used across the plan/apply tests. Kept in its own
// module (not exported from a test file) so rewriting any one test can't break the others.
export function muiProfile(): StackProfile {
  return {
    schemaVersion: 1,
    framework: {
      value: 'react',
      confidence: 'high',
      source: 'package.json',
      evidence: [{ file: 'package.json', matchedPattern: 'react' }],
    },
    uiLibraries: [
      {
        id: 'mui',
        version: '5.15.10',
        dependencyKind: 'direct',
        confidence: 'high',
        source: 'lockfile',
        evidence: [],
      },
    ],
    packageManager: { value: 'npm', confidence: 'high', source: 'lockfile', evidence: [] },
    playwrightVersion: {
      value: '1.51.1',
      confidence: 'high',
      source: 'package.json',
      evidence: [],
    },
    moduleSystem: { value: 'ESM', confidence: 'high', source: 'package.json', evidence: [] },
    testIdAttribute: { value: 'data-testid', confidence: 'high', source: 'default', evidence: [] },
    selectorStrategy: { value: 'role-first', confidence: 'high', source: 'default', evidence: [] },
    target: { kind: 'single', root: '/fake/mui-app' },
  };
}

export function planOptions(): PlanOptions {
  return { baseUrl: 'http://localhost:4173' };
}
