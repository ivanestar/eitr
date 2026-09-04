// Template for generating .scaffold/schemas/test-cases.types.ts, the typed contract for
// artifacts/test-cases/test-cases.json - the bridge from Stage 2's test-conditions.json to a drafted,
// TMS-shaped test case. create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as business-intent-types.ts and
// test-conditions-types.ts - real mechanical enforcement comes from scripts/validate-journeys.mjs
// instead.

export function renderJourneysTypes(): string {
  return `// Typed contract for artifacts/test-cases/test-cases.json, produced by scripts/compose-journeys.mjs
// (structural test-level classification) and the /design-test-cases skill's LLM step (drafted
// test case). Reference this file when reading or writing that JSON - it is documentation-as-code,
// not a compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-journeys.mjs enforces its shape mechanically.

// Which test level a condition should be verified at. Assigned deterministically by
// scripts/compose-journeys.mjs from data already present in test-conditions.json - never from
// criticalityTier or any other LLM-derived signal, which is too unstable to gate a structural
// decision on even with fixed tier definitions.
export type TestLevel = 'e2e' | 'api' | 'ui-only';

export interface ConditionAssignment {
  conditionId: string;
  testLevel: TestLevel;
  // Human-readable rule name that produced this assignment (e.g. 'baseline-valid-vector',
  // 'checklist-based-default', 'html5-constraint-override') - not machine-checked, purely so a
  // human reading the artifact can see why without re-deriving the rule by hand.
  reason: string;
}

export interface DraftTestCaseStep {
  description: string;
  expectedResult: string;
}

// Written by the /design-test-cases skill's LLM step, not scripts/compose-journeys.mjs - absent
// until that step runs. 'api'-level steps describe the mechanism generically ("call the project's
// API client") rather than naming a language-specific class - actual code generation stays
// /automate-ticket's job.
export interface DraftTestCase {
  title: string;
  preconditions: string[];
  steps: DraftTestCaseStep[];
}

export interface JourneyEntry {
  // sha256(routeId + '|' + JSON.stringify(sorted conditionIds)).slice(0, 16) - same convention as
  // test-conditions.json's own conditionId.
  journeyId: string;
  routeId: string;
  conditionAssignments: ConditionAssignment[];
  // Absent until the /design-test-cases skill's LLM step drafts it.
  testCase?: DraftTestCase;
  // False until a human reviews it. Unlike every earlier stage in this pipeline, this is NOT a
  // blocking gate - /design-test-cases writes the draft and moves on; nothing downstream refuses
  // to proceed on reviewed:false here. Kept for future auditability, not enforcement.
  reviewed: boolean;
  // Who set reviewed:true - 'human' for an actual conversational approval, 'auto-pilot' only when
  // future auto-pilot tooling sets it on the user's own explicit pre-authorization. Required once
  // reviewed is true (mechanically enforced); expected but not mechanically enforced to be absent
  // while reviewed is false.
  reviewedBy?: 'human' | 'auto-pilot';
  // Hash of this route's reviewed conditionIds, each one's reviewed flag, and each one's technique
  // at the last compose pass - scripts/compose-journeys.mjs recomputes and compares this to decide
  // whether conditionAssignments needs to be regenerated, preserving any existing testCase/
  // reviewed/reviewedBy when nothing structurally changed.
  sourceConditionsHash: string;
  analyzedAt: string;
}

export interface JourneysReport {
  schemaVersion: 1;
  generatedAt: string;
  // Keyed by routeId, one entry per route with at least one reviewed test condition - same
  // convention as business-intent.json and test-conditions.json. journeys is an array for forward
  // compatibility (a future cross-route stage), but v1 never writes more than one entry per route.
  routes: Record<string, { routeId: string; journeys: JourneyEntry[] }>;
}
`;
}
