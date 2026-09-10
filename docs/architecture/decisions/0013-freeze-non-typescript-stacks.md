# 0013: Freeze the non-TypeScript stacks rather than ship four half-carried ones

## Status

Accepted

## Context

The generator supports four languages (TypeScript, Python, C#, Java) and two runners (Playwright,
Cypress), and Section 1 of `CLAUDE.md`/`AGENTS.md` required every new capability to land across all
of them simultaneously. That multiplied the cost of each feature by four and spread verification
thin: the crawl, the analysis pipeline and the AI-artifact layer were exercised end to end against
real applications on TypeScript only, while the other stacks were verified by generation tests and
build smoke runs.

Three forces made the multiplier worse than it looks on paper:

- **Playwright's own ecosystem is not evenly distributed.** The core browser API has parity across
  bindings, but `@playwright/test`, UI mode, the HTML reporter and the VS Code extension exist for
  Node only. A generated Python or Java project therefore cannot be the same product as the
  TypeScript one, however carefully the generator is written. Even the release trains differ - the
  repository's own `check:playwright` has repeatedly found the JavaScript pin ahead of PyPI, Maven
  Central and NuGet.
- **Verification cost is concentrated in the frozen stacks.** The full-cycle and pairwise E2E
  suites ran real `pip`, `mvn`, `gradle` and `dotnet` builds; CI carried four build-tool caches
  purely to make them tolerable. That is most of the pipeline's wall-clock time spent on stacks with
  no users yet.
- **Nothing has shipped.** There is no released version and no installed base, so no one is relying
  on the Python, C# or Java output today. The cost of narrowing is at its lowest it will ever be.

## Decision

**TypeScript + Playwright is the only stack this project generates and supports.** Python, C#, Java
and Cypress are _frozen_: their generators, templates, CPOM linters and tests all remain in the
repository and still work, but they are not offered by the questionnaire, refused by
`eitr generate`, excluded from the doctor's environment report, and their tests do not run in any
suite.

The parity standard is narrowed rather than dropped. It no longer has a language axis; it still
applies in full to every other axis a capability can span - AI-assistant artifacts, CI/CD
providers, task trackers and TMS integrations, and the analysis pipeline's own scripts and schemas.

Unfreezing a stack is a deliberate act with three edits: the questionnaire choice, the pair in
`generate.ts`'s `SUPPORTED` list, and the two lines in `packages/engine/test/helpers/frozen.ts`
that turn its tests back on.

## Alternatives Considered

- **Delete the non-TypeScript generators outright.** Removes the most trouble - roughly 3.5k lines
  of templates plus 96 language branches through shared files - and makes the README honest with no
  caveat. Rejected because the code works today and returning it later would not be a revert: the
  CPOM layer, the skills and the artifact pipeline have all changed shape three times in recent
  weeks, so a restored generator would need porting, not un-deleting. The cost of keeping it is
  bounded and the cost of recreating it is not.
- **Keep all four stacks in the release.** Zero work now. Rejected because the release would promise
  four stacks while only one has been carried to a verified working suite against real applications,
  and the first defect reported against a Java project would consume the time the first release most
  needs.
- **Hide them from the questionnaire but leave the parity rule and the test suites alone.** The
  smallest change. Rejected because it leaves a rule requiring four implementations of every feature
  for stacks nobody can select - a rule that would be broken weekly - and keeps the E2E suites
  paying for builds of projects nothing can produce.

## Consequences

- The frozen code has no test signal. Nothing runs it, so an unrelated refactor can break it
  silently, and unfreezing will start with repairs rather than a green suite. That is accepted
  explicitly: the rules now say not to fix a frozen path in passing, and to report it in the pull
  request instead, so the breakage is at least visible when it happens.
- CI loses four build-tool caches and most of its E2E wall-clock time. The pairwise matrix shrinks
  from 16 combinations to 6, which now vary framework, UI library, CI provider and AI assistant
  instead of language.
- The questionnaire's language and runner questions each have one option. They are kept rather than
  removed so that unfreezing restores a list rather than reintroducing a question.
- The `check:playwright` staleness report covers TypeScript only. The frozen pins stay in the
  templates, and the rendered container-image tags are still resolved against the registry for every
  stack, since a template rendering an unresolvable tag is broken whether or not anyone generates
  from it.
- `README.md` promises one stack, and says new languages and runners follow demand and the capacity
  to support them.
