---
name: axis-closure-matrix
description: Produces a research-backed Core/Extended gap matrix for exactly ONE named EITR architecture axis (e.g. "CPOM base for Python", "CI/CD generator", "AI-agent layer") at a time, ending in a checkable Definition of Done and explicit re-open triggers instead of an open-ended audit. Trigger only when the user explicitly names a specific axis and asks to research/score/close it — phrases like "матрица по оси X", "closure-план для X", "проверь ось X", "что осталось по X". Never self-invoke to propose a new axis on your own initiative.
---

# Axis Closure Matrix

## Purpose

EITR's architecture has more surface area than can be audited all at once, and open-ended "let's
review the whole thing again" passes never converge — any sufficiently complex codebase has
near-infinite room for "could be more complete," so a fully open audit just burns tokens without
ever reaching a release-ready verdict. This skill exists to replace that loop with a **bounded**
per-axis process: pick one architecture area, research what a genuinely solid version of it needs
from real external sources (never from memory), compare it line-by-line against what EITR currently
does, and stop at an explicit, checkable Definition of Done — not at "looks good enough."

An axis qualifies for a single pass of this skill only if it maps to **at most 3
independently-versioned subsystems** (e.g. "CI/CD generator" = 4 CI providers sharing one
`cicd.ts` source = 1 subsystem; "AI-agent layer" = agents + skills + MCP bridge + slash-commands =
4 independently-versioned subsystems, so it does NOT qualify as one axis) **and** is expected to
produce **at most ~15 Core+Extended table rows**. Examples that qualify as one axis: "the
TS+Playwright CPOM base," "the CI/CD generator," "the Python CPOM base." If the named target
exceeds either bound — "the AI-agent layer," "the entire codebase," or anything you cannot map to
a single noun phrase after 1-2 clarifying questions — do not run the full process against it as
one axis; instead propose 2-4 named sub-axes (e.g. "AI-agent layer" → "agent definitions,"
"skill definitions," "MCP bridge," "slash-command layer") and ask the user which one to start
with.

## When to use

**Good trigger** — user names one qualifying axis and asks for research/matrix/closure status:
`"матрица по оси CI/CD генератора"`, `"проверь ось Python CPOM base"`, `"что осталось по
TS+Playwright базе"`. Proceed directly.

**Bad trigger — do not proceed, ask first** — the request names no axis, or names one that fails
the size bound above: `"давай ещё раз всё перепроверим"` (no axis named — ask which one),
`"проверь AI-слой целиком"` (fails the ≤3-subsystem bound — propose the sub-axis split above and
ask which sub-axis to start with).

Never invoke this skill proactively to suggest auditing some other part of the codebase on your
own initiative — that reintroduces the exact unbounded-audit loop this skill was created to end.

**Step 0 — check for a prior closure before starting new research.** Before doing any research,
run `Artifact action:"list"` (or ask the user for the link if you suspect one exists outside this
session) and look for an existing artifact whose title matches this axis. If one exists and its
Definition of Done was met (status `ЗАКРЫТА`), do not start new research — ask the user to name
which specific re-open trigger from step 4 applies before proceeding. If no matching closed
artifact exists, or the user names a valid trigger, proceed to step 1.

## The process (four deliverables, in order)

1. **Real, cited research.** Never invent what a solid version of the axis needs from memory — every
   requirement in the table must trace to a source that is either (a) the tool/platform's own
   official documentation, (b) a GitHub repository with ≥1,000 stars (≥500 stars if the axis's tool
   is itself a niche/low-adoption one), or (c) a post on the tool's own engineering blog. Sources
   outside these three categories do not count as citable evidence for a Core/Extended
   classification. Delegate the research to the `web-researcher` agent whenever the axis touches
   **3 or more** distinct external tools/platforms/vendors (e.g. 4 CI providers); do the research
   directly yourself when it touches 1-2. When delegating, give the agent the current EITR code for
   the axis as context and a numbered list of exactly what needs a citable answer, and require every
   claim in its report to name a source URL meeting the criteria above.
   - If no source meeting the criteria above resolves a question, mark it **unresolved** — do not
     guess a verdict either way.
   - If two sources that both meet the criteria above directly conflict on the same row, do not pick
     one — mark the row `—`/unresolved in the Core/Extended column and quote both conflicting claims
     verbatim in "Действие," naming both sources.

