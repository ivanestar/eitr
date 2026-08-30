# 0003: Universal primitives + per-role adapters

**Status:** Accepted

## Context

Target applications use dozens of UI libraries (MUI, Ant Design, Radix, Chakra, plain HTML, and many
more this project will never have a dedicated adapter for). A component library needs to work
reasonably out of the box for a library it has never seen, while still taking advantage of accurate,
library-specific locator strategies where one is known.

## Decision

Ship universal primitives (a role/test-id-driven locator ladder that works against any semantically
reasonable markup) as the always-available fallback, plus a small set of per-UI-library adapters
(MUI, Ant Design, Radix) that resolve locator strategy **per component role**, not per whole
library. An adapter only needs to cover the roles it actually improves on; any role it returns `null`
for falls back to the universal primitive automatically.

## Alternatives Considered

- **One adapter per library covering every role, no universal fallback.** Rejected: an app using an
  unsupported library (or a library adapter that's only partially built) would get nothing, instead
  of a reasonable degraded experience.
- **A single universal implementation, no adapters at all.** Rejected: some libraries render
  semantically ambiguous markup (e.g. a MUI `Select` isn't a native `<select>`) where a
  library-aware strategy is meaningfully more reliable than a generic one - not adapting for these
  costs real locator accuracy.

## Consequences

- New UI-library support is additive (a new adapter registered against the same interface), not a
  rewrite of the primitive layer.
- A component role an adapter doesn't yet cover degrades gracefully to the universal primitive
  rather than failing to generate - partial adapter coverage is a normal, expected state, not a bug.
