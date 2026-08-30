# Architecture

> Living design document. Status: **PIVOTED 2026-07-17 — see "Direction change" below.**
> The sections beneath it (§1–§10, hardened 2026-07-16) describe the earlier login-centric
> "verified login smoke" design and are SUPERSEDED where they conflict with the pivot — kept for
> reference and for the parts still reused. A full re-plan around the pivot is the next task.

## Direction change (2026-07-17) — universal, CORE-ONLY scaffolder

The product is a **universal polyglot scaffolder that generates the CORE of a UI-test framework**
(Playwright; across TypeScript, JavaScript, Python, Java, or C#) — nothing app-specific. Cypress
(TypeScript/JavaScript) support exists in the codebase but is temporarily withheld from the CLI
pending a CPOM primitive redesign native to its own retry/command-chain model rather than the
Playwright-shaped one it currently reuses.
Confirmed with the user after the earlier design drifted into a TS/Playwright login-specific slice.

**Flow:** minimal CLI questionnaire → quick headless recon of the target's start page → generate the
framework core tuned to the detected stack.

## Long-term product vision (2026-08-29) — deterministic base for a full SDET ecosystem

The scaffolder itself (this document's main subject) is deliberately the FIRST, deterministic layer
of a larger intended product, not the whole product. Stated by the project owner: the goal is that a
SDET arrives on a project, runs EITR once to deterministically stand up a framework core that is
genuinely production-grade (not cosmetic scaffolding), and from that point works with AI assistants
_on top of_ that base for the rest of the engagement — growing the framework and discharging ongoing
QA responsibility — rather than EITR being a one-shot tool with no further role. The MCP bridge, the
multi-assistant slash-command layer, and the TMS integrations exist because of this: they are the
seams through which AI agents keep operating on the generated framework long after `eitr new` exits,
not incidental extras. Planned/considered extensions along this axis (not yet built - see TODO.md's
"Идеи буста" section) include agents for requirements analysis and test-case generation driven from
application analysis or existing documentation, and other pieces that fit "one place, full SDET
lifecycle" access rather than a disconnected tool.

**Why this raises the bar on the deterministic base's own correctness**: because agents are expected
to build on top of the generated framework indefinitely, a defect in the base layer does not stay a
one-time bug - it gets inherited and amplified by every agent action layered on top of it afterward.
This is the concrete reason CPOM-contract correctness, cross-platform generation reliability, and
CI verification depth (Section 12/13 of `CLAUDE.md`/`AGENTS.md`) matter more here than they would for
a disposable one-shot generator, and should be weighed accordingly when triaging what's worth fixing
before a release vs. deferring.

**Governing design principle: augmentation, not replacement.** The project owner has stated this
explicitly and it should shape every future agent/automation design in this ecosystem: the goal is
NOT to remove the human SDET from any decision - it is to let one strong SDET operate at the
throughput of several by having tools and agents handle context assembly and analysis, while the
SDET retains all architectural and consequential decisions. Concretely, this means: a proposed design
that has an agent autonomously merge, auto-approve, or take an irreversible/consequential action
without a human decision point is the WRONG default shape for this ecosystem, even where it is
technically feasible - prefer designs where the agent's output is a fully-prepared decision (a
diagnosis, a draft PR, an assembled context bundle) that a human still explicitly triggers or
approves. This is a stronger, first-class constraint, not merely a cautious MVP stepping stone to be
relaxed later.

1. **CLI questionnaire (minimal).** Ask ONLY what inspection can't determine: the **start-page URL**,
   output location, TS + Playwright confirm, optional stack hints. **Never ask for login /
   credentials / auth — ever.**
2. **Recon — single goal: learn HOW components are implemented.** Open the start page in a headless
   browser and capture a page/stack-level profile: framework, UI library (→ an adapter, or none →
   universal primitives), semantic vs non-semantic controls (e.g. a button rendered as a `<div>`),
   test-id conventions, overlay/dropdown patterns. It does **not** classify individual elements or
   choose locators.
3. **Generate the CORE only:** base classes `BasePage` / `Container` / `Component` / `Collection` +
   the base component set (Button, TextInput, Checkbox, Select, Link, …) with their methods —
   reusable and inheritable — tuned to the stack (mainly which adapter; the profile recorded as
   config). Most components are identical across stacks.

**Explicitly NOT part of the scaffold step (deferred / dropped from the core):** full POM and
app-specific page objects; concrete **locators** (added later by AI or humans); the `verify` command
and live-DOM checking; any login flow; the local MUI fixture app + Vite.

**Non-semantic markup (`<div>`-as-button)** is handled at the core level by (1) **tag-agnostic
component methods** — `Button.click()` works on a `<div>` as well as a `<button>` (Playwright clicks
any element) — and (2) the recon **recording the non-semantic pattern** in the profile so whoever
adds locators later accounts for it. The scaffold itself never picks a locator.

**Status of the flow (2026-07-17):** step 1 (the CLI questionnaire) is **built** as `scaffold
init` — a numbered, line-based wizard with an editable review-before-submit screen, implemented
with **zero external dependencies and zero TTY dependency** (one shared `node:readline` session
behind an `IoPort` seam; pure `Question[]` schema + Result validators + reducer + driver, all
headless-tested via a scripted fake). Selection is by number rather than arrow keys on purpose:
arrow keys require raw mode → a real TTY, which Windows Git Bash/MinTTY does not expose, whereas
line reading works identically in PowerShell / MinTTY / pipes / CI. It writes `.eitr/init.json`
(`{ schemaVersion, startUrl, outputDir, stackHints? }`, the CLI-local `InitAnswers` contract) and
**never** asks for login/credentials. The login/verify/fixture/page-object legacy has been
**purged** (Part 2): `plan()` now emits only the CORE tree (base classes + primitives +
`eitr.config.ts` + overrides seed), `apply()` writes those plus `manifest.json`, and there is
no `verify`, no concrete pages/locators, and no MUI fixture app. **`eitr generate`** (Part A)
reads `init.json` and writes a **complete, self-contained, runnable test project** (in the chosen language and framework)
into the output folder (default **`<Tool>Tests/`**, e.g., `PlaywrightTests/`, = the outputDir),
once the questionnaire offers a framework/language choice), then **installs it** (npm + browsers).
The project contains: the base component library (`components/`, regenerated), a real
`playwright.config.ts` (create-if-absent — spreads the regenerated machine-default
`eitr.config.ts` and pins `baseURL`), `package.json`/`tsconfig.json`/`.gitignore`/`README.md`
(create-if-absent), an example test (`tests/example.spec.ts` — a network-free "harness boots" smoke

- a `test.fixme` real-app placeholder), the `overrides/` seed, and `.eitr/manifest.json`. With
  no recon yet the profile is an honest **baseline** placeholder flagged `pendingRecon: true`; raw
  stack hints stay in `init.json`. Install runs via `process.execPath` (never `npm.cmd`/`npx.cmd` —
  they crash on current-Node Windows) with the browser download isolated after a JS-only `npm install`
  (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`); a blocked browser step degrades gracefully (exit `2`, files
  valid, exact commands printed). Exit codes: `0` fully done · `2` emitted-but-install-incomplete · `1`
  emission failed. **`eitr new`** runs the whole flow (questionnaire → generate → install) in one
  command; `init` / `generate` / `install` remain as separate steps for CI, re-generation, and retry.
  **Recon** (headless/GET visit of the start URL to learn the real stack and tune the CORE) is the next
  step and will slot into the middle of `new` (questionnaire → recon → generate) without changing the
  command. The generated base is a **Component Page Object Model (CPOM)** — the sole default pattern
  (it subsumes plain POM; a "pattern" selector / Screenplay is a reserved future axis, not built). The
  component library ships `base/` (BasePage/Component/Container/Collection + `child`/`list`
  child-declaration helpers scoped to the component or page root), `primitives/`
  (Button/TextInput/Checkbox/Select/Link/FileInput), and `widgets/` (Dialog — portal, resolved from
  the page root; Table/Row/Cell — nesting), plus a tool-owned regenerated `tests/cpom-showcase.spec.ts`
  that composes a Page Object from them and runs green against `setContent` markup (no app).

The §1–§10 login-centric design below is retained only for the parts still reused and is otherwise
superseded.

**Reused from the 2026-07-16 build:** base classes + primitives, per-role adapters,
`@eitr/engine` packaging, CLI skeleton, RegExp-safe JSON codec, per-file atomic apply.
**Dropped from the core:** login-scan + `LoginPage` seed, `verify` (oracle/reveal), the MUI fixture +
Vite, and the login-specific parts of the generation plan (verifyTargets, login/dashboard PagesModel).

**Env note (settled this session):** the machine's AV strips native node binaries
(`@rollup/rollup-win32-x64-msvc` `.node` and `@esbuild/win32-x64` `.exe` both missing) → Vite/esbuild
can't run locally. Irrelevant to the pivot (no local app to bundle), but it is why the earlier
login-smoke e2e never went green here.

---

## 1. Purpose & goals (SUPERSEDED by the pivot above where it conflicts)

Scaffold a **polyglot UI-test framework (Playwright; Cypress withheld pending a native redesign)** into a **test repository**,
tuned to the _product's_ frontend stack, and **verify** the result against the real app.

**Unit of value = a verified login + one green smoke test against the real app** — NOT
"a component library." A library that compiles but exercises nothing does not satisfy the
priority order: **working > reliable > universal > simple.**

We build **only the base**; other tools/agents extend it.

### Non-goals (deliberately out)

Visual-regression, BDD/Cucumber, custom reporters, data/factory generation, per-component
custom matchers (Playwright web-first assertions already cover this).

## 2. Layered architecture

```
                 test repo
   ┌─────────────────────────────────────────────┐
   │  overrides/         (user-owned)             │  extends ↓, NEVER touched by regen
   ├─────────────────────────────────────────────┤
   │  generated/         (tool-owned, path-authority: regen overwrites)
   │    pages/           BasePage subclasses + a CONCRETE LoginPage (seed)
   │    smoke/           one generated smoke test (login → authenticated route)
   │    components/
   │      base/          Component, Container, Collection
   │      primitives/    Button, Link, TextInput, Checkbox, Select … (role/test-id driven)
   │      adapters/      mui/ antd/ radix/   (selected per detected stack, per-role)
   │    fixtures/        test.extend bundle (per-page, test-scoped)
   │    support/         auth.setup.ts (opt-in)
   │  eitr.config.ts   config the user spreads into their own defineConfig
   │  .eitr/       stack-profile.json, manifest.json, verify-report.json
   └─────────────────────────────────────────────┘
```

Everything is ultimately a Playwright `Locator`; scoping is nested locators.

## 3. Cross-cutting decisions (HARDENED)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Engine = `detect() → StackProfile` · `plan(profile) → GenerationPlan` (pure, in-memory) · `apply(plan, fs)` (only IO). CLI runs these with **no LLM**. **Invariant:** `plan()` never touches network/LLM; unknowns become fail-loud stubs, not "smart" guesses.                                                                                                          |
| D2  | Universal primitives (locator ladder) + adapters **MUI / Ant Design / Radix**, resolved **per role** so an adapter need not cover the whole taxonomy. More adapters scale via the registry.                                                                                                                                                                              |
| D3  | **Success = verified.** Oracle: exactly **one visible** (and, for interactives, **enabled**) match. Collections expect **>1** (cardinality read from role). Overlay locators are **revealed** (opened) before counting. Unverified locators emit as a **throwing getter** — fail loud at the point of use, granular, CI-red.                                             |
| D4  | Owned tree is **authority by path**: regeneration overwrites `writePolicy: regenerate` paths **unconditionally**, printing a diff of any clobbered hand-edit; the per-file hash is **warn-only, never a block**. "Never overwrite" applies strictly to `overrides/` and the config file.                                                                                 |
| D5  | **Portals/overlays in the base.** Separate _logical scope_ (which container a control belongs to) from _DOM scope_ (where its overlay renders). Resolve overlays from the page root; disambiguate multiple/nested overlays by topmost / `[aria-modal]`; support **reveal recipes** (open / type / scroll / hover) — ARIA linking is best-effort, not the sole mechanism. |
| D6  | **Fixtures are the composition root.** POMs instantiated per-test via `test.extend` (**test-scoped, never worker-scoped**); containers/elements are lazy getters, not fixtures.                                                                                                                                                                                          |
| D7  | **Login seed.** The engine generates a concrete `LoginPage` with real locators (from a login-source scan or a short interactive point-and-pick). Login is the one screen reachable **pre-auth**, so it verifies without `storageState` and then _produces_ it — breaking the auth bootstrap deadlock.                                                                    |
| D8  | Engine ships as its own **versioned package** with a public typed API. CLI and the Claude agent are peer consumers over that typed contract — neither shells out nor imports internals.                                                                                                                                                                                  |

## 4. Core data model

- **`StackProfile`** (versioned schema — the detect↔generate contract): `framework`,
  `uiLibraries[]` (id + **resolved version** + `dependencyKind` direct/transitive),
  `packageManager`, `playwrightVersion`, `moduleSystem` (ESM/NodeNext vs CJS — decides `.js`
  import extensions), `testIdAttribute`, `selectorStrategy`, a `target` identity (monorepo
  workspace), per-field `confidence`, structured `evidence` (`{file, matchedPattern}`), and
  `source` (`package.json`|`lockfile`|`live`|`manual`).
- **`GenerationPlan`** — ordered `FileDescriptor { path, writePolicy, provenance, content|template+data, hash }`.
  Pure data; snapshot-testable; the unit AI polish transforms. **Hash is over the final emitted
  bytes, computed at emission — after any polish** (else re-runs think everything was hand-edited).
  `writePolicy ∈ { regenerate, create-if-absent (overrides seeds), merge-fragment (config) }`.
- **`Manifest`** — every generated path + content hash + `writePolicy` + engine version +
  **the previous `StackProfile` content** (for delta/prune) + the manifest's **own schema version**.

## 5. Component model (P1 detail)

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
- **`custom` carries a justification** and is hard-tagged lowest confidence — the escape hatch
  can't silently dodge the ladder.
- **`fromLocator`** is a first-class construction path; `Collection`/`.nth()`/`Table` need it.
- **`ComponentClass<T>` is modelled as `new (scope, spec) => T` (constructor only).** This keeps
  generic inference unambiguous — `new Collection(loc, Row)` infers `Collection<Row>` with **no
  explicit type arg** (readability), and it rejects descriptor-ctor components like `Select` from
  collections **at compile time** (their ctor doesn't take a `LocatorSpec`). `Collection.nth()`
  reaches the inherited static `fromLocator` via one internal cast — the only cast in the base, kept
  in library plumbing so user Page Objects stay generics-free.
- **Locator ladder is a function of `selectorStrategy`** (from P3), not a constant: test-id-first
  for instrumented apps (stable under i18n/copy changes), role-first otherwise. Order otherwise:
  `role+name → label → text → testId → css`.
- **Provenance is generation-time data** (in the plan/manifest/verify report — drives which code
  is emitted: blessed getter vs. throwing getter). It is **not** a runtime instance field.
- **`Container extends Component`** — typed factories pass `this.locator` as scope; optional-container
  = pass `page`. **`BasePage`** holds `page`, a `path`, `goto()`, lazy getters. **`Collection`** wraps a
  locator: `.nth`/`.first`/`.last`, `.filter`, `.count()`, `.all()`; asserted via `expect().toHaveCount()`.
- **Method safety contract** — every component/primitive method is an **Action** (auto-waiting,
  `Promise<void>`), a **Producer** (lazy locator/component, no `await`), or a **`…Now()` snapshot read**
  (string data only — no boolean readers). No assertion wrappers (assert on the public `locator`).
  The full rule lives in CLAUDE.md and is enforced CI-red by `test/contract.test.ts`.

## 6. Phase designs (HARDENED)

### P1 — Component foundation

Base `Component`/`Container`/`FrameContainer`/`BasePage`/`Collection`, `Scope`, discriminated `LocatorSpec`, `fromLocator`.
Primitives: Button, Link, TextInput, Checkbox, Select/Dropdown (overlay-aware), RadioGroup, Table, Element, Heading, Slider.
Overlay handling per D5.

### P2 — Fixtures & run scaffold

Per-page `test.extend` fixtures, **test-scoped**, chained via `mergeTests` when many pages exist.
Auth: opt-in `auth.setup.ts` writing `storageState`, wired as a setup project + dependency.
Config: emitted as **`eitr.config.ts` exporting a config object the user spreads into their own
`defineConfig`** — never an AST edit of `playwright.config.ts` (`testIdAttribute`, `baseURL`,
`trace: on-first-retry`, CI `retries`, HTML + blob/junit reporters).

### P3 — Stack detector

Trust order: **`package.json` for presence (robust) → lockfile only to resolve exact version → manual.**
Degrade to the package.json range if the lockfile format is unknown; use real parsers
(`@pnpm/lockfile-file`, `@yarnpkg/parsers`), never hand-rolled. Record `dependencyKind` (direct vs
transitive) to avoid false positives from tooling deps. Live-URL sniffing is **probabilistic** and gets
the same skeptical treatment as AI output (confidence + must be confirmed/verified); headless libs like
Radix are detected from the lockfile, not the DOM. Flow: **propose → confirm → persist** to `.eitr/`,
with a **non-interactive path** (`--profile <file>` / `--trust-source --yes`) for CI. Monorepo: enumerate
workspaces, require target selection. Wrapped design system: **flag** (local package that transitively
depends on a known lib and is imported instead of the lib) — resolution deferred to verify/AI.

### P4 — Generator

`plan(profile, opts)` resolves the appropriate modular target generator from a registry (`TARGET_GENERATORS`) matching the chosen language & automation tool (strategy pattern). Each target generator (implementing the `TargetGenerator` interface, e.g. `PlaywrightTsGenerator`) is responsible for generating its own `FileDescriptor` list and planning.

`apply` **stages to a temp dir + atomic rename**, uses a **two-phase manifest** (intent → commit) so an interrupted run is unambiguous, and **prunes** only `regenerate` paths dropped since the last profile. Owned tree = **path authority** (D4). Adapters return **descriptors**; the base owns templating/emission. Adapter tiebreak (when >1 could match a role) is a later-slice concern — early slices resolve one library per profile.

### P5 — Reality verification

**`verify`** loads the app (auth via `storageState`), and for each locator applies the **D3 oracle**
(one _visible_/_enabled_ match; collections expect >1; overlays revealed before counting), using each
locator's **reveal recipe** to drive the UI into the state where the target exists. Writes
`verify-report.json` and re-emits each locator as a **blessed getter** or a **throwing getter**. CLI exits
non-zero while any locator is unverified. **AI polish** (`GenerationPlan → GenerationPlan`, only when a
source of truth exists) fits adapter locators to the real DOM and writes wrappers for custom/in-house
components — **static committed code only, never AI at test runtime.**

### P6 — Packaging

Engine published as **`@eitr/engine`** (public typed API, semver). **CLI** (`scaffold
detect|plan|apply|verify`) is a peer consumer — full deterministic value, no LLM (only `verify` needs a
browser, made an **optional install** so `detect/plan/apply` stay light). The **Claude agent** is another
peer consumer that adds AI polish + "go gather" (read product repo, drive the app).

## 7. Extension seam (what makes "extensible" real)

1. **`Adapter` interface** — `id`, `appliesTo(profile)` (library-level), **`strategyFor(role) → Descriptor | null`**
   (per-role; `null` ⇒ fall back to primitive) so an adapter need not cover the whole taxonomy.
2. **Component-role taxonomy** — closed enum both primitives and adapters implement. **Additive-only within
   a major** (new roles only; rename/remove = major bump).
3. **`Descriptor` schema** — the adapter↔base emission contract; versioned like the interface.
4. **Registry** — deterministic precedence; extensions register via **`eitr.config.ts`
   (`adapters: string[]`)**, never by editing engine source.
5. **Adapter-as-npm-package** — exports a well-known symbol implementing `Adapter`, declares
   `peerDependencies: { "@eitr/engine": "^X" }`; the registry checks the declared contract version
   against the running engine (accepts taxonomy/interface major ≤ its own, warns on a minor gap).
6. **`StackProfile` schema** — the detect↔generate contract, versioned.

> The npm-package / peer-dep / version-check machinery (5) is only needed once **external** adapters exist
> — it is a later slice. Slices 1–2 use in-repo adapters against the same interface + descriptor + taxonomy.

## 8. Idempotency & re-run (path authority)

- **Edited an owned file** → overwritten on regen; a **diff of the loss is printed** (hash is warn-only).
  Real customization belongs in `overrides/` (never touched).
- **Profile changed** → diff new vs. previous profile (stored in the manifest), add/remove adapter outputs,
  prune dead `regenerate` files, report the delta.
- **Engine version bump** → owned tree fully regenerated; warn if a user extension is pinned to an older
  contract. Manifest carries its own schema version for self-migration.
- **Interrupted run** → temp-dir + atomic rename + two-phase manifest ⇒ orphans are owned paths, simply
  overwritten next run. No wedged tree.

## 9. Open risks (tracked)

- **Silent false-green scaffold** — deepest risk; killed by D3 (visible/enabled oracle + reveal recipes +
  throwing getters + `verify`). If this regresses, the tool loses its reason to exist.
- **Nothing concrete to verify** — resolved by D7 (login seed + one smoke test) so `verify` has a real
  subject on day one.
- **Overlay ARIA linking is fragile** (Ant rarely wires `aria-controls`; virtualized lists, typeahead,
  tooltips, nested dialogs) — mitigated by reveal recipes + topmost disambiguation; validated on real
  MUI/Radix overlays, not a demo.
- **iframe widgets** (payments, embeds) — modelled via `FrameLocator` in `Scope`; verify has a frame-descent
  step. Partial in early slices.
- **Live-URL detection** blind spots (auth walls, minified classes, SPA lazy DOM) — confidence + confirm +
  verify; never a silent default.

## 10. Build sequencing — vertical slices (not horizontal phases)

All six phases are in scope. They are built as **thin vertical slices**, each ending in a runnable,
verified artifact — never all layers at once (which risks a large design that never reaches "working").

- **Slice 1 — a verified login smoke test (thin cut through every phase).**
  P1 core primitives (Button/TextInput/Checkbox/Select/Collection) · P2 fixtures + config + `auth.setup.ts`
  · P3 `package.json`+lockfile source detection + manual · P4 `plan`/`apply` with **one adapter (MUI)** +
  primitive fallback, regenerate-the-owned-tree · **D7 concrete `LoginPage` + one smoke test** · P5 `verify`
  drives the real app, fail-loud, non-zero exit · P6 CLI only. *Deliverable: `scaffold` produces a login POM
  - smoke test that verifies green against a real MUI app behind auth.*
- **Slice 2 — prove the seam.** Add a **second adapter — Radix (headless)** (sharper stress of D5 than Ant),
  freeze/version the `Adapter` interface + descriptor + taxonomy from the MUI↔Radix diff. Add richer reveal recipes.
  Table, richer reveal recipes.
- **Slice 3 — widen & harden.** Ant Design adapter · manifest hashing/pruning/migration · live-URL detection
  - wrapped-DS flag + monorepo multi-target · AI polish · external-adapter npm packaging (§7.5) · the Claude
    Code agent.

## 11. Expansion and AI Integrations (2026-07-20)

### 11.1 Method Safety Contract

To maintain robust, non-flaky test automation across different development environments, Eitr enforces a strict Method Safety Contract inside component page objects:

- **Actions (Mutations):** Must return `Promise<void>` (or `void`/`Task` depending on language) and rely on the framework's native auto-waiting before triggering interactions (e.g., `click()`, `fill()`).
- **Producers (Sub-components):** Must return locator or sub-component instances synchronously (e.g., via getters using `this.child()`). No async or network operations are allowed inside producers.
- **Snapshot Reads (Point-in-time state):** Must return raw primitive values and must be suffixed with `Now` (e.g., `textNow()`, `valueNow()`).
- **No Assertions:** Assertion blocks (e.g., `expect`, `assert`) are strictly prohibited inside components; they belong exclusively in test scripts (`spec` / `test` files).

### 11.2 Native Multi-Assistant AI Rules Generation

Eitr directly generates native rule formats and skills tailored to each selected AI assistant during project scaffolding, eliminating intermediate monolithic directories:

- **Cursor:** `.cursor/rules/*.mdc` (using glob targets and frontmatter)
- **Windsurf:** `.windsurf/rules/*.md`
- **Claude Code:** `CLAUDE.md` and `.claude/skills/*/SKILL.md`
- **GitHub Copilot:** `.github/copilot-instructions.md`
- **Gemini / Antigravity:** `.agents/skills/*/SKILL.md` and `AGENTS.md`
- **OpenAI Codex:** `.codex/skills/*/SKILL.md`
- **Aider:** `.aider.conf.yml`, `CONVENTIONS.md`, and `AGENTS.md`

### 11.3 API Testing & Setup Support

To keep E2E tests fast, Eitr embeds a custom `ApiClient` wrapper around Playwright's `APIRequestContext` in the generated project (`shared/utils/api-client.ts`). It simplifies HTTP requests:

- **REST:** Provides standard typed `get()`, `post()`, `put()`, `delete()` helpers.
- **GraphQL:** Provides a `graphql(query, variables)` method mapping directly to POST payload queries.
- **Transpiler Compatibility (TS/JS):** Properties are declared explicitly (no TypeScript constructor parameter properties) to remain compatible with Playwright's light `strip-only` runner.
- **Polyglot Equivalents:** Java utilizes `okhttp3` / `playwright.request`, Python utilizes `playwright.request`, and C# uses `IAPIRequestContext` to implement similar synchronous or asynchronous helpers depending on the runtime.

### 11.4 AST-Based Quality Evaluations (`@eitr/evals`)

To prepare for scaling Eitr to other languages (Python, Java, etc.) and to guarantee that AI-generated code conforms to the Method Safety Contract, the project contains the `@eitr/evals` workspace:

- Uses a **TypeScript AST Compiler API** to parse files and flag contract violations (such as `expect()` inside classes, missing `Now` suffix on getter reads, or parameter properties in components).
- Executes offline evaluations using Vitest and Gemini API prompts with fallback mocks to measure and assert AI coding quality automatically.

## 12. Enterprise Readiness & Missing Features Roadmap (Multi-Agent Review Findings)

A multi-agent architectural review (QA, SWE, DX) identified several missing advanced features and deviations from best practices required for a true "enterprise-ready" framework. While the core CPOM architecture provides a mathematically sound foundation, the following areas represent our backlog for scaling EITR:

### 12.1 Validated Existing Features (Often Overlooked)

- **CI/CD Generation:** The engine _does_ scaffold CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins) and IDE integrations (VSCode `settings.json`, `extensions.json`) out-of-the-box via `shared.ts`.
- **AI-Readiness:** The engine dynamically generates AI-assistant rules (`.cursorrules`, `.windsurf`, `.github/copilot-instructions.md`) that inject the Method Safety Contract directly into the user's workspace, protecting the generated architecture from degradation by LLMs.

### 12.2 Architectural Deviations & Future Backlog

- **Dependency Injection (DI) & IoC:** The framework currently tightly couples cross-cutting concerns (ApiClients, Logging) to the test runner (Playwright fixtures). _Roadmap:_ Introduce a lightweight standalone IoC container to manage framework utilities independent of the test runner.
- **Locator Extensibility (OCP Violation):** The `LocatorSpec` currently uses a closed discriminated union with a hardcoded switch case for resolution (role, text, testId, custom). _Roadmap:_ Refactor locator resolution to a polymorphic registry strategy so enterprise users can register first-class custom locator strategies (e.g., specific React node selectors) in `eitr.config.ts`.
- **Advanced State Management:** Relies entirely on Playwright's native auto-waiting. _Roadmap:_ Introduce an extensible `WaitStrategy` interface to handle complex app-level synchronization (e.g., waiting for GraphQL hydration, network idle) before executing Actions.
- **Middleware / Interceptors:** Lack of generic hooks around CPOM Actions. _Roadmap:_ Add hooks allowing execution interception (e.g., auto-logging every `click()`, dispatching telemetry, capturing visual regression snapshots).
- **Test Data Management (TDM) & Reporting:** Currently marked as non-goals. _Roadmap:_ Provide opt-in factory generation integration (e.g., `faker.js`) and advanced reporting dashboard configuration (Allure).

## 13. Target Architecture: The Universal AI-First SDET Platform

### 13.1 Platform Vision & Paradigms

EITR transitions from a pure scaffolding generator to an **autonomous, end-to-end AI-First SDET platform**. The goal is enabling an SDET or QA engineer arriving at a project with zero existing test automation to bootstrap a production-grade, CPOM-compliant test framework and deliver verified, green automated tests from TMS requirements (TestRail, Jira, Zephyr, Azure DevOps) in minutes rather than weeks.

### 13.2 The 4-Layer AI Architecture

Generated test repositories are structured with four dedicated AI layers:

```
Generated Test Repository
├── 1. Actors Layer (.agents/agents/, .claude/agents/, .cursor/rules/, .windsurf/rules/, .codex/agents/, .github/agents/)
│   ├── sdet-orchestrator     -- Single facade & DAG task router
│   ├── tms-validator         -- TMS requirements quality gate, atomicity check & GIGO guard
│   ├── sdet-architect        -- Architecture governance, DI fixtures & CPOM validation
│   ├── pom-engineer          -- DOM inspection, Page Object generation & live-DOM liveness checking
│   ├── test-automator        -- Linear test synthesis from TMS, dynamic TDM & fast-path API
│   ├── assertion-auditor     -- Web-first anti-fake-green guard & mutation verification
│   └── trace-debugger        -- Playwright trace analysis & Two-Strike self-healing
│
├── 2. Workflows Layer (.agents/skills/, .claude/skills/, .cursor/rules/, .windsurf/workflows/, .codex/skills/, .github/)
│   ├── /auth-setup           -- Session capture (auth.json) and state re-use with SSO fallback
│   ├── /scan-and-generate-pom-- Live DOM exploration + live-DOM Page Object verification
│   ├── /automate-ticket      -- End-to-end flow: TMS ticket -> DLP -> Intent -> AST Code -> Green run
│   ├── /heal-test            -- 4-Point trace inspection + Two-Strike autonomous fix loop
│   ├── /bulk-rescan          -- Batch locator update on Page Objects, re-verified against the live DOM
│   └── /map-site             -- Route graph crawler, site topology & shared widget mining
│
├── 3. Model Context Protocol (MCP) Layer (.mcp.json, .cursor/mcp.json, .claude/mcp.json, etc.)
│   ├── Playwright MCP        -- Live DOM querying, selector evaluation, visual feedback
│   └── TMS Bridge MCP        -- TestRail / Zephyr / Jira / ADO test case extraction (.mcp/tms-bridge/)
│
└── 4. Lifecycle Guards, Hooks & Rules Layer
    ├── Root Context          -- AGENTS.md, CLAUDE.md, .windsurfrules, copilot-instructions.md
    └── CPOM Contract         -- CONVENTIONS.md (Method Safety Contract & locator hierarchy)
```

### 13.3 3-Tier Component Sanity Engine — Removed

The 3-tier component sanity engine (a dedicated `sanity` Playwright project, a mandatory
`npm run test:sanity` CI step, and generated `tests/pom-sanity/<name>-page.sanity.spec.ts` files)
was never fully wired into scaffolded projects and has been removed rather than completed.
Generated projects no longer ship a `sanity` test project, a `test:sanity` script, a mandatory
sanity CI step, or any generated `tests/pom-sanity/` spec files. AI agent and operational-skill
system prompts were updated in lockstep: every instruction that previously told an agent to run
`npm run test:sanity` or generate a `*.sanity.spec.ts` file now instructs it to verify each Page
Object directly against the live DOM (via the embedded Playwright MCP tools) as part of the normal
generation loop, with no persistent sanity test artifact and no dependency on the removed CI step.

### 13.4 Anti-Fake-Green Assertion Engine & Dual-Layer Validation

To prevent automated tests from passing without verifying actual business logic:

- **100% Expected Results Mapping:** Every _Expected Result_ in the ingested TMS test case is deterministically translated into a strict, auto-retrying web assertion (`await expect(...).toHaveText()` / `toBeVisible()` / `toBeEnabled()`).
- **Unawaited Promise Guard:** Rejects unawaited promises inside assertions (e.g. `expect(locator.isVisible()).toBeTruthy()`), eliminating silent false positives where unawaited promises evaluate truthy.
- **Prohibition of Non-Retrying Boolean Checks:** Prohibits wrapping snapshot state readers in non-retrying boolean assertions (e.g. `expect(await el.isVisibleNow()).toBe(true)`).
- **Dual-Layer Validation:** Verifies UI DOM changes in combination with backend network response payloads via pre-action response interceptors (`Promise.all([page.waitForResponse(...), action()])`) or `apiClient` checks.
- **Mutation Analysis Protocol:** Verifies that tests deterministically fail if the backend returns HTTP 400/500 or if the UI component fails to render.

### 13.5 Live Trace-Based Self-Healing (Two-Strike Rule & 4-Point Trace Triage)

When generated tests fail during live execution:

1. **Fail-Fast Real Bug Detection:** Inspects network waterfalls for HTTP 4xx/5xx responses and console logs for unhandled JS exceptions before altering Page Objects. Genuine server/application crashes are immediately reported as `REAL APPLICATION BUG`.
2. **4-Point Trace Triage:** Captures Playwright `trace.zip`, console logs, network waterfalls, and visual snapshots to diagnose root causes (timing vs selector drift vs race condition).
3. **Targeted Isolated Self-Healing:** Runs _only_ the specific failing test file (`npx playwright test tests/TC-XXX.spec.ts`) under the **Two-Strike Rule**:
   - _Attempt 1:_ Adjusts locator in the CPOM Page Object adhering to 3-Tier Locator Priority (`getByTestId` -> `getByRole` -> `getByLabel`).
   - _Attempt 2:_ Refines timing/synchronization (Web-First assertions or network waiters).
   - _Rollback & Escalation:_ If the test fails twice consecutively, immediately rolls back changes (`git checkout -- <modified_files>`) and outputs a structured taxonomy report (`[FLAKY / TIMING]`, `[SELECTOR DRIFT]`, `[PRODUCT BUG]`).

### 13.6 Zero Lock-in Principle

All generated Page Objects, tests, and configuration files remain 100% self-contained standard projects (TypeScript, Python, Java, or C#) without any proprietary runtime dependency on EITR.

### 13.7 Test Data Management (TDM) & Teardown Protocol

To ensure test idempotency and prevent collisions during parallel or re-run executions:

- **Dynamic TDM Generators:** `ApiClient` provides built-in `createUniqueId()` and `createTestEmail()` helpers for collision-free data isolation without external dependencies.
- **Integrated Teardown Registry:** Tests register cleanup functions via `apiClient.registerTeardown(async () => { ... })`. Tasks are executed in LIFO (Last-In-First-Out) order inside safe `try/catch` blocks.
- **Automatic Fixture Teardown:** The `apiClient` test fixture in `tests/fixtures.ts` automatically executes `await client.cleanup()` post-test, guaranteeing 100% clean teardown even if tests fail or time out.
- Hardcoded production dependencies and shared mutable data are strictly forbidden.

### 13.8 TMS Pre-Processing & Quality Validation (GIGO Protection)

Before initiating test generation:

- The `tms-validator` inspects ingested test cases from Jira, TestRail, Zephyr, or Azure DevOps:
  - **Scenario Atomicity (Step Limit <= 10):** Ensures the ticket tests a Single Business Outcome rather than an overloaded monolithic test plan.
  - **Expected Results Verifiability:** Requires explicit, measurable outcomes (UI state changes or API response codes) for every step.
  - **TDM Completeness:** Verifies required test data parameters, user credentials, and preconditions.
- If Quality Score < 80%, the ticket is rejected upfront with a structured Rejection Report (Scorecard) for the author, preventing defective and flaking test generation.

### 13.9 Deterministic AST Generation, RAG Component Indexing & Human Sign-Off Gateway

To guarantee scalability, zero-hallucination code generation, and developer governance:

- **Component Registry Indexing:** Page Objects and shared widgets are indexed from `docs/site-map.json` and `components/` to match scenario steps to existing CPOM classes.
- **Human Sign-Off Gateway (`/automate-ticket`):** Before synthesizing test files on disk, the agent presents a structured Markdown automation proposal artifact (Executive Summary, Steps, Preconditions, Page Objects used, TDM strategy) for explicit human review and sign-off in chat.
- **Strict AST Linearity (Zero Branching):** Synthesized test scripts (`tests/TC-{id}-{feature}.spec.ts`) strictly ban conditional statements (`if`/`else`), loops (`for`/`while`/`forEach`), and `try/catch` wrapping assertions.
- **Demarkation & DI:** Every step is wrapped in `await test.step('Step N: ...', async () => { ... })` and fixtures (`test.extend<{ loginPage: LoginPage, apiClient: ApiClient }>()`) supply dependencies without raw constructors.

### 13.10 Enterprise Security, TMS Local Caching & Corporate Network Resilience

- **Local Caching & Circuit Breaker (`.mcp/tms-bridge/`):** Test cases fetched via TMS MCP are cached locally in `.tms-cache/<safeId>.json` with path traversal protection, enabling offline execution and API rate-limit resilience.
- **Native TMS Adapters:** Zero-dependency HTTP client with robust parsing for TestRail, Azure DevOps XML steps (`Microsoft.VSTS.TCM.Steps`), Jira Xray, Zephyr, and Generic REST.
- **Data Loss Prevention (DLP):** Pre-prompt filtering masks PII (emails, phone numbers, customer database dumps) before transmission to LLM APIs.
- **Session Protection:** `auth.json` is stored locally with secure permissions and permanently excluded from version control.
- **Corporate Infrastructure:** Native support for `HTTP_PROXY`, `HTTPS_PROXY`, custom enterprise CA certificates (`NODE_EXTRA_CA_CERTS`), and internal artifact repositories (`PLAYWRIGHT_DOWNLOAD_HOST`).

### 13.11 Site Map Topology & Cross-Page Shared Widget Deduplication Engine

To eliminate boilerplate code duplication across large applications. This is an AI-assistant-driven
skill (`/map-site`), not a standalone CLI command - it needs a live browser/DOM to crawl, which only
the AI assistant's own terminal session has; a `eitr map` CLI command existed at one point but only
ever produced hardcoded, fabricated route/component data (never a real crawl) and was removed rather
than kept as dead weight duplicating this skill.

- **Concurrent Topology Crawler (`/map-site`):** Authenticated crawler explores internal routes within `baseUrl.origin` using a concurrent worker pool (`concurrency: 4..6`) and URL canonicalization (dropping hashes, sorting query parameters, collapsing duplicate slashes), outputting deterministically sorted `docs/site-map.json` and `docs/APP_GRAPH.md` with Mermaid navigation charts.
- **Shared Widget Mining (`frequency >= 2`):** Repeating DOM structures (Navbar, Sidebar, UserMenu, DataGrid, Modal) appearing across 2 or more routes are extracted into dedicated classes in `components/widgets/<name>.widget.ts` extending `Component`.
- **CPOM Composition Contract:** Page Objects compose shared widgets via `this.child(WidgetClass, spec)` without subclassing widget classes.
- **Global Orchestrator-Worker Swarm Paradigm:** For batch Page Object generation, `sdet-orchestrator` enforces Shared Primitives First (generating widgets), dispatches parallel `pom-engineer` worker subagents across routes (1 route per worker), and executes a global barrier synchronization confirming 100% live-DOM liveness across all workers.
- **Zero-Flag URL Resolution:** `eitr auth` discovers target `baseURL` automatically via `resolveTargetUrl` (`process.env.E2E_BASE_URL` -> `.eitr/init.json` -> `playwright.config.ts` -> `.env`).

### 13.12 Bulk Re-Recon & Page Object Contract Preservation (UI Redesign Resilience)

When application UI layout, styling, or DOM structure changes. Also an AI-assistant-driven skill
(`/bulk-rescan`), not a CLI command, for the same reason as 13.11 - a `eitr rescan`/`eitr recon` CLI
command existed but never actually rewrote a locator or verified anything against a live DOM; it only
printed status lines claiming success. Removed rather than kept as a false-success trap.

- **Skill `/bulk-rescan`:** Re-inspects live application pages (or `docs/site-map.json`) and updates Page Object locators adhering to 3-Tier Locator Priority (`getByTestId` -> `getByRole` -> `getByLabel`).
- **Public Contract Preservation:** Updates locator declarations while preserving all existing public method names, parameters, and return types. This ensures that 50+ dependent test specs continue passing without modifying a single line of test code.
- **Verification Barrier:** Re-runs `npm test` on updated components, preventing regression leakage into version control.

### 13.13 Static CPOM Contract Linter & Multi-Tier CI/CD Quality Gates

To enforce SDET architectural rigor and prevent flakiness in production CI/CD pipelines:

- **Zero-Dependency Linter (`scripts/lint-cpom.js` & `npm run lint:cpom`):** Emitted into every generated project to audit:
  1. _Rule 1 (Zero Arbitrary Delays):_ Prohibits `sleep()`, `setTimeout()`, and `page.waitForTimeout()`.
  2. _Rule 2 (Mandatory `Now()` Suffix):_ Enforces `Now()` suffix on all point-in-time state readers in `components/`.
  3. _Rule 3 (Zero Assertions in Components):_ Prohibits `expect(...)` inside Component & Page Object classes.
  4. _Rule 4 (Unawaited Promise Guard):_ Rejects unawaited boolean promises in test assertions (`expect(locator.isVisible()).toBeTruthy()`).
  5. _Rule 5 (Fixture Dependency Injection):_ Rejects raw `new PageObject(page)` instantiation inside test specs.
- **Multi-Tier CI/CD Quality Gate:**
  - **Tier 1 (Static Contract Gate):** `npm run lint:cpom` (<1 sec static audit before browser launch).
  - **Tier 2 (Scenario Regression Gate):** `npm test` (full parallel E2E scenario execution with trace artifact uploads).

### 13.14 Protocol 123 SDET Engineering Standard & Review Arbiter

To ensure enterprise-grade test automation quality without architectural drift or LLM hallucinations:

- **The 8-Phase SDET Lifecycle (Protocol 123 / `/123`):**
  1. _Phase 0 (Baseline):_ `npm test` confirms clean initial baseline.
  2. _Phase 1 (Recon & Web Search):_ `recon-scout` / `pom-engineer` crawls DOM and spawns Web Search subagents to query official framework and UI library docs, formulating concrete engineering recommendations.
  3. _Phase 2 (Spec Formulation):_ `sdet-architect` synthesizes the deterministic Automation Proposal Artifact before writing code.
  4. _Phase 3 (Plan Review Swarm & Arbiter):_ Review swarm (`assertion-auditor`, `sdet-architect`, `flake-sentinel`) audits the plan; `review-arbiter` validates findings and emits the official Review Arbiter Verdict Artifact.
  5. _Phase 4 (Human Intent Lock):_ Human engineer reviews and approves the proposal artifact. ZERO code is written until approved.
  6. _Phase 5 (TDD Dual Synthesis):_ Shared primitives first (`pom-engineer` creates Page Objects and verifies each against the live DOM) -> linear test synthesis (`test-automator`).
  7. _Phase 6 (Code Review Swarm & Arbiter):_ Reviewers audit git diff; `review-arbiter` adjudicates diff comments and authorizes the commit.
  8. _Phase 7 (Two-Strike Self-Healing):_ Isolated test run; 4-point trace triage in `trace.zip`; max 2 attempts, automatic rollback via `git checkout -- <files>` on repeat failure.
  9. _Phase 8 (Quality Gate & Handoff):_ `npm run lint:cpom` + `npm test` + Final Handoff Report.
- **The Review Arbiter (`review-arbiter`):** Independent judge meta-agent that cross-references review comments against Ground Truth (`CONVENTIONS.md`, `AGENTS.md`, live DOM), classifying each into `ACCEPTED [CRITICAL/MAJOR]`, `DISMISSED: FALSE_POSITIVE`, `DISMISSED: HALLUCINATED_RULE`, or `DISMISSED: OUT_OF_SCOPE`.
- **4 Deterministic Report Schemas:** Fixed markdown formats for Automation Proposal, Arbiter Verdict, Two-Strike Triage, and Final Handoff Report.
