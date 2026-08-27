import type { StackProfile } from '../types/stack-profile.js';

// The no-evidence baseline profile: every field defaulted with honest low/default provenance and
// empty evidence — i.e. "nothing was detected." It asserts no stack. Used as the pre-recon
// placeholder by the CLI's `generate` command (which persists it into the manifest flagged
// pendingRecon). Framework stays 'react' because that literal is the type's only inhabitant today;
// confidence:'low' + source:'default' is the codebase's existing convention for "unknown", so this
// never masquerades as a detection. Real stack facts come from recon (Part B), not here.
export function baselineStackProfile(root: string): StackProfile {
  return {
    schemaVersion: 1,
    framework: { value: 'unknown', confidence: 'low', source: 'default', evidence: [] },
    uiLibraries: [],
    packageManager: { value: 'unknown', confidence: 'high', source: 'default', evidence: [] },
    playwrightVersion: { value: '', confidence: 'low', source: 'default', evidence: [] },
    moduleSystem: { value: 'ESM', confidence: 'low', source: 'default', evidence: [] },
    testIdAttribute: { value: 'data-testid', confidence: 'high', source: 'default', evidence: [] },
    selectorStrategy: { value: 'role-first', confidence: 'high', source: 'default', evidence: [] },
    target: { kind: 'single', root },
  };
}
