// Template for generating .scaffold/schemas/test-conditions.types.ts, the typed contract for
// docs/analysis/test-conditions.json (Stage 2 of the app-analysis pipeline). create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not docs/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as business-intent-types.ts -
// real mechanical enforcement comes from scripts/validate-test-conditions.mjs instead.

export function renderTestConditionsTypes(): string {
  return `// Typed contract for docs/analysis/test-conditions.json, produced by the /derive-test-conditions
// skill. Reference this file when reading or writing that JSON - it is documentation-as-code, not
// a compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-test-conditions.mjs enforces its shape mechanically.

export type ParameterKind =
  'text' | 'number' | 'email' | 'date' | 'select' | 'checkbox' | 'radio' | 'password' | 'other';

// Which already-rendered, read-only signal grounded an EquivalencePartition's evidence. Same
// zero-mutation discipline as business-intent.types.ts's BusinessIntentSource.
export type TestConditionSource =
  'form-label' | 'html5-constraint' | 'aria-relationship' | 'select-option-text' | 'manual';

export interface Evidence {
  signal: TestConditionSource;
  excerpt: string;
}

export interface EquivalencePartition {
  id: string;
  kind: 'valid' | 'invalid';
  // Synthesized illustrative examples only - never copied from a live page.
  sampleValues: string[];
}

export interface BoundarySet {
  boundary: 'min' | 'max';
  // ISTQB 3-value BVA: [boundary-1, boundary, boundary+1].
  values: [string, string, string];
}

export interface Parameter {
  name: string;
  kind: ParameterKind;
  // Must contain at least one 'valid'-kind entry if boundaries is non-empty - enforced by
  // scripts/validate-test-conditions.mjs before generation ever runs.
  partitions: EquivalencePartition[];
  boundaries: BoundarySet[];
  evidence: Evidence[];
}

// v1 supports pairwise-exclusion constraints only - "if paramA holds partition X, paramB may
// never hold partition Y." General multi-clause boolean predicates are out of scope for this slice.
export interface ConstraintRule {
  ifParam: string;
  ifPartition: string;
  thenParam: string;
  thenExcludesPartition: string;
}

// Deliberately empty ({}) on every generated condition - auto-synthesizing this from live network
// responses would require actually submitting the form, which this pipeline's read-only-by-default
// safety rule forbids. A human fills this in at sign-off.
export interface VerificationContract {
  ui?: string;
  state?: string;
  network?: { status: number; bodyShape?: string };
}

export type TestConditionTechnique = 'combinatorial' | 'boundary-value';

export interface TestCondition {
  // sha256(routeId + '|' + JSON.stringify(sorted [paramName, value] tuples)).slice(0, 16)
  conditionId: string;
  // paramName -> partitionId for technique: 'combinatorial'. For technique: 'boundary-value', the
  // boundary parameter's own entry holds the literal probe value from BoundarySet.values instead
  // of a partitionId - every other (held-constant) parameter's entry is still a partitionId.
  parameters: Record<string, string>;
  technique: TestConditionTechnique;
  verification: VerificationContract;
  isSpeculative: boolean;
  reviewed: boolean;
}

// A parameter pair the generator could not cover because every remaining candidate conflicted
// with an already-fixed value under the route's ConstraintRules (or, for a partition that can
// never appear in any valid complete vector at all, every pair mentioning it). Non-fatal:
// surfaced for human visibility at sign-off instead of crashing or silently dropping coverage.
export interface UnsatisfiedPair {
  paramA: string;
  partitionA: string;
  paramB: string;
  partitionB: string;
  reason: string;
}

export interface TestConditionsEntry {
  // Joins against docs/site-map/site-map.json's routes[*].routeId, same convention as
  // business-intent.json.
  routeId: string;
  parameters: Parameter[];
  constraints: ConstraintRule[];
  conditions: TestCondition[];
  unsatisfiedPairs: UnsatisfiedPair[];
  // site-map.json contentHash cheap-skip for the extraction step, same idiom as business-intent.json.
  sourceContentHash: string;
  // Hash of this entry's parameters+constraints at the last generation pass - the generator
  // recomputes and compares this to decide whether conditions[] needs to be regenerated.
  sourceParamsHash: string;
  analyzedAt: string;
}

export interface TestConditionsReport {
  schemaVersion: 1;
  generatedAt: string;
  routes: Record<string, TestConditionsEntry>;
}
`;
}
