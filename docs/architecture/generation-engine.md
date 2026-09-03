# Generation Engine

Part of [EITR Architecture](README.md).

## Pipeline

`detect() → StackProfile` · `plan(profile) → GenerationPlan` (pure, in-memory) · `apply(plan, fs)`
(the only step that touches disk). The CLI runs these with no LLM call anywhere in the path - see
[`decisions/0001-deterministic-core-only-scaffolder.md`](decisions/0001-deterministic-core-only-scaffolder.md).
**Invariant: `plan()` never touches the network or an LLM; unknowns become fail-loud stubs, not
"smart" guesses.**

Engine ships as its own versioned package (`@eitr/engine`) with a public typed API. The CLI is a
peer consumer over that typed contract - it does not shell out to or reach into engine internals.

## Stack detection

Trust order: `package.json` for presence (robust) → lockfile only to resolve an exact version →
manual override. Live-URL sniffing (fetching the target's start page and pattern-matching the HTML)
gets the same skeptical treatment as any probabilistic signal: it carries a `confidence` level and
`evidence`, never a silent default. The same heuristics module
(`packages/engine/src/detect/stack-heuristics.ts`) backs both the CLI questionnaire's pre-fill hint
and the engine's own `recon()`, so the two can never disagree about what a given URL looks like -
see [`decisions/0009-shared-detection-heuristics.md`](decisions/0009-shared-detection-heuristics.md).

## Extension seam (what makes "extensible" real)

1. **`Adapter` interface** - `id`, `appliesTo(profile)` (library-level), `strategyFor(role) →
Descriptor | null` (per-role; `null` ⇒ fall back to a universal primitive), so an adapter never
   needs to cover the whole component taxonomy.
2. **Component-role taxonomy** - a closed enum both primitives and adapters implement.
   Additive-only within a major version (new roles only; rename/remove is a major bump).
3. **`Descriptor` schema** - the adapter↔base emission contract, versioned like the interface.
4. **Registry** - deterministic precedence; extensions register via `playwright.config.ts`
   (`adapters: string[]`), never by editing engine source.
5. **`StackProfile` schema** - the detect↔generate contract, versioned.

Adapters currently resolved: MUI, Ant Design, Radix, plus universal primitives as the fallback for
any role no adapter claims.

## Polyglot registry (language & tool adapters)

`LanguageAdapter` (`id` matches `PlanOptions.language`: `typescript`/`python`/`csharp`/`java`) and
`ToolAdapter` (`id` matches `PlanOptions.automationTool`: `playwright`/`cypress`/`pytest`/`maven`/
`gradle`) each expose one method, `planFiles(profile, opts) → FileDescriptor[]`, and are looked up by
`id` rather than switched on inline - adding a language or tool means implementing one of these two
interfaces and registering it, not touching `plan()`'s own logic. This is the layer that keeps a
generated test's own code independent of which language/runner combination produced it: the same
separation a test automation architecture generally draws between defining a test and adapting it to
a specific technology stack, just applied to code generation rather than execution.

## Idempotency & re-run (path authority)

- **Edited an owned file** → overwritten on regen; a diff of the loss is printed (the per-file hash
  is warn-only, never a block on its own).
- **Profile changed** → diff new vs. previous profile (stored in the manifest), add/remove adapter
  outputs, prune dead `regenerate` files, report the delta.
- **Engine version bump** → owned tree fully regenerated; warn if a user extension is pinned to an
  older contract. The manifest carries its own schema version for self-migration.
- **Interrupted run** → staged to a temp dir with atomic rename, two-phase manifest (intent →
  commit), so an interrupted run is unambiguous: orphans are owned paths, simply overwritten next
  run. No wedged tree.

See [`decisions/0004-path-authority-regeneration.md`](decisions/0004-path-authority-regeneration.md)
for why this is unconditional rather than a hash-gated "only if unmodified" overwrite.
