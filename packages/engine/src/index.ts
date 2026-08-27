// The ONLY public surface of @scaffolder/engine (D8). engine package.json "exports" maps '.' to
// ./dist/index.js so deep imports do not resolve. CORE-only: detect the stack, plan the framework
// base tree (pure), apply it (IO). No module reachable from here value-imports '@playwright/test'
// (the base runtime assets only type-reference Locator), so the engine stays browser-free.
export { detect } from './detect/detect.js';
export { baselineStackProfile } from './detect/baseline.js';
export { recon } from './detect/recon.js';
export { plan } from './plan/plan.js';
export { apply } from './apply/apply.js';
export { ENGINE_VERSION } from './version.js';
export { encodeJson, decodeJson } from './persist/json-codec.js';

export type { DetectOptions } from './detect/detect.js';
export type { ReconResult, ReconOptions } from './detect/recon.js';
export type { PlanOptions } from './plan/plan.js';
export type { ApplyResult, ApplyOptions } from './apply/apply.js';
export type {
  StackProfile,
  UiLibrary,
  Field,
  Evidence,
  Confidence,
  PackageManager,
  SelectorStrategy,
  ModuleSystem,
  ProfileSource,
  DependencyKind,
  FrontendFramework,
} from './types/stack-profile.js';
export type {
  GenerationPlan,
  FileDescriptor,
  WritePolicy,
  Provenance,
  FileSource,
} from './types/generation-plan.js';
export type { Manifest } from './types/manifest.js';
export type { LocatorSpec, Scope, AriaRole } from './types/locator-spec.js';
export type { ComponentRole } from './types/taxonomy.js';
export type {
  Descriptor,
  SelectStrategy,
  SelectDescriptor,
  RevealRecipe,
} from './types/descriptor.js';
export type { Adapter } from './types/adapter.js';
