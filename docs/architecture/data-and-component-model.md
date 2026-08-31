# Data & Component Model

Part of [EITR Architecture](README.md).

## Core data types

- **`StackProfile`** (versioned schema - the detect↔generate contract): `framework`,
  `uiLibraries[]` (id + resolved version + `dependencyKind` direct/transitive), `packageManager`,
  `playwrightVersion`, `moduleSystem` (ESM/NodeNext vs CJS - decides `.js` import extensions),
  `testIdAttribute`, `selectorStrategy`, a `target` identity (monorepo workspace), per-field
  `confidence`, structured `evidence` (`{file, matchedPattern}`), and `source`
  (`package.json`|`lockfile`|`live`|`manual`).
- **`GenerationPlan`** - an ordered list of `FileDescriptor { path, writePolicy, provenance,
content|template+data, hash }`. Pure data, snapshot-testable, the unit AI polish would transform
  if that path is ever built. The hash is computed over the final emitted bytes at emission time -
  after any polish - so a re-run doesn't mistake polished content for a hand-edit.
  `writePolicy ∈ { regenerate, create-if-absent (overrides seeds), merge-fragment (config) }`.
- **`Manifest`** - every generated path + content hash + `writePolicy` + engine version + the
  previous `StackProfile` content (for delta/prune) + the manifest's own schema version.

## Component model

```ts
type Scope = Page | Locator | FrameLocator; // FrameLocator ⇒ iframes are modelled

type LocatorSpec =
  // discriminated union (kind tag)
  | { kind: 'role'; role: AriaRole; name?: string | RegExp; exact?: boolean }
  | { kind: 'testId'; testId: string }
  | { kind: 'label'; label: string | RegExp }
  | { kind: 'text'; text: string | RegExp }
  | { kind: 'css'; css: string }
  | { kind: 'custom'; resolve: (s: Scope) => Locator; why: string }; // must justify

abstract class Component {
  readonly locator: Locator;
  constructor(scope: Scope, spec: LocatorSpec) {
    /* exhaustive switch, no await */
  }
  static fromLocator<T>(this: Ctor<T>, loc: Locator): T {
    /* wrap existing — for Collection/.nth */
  }
  page(): Page {
    return this.locator.page();
  }
}
```

- **`LocatorSpec` is a discriminated union** (`kind`) → exhaustive `switch` + `assertNever`;
  key-overlap becomes a type error (programmatic construction bypasses excess-property checks).
- **`custom` carries a justification** and is hard-tagged lowest confidence - the escape hatch
  can't silently dodge the ladder.
- **`fromLocator`** is a first-class construction path; `Collection`/`.nth()`/`Table` need it.
- **`ComponentClass<T>` is modelled as `new (scope, spec) => T`** (constructor only). This keeps
  generic inference unambiguous - `new Collection(loc, Row)` infers `Collection<Row>` with no
  explicit type arg - and it rejects descriptor-ctor components like `Select` from collections at
  compile time (their ctor doesn't take a `LocatorSpec`). `Collection.nth()` reaches the inherited
  static `fromLocator` via one internal cast - the only cast in the base, kept in library plumbing
  so user Page Objects stay generics-free.
- **The locator ladder is a function of `selectorStrategy`**, not a constant: test-id-first for
  instrumented apps (stable under i18n/copy changes), role-first otherwise. Order otherwise:
  `role+name → label → text → testId → css`.
- **Provenance is generation-time data** (in the plan/manifest - drives which code is emitted). It
  is not a runtime instance field.
- **`Container extends Component`** - typed factories pass `this.locator` as scope; an optional
  container passes `page`. **`BasePage`** holds `page`, a `path`, `goto()`, lazy getters.
  **`Collection`** wraps a locator: `.nth`/`.first`/`.last`, `.filter`, `.countNow()`, `.allNow()`
  (both `Now`-suffixed per the Method Safety Contract below - one-shot snapshots, not retrying
  assertions); cardinality is asserted via `expect().toHaveCount()`.
- **The `Page | Locator | FrameLocator` `Scope` union above is TypeScript/JS Playwright-specific.**
  Python, Java, and C# components are constructed from an already-resolved locator, not a
  `(scope, spec)` pair, so none of them has (or needs) a polymorphic `Scope` type. Each language's
  `FrameContainer` is instead a self-contained class that resolves the language's own
  frame-locator primitive directly from whatever locator/page it is given and exposes its own
  frame-scoped child/collection factory methods:
  - **Python** - `FrameContainer.__init__(self, scope: Page | Locator, selector: str)` calls
    `scope.frame_locator(selector)` (`playwright.sync_api`'s frame-locator primitive) and exposes
    `_child_in_frame(cls, selector)` / `_list_in_frame(cls, selector)` (leading underscore, matching
    the `_scope` naming convention on the base `Scope` class).
  - **Java** - `FrameContainer(Locator scope, String selector)` calls `scope.frameLocator(selector)`
    and exposes `childInFrame(Function<Locator, T>, String)` / `listInFrame(...)`, mirroring the
    `Function<Locator, T>` factory idiom `Collection<T>` already uses.
  - **C#** - `FrameContainer(ILocator scope, string selector)` calls `scope.FrameLocator(selector)`
    and exposes generic `ChildInFrame<T>` / `ListInFrame<T>` factory methods.
  - **Cypress** has no `FrameLocator` analogue (cross-origin iframes are out of Cypress's default
    model), so it does not get a `FrameContainer` at all - this is a deliberate scope exclusion, not
    a gap.

## Overlays & portals

A control's _logical_ scope (which container it conceptually belongs to) is separate from its _DOM_
scope (where an overlay/dialog/dropdown actually renders - often a portal attached near
`document.body`, not nested under its trigger). Overlay locators resolve from the page root, not
from the trigger's container; multiple/nested overlays disambiguate by topmost / `[aria-modal]`.
Because ARIA linking between a trigger and its overlay (`aria-controls`) is unreliable in practice
(rarely wired correctly by Ant Design, virtualized lists, typeahead, tooltips, nested dialogs), a
component can declare a **reveal recipe** (open / type / scroll / hover) describing how to drive the
UI into the state where the target actually exists, rather than relying on ARIA alone.

## Method Safety Contract

Every component/primitive method is exactly one of three shapes, mechanically enforced CI-red by
`scripts/lint-cpom.js` in generated projects (and `test/contract.test.ts` in this repo):

- **Action** - a mutation. Auto-waiting, returns `Promise<void>` (or the language-native
  equivalent). Relies on the framework's native auto-waiting, never a manual `sleep`/`setTimeout`.
- **Producer** - a sub-component or locator getter. Synchronous, no `await`, no network operation
  inside it.
- **`...Now()` snapshot read** - a point-in-time state read. Returns a raw primitive value only
  (never a boolean wrapped for assertion), suffixed with `Now` (`isVisibleNow()`, `textNow()`), and
  does not auto-retry.

**No assertions inside components.** `expect(...)`/`assert` calls belong exclusively in test spec
files - components only expose locators, actions, and state readers.
