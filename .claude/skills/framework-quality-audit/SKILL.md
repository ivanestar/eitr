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

Use this exact structure, CSS tokens, and section order for every audit. Placeholders are written
as `{{PLACEHOLDER}}`; repeated blocks (category cards, bar rows, gap items, killer cards) are
marked with a `<!-- REPEAT ... -->` comment showing what to loop.

```html
<title>Аудит EITR {{STACK_LABEL}}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

  :root {
    --bg: #f6f5f1;
    --surface: #ffffff;
    --surface-2: #efeee8;
    --ink: #1c1f1d;
    --muted: #5c6460;
    --border: #dedcd3;
    --accent: #0e6e63;
    --accent-ink: #ffffff;
    --accent-soft: #dcefe9;
    --warn: #a3590a;
    --warn-soft: #f6e6d2;
    --crit: #a3271f;
    --crit-soft: #f5dfdc;
    --good: #2f7d4f;
    --good-soft: #dcefe1;
    --bar-track: #e6e4dc;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --bg: #15181a;
      --surface: #1c2023;
      --surface-2: #22262a;
      --ink: #eceeec;
      --muted: #9aa39e;
      --border: #31373a;
      --accent: #5fc9b8;
      --accent-ink: #0c1211;
      --accent-soft: #1e3430;
      --warn: #e0a256;
      --warn-soft: #3a2c19;
      --crit: #e2837b;
      --crit-soft: #3a2320;
      --good: #7fcb9a;
      --good-soft: #1c3226;
      --bar-track: #2a2f32;
    }
  }
  :root[data-theme='dark'] {
    --bg: #15181a;
    --surface: #1c2023;
    --surface-2: #22262a;
    --ink: #eceeec;
    --muted: #9aa39e;
    --border: #31373a;
    --accent: #5fc9b8;
    --accent-ink: #0c1211;
    --accent-soft: #1e3430;
    --warn: #e0a256;
    --warn-soft: #3a2c19;
    --crit: #e2837b;
    --crit-soft: #3a2320;
    --good: #7fcb9a;
    --good-soft: #1c3226;
    --bar-track: #2a2f32;
  }
  * {
    box-sizing: border-box;
  }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Source Sans 3', system-ui, sans-serif;
    line-height: 1.55;
  }
  .wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: 56px 24px 120px;
  }
  h1,
  h2,
  h3 {
    font-family: 'Fraunces', Georgia, serif;
    text-wrap: balance;
    color: var(--ink);
  }
  h1 {
    font-size: 2.6rem;
    font-weight: 700;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  h2 {
    font-size: 1.55rem;
    font-weight: 600;
    margin: 0 0 4px;
  }
  h3 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0 0 2px;
  }
  .kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 700;
    margin-bottom: 14px;
  }
  .lede {
    color: var(--muted);
    font-size: 1.05rem;
    max-width: 65ch;
    margin: 14px 0 0;
  }
  header.hero {
    border-bottom: 1px solid var(--border);
    padding-bottom: 36px;
    margin-bottom: 40px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .headline-score {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-top: 6px;
  }
  .headline-score .num {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 3.4rem;
    color: var(--accent);
    line-height: 1;
  }
  .headline-score .of {
    font-family: 'JetBrains Mono', monospace;
    color: var(--muted);
    font-size: 1.2rem;
  }
  .headline-score .label {
    color: var(--muted);
    font-size: 0.95rem;
    max-width: 38ch;
  }
  .verdict {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    font-size: 0.98rem;
    color: var(--ink);
  }
  .verdict strong {
    color: var(--accent);
  }
  nav.toc {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    margin-bottom: 48px;
    font-size: 0.9rem;
  }
  nav.toc a {
    color: var(--ink);
    text-decoration: none;
    border-bottom: 1px dotted var(--border);
  }
  nav.toc a:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  nav.toc .toc-title {
    grid-column: 1/-1;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.7rem;
    color: var(--muted);
    margin-bottom: 6px;
  }
  section {
    margin-bottom: 56px;
  }
  section.group-open {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 64px 0 24px;
    border-top: 1px solid var(--border);
    padding-top: 28px;
  }
  section.group-open .idx {
    font-family: 'JetBrains Mono', monospace;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.95rem;
  }
  .overview {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 56px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 230px 1fr 56px;
    align-items: center;
    gap: 12px;
  }
  .bar-row .name {
    font-size: 0.88rem;
    color: var(--ink);
  }
  .bar-track {
    height: 10px;
    border-radius: 6px;
    background: var(--bar-track);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 6px;
    background: var(--accent);
  }
  .bar-fill.warn {
    background: var(--warn);
  }
  .bar-fill.crit {
    background: var(--crit);
  }
  .bar-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    color: var(--muted);
    text-align: right;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px 26px;
    margin-bottom: 18px;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
  }
  .score-pill {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 0.95rem;
    padding: 4px 12px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .score-pill.good {
    background: var(--good-soft);
    color: var(--good);
  }
  .score-pill.mid {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .score-pill.low {
    background: var(--crit-soft);
    color: var(--crit);
  }
  ul.ev {
    margin: 0;
    padding-left: 20px;
  }
  ul.ev li {
    margin-bottom: 8px;
    font-size: 0.95rem;
  }
  ul.ev li::marker {
    color: var(--accent);
  }
  code,
  .fp {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82em;
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--ink);
  }
  .gaplist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gaplist li {
    display: flex;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--crit);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 0.92rem;
  }
  .gaplist li.mid {
    border-left-color: var(--warn);
  }
  .gaplist .n {
    font-family: 'JetBrains Mono', monospace;
    color: var(--muted);
    font-size: 0.82rem;
    min-width: 26px;
  }
  .killerlist {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .killer {
    background: var(--accent-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
  }
  .killer h4 {
    margin: 0 0 6px;
    font-family: 'Source Sans 3';
    font-weight: 700;
    font-size: 0.98rem;
    color: var(--ink);
  }
  .killer p {
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink);
  }
  .killer .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 2px 8px;
    border-radius: 999px;
    margin-left: 8px;
  }
  .priority {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 700px) {
    .priority {
      grid-template-columns: 1fr;
    }
    nav.toc {
      grid-template-columns: 1fr;
    }
    .bar-row {
      grid-template-columns: 150px 1fr 40px;
    }
  }
  .prio-col {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
  }
  .prio-col h4 {
    margin: 0 0 10px;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .prio-col ol {
    margin: 0;
    padding-left: 18px;
    font-size: 0.9rem;
  }
  .prio-col li {
    margin-bottom: 8px;
  }
  footer {
    border-top: 1px solid var(--border);
    margin-top: 60px;
    padding-top: 20px;
    font-size: 0.82rem;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
  }
  a {
    color: var(--accent);
  }
  ::selection {
    background: var(--accent-soft);
  }
</style>

<div class="wrap">
  <header class="hero">
    <div class="kicker">Аудит генератора · {{STACK_LABEL}} · {{DATE}}</div>
    <h1>{{HEADLINE}}</h1>
    <p class="lede">{{SCOPE_NOTE — sample path used, engineVersion/staleness check result}}</p>
    <div class="headline-score">
      <span class="num">{{OVERALL_SCORE}}</span><span class="of">/ 10</span>
      <span class="label">{{ONE_LINE_HEADLINE_TAKEAWAY}}</span>
    </div>
    <div class="verdict"><strong>Главный вывод:</strong> {{2-4 SENTENCE RUTHLESS VERDICT}}</div>
  </header>

  <nav class="toc">
    <div class="toc-title">Разделы отчёта</div>
    <a href="#overview">Обзор всех оценок</a>
    <a href="#code">A. Код фреймворка (10 категорий)</a>
    <a href="#ai">B. AI-экосистема (8 категорий + гэп)</a>
    <a href="#gaps">Полный список гэпов</a>
    <a href="#killer">Killer-фичи</a>
    <a href="#priority">Приоритеты: что чинить в первую очередь</a>
  </nav>

  <section id="overview">
    <h2>Обзор</h2>
    <div class="overview">
      <!-- REPEAT for all 19 categories, in the fixed order from this skill:
      <div class="bar-row"><div class="name">{{CATEGORY NAME}}</div>
        <div class="bar-track"><div class="bar-fill {{warn|crit if <7|<5}}" style="width:{{SCORE*10}}%"></div></div>
        <div class="bar-score">{{SCORE}}/10</div></div>
      -->
    </div>
  </section>

  <section class="group-open" id="code">
    <span class="idx">A</span>
    <h2>Код фреймворка</h2>
  </section>
  <!-- REPEAT one .card per category 1-10:
  <div class="card">
    <div class="card-head"><h3>{{CATEGORY NAME}}</h3><span class="score-pill {{good|mid|low}}">{{SCORE}}/10</span></div>
    <ul class="ev"><li>{{evidence bullet with file:line}}</li> ... </ul>
  </div>
  -->

  <section class="group-open" id="ai">
    <span class="idx">B</span>
    <h2>AI-экосистема</h2>
  </section>
  <!-- REPEAT one .card per category 11-19 (category 19 gets card style="border-color:var(--crit);" if score is 0) -->

  <section id="gaps">
    <h2>Полный список гэпов</h2>
    <ul class="gaplist">
      <!-- REPEAT: <li class="{{mid if minor}}"><span class="n">{{NN}}</span><span>{{gap text}}</span></li> -->
    </ul>
  </section>

  <section id="killer">
    <h2>Killer-фичи</h2>
    <div class="killerlist">
      <!-- REPEAT: <div class="killer"><h4>{{idea title}}<span class="tag">{{area tag}}</span></h4><p>{{1-3 sentence description}}</p></div> -->
    </div>
  </section>

  <section id="priority">
    <h2>Приоритеты</h2>
    <div class="priority">
      <div class="prio-col">
        <h4>Быстрые правки (часы)</h4>
        <ol>
          <!-- REPEAT -->
        </ol>
      </div>
      <div class="prio-col">
        <h4>Стратегические инвестиции (дни–недели)</h4>
        <ol>
          <!-- REPEAT -->
        </ol>
      </div>
    </div>
  </section>

  <footer>
    Источники: {{sample path + engineVersion}} · {{template source path(s)}} · два независимых
    read-only аудита
  </footer>
</div>
```

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
