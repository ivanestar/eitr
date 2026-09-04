# 0004: Unconditional path authority on regeneration

**Status:** Accepted

## Context

Re-running generation against an existing project (a new engine version, a changed stack profile)
needs a clear rule for what happens to a tool-owned file the user has since hand-edited. A rule
based on "only overwrite if unmodified" (hash-gated) sounds safer but creates an ambiguous third
state: files that are neither cleanly regeneratable nor a real user extension, silently drifting out
of sync with the engine's current template.

## Decision

The owned tree is **authority by path, not by content hash**. Every path with `writePolicy:
regenerate` is overwritten unconditionally on every `apply()`, and a diff of anything clobbered is
printed so the user sees exactly what was lost. The per-file content hash exists for delta reporting
and is warn-only - it never blocks a regeneration. "Never overwrite" applies strictly and only to
`writePolicy: create-if-absent` paths (user config, seed files) - those are never touched by
regeneration, full stop.

## Alternatives Considered

- **Hash-gated overwrite (only regenerate an unmodified file).** Rejected: it produces a third,
  ambiguous state - a hand-edited "owned" file that regeneration now silently skips forever, drifting
  further from the current template with each engine update, with no clear signal to the user that
  this has happened.
- **Prompt interactively on every conflicting file.** Rejected: breaks non-interactive/CI use, and
  doesn't scale past a handful of conflicts.

## Consequences

- Real customization happens by building on top of the owned tree (a Page Object importing from
  `components/`, a test importing from `shared/`), never by editing a tool-owned file directly -
  that edit is always temporary and lossy. An earlier version of this design routed customization
  through a dedicated `overrides/` directory instead; removed (2026-09) as unused ceremony no
  generated project's own conventions actually needed - the same `create-if-absent`/`writePolicy:
regenerate` split this ADR establishes already gives every layer a real extension point without
  a separate directory.
- A user who forgets this rule loses hand-edits on the next regen - the printed diff is the safety
  net, not prevention. This is an accepted, deliberate trade-off for keeping the owned tree
  trustworthy rather than silently stale.
