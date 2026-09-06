// Template for generating .scaffold/schemas/api-contracts.types.ts, the typed contract for
// artifacts/site-map/api-contracts.json. create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as the other .types.ts files -
// real mechanical enforcement comes from scripts/validate-api-contracts.mjs instead.

export function renderApiContractsTypes(): string {
  return `// Typed contract for artifacts/site-map/api-contracts.json, produced by /map-site (Step 2's live
// network observation during crawl) and /auth-setup (observing the login request/response itself).
// Reference this file when reading or writing that JSON - it is documentation-as-code, not a
// compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-api-contracts.mjs enforces its shape mechanically.
//
// A contract entry only exists because it was ACTUALLY OBSERVED on the live application - never a
// guessed endpoint. /design-test-cases and /automate-test only draft/synthesize an 'api'-layer test
// case grounded in a real entry here; when no entry matches a route's interaction, that is a real,
// disclosed gap (see JourneyEntry.testCase.steps[].api.contractGrounded in test-cases.types.ts), not
// something to fill in with an invented endpoint.

export interface ApiContractEntry {
  // sha256(method + '|' + pathTemplate).slice(0, 16) - stable across re-observation of the same call.
  contractId: string;
  method: string;
  // Canonicalized the same way site-map.json's routes are: a numeric ID/UUID/slug segment collapses
  // to a template ({id}), never one entry per concrete record.
  pathTemplate: string;
  // Which route(s) in site-map.json this call was actually observed being made from - a login
  // request observed during /auth-setup's own capture names no routeId (auth happens before any
  // route is "current" yet); an in-app call observed during /map-site's own crawl names the route
  // whose page triggered it.
  observedFromRouteIds: string[];
  // A representative request payload, PII/session-data redacted the same way every other evidence
  // field in this pipeline already is (6+ digit runs, 8+-char majority-digit tokens -> [REDACTED]).
  // Absent for a method with no body (GET/DELETE with no payload).
  sampleRequestPayload?: Record<string, unknown>;
  // The status actually returned when this call was observed - not an assumption.
  responseStatus: number;
  // Response body SHAPE only: field name -> type hint ("string (uuid)", "integer", "boolean",
  // "string (Active | Inactive)", "... or null", "[ { ... } ]" for an array of objects) - never a
  // concrete instance value. The concrete values a drafted test case actually checks live in that
  // test case's own step content, not here.
  responseShape?: Record<string, string>;
  observedAt: string;
}

export interface ApiContractsReport {
  schemaVersion: 1;
  generatedAt: string;
  contracts: ApiContractEntry[];
}
`;
}