2. **One consolidated Core/Extended table.** Columns, in this exact order:
   `Категория | Core/Ext | Что говорит ресёрч | Реализовано | Протестировано вживую |
Регрессионные тесты | Действие`.
   - **Core** if, and only if, its absence would break CPOM contract checks, break CI, or produce
     incorrect generated code in at least 1 of the languages/systems this axis covers — a
     correctness/contract test, not a subjective feel.
   - **Extended** if it only applies to a subset of possible target-project shapes (a project type,
     a scale, an optional integration) and can be fully covered by documenting it as an opt-in
     pattern with zero unconditionally-generated code — do not pad the framework with something a
     given project may never need just to raise a score.
   - "Что говорит ресёрч" must carry a citation meeting step 1's source criteria for every row, not
     just a claim.
   - **"Реализовано"** (Да/Нет/Частично + `file:line`): grounded in an actual read of the current
     source — never assumed from a prior audit or from the template's own docstring/description.
     Verify a check's real scope empirically (read the code) rather than trusting what its name
     implies. This column answers only "does the code exist," nothing about whether it works.
   - **"Протестировано вживую"** (Да/Нет + what was actually run): answers "was this row's exact
     behavior executed for real at least once," not "does a unit test exist for it." Да requires at
     minimum **System**-level execution per the four levels below; a passing unit/integration test
     alone is Нет here, even if it's green. Be honest when the answer is Нет because the real
     external target isn't available to this session (e.g. no live CI-provider server to push to) —
     record that as the reason, don't leave the cell ambiguous or skip it.
   - **"Регрессионные тесты"** (which of the four levels below exist, or "нет"): what automated,
     repeatable coverage protects this row going forward, independent of whether it happened to get
     live-tested this pass. Name the actual test file(s), not just the level.
     - **Unit** — a test asserting one render/generator function's output content in isolation
       (string/AST assertion against its return value), no filesystem or process execution.
     - **Integration** — a test asserting multiple generators' combined output together in-memory
       (e.g. `plan()`'s full file list/content for a given profile), still no real toolchain run.
     - **System** — a test that writes a real generated project to disk and executes the real
       target toolchain against it end-to-end (e.g. actually running `mvn test`/`gradle
test`/`pytest`/`npm test` against freshly generated output) — proves the generated artifact
       actually works standalone, not just that the generator produced plausible-looking text.
     - **Acceptance** — the generated artifact exercised against the real external system it's
       built for, outside EITR's own test harness (an actual GitHub Actions run on a real repo, a
       real GitLab CI pipeline, a real TeamCity server build). Often infeasible inside a single
       session with no access to that external system — mark it honestly absent rather than
       claiming it.
   - A row you could not resolve to Core or Extended with real evidence gets `—` in that column and
     an explicit note in "Действие" that it needs a follow-up lookup — never force a guess into
     Core or Extended just to fill the cell.
   - Every claimed gap must be real and verified, never invented to make the matrix look more
     rigorous — this mirrors the project's own scoring-methodology standard: a gap is only a gap if
     it is grounded in an actual file, missing capability, or genuine limitation you checked.

   **Worked example row** (format reference, not literal content to reuse):
   `Auth bootstrap | Core | Playwright docs recommend storageState reuse across the whole suite
(playwright.dev/docs/auth) | Да, packages/engine/src/plan/templates/auth-setup.ts:12 | Да — real
generated project, real Playwright test run against a live app | System
(packages/cli/test/e2e.full-cycle.test.ts), Integration (plan.matrix.test.ts); no Acceptance (never
run in a real CI provider) | none — closed`

