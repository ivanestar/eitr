# EITR Architecture

This is the living architecture description of EITR: what the system is, why it is shaped this way,
and where a given topic is documented in depth. It describes the **current** system in the present
tense - historical narrative ("on this date we decided...") belongs in `CHANGELOG.md`, not here.
Individual decisions with real alternatives that were considered and rejected are recorded as
Architecture Decision Records in [`decisions/`](decisions/) instead of as prose in these pages -
see [`decisions/README.md`](decisions/README.md) for the index and format.

## 1. Introduction & Goals

EITR generates the **deterministic core** of a UI-test automation framework - a typed
Component Page Object Model (CPOM), CI/CD config, and (optionally) a bridge to a Test Management
System - for a target web application, in one command, with zero LLM involvement in the generation
step itself. See [`decisions/0001-deterministic-core-only-scaffolder.md`](decisions/0001-deterministic-core-only-scaffolder.md)
for why the scope is deliberately narrower than "generate a whole finished test suite."

The scaffolder is the first, deterministic layer of a larger intended workflow, not the whole
product: an SDET runs EITR once to stand up a production-grade framework core, then works with AI
assistants on top of that base for the rest of the engagement - growing the suite and discharging
ongoing QA responsibility. The MCP bridge, the multi-assistant slash-command layer, and the TMS
integrations exist because of this: they are the seams through which AI agents keep operating on the
generated framework long after `eitr new` exits. See
[`ai-agent-integration.md`](ai-agent-integration.md).

**Because agents build on the generated framework indefinitely, a defect in the deterministic base
does not stay a one-time bug - it gets inherited and amplified by every agent action layered on top
of it afterward.** This is the concrete reason CPOM-contract correctness, cross-platform generation
reliability, and CI verification depth are held to a higher bar here than they would be for a
disposable one-shot generator (see `CLAUDE.md`/`AGENTS.md` Sections 8 and 12/13 for how that bar is
enforced mechanically).

**Governing design principle: augmentation, not replacement.** No design in this ecosystem should
have an agent autonomously merge, auto-approve, or take an irreversible/consequential action without
a human decision point, even where technically feasible. The agent's output should be a
fully-prepared decision (a diagnosis, a draft PR, an assembled context bundle) that a human still
explicitly triggers or approves. This is a first-class constraint on every future agent/automation
design in this ecosystem, not a cautious MVP stepping stone.

## 2. Non-Goals

Deliberately out of scope for the generation step itself: visual regression, BDD/Cucumber, custom
reporters, concrete app-specific locators (added later by AI or humans), live-DOM verification at
generation time, and any login/credential flow during scaffolding (session capture is a separate,
explicit step - `eitr auth` - never part of `eitr new`'s questionnaire).

## 3. High-Level Structure

```
                 test repo
   ┌─────────────────────────────────────────────┐
   │  overrides/         (user-owned)             │  extends ↓, NEVER touched by regen
   ├─────────────────────────────────────────────┤
   │  components/        (tool-owned, path-authority: regen overwrites)
   │    base/            BasePage, Component, Container, Collection
   │    primitives/      Button, TextInput, Checkbox, Select, Link, ... (role/test-id driven)
   │    widgets/         Dialog, Table, ... (shared, composed via this.child())
   │  tests/              example test + user tests
   │  eitr.config.ts     config the user spreads into their own defineConfig
   │  .eitr/              stack-profile.json, manifest.json
   │  .mcp/tms-bridge/    embedded MCP server for AI-assistant TMS/test-runner access
   └─────────────────────────────────────────────┘
```

Everything is ultimately a Playwright `Locator` (or its language-native equivalent); scoping is
nested locators. See [`data-and-component-model.md`](data-and-component-model.md) for the typed
contract behind this diagram.

## 4. Where to find things

| Topic                                                                                      | Document                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `StackProfile`, `GenerationPlan`, `Manifest`, CPOM component model, Method Safety Contract | [`data-and-component-model.md`](data-and-component-model.md) |
| detect → plan → apply pipeline, adapters/registry, idempotency & re-run                    | [`generation-engine.md`](generation-engine.md)               |
| Agents/skills/MCP layers, TMS bridge, Protocol 123                                         | [`ai-agent-integration.md`](ai-agent-integration.md)         |
| CPOM linter, anti-fake-green, self-healing, TDM, CI gates                                  | [`quality-gates.md`](quality-gates.md)                       |
| Individual decisions, alternatives considered, and why                                     | [`decisions/`](decisions/)                                   |
| Known gaps and deliberate backlog                                                          | [`known-gaps.md`](known-gaps.md)                             |

## 5. Quality Requirements (what "good" means here)

1. **Working > reliable > universal > simple**, in that priority order. A component library that
   compiles but exercises nothing does not satisfy this.
2. **Fail loud, never silently guess.** Unresolved detection, unverifiable locators, and ambiguous
   stack signals become explicit stubs or confidence-scored data, never a silent best-effort default.
3. **Path authority is absolute for tool-owned files.** Regeneration overwrites `regenerate`-policy
   paths unconditionally (with a printed diff of anything clobbered); `overrides/` and user config
   are never touched. See [`decisions/0004-path-authority-regeneration.md`](decisions/0004-path-authority-regeneration.md).
4. **Zero lock-in.** Generated projects are 100% standalone - no runtime dependency on `@eitr/engine`,
   no reference to EITR itself anywhere in generated output. See
   [`decisions/0006-zero-lock-in.md`](decisions/0006-zero-lock-in.md).

## 6. Glossary

- **CPOM** - Component Page Object Model: the typed Page-Object pattern this project generates
  (`BasePage`/`Component`/`Container`/`Collection` + primitives + widgets).
- **Adapter** - a per-role locator strategy for a specific UI library (MUI, Ant Design, Radix, ...),
  registered against the `Adapter` interface.
- **StackProfile** - the detect↔generate contract: the structured record of what framework/UI
  library/conventions were detected for a target app.
- **GenerationPlan** - the pure, in-memory, ordered list of `FileDescriptor`s a `plan()` call
  produces; `apply()` is the only step that touches disk.
- **TMS** - Test Management System (Jira Xray, Azure DevOps, TestRail, Zephyr) - where test
  cases/plans/runs live for a project that has one configured.
- **MCP** - Model Context Protocol: the mechanism by which AI assistants call tools (this project
  embeds an MCP bridge in every generated project for TMS and test-runner access).
