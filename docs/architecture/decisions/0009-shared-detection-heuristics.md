# 0009: Shared stack-detection heuristics between CLI and engine

**Status:** Accepted

## Context

The CLI questionnaire's URL pre-fill hint and the engine's own `recon()` (which drives actual
generation decisions) each hand-rolled a separate framework/UI-library regex heuristic against the
same kind of input (a fetched HTML page). Because they were independent implementations, they could
disagree about the same URL - the wizard could hint "React" while the engine's own detection
resolved to something else at generation time, with no mechanism keeping them in sync as either one
was tuned.

## Decision

Extract one shared heuristics module (`packages/engine/src/detect/stack-heuristics.ts`) that both
the CLI's pre-fill hint and the engine's `recon()` call. There is exactly one implementation of
"what does this HTML look like," used by both call sites.

## Alternatives Considered

- **Keep two implementations, add a test asserting they agree on a fixed set of sample pages.**
  Rejected: this only catches divergence for the specific samples tested, not the general case, and
  still requires remembering to update both places for every heuristic change.
- **Make the CLI hint call the full `recon()` and use its result as-is, without extracting a shared
  module.** Considered as the immediate fix, and is in fact what `detect.ts` now does - but the
  underlying heuristics still needed to be as good as the CLI's independently-tuned version, which
  had stronger signals (Next.js/Nuxt/SvelteKit build-artifact detection) than `recon()`'s original
  heuristics. Extracting a shared module let both call sites benefit from the stronger heuristics,
  rather than the engine silently keeping its weaker original ones.

## Consequences

- A heuristic improvement (a new framework signature, a false-positive fix) benefits both the wizard
  hint and actual generation in one change, with no possibility of the two drifting apart again.
- The CLI package now depends on the engine package for this (`import { recon } from '@eitr/engine'`)
  rather than owning its own detection logic - an intentional simplification, not a layering
  violation, since the CLI already depends on the engine for `plan`/`apply`.
