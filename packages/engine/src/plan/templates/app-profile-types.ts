// Template for .scaffold/schemas/app-profile.types.ts вЂ” the type contract for
// artifacts/analysis/app-profile.json.
//
// Scope is deliberately narrow: this file holds ONLY facts that have no other home and cannot be
// recovered by re-running anything - what a human said out loud, and what a crawl observed about
// the application's nature rather than its structure. Everything that already persists elsewhere
// stays there and is referenced, never copied: routes in site-map.json, confirmed purpose and role
// purposes recorded here, observed endpoints in api-contracts.json. A second copy of a
// fact is a second thing that can be wrong.
//
// It is optional enrichment for every reader, never a precondition. A skill that finds no profile,
// or no value for the field it wants, asks the human exactly as it would have anyway - which is
// what keeps the skills independent of each other rather than chained through this file.
export function renderAppProfileTypes(): string {
  return `// Type contract for artifacts/analysis/app-profile.json - the durable record of facts about this
// application that nothing else stores and no re-run can rediscover.
//
// Read it for context, never as a precondition: every field is optional, and a consumer that does
// not find what it needs asks the human instead of failing. Written incrementally by whichever
// stage learns the fact - no single stage owns the whole file.

export type FactSource = 'human' | 'observed';

export interface Fact<T> {
  value: T;
  // 'human' - stated by a person, and therefore authoritative over any inference.
  // 'observed' - derived from what a crawl actually saw, and safe for a later human answer to
  // overrule without ceremony.
  source: FactSource;
  // One plain sentence on where this came from, so a reader can judge it later without digging
  // through a transcript that no longer exists.
  note?: string;
  recordedAt: string;
}

// What KIND of application this is - distinct from what it is FOR (that is this file's own
// corePurpose). The distinction is load-bearing: a UI-automation practice sandbox and a real
// banking portal can share a "user authentication" purpose while deserving completely different
// test criticality, and only this field can tell them apart.
export type ApplicationKind =
  'production' | 'sandbox-demo' | 'internal-tool' | 'staging-of-production' | 'unknown';

// How this application talks to its backend. A person answers this in a second; a crawler has to
// infer it from traffic it may or may not have seen enough of, and inferring it wrong is expensive
// - a GraphQL API read as REST records one contract for the entire backend. Recorded here so the
// answer is given once rather than re-derived on every pass.
// 'mixed' is a real answer, not a hedge: a backend-for-frontend serving GraphQL over REST
// microservices is the common enterprise shape. 'none-observable' is the honest answer for an
// application whose server interaction is not a readable API at all - Next.js Server Actions,
// Remix actions, classic form posts, or a Phoenix LiveView / Blazor Server app where everything
// travels over one stateful WebSocket. On such an application the feature map is built from routes
// and UI forms alone, and saying so up front is better than presenting a thin map as a full one.
export type ApiStyle = 'rest' | 'graphql' | 'rpc' | 'mixed' | 'none-observable' | 'unknown';

export type CrawlBoundary = 'read-only' | 'safe-interactions' | 'full' | 'full-except';

export interface CrawlBoundaryFact extends Fact<CrawlBoundary> {
  // Routes or features the human named as off-limits, when the boundary was 'full-except'.
  offLimits?: string[];
}

// What this application is FOR, in one sentence, once a person has confirmed it.
//
// This lives here rather than beside the per-route analysis that first proposes it, and the reason
// is a live failure: a human answered the purpose question and then could not find their answer,
// because it had been written into a different file from applicationKind - the other app-level
// fact, established by the very next question in the same conversation. Two answers to two adjacent
// questions about the same application belong in the same record.
//
// "candidates" is what the analysis proposed; "selected" is what a person actually settled on, and
// only "selected" is authoritative. Absence of "selected" means the question was asked and never
// answered, which is different from never having been asked at all.
// Whether this application has a sign-in at all. Recorded because it is a durable fact about the
// application rather than about a run, and because not recording it meant the auth flow asked the
// same question on every single invocation - a person who has answered "there is no login" once
// should never be asked again.
//
// 'present' is worth recording too, not only 'none': a later stage that meets an unexpected login
// wall can tell "this application has auth and no session was captured" apart from "something is
// wrong here".
export type LoginPresence = 'none' | 'present';

export interface CorePurposeCandidate {
  value: string;
  reasoning: string;
  // What in the application supports this reading. Free-form signal name plus a short excerpt,
  // matching how every other inferred field in this project cites itself.
  evidence: Array<{ signal: string; excerpt: string }>;
}

export interface CorePurpose {
  candidates: CorePurposeCandidate[];
  // Index into "candidates" the evidence supports most strongly. Always 0 when there is only one.
  mostLikelyIndex: number;
  selected?: Fact<string>;
  reviewed: boolean;
  reviewedBy?: 'human' | 'auto-pilot';
}

// What one role is actually for, derived from the routes it could reach that others could not -
// never from its name. A role called "admin" that reaches nothing others cannot is the finding
// worth surfacing, and naming it "administrative access" would bury it.
export interface RoleProfile {
  name: string;
  purpose: Fact<string>;
  exclusiveRoutes: string[];
  reviewed: boolean;
  reviewedBy?: 'human' | 'auto-pilot';
}

// A piece of domain knowledge a person volunteered - a business rule, a past incident, an edge
// case. This is the single highest-value input in the whole pipeline and the one a crawl can never
// recover on its own ("refunds are processed by a nightly batch job" is not visible in any DOM),
// which is precisely why it is written down here instead of only becoming a test condition and
// then being forgotten.
export interface DomainNote {
  note: string;
  // Which stage the person was talking to when they said it - context for reading it later.
  statedDuring: string;
  recordedAt: string;
}

// Which test types this project actually tests for. Functional is the only one in scope by
// default, and that default is stated here rather than left implicit: "we only wrote functional
// tests" is a scope decision, and an unstated scope decision is indistinguishable from an
// oversight when someone later asks why nothing checks accessibility.
//
// The set is open by design. A new type is added by giving it an id here and a rule for what it
// contributes at the test-condition stage - nothing in the pipeline branches on a closed list of
// type names, so adding or removing one never means editing the stages themselves.
export interface TestTypeScope {
  id: string;
  inScope: boolean;
  // Why this type is or is not being tested for - the sentence a reader needs when they find a
  // type switched off and want to know whether that was deliberate.
  rationale?: string;
  decidedAt: string;
}

// Where the rest of this project's knowledge actually lives. Pointers, not copies - each may
// legitimately not exist yet, depending on how far the pipeline has run.
export interface ArtifactIndex {
  siteMap?: string;
  featureMap?: string;
  apiContracts?: string;
  testConditions?: string;
  testCases?: string;
}

export interface AppProfile {
  schemaVersion: 1;
  generatedAt: string;
  lastUpdatedAt?: string;
  applicationKind?: Fact<ApplicationKind>;
  login?: Fact<LoginPresence>;
  corePurpose?: CorePurpose;
  // Keyed by role name. Present only once a crawl actually ran as more than one role.
  roles?: Record<string, RoleProfile>;
  apiStyle?: Fact<ApiStyle>;
  crawlBoundary?: CrawlBoundaryFact;
  domainNotes?: DomainNote[];
  // Absent means the default: functional only. Present means somebody decided, and what they
  // decided is on the record.
  testTypes?: TestTypeScope[];
  artifactIndex?: ArtifactIndex;
}
`;
}