3. **An explicit, checkable Definition of Done.** State the exact condition under which the axis
   counts as closed — normally: every Core row has "Реализовано" = Да, has at least System-level
   coverage in "Регрессионные тесты" (Unit/Integration alone is not enough for a Core row — a test
   that never actually runs the generated output is not proof it works), every Extended row has a
   recorded rationale for staying Extended, and zero rows are in an unresolved "missing/buggy"
   state. A Core row with "Протестировано вживую" = Нет does **not** by itself block closure — being
   honest about it does — as long as System-level regression coverage exists and the reason live/
   Acceptance-level testing wasn't possible this pass is stated (e.g. no access to a real CI-provider
   server). If any Core row is still open on implementation or lacks System-level regression
   coverage, the axis is **not** closed — say so plainly (open axis, punch list of what's left)
   rather than rounding up to "basically done."

4. **Explicit re-open triggers.** Name the specific future external events that would legitimately
   justify revisiting this axis later (a new major version of a tool the axis depends on, a real
   user-reported bug in a Core row, new official guidance superseding a row). **A new internal audit
   finding something on its own initiative is explicitly NOT a valid re-open trigger** — say this in
   the report itself, every time. That is precisely the loop this skill exists to prevent.

## Report shape (deterministic HTML template)

Load the `artifact-design` skill before writing the file (required by the Artifact tool). Reuse
this structure and token system for every axis matrix so they read as one consistent series
regardless of axis or date — only the content changes, not the shape:

- A `kicker` line stating which axis this is, its explicit scope boundary (what's deliberately
  excluded, if anything), and current status (`ОТКРЫТА` / `ЗАКРЫТА`).
- A short "Итог ресёрча" paragraph — 2-4 sentences, prose, citing the strongest 1-2 sources.
- A stat-row summarizing counts: confirmed bugs, Core gaps, Extended/OK-as-is, already-correct
  rows, and unresolved-by-research rows — so the reader gets the shape of the matrix before the
  table itself.
- The Core/Extended table itself, using the 7-column schema from step 2, with `<span class="badge
core">`/`<span class="badge ext">` tags for Core/Ext, and `<span class="status ok/warn/bad/na">` for
  both "Реализовано" and "Протестировано вживую" (green Да / red Нет / grey — for a row where the
  answer is context-dependent, e.g. "Частично") — reuse the color tokens already established in
  this repo's prior axis artifacts: `--good`, `--warn`, `--bad`, `--ink-soft`. "Регрессионные тесты"
  is plain text naming the levels and files, not a badge.
- A "Definition of Done" callout — green/`done` styling only if every Core row is actually closed,
  otherwise amber/`open` styling with the explicit punch list of what remains.
- A "Триггеры на переоткрытие" callout listing the legitimate re-open triggers from step 4,
  including the explicit "NOT a trigger" line about self-initiated audits.
- A footer naming the real sources consulted and the date.

Base the palette and type choices on the axis's own subject matter (a CI/CD matrix can read
differently from a language-runtime matrix) rather than reusing one hardcoded hex palette verbatim
— follow the `artifact-design` skill's guidance on choosing a considered, non-default palette, but
keep the same layout skeleton, column schema, and section order across axes.

## After publishing

Report back in Russian (per this repo's own CLAUDE.md Section 6 language rule): the artifact link,
whether the axis is closed or open, and — if open — the short punch list of remaining Core gaps.
Do not restate the full table in chat; the artifact is the record. Do not propose which axis to do
next unless the user asks.

## Anti-patterns this skill exists to prevent

- Re-running the same axis "just to double-check" without a new re-open trigger from step 4.
- Scoring or closing more than one axis in a single pass — pick one, finish it, stop.
- Treating "the code looks fine on a skim" as equivalent to "verified against cited research" —
  every Core/Extended classification needs both a citation and a file:line check, not either alone.
- Rounding an open axis (any unresolved Core row) up to closed because most of the table is green.
