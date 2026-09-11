// Template for generating .scaffold/schemas/test-conditions.types.ts, the typed contract for
// artifacts/analysis/test-conditions.json (Stage 2 of the app-analysis pipeline). create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as feature-map-types.ts -
// real mechanical enforcement comes from scripts/validate-test-conditions.mjs instead.

export function renderTestConditionsTypes(): string {
  return `// Typed contract for artifacts/analysis/test-conditions.json, produced by the /define-test-conditions
// skill. Reference this file when reading or writing that JSON - it is documentation-as-code, not
// a compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-test-conditions.mjs enforces its shape mechanically.

export type ParameterKind =
  'text' | 'number' | 'email' | 'date' | 'select' | 'checkbox' | 'radio' | 'password' | 'other';

// Which signal grounded an EquivalencePartition's evidence. All but 'field-probe' are read off the
// page as rendered; 'field-probe' is what the page did when a value was typed into the field and the
// focus moved away (scripts/field-probe.mjs), and its excerpt starts with the probe id.
export type TestConditionSource =
  | 'form-label'
  | 'html5-constraint'
  | 'aria-relationship'
  | 'select-option-text'
  | 'field-probe'
  | 'manual';

export interface Evidence {
  signal: TestConditionSource;
  excerpt: string;
}

// Where a condition's expected result comes from - what makes it right, not merely what happens.
//   requirement - a requirement, ticket or specification says so
//   human       - a person said so (a domain note, an answer to this stage's question)
//   research    - published practice for this kind of feature, cited in the feature's research
//   domain      - the meaning of the feature and its fields, reasoned through in the feature analysis
//   observed    - the application was seen doing it (a field probe, a crawl observation)
//   markup      - the page's own markup states it (an HTML5 attribute, a label, the offered options)
// The first four can find a defect that already exists. The last two only record what the
// application does today: a condition resting on them alone is a regression check - it fails when the
// behaviour changes, and passes on a bug that was there when it was written.
export type OracleSource = 'requirement' | 'human' | 'research' | 'domain' | 'observed' | 'markup';

// What a condition exercises.
//   field    - what one field lets in: type, format, required, length, a limit only the markup states
//   rule     - a rule of the business shown at the fields: a limit that carries meaning, a relation
//              between fields ("the end date is after the start date")
//   behavior - what the feature does with input it accepts: a result, a calculation, a decision, a
//              state change, an output
//   frame    - the site-wide frame (language, theme, a setting that must persist), tested once
export type ConditionLayer = 'field' | 'rule' | 'behavior' | 'frame';

// What a claim rests on - a pointer into the test basis. Polymorphic on purpose: today's basis is the
// live application, whose conditions cite controls, probes and research; a requirements, ticket,
// source-code or document basis cites a quote from those in exactly the same way.
//   control     - an inventory control id on the route ("c4")
//   probe       - a probe id in artifacts/analysis/field-probes.json
//   research    - a source id ("s3") in the feature's research record
//   feature     - a featureId in artifacts/analysis/feature-map.json
//   entity      - an entityId in artifacts/analysis/feature-map.json
//   human       - "domainNotes:<index>" in app-profile.json, or "question:<index>" of this feature
//   requirement, ticket, code, document - a reference inside that source (a path with a line or
//               section, a ticket key), with the words relied on in quote
export type AnchorKind =
  | 'control'
  | 'probe'
  | 'research'
  | 'feature'
  | 'entity'
  | 'human'
  | 'requirement'
  | 'ticket'
  | 'code'
  | 'document';

export interface Anchor {
  kind: AnchorKind;
  ref: string;
  // The exact words relied on, <= 200 characters. Required for human, requirement, ticket, code and
  // document anchors, whose ref alone says where but not what.
  quote?: string;
}

// How likely this is to break here - the likelihood half of a risk level (ISTQB: risk level =
// likelihood x impact). Impact is the feature's own, from the feature map.
export type Likelihood = 'high' | 'medium' | 'low';

export interface Risk {
  likelihood: Likelihood;
  // The concrete mechanism that makes it plausible here, not the category it belongs to.
  reason: string;
}

// Computed by scripts/generate-test-conditions.mjs from likelihood x impact, never written by hand.
//   P1 - risk score 6-9, P2 - 3-4, P3 - 1-2
export type Priority = 'P1' | 'P2' | 'P3';

// Who produced a condition. 'generated' ones are rebuilt by the script on every run; the rest are
// kept exactly as written.
export type ConditionOrigin = 'generated' | 'model' | 'research' | 'human';

// What a field's value is, to a person using the feature - which decides which checks apply at all.
export type FieldRole =
  | 'quantity' // a number with a unit, or a count
  | 'money'
  | 'date-time'
  | 'identifier' // an email, a phone number, a code, an id with a format of its own
  | 'credential'
  | 'free-text'
  | 'choice' // one of the offered options
  | 'toggle'
  | 'search-filter' // narrows what a list shows
  | 'file'
  | 'setting' // changes how the application behaves or looks, and should persist
  | 'other';

// One constraint a field should obey, and whether the page enforces it today.
export interface ExpectedConstraint {
  // One plain sentence: "between 1 and 1000 inclusive", "never negative - it is a device's speed",
  // "any real number - a converter reads a negative speed as a direction".
  statement: string;
  source: OracleSource;
  confidence: 'high' | 'medium' | 'low';
  //   markup       - an HTML5 attribute enforces it
  //   observed     - a probe saw the page refuse a value breaking it
  //   not-enforced - a probe saw the page accept a value breaking it: a candidate defect when the
  //                  source is not markup or observed
  //   unknown      - nothing checked
  enforcement: 'markup' | 'observed' | 'not-enforced' | 'unknown';
  anchors: Anchor[];
}

export interface FieldMeaning {
  routeId: string;
  // The inventory control id of the field - or, for a field a probe revealed after the crawl recorded
  // the page, the name of its parameter instead. Exactly one of the two.
  control?: string;
  parameter?: string;
  // What the value means in this feature: "the speed to convert, in the unit chosen beside it".
  meaning: string;
  role: FieldRole;
  unit?: string;
  // May be empty: "free text of any length" is a statement about the field too.
  constraints: ExpectedConstraint[];
  confidence: 'high' | 'medium' | 'low';
}

// One question for a person, asked with the review, when the analysis is unsure of something that
// changes the tests - a field's meaning, a limit nothing states.
export interface FeatureQuestion {
  text: string;
  // A control id, or 'feature'.
  about: string;
  // The person's words, once answered.
  answer?: string;
}

export interface FeatureDependency {
  // A featureId, an entityId, or the name of an outside system.
  on: string;
  kind: 'feature' | 'entity' | 'external';
  // How a failure there shows up here.
  why: string;
}

// The research record behind a feature's research-origin conditions. scripts/test-research.mjs owns
// the file and its cache: one per kind of feature, reused by every feature of that kind.
export interface ResearchSummary {
  status: 'done' | 'cached' | 'skipped';
  // The generic kind of feature researched ("unit converter", "checkout", "file upload") - never the
  // application's own name, which a search query must not carry.
  archetype: string;
  // artifacts/analysis/research/<slug>.json, for done and cached.
  file?: string;
  // Why it was skipped, in a few words ("no web access in this assistant").
  reason?: string;
}

// What the analysis understood about one feature before a single condition was written: the model
// every condition of the feature is derived from, rather than the fields the page happened to show.
export interface FeatureAnalysis {
  featureId: string;
  // What the feature does, in the application's own terms.
  purpose: string;
  // How it serves what the whole application is for - the reasoning that settles what it is: "a
  // converter in a collection of testing tools, so its job is an exact conversion, not setting a
  // device's speed".
  fitsApplication: string;
  archetype: string;
  confidence: 'high' | 'medium' | 'low';
  anchors: Anchor[];
  // Every field of every member route outside the site frame, by control id.
  fields: FieldMeaning[];
  dependencies: FeatureDependency[];
  questions: FeatureQuestion[];
  research: ResearchSummary;
  analyzedAt: string;
}

// What the conditions were derived from.
//   live-app  - a crawled application: site map, inventories, feature map
//   documents - requirements, tickets, source code, documents or diagrams
//   mixed     - both
export interface TestBasis {
  mode: 'live-app' | 'documents' | 'mixed';
  // The base URL of a live application; file paths or ticket keys of documents.
  sources: string[];
}

// How a value reaches the application. 'ui' (the default when absent) is anything a person can
// enter through the page's own controls. 'dom' is a value those controls cannot produce - an option
// a <select> does not offer - so a test has to set it by script, past the control. 'api' is sent
// straight to the endpoint, and is only allowed on a route with an observed call in
// artifacts/site-map/api-contracts.json.
export type ExecutionLevel = 'ui' | 'dom' | 'api';

export interface EquivalencePartition {
  id: string;
  kind: 'valid' | 'invalid';
  // Synthesized illustrative examples only - never copied from a live page.
  sampleValues: string[];
  // What a person sees when this parameter takes the partition's first sample value - the value
  // every condition built from it uses - and every other input is valid: a message and where it
  // appears, a count, a value shown, a control disabled. It is the oracle those conditions inherit,
  // so a sentence nobody could check against the page ("handled correctly", "works as expected") is
  // rejected by the validator.
  expectedOutcome: string;
  // Required on an 'invalid' partition: where the page says this value is not allowed - an HTML5
  // constraint, a label stating the rule, the offered option list, or a person's words. A value is
  // invalid because something says so, never because it looks unusual. A placeholder such as
  // "e.g. 20" is an example of a valid value, not a rule.
  rule?: Evidence;
  // Absent means 'ui'. Only an 'invalid' partition may be 'dom' or 'api', and an invalid partition
  // of a select, radio or checkbox must be one of the two, since the control cannot produce it.
  executionLevel?: ExecutionLevel;
  // Where expectedOutcome comes from. Absent means: the rule's own source on an invalid partition
  // ('markup', 'observed' for a field probe, 'human' for a person's words), 'domain' on a valid one.
  oracle?: OracleSource;
  // What that oracle rests on beyond the rule - the research source, the person's words, the probe.
  // The generator copies these onto every condition it builds from this partition, so a condition
  // whose expected result comes from research points at the research.
  anchors?: Anchor[];
}

export interface BoundarySet {
  boundary: 'min' | 'max';
  // ISTQB 3-value BVA: [boundary-1, boundary, boundary+1].
  values: [string, string, string];
  // Where the limit is stated - an HTML5 min/max/minlength/maxlength attribute, a label giving the
  // range, or a person's words. A boundary nobody states is a guess, and a guessed limit produces
  // conditions that reject values the application legitimately accepts.
  rule: Evidence;
  // What a person sees at the limit and one step inside it - both probes carry this, so it has to
  // hold for either value ("exactly as many GUIDs as requested are listed", not "5 GUIDs").
  acceptedOutcome: string;
  // What a person sees when the value one step past this boundary is entered.
  rejectedOutcome: string;
  // Where the limit comes from. Absent means the rule's own source.
  oracle?: OracleSource;
  // As on a partition: copied onto every boundary condition built from this set.
  anchors?: Anchor[];
}

export interface Parameter {
  name: string;
  kind: ParameterKind;
  // Every parameter needs at least one 'valid'-kind partition: an invalid value is only ever
  // combined with valid values of the others, and a parameter with no acceptable value is either
  // mislabelled or not an input. Enforced by scripts/validate-test-conditions.mjs.
  partitions: EquivalencePartition[];
  boundaries: BoundarySet[];
  evidence: Evidence[];
  // The id of the field this parameter is, in the route's inventory
  // (artifacts/site-map/inventory/<routeId>.json). Absent only for a field the inventory does not
  // list - one a probe revealed after the crawl recorded the page.
  control?: string;
  // For a parameter without control, on a route with an inventory: the id of the page's own field
  // whose toggle, selection or fill revealed this one. Without it, "not in the inventory" would let
  // anything through - the header's language switcher included.
  revealedBy?: string;
  // The option labels a 'select' or 'radio' offers, as displayed. With an inventory the validator
  // reads them from there; without one they are required here. A valid partition's samples must
  // come from this list and an invalid partition's samples must not - an option the page itself
  // offers cannot be an invalid input. A list drawn from the user's own data (saved addresses, their
  // contacts) is recorded as ['[REDACTED]'].
  options?: string[];
}

// Why a field on the page is not a parameter. Closed list: anything else on the page is a parameter.
//   result-output - shows the page's result rather than taking input (a read-only result box)
//   duplicate     - the same field rendered twice (a mobile and a desktop copy, a repeated row);
//                   note names the control id that stands for it
//   disabled      - disabled, and nothing short of pressing a button enables it
//   needs-button  - only takes a value after a button this stage may not press opens it
//   off-limits    - inside an area the human put off-limits for this project
export type ExclusionReason =
  'result-output' | 'duplicate' | 'disabled' | 'needs-button' | 'off-limits';

export interface ExcludedControl {
  control: string;
  reason: ExclusionReason;
  note?: string;
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
// 'state-transition' and 'use-case' are the two flow-oriented techniques. Both need a model of what
// an entity's life looks like, which no amount of per-page analysis can produce - they come from
// artifacts/analysis/feature-map.json's reviewed entity lifecycles, and simply do not appear on a
// project that has none. A 'state-transition' condition is either one defined transition or one
// (state, trigger) pair the lifecycle leaves undefined; a 'use-case' condition is one entity's whole
// main flow, which is what a cross-route journey gets built from.
// 'property' and 'metamorphic' are the oracle for a page that turns input into output - generates,
// converts, formats, compares - where no example answer can be written down in advance but the
// output still has to obey a rule. A 'property' holds over one run's whole output; a 'metamorphic'
// relation links two runs. Both are written by the agent, like 'architectural-invariant'.
// 'decision-table' is a rule that combines inputs into an outcome ("free shipping when the total is
// over 50 and the address is domestic") - one condition per rule column, written by the agent with the
// inputs in parameters as literal values. 'error-guessing' is a failure the analysis expects from
// experience of this kind of feature rather than from a stated rule - where a typical defect of the
// archetype, a research finding or an edge case lands. Both are ISTQB techniques; like the other
// agent-written ones they survive every regeneration.
export type TestConditionTechnique =
  | 'combinatorial'
  | 'boundary-value'
  | 'equivalence-partition'
  | 'checklist-based'
  | 'state-transition'
  | 'use-case'
  | 'architectural-invariant'
  | 'property'
  | 'metamorphic'
  | 'decision-table'
  | 'error-guessing';

// Closed lists, so every relation is one a test can compute rather than a phrase to interpret.
//   count-matches-request      - the output holds exactly as many items as the input asked for
//   all-unique                 - no two items of the output are the same
//   format-conformance         - every item matches a stated format (a UUID v4, an ISO date)
//   covers-all-pairs           - every pair of input values appears together in some output row,
//                                except the pairs a constraint stated on the page rules out
//   output-matches-display     - what a copy, export or download control delivers equals what the
//                                page shows; the condition names that control in outputs
//   persists-across-navigation - a setting (language, theme) survives a reload and a move to
//                                another page
export type PropertyRelation =
  | 'count-matches-request'
  | 'all-unique'
  | 'format-conformance'
  | 'covers-all-pairs'
  | 'output-matches-display'
  | 'persists-across-navigation';
//   round-trip             - converting there and back returns the original, within the precision
//                            the page states
//   idempotence            - applying the operation to its own output changes nothing
//   symmetry               - swapping the two inputs mirrors the result
//   permutation-invariance - reordering the input does not change the result
export type MetamorphicRelation =
  'round-trip' | 'idempotence' | 'symmetry' | 'permutation-invariance';

// Whether every parameter value in a TestCondition's vector is drawn from a 'valid' partition (or
// the inclusive/still-inside side of a boundary) - 'negative' when one is an 'invalid'-kind
// partition, the value one step past a boundary, or a checklist probe (checklist values are
// malformed/injection-class by construction, always 'negative'). Never more than one: the first
// rejected value would hide what the application does with the second.
export type TestConditionScenario = 'positive' | 'negative';

export interface TestCondition {
  // sha256(routeId + '|' + (technique === 'architectural-invariant' ? (negativeCategory || '') + '|' + description : a condition the analysis wrote ? technique + '|' + (relation || '') + '|' + description : JSON.stringify(sorted [paramName, value] tuples))).slice(0, 16)
  // - the generator fills it in on a condition the analysis wrote without one.
  conditionId: string;
  // paramName -> partitionId for technique: 'combinatorial' and 'equivalence-partition'. For
  // technique: 'boundary-value' or 'checklist-based', the target parameter's own entry holds the
  // literal probe/checklist value instead of a partitionId. For technique: 'architectural-invariant',
  // parameters is empty ({}) or holds relevant route context.
  parameters: Record<string, string>;
  technique: TestConditionTechnique;
  // One human-readable sentence synthesized deterministically from the vector's own resolved
  // values (partition sampleValues, or the literal boundary/checklist probe) and the outcome below,
  // or authored by the agent for architectural invariants. This is what a human actually reviews
  // at sign-off; parameters/technique above remain the machine-consumable form.
  description: string;
  // What a person should observe - the expected result a test case asserts. Generated conditions
  // take it from the partitions and boundaries they draw on (a negative one carries exactly one
  // invalid value, so its outcome is that value's own); an architectural invariant states its own.
  expectedOutcome: string;
  // Present only when the condition cannot be driven through the page's own controls - copied from
  // the invalid partition it carries.
  executionLevel?: 'dom' | 'api';
  // Required on 'property' and 'metamorphic' conditions, from the list matching the technique.
  relation?: PropertyRelation | MetamorphicRelation;
  // 'property' and 'metamorphic': what the (first) run enters, concretely enough to reproduce.
  sourceInput?: string;
  // 'metamorphic' only: how the second run's input is derived from the first run or its output.
  followUpInput?: string;
  // Inventory ids of the output controls (copy, export, download) this condition checks.
  outputs?: string[];
  scenario: TestConditionScenario;
  // Closed taxonomy category for negative scenarios. Applicable strictly when scenario === 'negative';
  // required when technique === 'architectural-invariant'.
  negativeCategory?: NegativeCategory;
  verification: VerificationContract;
  isSpeculative: boolean;
  reviewed: boolean;
  // Who set reviewed:true - 'human' for an actual approval (in conversation or ticked in the review
  // file), 'auto-pilot' only when /ground-zero-setup's auto-pilot mode set it on the user's own
  // explicit pre-authorization. Required once reviewed is true (mechanically enforced); expected but
  // not mechanically enforced to be absent while reviewed is false.
  reviewedBy?: 'human' | 'auto-pilot';
  // A person cut it at the review. It stays in the file, so the cut is visible and can be undone, but
  // it is never reviewed, nothing downstream uses it, and the generator does not bring it back.
  cut?: boolean;
  // The feature this condition belongs to - one of the route's features in the feature map. The
  // review lists conditions by feature, ordered by priority.
  featureId: string;
  layer: ConditionLayer;
  // Where the expected result comes from; see OracleSource for what that means for the condition.
  oracle: OracleSource;
  // What the condition rests on - at least one. The generator fills these for its own conditions.
  anchors: Anchor[];
  origin: ConditionOrigin;
  // Required on every condition not 'generated'; the generator gives its own a default by technique.
  risk: Risk;
  // likelihood x impact on a 1-3 scale each, and the priority tier it lands in - both computed by the
  // generator on every run.
  riskScore: number;
  priority: Priority;
  // Optional, from the analysis: why this might be a check for the check's sake. Shown to the person
  // reviewing; it removes nothing.
  valueNote?: string;
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
  // feature-map.json.
  routeId: string;
  parameters: Parameter[];
  // Every field in the route's inventory outside the site frame (header, navigation, footer,
  // sidebar) is either a parameter, by its control id, or listed here - enforced by
  // scripts/validate-test-conditions.mjs, since a field nobody accounted for is a field nothing
  // downstream tests.
  excluded?: ExcludedControl[];
  constraints: ConstraintRule[];
  conditions: TestCondition[];
  unsatisfiedPairs: UnsatisfiedPair[];
  // site-map.json contentHash cheap-skip for the extraction step, same idiom as feature-map.json.
  sourceContentHash: string;
  // Hash of this entry's parameters+constraints at the last generation pass - the generator
  // recomputes and compares this to decide whether conditions[] needs to be regenerated.
  sourceParamsHash: string;
  analyzedAt: string;
}

export interface TestConditionsReport {
  schemaVersion: 3;
  generatedAt: string;
  basis: TestBasis;
  // The one route whose entry carries the site frame's own fields - the header's language switcher,
  // the theme toggle - so they are tested once rather than on every page or on none. Usually the
  // route with the fewest fields of its own. Every other route leaves the frame out.
  frameRouteId?: string;
  // One analysis per reviewed feature of the feature map, keyed by featureId.
  features: Record<string, FeatureAnalysis>;
  routes: Record<string, TestConditionsEntry>;
}
`;
}
