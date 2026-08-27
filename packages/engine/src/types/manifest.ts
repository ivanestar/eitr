import type { WritePolicy } from './generation-plan.js';
import type { StackProfile } from './stack-profile.js';

// Written ONCE (atomically, stage+rename) at the end of a successful apply; NO hash, NO
// intent/commit phases — the two-phase journal is deferred with prune/delta.
// pendingRecon: true marks a manifest whose `profile` is a pre-recon placeholder (baseline
// defaults, not a detection result) so a reader never trusts it as the real stack.
export interface Manifest {
  manifestSchemaVersion: 1;
  engineVersion: string;
  generatedAt: string;
  profile: StackProfile;
  files: Array<{ path: string; writePolicy: WritePolicy }>;
  pendingRecon?: boolean;
}
