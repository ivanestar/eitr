// Template for generating .scaffold/schemas/test-conditions.types.ts, the typed contract for
// artifacts/analysis/test-conditions.json (Stage 2 of the app-analysis pipeline). create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as business-intent-types.ts -
// real mechanical enforcement comes from scripts/validate-test-conditions.mjs instead.

export function renderTestConditionsTypes(): string {
  return `// Typed contract for artifacts/analysis/test-conditions.json, produced by the /define-test-conditions
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

// Closed 9-category taxonomy of negative testing concerns (ISTQB Stage 2).
export type NegativeCategory =
  | 'invalid_input'
  | 'boundary'
  | 'missing_precondition'
  | 'concurrent_conflict'
  | 'state_violation'
  | 'permission_denied'
  | 'external_failure'
  | 'data_integrity'
  | 'error_path';

// Deliberately empty ({}) on every generated condition - auto-synthesizing this from live network
// responses would require actually submitting the form, which this pipeline's read-only-by-default
// safety rule forbids. A human fills this in at sign-off.
//
// Defensive Oracle Polarity Invariant: A negative condition's verification contract MUST assert
// system self-defense and state preservation (ui: validation message/redirection; state: draft
// preserved, no ghost entity created; network: 4xx response, NEVER an unhandled crash or 500 error).
export interface VerificationContract {
  ui?: string;
  state?: string;
  network?: { status: number; bodyShape?: string };
}

// 'equivalence-partition' covers a route with fewer than 2 parameters, where pairwise coverage
// has no second parameter to pair against and would otherwise silently produce zero conditions.
// 'checklist-based' (ISTQB experience-based technique) probes a closed, deterministic list of
// well-known malformed-format/injection-class values per parameter kind - complementary to
// boundary-value, not a replacement for it.
// 'architectural-invariant' covers systemic, route-level conditions (e.g. missing_precondition,
// permission_denied, state_violation) not bound to form parameter inputs.
export type TestConditionTechnique =
  | 'combinatorial'
  | 'boundary-value'
  | 'equivalence-partition'
  | 'checklist-based'
  | 'architectural-invariant';

// Whether every parameter value in a TestCondition's vector is drawn from a 'valid' partition (or
// the inclusive/still-inside side of a boundary) - 'negative' when at least one is an
// 'invalid'-kind partition, the value one step past a boundary, or a checklist probe (checklist
// values are malformed/injection-class by construction, always 'negative').
export type TestConditionScenario = 'positive' | 'negative';

export interface TestCondition {
  // sha256(routeId + '|' + (technique === 'architectural-invariant' ? (negativeCategory || '') + '|' + description : JSON.stringify(sorted [paramName, value] tuples))).slice(0, 16)
  conditionId: string;
  // paramName -> partitionId for technique: 'combinatorial' and 'equivalence-partition'. For
  // technique: 'boundary-value' or 'checklist-based', the target parameter's own entry holds the
  // literal probe/checklist value instead of a partitionId. For technique: 'architectural-invariant',
  // parameters is empty ({}) or holds relevant route context.
  parameters: Record<string, string>;
  technique: TestConditionTechnique;
  // One human-readable sentence synthesized deterministically from the vector's own resolved
  // values (partition sampleValues, or the literal boundary/checklist probe) or authored by the
  // agent for architectural invariants. This is what a human actually reviews at
  // sign-off; parameters/technique above remain the machine-consumable form.
  description: string;
  scenario: TestConditionScenario;
  // Closed taxonomy category for negative scenarios. Applicable strictly when scenario === 'negative';
  // required when technique === 'architectural-invariant'.
  negativeCategory?: NegativeCategory;
  verification: VerificationContract;
  isSpeculative: boolean;
  reviewed: boolean;
  // Who set reviewed:true - 'human' for an actual conversational approval, 'auto-pilot' only when
  // /ground-zero-setup's auto-pilot mode set it on the user's own explicit pre-authorization.
  // Required once reviewed is true (mechanically enforced); expected but not mechanically
  // enforced to be absent while reviewed is false.
  reviewedBy?: 'human' | 'auto-pilot';
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
  // Joins against artifacts/site-map/site-map.json's routes[*].routeId, same convention as
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
