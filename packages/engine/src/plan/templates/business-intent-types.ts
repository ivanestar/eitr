// Template for generating .scaffold/schemas/business-intent.types.ts, the typed contract for
// docs/analysis/business-intent.json (Stage 1 of the app-analysis pipeline). create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not docs/ - see site-map-schema.ts's header
// comment for why.
//
// Deliberately a plain TypeScript interface file, not a JSON Schema document: this repo's own
// deterministic core already settled on "typed interface + schemaVersion literal, checked only by
// tsc, no runtime validator" (StackProfile/GenerationPlan, packages/engine/src/types/) rather than
// the JSON-Schema-file approach site-map.schema.json takes - and that approach is itself unenforced
// here (no ajv dependency anywhere; the only test touching it checks the file exists, not its
// shape). Real mechanical enforcement for this artifact comes from
// scripts/validate-business-intent.mjs instead (see business-intent-validator.ts).

export function renderBusinessIntentTypes(): string {
  return `// Typed contract for docs/analysis/business-intent.json, produced by the /map-site skill's
// optional business-intent analysis step (Step 6). Reference this file when reading or writing
// that JSON - it is documentation-as-code, not a compiled/imported module: nothing in this project
// imports it at runtime. scripts/validate-business-intent.mjs enforces its shape mechanically.

export type Confidence = 'high' | 'medium' | 'low';

// Four levels rather than the usual three (high/medium/low): a payment or auth route deserves its
// own tier above a generic "high," not lumped in with it.
export type CriticalityTier = 'critical' | 'high' | 'medium' | 'low';

// Which already-rendered, read-only signal grounded a Field<T>'s value. This analysis step
// performs zero .click()/.fill()/.check()/.selectOption() calls, not even trial:true dry-runs -
// see /map-site's own Step 6 instructions for the full rule.
export type BusinessIntentSource =
  'route-path' | 'heading-text' | 'form-labels' | 'button-link-text' | 'aria-roles' | 'manual';

export interface Evidence {
  signal: BusinessIntentSource;
  excerpt: string;
}

// Same wrapper shape as this project's own StackProfile Field<T> (value, confidence, source,
// evidence) - a distinct type here, not an import: that type is internal to the deterministic
// StackProfile detection pipeline, while this artifact is produced entirely by an AI agent inside
// this generated project. The structural convention is intentionally identical.
export interface Field<T> {
  value: T;
  confidence: Confidence;
  source: BusinessIntentSource;
  // Names which checklist criterion or confidence-rule branch this value matched - never a
  // restatement of an evidence excerpt. Lets a human reviewer see WHY, not just WHAT, without
  // re-deriving the inference themselves.
  reasoning: string;
  evidence: Evidence[];
}

// One plausible one-sentence description of what the application's primary purpose is, grounded in
// evidence gathered across the whole crawl (not just one route) - never invented without a real
// signal behind it.
export interface CorePurposeCandidate {
  value: string;
  evidence: Evidence[];
}

// App-level (not per-route) inference, drafted once per crawl and confirmed once by the human
// before it's used to adjust any route's criticalityTier - see /map-site Step 6's Core-Purpose
// Inference/Confirmation/Re-Derivation sub-steps. Optional on the report as a whole: an existing
// business-intent.json from before this feature existed simply has none, and downstream readers
// must treat its absence the same as an unconfirmed one - never assume a purpose that was never
// drafted.
export interface CorePurpose {
  // 2-4 plausible candidates the model drafted from evidence - never just one, so the human has a
  // real choice rather than a single take-it-or-leave-it guess.
  candidates: CorePurposeCandidate[];
  // Index into candidates the model's own evidence most strongly supports - shown to the human as
  // the recommended default, never auto-selected without their confirmation.
  mostLikelyIndex: number;
  // Set once the human has picked a candidate or described the purpose in their own words -
  // interpreted into the same Field<T> shape every other inference in this artifact uses.
  // source: 'manual' when built from the human's own free text; otherwise the picked candidate's
  // own strongest evidence signal.
  selected?: Field<string>;
  reviewed: boolean;
  reviewedBy?: 'human' | 'auto-pilot';
}

export interface BusinessIntentEntry {
  // Joins against docs/site-map/site-map.json's routes[*].routeId - routeId, not the path
  // template key, because routeId is documented there as stable across a URL restructure, and
  // this artifact is a separate file with its own lifecycle.
  routeId: string;
  businessFeature: Field<string>;
  criticalityTier: Field<CriticalityTier>;
  // Copy of site-map.json's routes[routeId].contentHash at the moment this entry was inferred.
  // A re-run compares the CURRENT site-map.json contentHash for this routeId against this
  // stored value: unchanged means the route's structure hasn't moved and inference is skipped
  // for it, mirroring site-map.json's own update-mode cheap-skip logic.
  sourceContentHash: string;
  analyzedAt: string;
  // False until a human has reviewed this entry per /map-site's Human Sign-Off Gateway. No other
  // skill or agent should treat an entry with reviewed: false as ground truth.
  reviewed: boolean;
  // Who set reviewed:true - 'human' for an actual conversational approval, 'auto-pilot' only when
  // /ground-zero-setup's auto-pilot mode set it on the user's own explicit pre-authorization.
  // Required once reviewed is true (mechanically enforced); expected but not mechanically
  // enforced to be absent while reviewed is false.
  reviewedBy?: 'human' | 'auto-pilot';
}

export interface BusinessIntentReport {
  schemaVersion: 1;
  generatedAt: string;
  // App-level, not per-route - see CorePurpose's own doc comment. Absent until Step 6's
  // Core-Purpose Inference sub-step runs at least once.
  corePurpose?: CorePurpose;
  // Keyed by routeId (see BusinessIntentEntry.routeId), unlike site-map.json's own routes object
  // which is keyed by canonical path template - resolve a path with
  // Object.values(siteMap.routes).find(r => r.routeId === id) or a one-time routeId index.
  routes: Record<string, BusinessIntentEntry>;
}
`;
}
