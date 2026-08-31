---
name: framework-quality-audit
description: On-demand, unbiased multi-angle quality audit of an EITR-generated test framework for any language + automation-tool combination (e.g. TypeScript+Playwright, Python+pytest, Java+Selenium, C#+Playwright). Scores a fixed set of 19 categories on a 1-10 scale with objective file-referenced evidence, lists ALL found gaps (not just top picks) and concrete killer-feature ideas, and publishes a deterministically-structured HTML Artifact report so every audit looks and reads the same regardless of stack or date. Trigger on requests like "аудит фреймворка", "оцени генерацию", "quality audit for <language>+<tool>", "проведи ревью качества".
---

# Framework Quality Audit

## Purpose

EITR's core product bet (see `docs/architecture/README.md` Section 1, "Introduction & Goals") is that the
generated framework is the deterministic first layer of a larger SDET ecosystem, not a disposable
scaffold. That means generation quality has to be checked periodically, per stack combination, with
a report that is **comparable across runs** — same categories, same scoring rigor, same layout —
so drift and regressions show up as a diff in scores over time, not as a differently-shaped essay
each time.

This skill is intentionally a **process + report-shape** definition, not a scorecard. It carries no
memorized scores or verdicts from any prior run — each invocation is a fresh, unbiased read of
whatever the generator currently produces for the requested stack. Never seed a new audit with
a previous run's numbers.

## When to use

Invoke this skill whenever the user asks for a quality/maturity audit, review, or scorecard of an
EITR-generated framework — for the TS+Playwright combo or any other supported language +
automation-tool pairing. If the user names a stack, audit that stack. If they don't, ask which
stack (or default to whichever sample project already exists in the repo, if any).

## The 19 fixed categories (exact names, exact order, exact grouping)

Never rename, reorder, merge, split, or add/remove a category between runs — that is what makes
scores comparable across audits. If a category is genuinely inapplicable to a given stack (e.g. a
language with no equivalent of a given concern), still include its row and mark it `N/A` with a
one-line reason rather than omitting it.

### Group A — Framework code (10 categories)

1. **CPOM-архитектура** — base classes/primitives/widgets for the stack's Page-Object-Model
   equivalent: no assertions in base components, `Now()`-suffix (or language-idiomatic equivalent)
   convention for state getters, auto-retry semantics, collection/list handling, type-safety
   discipline (generics/casts isolated and documented).
2. **Тесты и фикстуры** — dependency-injection/fixture pattern, auth bootstrap quality, 3-tier
   locator priority usage, dynamic TDM usage in examples, dual-layer (UI+API) example coverage,
   `test.step()`-equivalent step demarcation in shipped examples (not just described in docs).
3. **Конфиг тест-раннера** (`playwright.config.ts` / `pytest.ini` / `pom.xml` / etc.) — projects/
   environments setup, retries, trace/video/screenshot or language-equivalent diagnostics, reporters,
   cross-browser or cross-target coverage, sharding support.
4. **CI/CD** — real vs. placeholder pipelines across every CI provider the generator claims to
   support; whether gates (lint, type-check) are actually wired in as enforced steps; caching;
   sharding/matrix parallelism; whether every provider is genuine pipeline-as-code or some are
   instructions-only.
5. **TDM-хелперы** — dynamic test-data generators, collision resistance, zero-dependency discipline,
   teardown/cleanup isolation, bulk/seed data loading if claimed.
6. **Конфиг и окружение** — env var documentation completeness (does `.env.example` list every var
   the generated code actually reads), secrets handling, multi-environment support, whether
   generated team-shared config actually reaches version control (`.gitignore` correctness).
7. **Линт / формат / типы** — type-checker strictness, real static-analysis gates vs. decorative
   ones, real linter (ESLint/Ruff/Checkstyle/etc.) presence vs. a narrow hand-rolled regex script,
   coverage of the rules the framework's own AI-rules docs claim to enforce.
8. **Документация** — README/CONVENTIONS accuracy against actual generated file inventory (stale
   inventories count against this), concreteness of instructions, presence of a worked example that
   actually exists in the generated tree (not just described in prose).
9. **Zero lock-in** — grep the entire generated tree for the tool's own brand name in any form,
   including in live protocol/handshake surfaces (e.g. an MCP `serverInfo.name`), not just in
   filenames or comments. Any hit outside a legitimate self-referential config filename is a finding.
10. **Мёртвый код / долг шаблонов** — TODO/FIXME/HACK markers, unused/aspirational commented-out
    code referencing nonexistent classes, redundant/overlapping primitives, any generator-template
    code that looks unfinished or duplicated.

### Group B — AI ecosystem (8 categories + 1 explicit gap check)

11. **Паритет ассистентов (N шт.)** — for every AI assistant EITR claims to support (Claude Code,
    Cursor, Windsurf, Codex, Copilot, Antigravity, Aider — update the count if the supported list
    changes), confirm real non-placeholder generated config exists, note any assistant that's
    thinner than the rest.
12. **Качество агентов** — read at least 1-2 generated agent definitions fully: concrete/measurable
    instructions vs. vague adjectives, tool scoping matched to role (not one identical tool list for
    every agent regardless of what it does), whether the agent is genuinely self-contained in a
    fresh project with zero knowledge of EITR's own internals.
13. **Качество скиллов** — same assessment for generated skills; check for accidental duplicate
    skill registrations (same capability under two names).
14. **Слэш-команды** — presence and native-format correctness of invocable commands across
    assistants; whether a user has any single place that maps one capability to its exact invocation
    syntax in each assistant they might use.
15. **MCP-мост** — read the actual embedded MCP server source (not just its config), and for every
    exposed tool compare the tool's _description_ against what its implementation actually does —
    a tool whose description promises more than the code delivers is a finding, not just "it works."
16. **TMS-интеграции** — for every claimed TMS provider (Jira Xray, Azure DevOps, TestRail, Zephyr,
    etc.), read the actual adapter code and confirm it calls that provider's real, provider-specific
    API — a shared/generic fallback path masquerading as multiple providers (e.g. one generic Jira
    call standing in for both Xray and Zephyr) is a critical finding. Separately verify whether
    result-publish-back (not just fetch) is actually implemented, not just advertised.
17. **Rules-файлы для конечного пользователя** (the generated project's own AGENTS.md/CLAUDE.md/
    equivalent, NOT EITR's own root rule files) — read fully; assess whether the rules are genuinely
    production-grade and specific (concrete good/bad examples, measurable constraints) versus
    generic boilerplate; re-confirm zero lock-in here too.
18. **Свежесть AI-синтаксиса** — cross-check frontmatter schemas, MCP protocol version, and
    per-assistant config formats against currently-known-correct conventions; flag anything that
    looks pinned to a stale spec revision or an unverified format guess. Note explicitly whether the
    repo shows any evidence of a recent live-verification pass (per the project's own AI Ecosystem
    Freshness rule) for the items you're flagging as possibly stale.
19. **Агент requirements→тест-кейсы** — search the generator source for any agent/skill/MCP tool
    that generates test cases from requirements text, TMS ticket content, live application
    exploration, or a design system (e.g. Storybook). Distinguish this clearly from a
    requirements-_quality-validator_ (which checks existing requirements, doesn't generate tests
    from them) or a DOM-crawl/page-object synthesizer (which maps existing UI, doesn't derive test
    cases from requirements). If genuinely absent, score `0/10 — отсутствует` and say so plainly;
    do not round up because the surrounding ecosystem is otherwise strong.

## Process

1. **Determine the target stack.** Confirm language + automation tool with the user if not already
   named. Note the current count/list of supported AI assistants and CI providers from the
   generator source (`packages/cli/src/questionnaire/schema.ts`, `packages/engine/src/plan/templates/`)
   so categories 11 and 4 use accurate, current lists rather than assumptions from a prior audit.

2. **Get real generated output for that stack — never audit from memory or from templates alone.**
   - First check whether a real generated sample for that exact stack already exists checked into
     the repo (e.g. `PlaywrightTests/` for TS+Playwright). If found, verify it isn't stale: compare
     its `.eitr/manifest.json` `engineVersion` against `packages/engine/src/version.ts`.
   - If no sample exists for the requested stack, generate one fresh via the CLI into the
     scratchpad/sandbox directory (never into the repo root — see CLAUDE.md Section 4 cleanliness
     rule) and clean it up after the audit unless the user asks to keep it.
   - Either way, cross-check the sample against the current template source in
     `packages/engine/src/plan/templates/<lang>/` to catch template-vs-output drift.

3. **Run two parallel, independent read-only audits** (spawn as background `Agent` calls so they
   don't block each other or bloat your context) — never do this investigation serially, and never
   let one agent see or bias the other's findings:
   - **Agent 1 — framework code** (categories 1-10). Best-fit agent type: `framework-auditor` if the
     stack is one it already knows how to navigate, otherwise `general-purpose`. Give it: the real
     sample path, the relevant template source path for the stack, and the exact category list from
     Group A above with the check criteria verbatim, plus an instruction to propose stack-specific
     killer-feature ideas (not generic ones).
   - **Agent 2 — AI ecosystem** (categories 11-19). Agent type `general-purpose`. Give it: the
     sample's AI-assistant directories, the MCP bridge and TMS adapter source paths, and the exact
     category list from Group B above with the check criteria verbatim, plus the
     augmentation-not-replacement design principle (agents prepare decisions, humans approve
     consequential/irreversible ones — no autonomous merge/auto-approve designs) as the lens for
     killer-feature ideas.
   - Instruct both agents explicitly: **do not modify any files** (read-only audit); cite concrete
     `file:line` evidence for every claim; do not pad or round up scores for categories the rest of
     the codebase is strong in — score each category independently on its own evidence
     (anti-sycophancy: this is a ruthless, highly critical audit, not a pitch); report ALL gaps
     found, not just the top few; and return findings as structured markdown, one section per
     category, each with a `/10` score, evidence bullets with file references, and category-specific
     gaps.

4. **Synthesize, don't just concatenate.** Once both agents report back:
   - Compute the overall average across the 18 numerically-scored categories (exclude category 19
     from the average if it scored `0 — отсутствует`, and call that out explicitly as a separate
     headline fact rather than folding a hard zero into an average that would understate everything
     else).
   - Merge both agents' flat gap lists into one deduplicated, ordered list — keep every item, most
     severe first, mark which are minor (secondary color) vs. major/critical.
   - Merge both agents' killer-feature ideas into one list, tagged by area.
   - Sort the merged gaps into a two-column priority split: quick fixes (hours) vs. strategic
     investments (days-to-weeks) — a defect a user could fix same-day (typo, missing cache flag,
     wrong RNG call) doesn't belong next to a missing agent architecture.

5. **Build the report using the exact deterministic HTML/CSS structure below.** Load the
   `artifact-design` skill first (required by the Artifact tool before writing any artifact file) —
   but do not redesign from scratch: reuse the token system, layout, and section order below
   verbatim so every audit renders identically regardless of stack or date. The only things that
   change between runs are the stack name, date, scores, evidence bullets, gap list, killer-feature
   list, and priority items — never the visual system or the category taxonomy.

6. **Write the response in Russian** (per this repo's own CLAUDE.md Section 6 language rule),
   concise, with the artifact link and a short critical summary — not a restatement of the whole
   report in chat.

## Deterministic report template (HTML skeleton — fill placeholders, keep everything else identical)

The full HTML skeleton (CSS tokens, section order, and `{{PLACEHOLDER}}`/`<!-- REPEAT -->` markers)
lives in `references/html-skeleton.md` — read it in full before building any report artifact. Reuse
it verbatim; only the stack name, date, scores, evidence bullets, gap list, killer-feature list, and
priority items change between runs, never the visual system or the category taxonomy.

## Scoring discipline (anti-sycompancy guard)

- A category score is earned by evidence in that category alone. Do not let a strong overall
  impression of the codebase pull a weakly-evidenced category up, and do not let one bad category
  drag down a category that has its own solid evidence.
- Every score below 10 needs a stated, concrete reason in the card's evidence bullets — "not quite
  10" without a named defect is not acceptable per this repo's own Uncompromising Engineering Rigor
  mandate.
- Category 19 (requirements→test-case generation agent) is a binary existence check dressed as a
  1-10 category: if genuinely absent, it is `0/10`, not `3/10` for "partial credit" from an adjacent
  agent that does something else. Do not average it into a softer number.
- Treat "the docs say it enforces X" and "the code actually enforces X" as two different claims —
  always verify the second before crediting a category for it.

## After publishing

Report back to the user in Russian: the artifact link, the overall score with one ruthless-but-fair
sentence of context, and the 2-4 single most consequential findings (not a re-listing of all 19
categories — the artifact is the detailed record, the chat message is the executive takeaway).
