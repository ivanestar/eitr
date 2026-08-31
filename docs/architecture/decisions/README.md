# Architecture Decision Records

Each file here records one architectural decision: the problem it solves, the path taken, the
alternatives that were seriously considered, and why they were rejected in favor of the chosen one.
This is where "why is it built this way and not the obvious other way" lives - the rest of
[`docs/architecture/`](../README.md) describes the resulting system, not the reasoning behind each
fork in the road.

## Format

Nygard-style, one page per decision:

- **Status** - `Accepted`, `Superseded by NNNN`, or `Deprecated`.
- **Context** - the problem, forces, and constraints that made a decision necessary.
- **Decision** - what was actually chosen, stated as a decision, not a feature description.
- **Alternatives Considered** - the real options that were on the table, each with why it was
  rejected, in one or two sentences. Not every option that theoretically exists - only the ones
  actually weighed.
- **Consequences** - what this decision costs or constrains going forward, not just what it buys.

ADRs are **immutable once accepted** - to change a decision, write a new ADR that supersedes the old
one (set the old one's Status to `Superseded by NNNN`) rather than editing history. Number
sequentially, zero-padded to 4 digits, kebab-case slug after the number.

## Index

| #    | Decision                                                                                                     | Status   |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------- |
| 0001 | [Deterministic core-only scaffolder](0001-deterministic-core-only-scaffolder.md)                             | Accepted |
| 0002 | [No LLM in the plan/apply core](0002-no-llm-in-core.md)                                                      | Accepted |
| 0003 | [Universal primitives + per-role adapters](0003-universal-primitives-plus-adapters.md)                       | Accepted |
| 0004 | [Unconditional path authority on regeneration](0004-path-authority-regeneration.md)                          | Accepted |
| 0005 | [Fixtures as the composition root](0005-fixtures-as-composition-root.md)                                     | Accepted |
| 0006 | [Zero lock-in for generated output](0006-zero-lock-in.md)                                                    | Accepted |
| 0007 | [Remove the fake `eitr map`/`eitr rescan` CLI commands](0007-remove-fake-map-rescan-cli-commands.md)         | Accepted |
| 0008 | [Deterministic-over-AI preference for this project's own process](0008-deterministic-over-ai-preference.md)  | Accepted |
| 0009 | [Shared stack-detection heuristics between CLI and engine](0009-shared-detection-heuristics.md)              | Accepted |
| 0010 | [AI-agent-driven operations ship as assistant skills, never CLI](0010-agent-operations-as-skills-not-cli.md) | Accepted |
