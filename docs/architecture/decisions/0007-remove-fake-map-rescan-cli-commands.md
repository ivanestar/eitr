# 0007: Remove the fake `eitr map`/`eitr rescan` CLI commands

**Status:** Accepted

## Context

`eitr map` and `eitr rescan`/`eitr recon` existed as CLI commands claiming to crawl a target
application's routes and rescan Page Object locators after a UI redesign. Investigating the actual
implementations (prompted by a decision to route this kind of work through AI-assistant skills
instead of human-typed CLI verbs) found both were non-functional: `crawlSiteMap()` returned
hardcoded route/component data regardless of the actual target URL (fixed candidate paths, fixed
component lists keyed off a path substring, `status: 200` always - it never opened a browser or
touched the real app), and `runRescan()` never inspected a live DOM or rewrote a single locator - it
only printed success-looking status lines for files it found already present, including a fabricated
closing claim ("All Page Objects verified 100% Green against live DOM!") with no DOM ever touched.
Both commands' own `--help` text and this project's own architecture docs had described them as
doing real work.

Separately, and independent of the fabrication finding: site crawling and locator rescanning
fundamentally need a live browser with real DOM access, which an AI assistant's own terminal session
has (it can drive a real browser, inspect real markup) and a headless CLI stub cannot legitimately
fake without doing the real work a browser automation library would require.

## Decision

Delete `eitr map` and `eitr rescan`/`eitr recon` entirely - the CLI commands, their `index.ts`
registration, and their unit tests. Site mapping and locator rescanning are exclusively AI-assistant
skills (`/map-site`, `/bulk-rescan`), which already existed, already describe a real live-DOM-driven
workflow, and are not affected by this removal.

## Alternatives Considered

- **Fix the CLI commands to do real crawling/rescanning.** Rejected: this would mean either
  embedding a full browser-automation dependency into the lightweight CLI package (conflicting with
  keeping `detect/plan/apply` fast and dependency-light - see
  [0002](0002-no-llm-in-core.md)/[0001](0001-deterministic-core-only-scaffolder.md)) or building a
  second, redundant implementation of exactly what `/map-site`/`/bulk-rescan` already do correctly
  through the AI assistant's own browser access.
- **Keep the CLI commands as thin wrappers that just print "use the skill instead."** Rejected: a
  command that exists only to redirect elsewhere is dead weight in the `--help` output and the
  codebase for zero benefit over simply not having the command.

## Consequences

- `eitr map`/`eitr rescan` are gone from `--help`, the README, and this project's docs - referenced
  only as history in `CHANGELOG.md` and as the explicit "why removed" note in
  [`ai-agent-integration.md`](../ai-agent-integration.md).
- Site mapping and rescanning are no longer available to a user with no AI assistant configured -
  accepted, since the CLI versions never actually worked for that user either.
