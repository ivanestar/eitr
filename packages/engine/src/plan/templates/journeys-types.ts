// Template for generating .scaffold/schemas/test-cases.types.ts, the typed contract for
// artifacts/test-cases/test-cases.json - the bridge from the test-conditions stage to a drafted,
// TMS-shaped test case. create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as business-intent-types.ts and
// test-conditions-types.ts - real mechanical enforcement comes from scripts/validate-journeys.mjs
// instead.

export function renderJourneysTypes(): string {
  return `// Typed contract for artifacts/test-cases/test-cases.json, produced by scripts/compose-journeys.mjs
// (structural classification) and the /design-test-cases skill's LLM step (drafted test case).
// Reference this file when reading or writing that JSON - it is documentation-as-code, not a
// compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-journeys.mjs enforces its shape mechanically.

// How the test drives the system. There are exactly two ways in, and an earlier version of this
// file conflated them with everything else into one 'layer' field whose values were 'e2e' | 'api' |
// 'ui-only' - one value describing breadth, one describing the interface, and one describing the
// interface plus a reason. Nothing could answer "is this an API test?" without parsing a mixed
// vocabulary, so the three questions are three fields now.
export type TestInterface = 'ui' | 'api';

// How much of the application one test walks. 'e2e' is reserved for a journey that follows a
// feature's own lifecycle across the routes it spans - creating something and then checking where
// it turns up. A thorough test of a single screen is 'targeted' no matter how many conditions it
// covers: breadth is about how far the test reaches, not how much it checks.
export type TestBreadth = 'targeted' | 'e2e';

// What the test object is. Follows deterministically from the two fields above - a browser-driven
// test necessarily exercises the assembled system, and an API call at one endpoint exercises a
// seam between components - and is recorded anyway because it is the vocabulary reports and test
// management systems ask for, and because a person who knows the deployment can correct it.
//
// Component ('unit') testing is deliberately absent and always will be: those tests belong to the
// application's own codebase, not to a test suite driving it from outside. A framework that
// generated them would be generating tests for code it cannot see.
//
// Acceptance is absent for a different reason: it is not a breadth or an interface but a statement
// about who validates and against what, which nothing here can observe. A journey becomes an
// acceptance test only when a person says it is one - see JourneyEntry.acceptanceCriterion.
export type TestLevel = 'integration' | 'system';

export interface ConditionAssignment {
  conditionId: string;
  // Which route this condition came from. Only meaningful on a journey that spans several - a
  // targeted journey's assignments all name its single route.
  routeId: string;
  // Human-readable rule name that produced this assignment (e.g. 'baseline-valid-vector',
  // 'checklist-based-default', 'html5-constraint-override') - not machine-checked, purely so a
  // human reading the artifact can see why without re-deriving the rule by hand.
  reason: string;
}

// Present only on a step belonging to a journey whose interface is 'api' - the observed contract
// this step is grounded in (from artifacts/site-map/api-contracts.json), never a guessed endpoint.
// expectedResponseShape maps field name to a type hint ("string (uuid)", "integer", "... or null"),
// never a concrete instance - the concrete values a step actually checks live in expectedResult.
export interface ApiStepDetail {
  method: string;
  path: string;
  payload?: Record<string, unknown>;
  expectedStatus: number;
  expectedResponseShape?: Record<string, string>;
  contractGrounded: boolean;
}

export interface DraftTestCaseStep {
  description: string;
  expectedResult: string;
  api?: ApiStepDetail;
}

// Written by the /design-test-cases skill's LLM step, not scripts/compose-journeys.mjs - absent
// until that step runs. 'api'-interface steps describe the mechanism generically ("call the
// project's API client") rather than naming a language-specific class - actual code generation
// stays /automate-test's job.
export interface DraftTestCase {
  title: string;
  preconditions: string[];
  steps: DraftTestCaseStep[];
}

export interface JourneyEntry {
  // sha256 of what this journey covers, truncated to 16 chars: for a targeted journey, its routeId
  // plus its own sorted conditionIds; for a feature journey, its featureId plus the same. Stable
  // across re-runs as long as the coverage is.
  journeyId: string;
  // Every route this journey touches, in the order it walks them. A targeted journey names one.
  routeIds: string[];
  // Present only on a journey walking a feature's lifecycle - the feature in
  // artifacts/analysis/feature-map.json it was built from.
  featureId?: string;
  testInterface: TestInterface;
  breadth: TestBreadth;
  level: TestLevel;
  conditionAssignments: ConditionAssignment[];
  // Absent until the /design-test-cases skill's LLM step drafts it.
  testCase?: DraftTestCase;
  // Set only when a person explicitly says this journey is what they would accept the feature on.
  // Never inferred: breadth, impact and interface say nothing about who signs a release off, and a
  // pipeline that promoted its widest test to "acceptance" on its own would be inventing a
  // stakeholder's opinion.
  acceptanceCriterion?: { statedBy: 'human'; statedAt: string; note?: string };
  // False until a human reviews it. Unlike every earlier stage in this pipeline, this is NOT a
  // blocking gate - /design-test-cases writes the draft and moves on; nothing downstream refuses
  // to proceed on reviewed:false here. Kept for future auditability, not enforcement.
  reviewed: boolean;
  // Who set reviewed:true - 'human' for an actual conversational approval, 'auto-pilot' only when
  // future auto-pilot tooling sets it on the user's own explicit pre-authorization. Required once
  // reviewed is true (mechanically enforced); expected but not mechanically enforced to be absent
  // while reviewed is false.
  reviewedBy?: 'human' | 'auto-pilot';
  // Hash of the reviewed conditions this journey was composed from, each one's reviewed flag, and
  // each one's technique at the last compose pass - scripts/compose-journeys.mjs recomputes and
  // compares this to decide whether conditionAssignments needs to be regenerated, preserving any
  // existing testCase/reviewed/reviewedBy when nothing structurally changed.
  sourceConditionsHash: string;
  analyzedAt: string;
}

export interface JourneysReport {
  schemaVersion: 2;
  generatedAt: string;
  // Keyed by journeyId. An earlier version nested journeys under the route they belonged to, which
  // could not represent a journey belonging to several routes at once - the exact thing an
  // end-to-end test is. Route membership lives on the journey now, where it can be a list.
  journeys: Record<string, JourneyEntry>;
}
`;
}
