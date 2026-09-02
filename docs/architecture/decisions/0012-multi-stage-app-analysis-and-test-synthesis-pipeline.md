# 0012: App-analysis and requirements-to-test synthesis as a staged, gated pipeline in the assistant layer

**Status:** Accepted

## Context

`TODO.md`'s strategic backlog and `docs/architecture/known-gaps.md` have accumulated several
overlapping, independently-proposed capabilities that all boil down to the same underlying job -
turning a live application, a requirements source, or an existing (legacy) test suite into new,
reviewable test coverage: a requirements-to-test-case agent, `/legacy-audit` (reference-mining from
an existing Selenium/Cypress/old-Playwright suite), and a Requirements-Diff Agent (comparing a TMS
ticket against a generated test's `test.step()` sequence). Each was speced separately, with no
shared architecture, which risks three different ad hoc implementations of the same "read
unstructured source → infer structured test intent → synthesize code" problem, each with its own
gaps and its own review surface.

This capability is also large enough, and touches enough already-settled ground, that it needs its
own decision before any implementation work starts: it inherently requires LLM judgment (inferring
business intent from a live DOM or prose requirements, arbitrating disagreement between three
sources of truth), which [0002](0002-no-llm-in-core.md) already excludes from `detect()`/`plan()`/
`apply()`. It also crawls a live, real, possibly-production application, which is different in kind
from `/map-site`'s existing read-only route/widget mining and carries genuine risk (destructive
mutations, session/credential exposure) if built without deliberate safeguards. Left undecided, a
future implementation attempt has no answer to "does this belong in the deterministic core or the
assistant layer" and no design precedent for how a multi-step AI pipeline should hand off state
between steps without either re-litigating everything in one giant prompt or losing intermediate
work to context loss.

## Decision

When built, requirements/app-analysis-to-test synthesis is a capability of the AI-assistant layer
(per [0010](0010-agent-operations-as-skills-not-cli.md)), never the deterministic `plan()`/`apply()`
core, and follows three structural rules that already govern the rest of EITR's AI-agent surface:

1. **Staged, typed hand-offs, not one large opaque pass.** The pipeline decomposes into discrete
   stages (e.g. feature/intent discovery, test-condition derivation, test-level/journey placement,
   spec synthesis), each stage consuming and producing a small, typed, on-disk artifact under
   `docs/analysis/` - mirroring how `plan()`/`apply()` already hand off through a typed
   `StackProfile`/`GenerationPlan` rather than one monolithic function. A stage's output is
   inspectable and resumable independent of the stages around it; nothing depends on holding the
   entire analysis in one model context window.
2. **Mechanical gate before judgment gate.** Every stage boundary validates the artifact's shape and
   internal consistency (schema conformance, dangling references, size/scope limits) with zero model
   involvement before an LLM or a human ever reviews its content - the same two-tier pattern Protocol
   123 already uses (mechanical checks first, `review-arbiter` judgment second) and for the same
   reason: a shape defect is cheaper and more reliably caught by code than by asking a model to
   notice it.
3. **Human sign-off before code, live-app safety by default.** Test-file generation from a synthesized
   spec goes through the same kind of explicit human sign-off gateway `/automate-ticket` already
   uses - no code is written until a human approves the proposed scenario. Any stage that interacts
   with a live application inherits `/map-site`'s read-only default and additionally treats
   destructive-looking actions (account deletion, payment, logout, irreversible state changes) as
   quarantined-by-default, never auto-executed, consistent with this project's "augmentation, not
   replacement" governing principle (`README.md` Introduction).

`/legacy-audit` (mining an existing test suite for reference intent) and the Requirements-Diff Agent
(comparing a ticket against a generated test) are subsumed as entry points/consumers of this same
pipeline rather than separate, independently-built features - see Consequences.

This capability is **not implemented**. `known-gaps.md` continues to be the accurate record of that.
This ADR settles the shape a future implementation must take and where it lives in the architecture,
not a commitment to build it on any particular timeline.

## Alternatives Considered

- **Free-form agent exploration with no staged pipeline** (one agent reads the app/requirements and
  writes tests end-to-end in a single autonomous pass). Rejected: non-reproducible, no natural point
  to deduplicate against existing `components/`/`docs/site-map.json` state, and no artifact exists
  for a human to review before code is written - directly at odds with the human sign-off gateway
  `/automate-ticket` already established as this project's norm for AI-authored tests.
- **Fold app/requirements analysis into the deterministic `plan()`/`apply()` core** so it runs as part
  of `eitr new`. Rejected: this is exactly what [0002](0002-no-llm-in-core.md) already excludes -
  deep app/requirements analysis is inherently a judgment task (inferring business intent, resolving
  conflicting sources), not a pure function of a resolved `StackProfile`.
- **Build the three backlog items (`/legacy-audit`, Requirements-Diff Agent, requirements-to-test
  agent) as separate, independent features**, each solving its own narrower slice. Rejected: they
  decompose into the same stages (structured-intent extraction, then synthesis/comparison against
  that intent) and would otherwise duplicate the mechanical-gate/typed-artifact machinery three times
  for no benefit.
- **Implement the whole pipeline in one undivided effort** once this ADR exists. Rejected: the scope
  (a live-app crawler with its own safety model, several new deterministic algorithms, a new TMS
  integration surface, a multi-stage AI pipeline) is large enough that a single implementation pass
  has no natural checkpoint for course-correction. Matches how the CPOM, CI/CD, and TMS-adapter axes
  were each closed independently through their own bounded, research-backed scope rather than one
  combined effort - the same discipline applies here: each stage/entry-point becomes its own SDD plan
  and its own reviewable unit of work.

## Consequences

- `ai-agent-integration.md`'s 4-layer structure and `known-gaps.md`'s "Requirements → test-case
  generation" entry are unchanged by this ADR - nothing here is live yet.
- A future implementation is committed to typed, on-disk, inspectable hand-offs between stages and to
  a human sign-off gate before code generation; a design that skips either would need a new ADR
  superseding this one, not a quiet deviation during implementation.
- `/legacy-audit` and the Requirements-Diff Agent stop being independent backlog proposals and become
  scoped entry points into this pipeline - `TODO.md`'s strategic backlog should be read accordingly
  the next time either is picked up.
- Before any code lands, the actual first slice to build (e.g. just the live-app analysis stage, or
  just typed test-condition derivation from an existing ticket) still needs its own dedicated SDD
  plan, scoped and reviewed on its own - this ADR is a precondition for that work, not a substitute
  for it.
