import type { Confidence, StackProfile } from './stack-profile.js';

// P4 (ARCHITECTURE §4). CORE-only: the plan emits the framework base (base classes + primitives),
// the Playwright config fragment, and the overrides seed. No concrete pages / locators / verify
// targets — those belong to the later recon + generation steps.
export type WritePolicy = 'regenerate' | 'create-if-absent' | 'merge-fragment';

// 'seed' = create-if-absent user-overrides seed (overrides/README.md). CORE-only emits only
// base/primitive/config/seed today; 'adapter' + adapterId/confidence are reserved for the
// recon/generation phase, where a matched adapter contributes files.
export interface Provenance {
  origin: 'base' | 'primitive' | 'adapter' | 'config' | 'seed' | 'project';
  adapterId?: string;
  confidence?: Confidence;
}

export type FileSource = { kind: 'inline'; text: string } | { kind: 'asset'; assetId: string };

export interface FileDescriptor {
  path: string;
  writePolicy: WritePolicy;
  provenance: Provenance;
  source: FileSource;
}

export interface GenerationPlan {
  engineVersion: string;
  profile: StackProfile;
  files: FileDescriptor[];
}
