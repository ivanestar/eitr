# 0002: No LLM in the plan/apply core

**Status:** Accepted

## Context

EITR's differentiator (see the product vision in [`README.md`](../README.md)) is being a
_deterministic_ base layer that AI agents build on top of indefinitely. If the generator itself
called an LLM to decide what to emit, a bad model response (or just model drift over time) would
make the same `eitr new` invocation produce different, unreviewable output on different runs -
undermining the one property this layer is supposed to guarantee.

## Decision

`detect()`, `plan()`, and `apply()` never call an LLM or reach the network for anything other than
fetching the target app's own start page for stack detection. Every file the engine can emit is a
pure function of the resolved `StackProfile` and the user's questionnaire answers. Anything that
needs judgment, live-DOM interpretation, or natural-language understanding is explicitly deferred to
the AI-assistant layer that operates on the generated project afterward, not folded into generation.

## Alternatives Considered

- **Call an LLM during `plan()`/`apply()`, e.g. to pick adapter/locator strategy from a live DOM
  snapshot.** Rejected: makes the core's output non-reproducible and API-key-dependent, and puts an
  LLM in the one place this project is supposed to guarantee determinism.
- **Optional "AI polish" pass between `plan()` and `apply()`** (considered, never built): a
  `GenerationPlan → GenerationPlan` transform that fits locators to a real DOM only when a live
  source of truth is available. Not implemented - superseded by doing this work at the AI-assistant
  layer instead (`/scan-and-generate-pom`), where the assistant already has live browser access and
  a human in the loop, rather than as a headless step inside `apply()`.

## Consequences

- `detect/plan/apply` stay fast, offline-capable (aside from the initial stack-detection fetch), and
  fully unit-testable without mocking an LLM.
- Any capability that genuinely needs an LLM (test synthesis from a TMS ticket, DOM-driven locator
  authoring, trace-based healing) lives in the AI-assistant skill layer, never in the engine
  package - see [`ai-agent-integration.md`](../ai-agent-integration.md).
