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
- Brownfield/legacy test-suite adoption and migration strategy - this is the axis most likely to
  reveal a real gap, since EITR's flow is currently greenfield-shaped by default.
- The MCP ecosystem's current state (spec version, conformance-tooling norms) - EITR embeds an MCP
  server in every generated project, so protocol drift is a direct maintenance risk.

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
   proposals (each with a one-line "why now, grounded in what research"), and a short, explicitly
   prioritized next-batch shortlist - not an undifferentiated wall of ideas. Cite the actual research
   sources.
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
