// Template for generating .scaffold/schemas/feature-map.types.ts, the typed contract for
// artifacts/analysis/feature-map.json. create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as business-intent-types.ts and
// test-conditions-types.ts - real mechanical enforcement comes from scripts/validate-feature-map.mjs
// instead.

export function renderFeatureMapTypes(): string {
  return `// Typed contract for artifacts/analysis/feature-map.json, produced by scripts/derive-feature-map.mjs
// (the deterministic draft) and the /map-features skill (the human's corrections on top of it).
// Reference this file when reading or writing that JSON - it is documentation-as-code, not a
// compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-feature-map.mjs enforces its shape mechanically.
//
// Why this file exists at all: every other artifact in this pipeline is keyed by route, which makes
// the application's navigation the backbone of the whole test model. That describes how the system
// is organized, not what a person does with it, and it cannot express the one fact most test design
// depends on - that a thing created on one screen has to show up on another. Features and entities
// are that missing spine; routes become where a feature is reachable rather than the unit of
// meaning itself.

// Which already-collected signal a claim rests on. Every one of these is read-only: derived from
// traffic already observed during the crawl, markup already rendered, or a route path already
// mapped - nothing here triggers a new request or a new interaction.
export type FeatureMapSource =
  | 'api-resource'          // a (method, pathTemplate) group in api-contracts.json
  | 'api-payload-field'     // an id-shaped field name in a request payload
  | 'api-response-nesting'  // a nested object/array in a response body shape
  | 'route-convention'      // a path shape like /orders, /orders/new, /orders/{id}
  | 'ui-form'               // a form on a route, and where its submit went
  | 'ui-navigation'         // a navigation link between two routes
  | 'business-intent-label' // an already-reviewed businessFeature value from business-intent.json
  | 'human';                // stated by a person at sign-off

export interface FeatureEvidence {
  signal: FeatureMapSource;
  // <=100 chars, PII/session-data masked the same way every other evidence excerpt in this
  // pipeline is: a 6+ digit run or an 8+-char majority-digit token becomes [REDACTED].
  excerpt: string;
}

// Whether a claim was seen or worked out. REST resources and domain entities are not the same
// thing - a path shaped like a resource is a hypothesis about the domain, never proof of one - so
// anything derived from path or field-name convention alone is 'inferred' and stays that way until
// a human says otherwise at sign-off.
export type Confidence = 'observed' | 'inferred';

export type EntityOperationKind = 'create' | 'read' | 'list' | 'update' | 'delete';

export interface EntityOperation {
  kind: EntityOperationKind;
  // contractId from artifacts/site-map/api-contracts.json when this operation was actually seen in
  // traffic. Absent when only a route path or a form suggested it - which is exactly the case worth
  // telling apart, so never fill it in with a guessed contract.
  contractId?: string;
  // Routes this operation is reachable from, when known.
  routeIds: string[];
  confidence: Confidence;
  evidence: FeatureEvidence[];
}

// 'references' - this entity carries a pointer to another (an order carrying customerId).
// 'contains' - another entity is nested inside this one's own representation (an order carrying its
// line items). The distinction matters downstream: a reference means the target must already exist
// before this one can be created, which is a precondition; containment means the two are created
// and destroyed together, which is not.
export type EntityRelationKind = 'references' | 'contains';

export interface EntityRelation {
  kind: EntityRelationKind;
  targetEntityId: string;
  // The field that carries the link - 'customerId' for a reference, 'items' for containment. This
  // is what a human checks first when deciding whether the relation is real or two paths merely
  // looked alike.
  viaField: string;
  confidence: Confidence;
  evidence: FeatureEvidence[];
}

// The observed lifecycle of one entity, expressed as states and the transitions between them.
// Derived from which operations exist, and nothing else: an entity with a create and no delete
// genuinely has no observed way to remove one, and that absence is information rather than a gap to
// fill in. Richer domain states ("paid", "shipped") cannot be read off traffic at all - they come
// from a person, via /map-features' own questions, and land here with source 'human'.
export interface LifecycleState {
  name: string;
  // True for the state an entity is in before it exists at all - there is exactly one.
  initial: boolean;
  // True for a state with no outgoing transition. An entity deleted and never recreated is
  // terminal; one that can be created again from 'absent' is not.
  terminal: boolean;
}

export interface LifecycleTransition {
  from: string;
  to: string;
  // What causes it - an operation kind for a derived transition, or a person's own words for one
  // they added ("refund is only allowed after payment clears").
  trigger: string;
  confidence: Confidence;
  evidence: FeatureEvidence[];
}

export interface EntityLifecycle {
  states: LifecycleState[];
  transitions: LifecycleTransition[];
}

export interface Entity {
  // sha256(name).slice(0, 16) - stable as long as the name is, so a human renaming an entity at
  // sign-off deliberately re-keys it rather than silently keeping a stale identity.
  entityId: string;
  // The resource name exactly as the application itself spells it ('orders', not 'Order'). No
  // singularization or prettifying is applied: an invented name is an invented fact, and a person
  // renaming this at sign-off is cheap where un-inventing one is not.
  name: string;
  operations: EntityOperation[];
  relations: EntityRelation[];
  lifecycle: EntityLifecycle;
  evidence: FeatureEvidence[];
  // False until a human reviews this entity and its relations. Nothing downstream may treat an
  // unreviewed entity as ground truth - the same rule business-intent.json's own entries follow.
  reviewed: boolean;
  reviewedBy?: 'human' | 'auto-pilot';
}

// The impact of a feature failing, on the same three-level scale business-intent.json already uses
// for routes. Not judged again here: it is the maximum tier across the feature's own reviewed
// member routes, because a feature is exactly as critical as the worst thing inside it - the same
// rule that already governs a single route carrying mixed functionality, applied one level up.
export type ImpactTier = 'high' | 'medium' | 'low';

export interface Feature {
  // sha256(name).slice(0, 16).
  featureId: string;
  name: string;
  // Every route this feature is reachable from. A route can belong to more than one feature; a
  // feature with several routes is the normal case and the whole reason this artifact exists.
  memberRouteIds: string[];
  entityIds: string[];
  impact: ImpactTier;
  // Which member route's own criticalityTier set the impact above, so a human can check the claim
  // against that route rather than re-deriving the maximum by hand. Absent when no member route had
  // a reviewed criticalityTier to draw from, in which case impact falls back to 'high' - an
  // unreviewed feature is treated as important until someone says otherwise, never the reverse.
  impactSourceRouteId?: string;
  evidence: FeatureEvidence[];
  reviewed: boolean;
  reviewedBy?: 'human' | 'auto-pilot';
}

export interface FeatureMapReport {
  schemaVersion: 1;
  generatedAt: string;
  // Keyed by featureId and entityId respectively - the same keyed-object convention every other
  // artifact in this pipeline uses, so a re-run's diff shows only what actually changed.
  features: Record<string, Feature>;
  entities: Record<string, Entity>;
  // Hash of the inputs this draft was derived from (site-map.json, api-contracts.json, and the
  // reviewed parts of business-intent.json). scripts/derive-feature-map.mjs compares it to decide
  // whether to redraft at all, preserving human review state when nothing upstream changed - the
  // same cheap-skip idiom as business-intent.json's sourceContentHash.
  sourceHash: string;
}
`;
}
