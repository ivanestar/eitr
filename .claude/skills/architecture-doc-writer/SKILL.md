---
name: architecture-doc-writer
description: How to write and maintain EITR's architecture documentation (docs/architecture/) - arc42-lite structure for the living system description, Nygard-format ADRs for individual decisions. Load before editing anything under docs/architecture/, or when asked to document a new architectural decision.
---

# Architecture Documentation Standard

`docs/architecture/` is EITR's living architecture description. It follows two established,
industry-standard formats rather than an invented one - [arc42](https://arc42.org/documentation/)
for the overall document structure and [Nygard-format ADRs](https://adr.github.io/) for individual
decisions - because both are well-understood, and reusing an established format means a reader
already knows how to navigate it.

## The hard rule: describe the system, don't narrate its history

`docs/architecture/` documents **what the system is and why it is shaped this way, in the present
tense.** It is not a log of who decided what on which date. Every one of these patterns is
disallowed in `docs/architecture/`:

- `"Confirmed with the user after..."`, `"Decided on 2026-08-29..."`, `"Status: PIVOTED..."`
- `"SUPERSEDED by the pivot above"`, `"(HARDENED)"` - stale-marking prose instead of just deleting
  the stale content or writing a new ADR that supersedes the old one
- `"Env note (settled this session): ..."` - session/environment trivia that belongs in a commit
  message or `TODO.md`, not the architecture description

That kind of narrative belongs in `CHANGELOG.md` (what shipped, when) or `git log` (who changed what
and why, at the time). If you're tempted to write a date or "the user decided" into
`docs/architecture/`, stop - either the content is a decision (write an ADR) or it's just the
current state (write it as a plain, dateless fact).

## Structure

```
docs/architecture/
  README.md                    -- arc42-lite overview: intro & goals, non-goals, constraints,
                                   high-level structure, a "where to find things" index, glossary
  <topic>.md                   -- one file per major subsystem/concern (data model, generation
                                   engine, AI integration, quality gates, ...) - split when a topic
                                   would make README.md too long to skim, not before
  known-gaps.md                -- deliberate backlog / risks & technical debt (arc42's "Risks and
                                   Technical Debt" section) - NOT routine bug tracking, that's TODO.md
  decisions/
    README.md                  -- ADR format + index table (number, title, status)
    NNNN-kebab-case-title.md   -- one ADR per decision, sequentially numbered, zero-padded to 4
```

Split a new topic into its own file once README.md's "where to find things" table would otherwise
need an entry that doesn't fit in a couple of sentences - don't pre-split into many tiny files
before there's enough content to justify the navigation cost.

## Writing an ADR

One ADR per **decision that had real alternatives that were seriously weighed**. Not every choice
made in the codebase needs one - only the ones where someone reading the code later would reasonably
ask "why not the obvious other way?" Use this exact structure (see any file in `decisions/` for a
live example):

1. **Title** - `NNNN: <the decision, stated as a decision>` (e.g. "No LLM in the plan/apply core",
   not "LLM usage").
2. **Status** - `Accepted`, `Superseded by NNNN`, or `Deprecated`.
3. **Context** - the problem, forces, and constraints that made a decision necessary. Enough that
   someone unfamiliar with the history understands why this needed deciding at all.
4. **Decision** - what was actually chosen, as a clear statement, not a feature walkthrough.
5. **Alternatives Considered** - the real options that were on the table, each in one or two
   sentences: what it was and specifically why it was rejected. Do not pad this with options nobody
   actually considered just to look thorough - a short, honest list beats an exhaustive fake one.
6. **Consequences** - what this decision costs or constrains going forward, not only what it buys.
   A decision with no real trade-off is unusual; if you can't name one, look harder before shipping
   the ADR.

**ADRs are immutable once `Accepted`.** To change a decision, write a new ADR and set the old one's
status to `Superseded by NNNN` - never edit an accepted ADR's Context/Decision retroactively to match
a new reality.

## When to write one

- A choice was made between two or more real approaches and the reasoning isn't obvious from the
  code alone → write an ADR.
- The user or the assistant just resolved an architectural question in conversation (a removal, a
  reversal, a new mechanism) → write an ADR while the reasoning is fresh, in the same batch of work,
  not as a follow-up task.
- A past decision is being reversed → write a new ADR; mark the old one `Superseded by NNNN` rather
  than deleting it (the rejected path and why it was rejected the first time is exactly the kind of
  context a future reversal needs).
- It's a routine implementation detail with one obviously-correct way to do it → no ADR; it belongs
  in the relevant topic file (or nowhere, if it's genuinely self-evident from the code).

## Cross-referencing

- Link between `docs/architecture/` files with relative Markdown links (`[text](./other.md)`,
  `[text](decisions/0004-....md)`), not by re-explaining content that already lives elsewhere.
- Reference an ADR from the topic file whose subsystem it affects (`... - see
decisions/0004-path-authority-regeneration.md for why.`) rather than only linking it from the
  decisions index - a reader in the topic file needs the "why" one click away, not a hunt through the
  index.
- After any change to `docs/architecture/`, grep the repo for `docs/architecture.md` (the old single
  file, retired - see `decisions/` for when this restructuring itself needs referencing) and for
  moved/renamed section names, to catch stale links in `README.md`, `CONTRIBUTING.md`,
  `CLAUDE.md`/`AGENTS.md`, and skill files. Per the Grep-Confirmed Removal rule
  (`CLAUDE.md`/`AGENTS.md` Section 8), zero remaining references outside `CHANGELOG.md` history is
  the bar, not "I updated the ones I remembered."

## Sources

This structure follows established, independently-verified practice rather than an invented format:
[arc42 Documentation](https://arc42.org/documentation/) (the overall living-document structure),
[Architectural Decision Records (adr.github.io)](https://adr.github.io/) and its
[ADR templates](https://adr.github.io/adr-templates/) (the Nygard Context/Decision/Consequences
format, extended here with an explicit Alternatives Considered section), and
[TechTarget's ADR best-practices summary](https://www.techtarget.com/searchapparchitecture/tip/4-best-practices-for-creating-architecture-decision-records)
(single-focused-decision sizing, immutability, status indicators). The C4 model
(context/container/component/code diagram levels) is a complementary framework for diagramming that
this project has not adopted diagramming tooling for yet - if `docs/architecture/` ever needs
diagrams beyond the plain-text trees already in use, reach for C4's levels rather than inventing an
ad hoc diagram style.
