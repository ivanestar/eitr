---
name: strategic-architecture-advisor
description: Acts as a strategic architect-advisor for EITR's own product direction (not a generated project's) - reviews current architecture against fresh industry research, hunts for non-obvious synergies between backlog ideas, designs the SDET onboarding flow across greenfield/brownfield x docs/no-docs x tests/no-tests, and records business-language questions only the user can answer. Trigger on requests like "проведи архитектурный ресёрч", "как SDET-помощник посмотри на архитектуру", "стратегическая сессия по архитектуре", "куда развивать EITR".
---

# Strategic Architecture Advisor

## Purpose

This is a periodic, deep-thinking session, not a code-review pass. The goal is to keep EITR's
product direction aligned with the [product vision](../../../docs/architecture/README.md#1-introduction--goals)
("one SDET + an AI-assistant subscription performs at the throughput of several, via agentic work
on a deterministic base") and with what the industry actually looks like _right now_, not at
training-cutoff. Load [`architecture-doc-writer`](../architecture-doc-writer/SKILL.md) alongside
this one if the session produces new ADRs or architecture-doc changes, which it usually should.

## Before anything else: load current state

1. Read `docs/architecture/README.md` and skim the topic files/`decisions/` for what's already
   decided - do not re-propose something already an ADR.
2. Read `TODO.md`'s "Стратегический бэклог" section (or equivalent) - the existing backlog is raw
   material for synergy-hunting, not a list to ignore in favor of inventing from scratch.

## Mandatory fresh web research

Never reason about "current industry best practice" from training data alone for this kind of
session - the AI-testing space moves fast enough that anything more than a few months stale is
liable to be wrong. At minimum, research:

- Agentic/autonomous QA platform architecture (how the market's actual leaders structure the
  orchestration layer, agent roles, human-in-the-loop gates).
- ISTQB's current syllabi relevant to _using_ AI for testing (CT-GenAI - not CT-AI, which is about
  testing AI-based systems as the product under test, a different and mostly irrelevant axis for
  EITR unless the user's target application is itself an AI feature).
- Context engineering / AI coding agent orchestration practice (this governs how EITR's own
  generated `CLAUDE.md`/`AGENTS.md`/skill files should be structured, and whether the
  `sdet-orchestrator` swarm-dispatch pattern matches current best practice or predates it).
- Brownfield/legacy test-suite handling - EITR always builds a fresh, deterministic framework core
  regardless of what already exists on a project (never adopts or wraps an existing suite - see
  `decisions/0001-deterministic-core-only-scaffolder.md`); an existing suite, if any, is at most a
  _reference source_ to mine for signal (routes, locators, business-flow intent) feeding that same
  fresh generation. Research migration/adoption practice for what it reveals about extracting signal
  from legacy code, not to build an adoption path EITR deliberately doesn't want.
- The MCP ecosystem's current state (spec version, conformance-tooling norms) - EITR embeds an MCP
  server in every generated project, so protocol drift is a direct maintenance risk.

### Also mandatory: practitioner forums, not just vendor content

Vendor blogs and "N best practices for 2026" articles describe what's marketed - they rarely admit
what actually broke in production. Explicitly search practitioner-experience sources too: Reddit
(r/QA, r/softwaretesting, r/ExperiencedDevs and similar), Habr (strong Russian-language signal for
this specific domain - real teams publishing detailed build-logs of AI-agent QA harnesses, often
with concrete pitfalls named), DEV.to, Substack, and LinkedIn posts from practitioners (not
vendor/company pages). Search in both English and Russian - Habr in particular has repeatedly
surfaced directly-relevant, detailed war-stories this project benefits from that pure English-vendor
search does not. Weight a first-hand "here's what broke and how we fixed it" post above a
marketing-flavored listicle every time they conflict. Specifically look for: agents gaming their own
success criteria (fixing a test instead of the defect it found, mocking exactly what a test exists
to verify, taking a DOM/auth shortcut that skips the real user path), context-window/token-limit
failure modes at the scale this project's own agents will hit, and any independent team building
something structurally similar to a piece of EITR's own architecture - convergent validation (or
convergent disagreement) from an unrelated team is stronger signal than either result alone.

### Also mandatory: per-provider changelogs/deprecations, and a careful OSS scan

Model/tool providers ship and deprecate capabilities fast enough that a session's own recommendation
can be built on a foundation that's already shifted. Check current changelogs and release notes for
at least: **Anthropic (mandatory - Claude models, Claude Code, the Agent SDK, MCP itself)**, then as
many of the following as time allows - OpenAI (Codex CLI, Agents SDK, API deprecations), xAI (Grok
models, Grok Build), Google (Gemini models, Antigravity CLI), and the tools this project's own
generated skills target or could target (Cursor, Windsurf, Copilot, Aider, and newer entrants like
Cline/Roo Code/Kilo Code/opencode/Grok Build that may not be in EITR's current 7-assistant list -
check `ai-agent-integration.md` against the current list before assuming it's complete). Also check
Playwright itself (not just MCP) - Microsoft's own guidance on agent-facing browser automation has
changed direction before (e.g. recommending a CLI over MCP for a large agent-token-cost reduction)
and a finding like that is exactly the kind of foundational shift this session exists to catch.

Separately, scan public GitHub/GitLab repositories for patterns worth learning from - **ideas and
approaches only, never copied code**. Note the license of anything cited (prefer MIT/Apache/BSD
examples when citing a specific implementation approach) and never suggest vendoring or adapting
code from a repository without explicitly flagging its license and getting the user's confirmation
first - this session proposes patterns for EITR to build its own way, not a source of code to import.

## The SDET day-1 flow matrix

Think through onboarding to a project as three largely-independent axes, not one linear path:

1. **Does a live application exist yet?** (nothing deployed vs. a real URL to point at)
2. **Does an existing automated test suite exist?** (blank slate vs. Selenium/Cypress/old
   Playwright/manual scripts already in place, possibly flaky or undocumented)
3. **Does usable documentation/requirements exist?** (nothing vs. a wiki/PRD vs. populated TMS
   tickets)

For each combination EITR is expected to actually encounter, walk through concretely what a human
SDET would do by hand, then ask: does EITR's current tooling make each step faster, or does the
human still have to do it manually because nothing covers that combination? A gap found this way is
worth far more than a feature invented in the abstract - it's the exact test this session exists to
run. Cross-reference the TODO backlog for cases that are already flagged versus a genuinely new gap.

## Hunt for non-obvious synergies, not just a longer list

The single highest-value output of this kind of session is usually not a new idea nobody thought of

- it's noticing that 3-4 items already in the backlog are actually **the same underlying mechanism
  viewed from different angles**, and building the shared mechanism once is cheaper and more coherent
  than building each separately. Concretely: before proposing a new feature, check whether it shares a
  data model, a trigger point, or a consumer with something else already proposed or already built.
  Say so explicitly when found - this is the "конфетка" moment the session is for, not a nice-to-have.

## Output

1. **A published Artifact** (load `artifact-design` first) with the findings: architecture
   critique + concrete fixes, the day-1 flow matrix with gaps called out, synergy findings, new idea
   proposals (each with a one-line "why now, grounded in what research"), practitioner-forum
   pitfalls worth guarding against explicitly (not just ideas to add - risks to design against, with
   which existing EITR mechanism already covers each one and which don't), and a short, explicitly
   prioritized next-batch shortlist - not an undifferentiated wall of ideas. Cite the actual research
   sources, including the practitioner-forum ones by name (a Habr/Reddit/DEV.to post is a legitimate
   citation here, not a lesser one).
2. **New ADRs** in `docs/architecture/decisions/` for anything this session actually resolves as a
   direction (not for open questions - those go in the strategic-questions file instead).
3. **Strategic questions for the user**, in a local, gitignored file (create
   `docs/architecture/STRATEGY-QUESTIONS.md` if it doesn't exist, and add it to `.gitignore` the
   first time) rather than blocking the session on them or losing them at session end. A strategic
   question is one only the user can answer as the business owner (target audience, monetization,
   compliance exposure, which of several valid directions to prioritize) - a technical question
   with a defensible right answer should just be resolved, not deferred here. Append with a date
   header per session so the file reads as a running log, and mark a question resolved (don't
   delete it) once the user has actually answered it in conversation.
