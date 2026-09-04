# 0001: Deterministic core-only scaffolder

**Status:** Accepted

## Context

An early design generated a whole verified slice: a concrete `LoginPage` scanned from the target
app, a login smoke test, and a `verify` command that drove the real app to confirm every locator
before considering the run successful. This meant `eitr new` needed the app's login flow and (at
least implicitly) credentials to produce anything runnable, and made "success" for the tool mean
"a login test passes against your real app" rather than "a correct framework core exists."

## Decision

Scope EITR's generation step to the **deterministic core only**: base classes
(`BasePage`/`Component`/`Container`/`Collection`), the primitive/adapter component library tuned to
the detected stack, CI/CD config, and (optionally) a TMS/MCP bridge. No concrete app-specific Page
Objects, no locators, no login flow, and no live-DOM verification happen during scaffolding. The
questionnaire never asks for credentials. Session capture (`eitr auth`) is a separate, explicit,
opt-in step - never bundled into `eitr new`.

## Alternatives Considered

- **Keep the full verified-login-slice design.** Rejected: it made "success" depend on a specific
  app's login flow being reachable and scannable, which doesn't generalize across the target
  applications this tool needs to support, and it required credentials during scaffolding, which
  conflicts with never asking for them.
- **Generate concrete Page Objects/locators immediately via live-DOM inspection at generation
  time.** Rejected: this pulls a browser dependency and network reachability into the deterministic
  `plan()`/`apply()` path (see [0002](0002-no-llm-in-core.md)), and is exactly the kind of work an
  AI assistant does better after the core exists, with the live app open, than a one-shot CLI run
  can.

## Consequences

- A freshly generated project has no app-specific tests yet - the AI-assistant skills
  (`/scan-and-generate-pom`, `/automate-test`, `/map-site`) are what add them, not the generator
  itself. This is a deliberate scope boundary, not a missing feature.
- Verification of "does this locator actually work" moved from a dedicated `verify` CLI command to
  AI-agent-driven live-DOM checks (`pom-engineer`, the anti-fake-green assertion engine - see
  [`ai-agent-integration.md`](../ai-agent-integration.md)), since there is no locator to verify
  until the AI-driven step creates one.
