---
name: protocol-456
description: 6-phase lightweight engineering pipeline (Phases 0-5) triggered by '456', 'по 456', 'таска по 456', or 'исправь по 456' for fast-track tasks (everyday bugfixes, small features, or pre-scoped tracks). Slashes token and time overhead by 80-85% compared to Protocol 123 via compact SDD planning, on-demand web research, in-session TDD, single-reviewer risk audit, and deterministic runner scripts/protocol-456.mjs. Pre-scoped tracks skip Phases 1 & 2 directly to Phase 3. Never self-invoke.
---

# The 456 Protocol Skill (v2.0)

## Purpose

A lightweight sibling of Protocol 123 with a streamlined 6-phase lifecycle (Phases 0-5) designed for 80% of everyday engineering tasks (bugfixes, targeted features, AST adjustments, or pre-scoped tracks). Slashes token consumption and latency by 80-85% compared to Protocol 123 by eliminating multi-agent debate, removing review-arbiter bureaucracy, bounding web searches to high-quality official sources, and relying on a single specialized domain reviewer. Backed by deterministic runner `scripts/protocol-456.mjs`.

## Precondition & Fast-Track Intake (Phase 0)

Protocol 456 handles both general fast-track tasks and pre-scoped plan tracks:

1. **Pre-Scoped Track (Fast-Track Branch)**: If input already names exact target files, step-by-step edits, and a runnable test verification command (e.g. from an SDD remediation spec), Phase 0 verifies the baseline and fast-tracks directly to Phase 3 (In-Session TDD), skipping planning Phases 1 and 2 while strictly retaining Phase 4 (Single-Reviewer Risk Audit).
2. **Standard Fast-Track Task**: If input is an arbitrary request (e.g. "исправь баг в CLI по 456"), Phase 0 verifies working tree cleanliness, Phase 1 formulates a compact SDD plan with on-demand web research, and Phase 2 secures fast human approval before TDD.

## Activation Rules & Trigger Phrases

- **Strict Trigger Rule (Explicit Activation Only)**: Activated STRICTLY AND ONLY when the user explicitly invokes it via `456`, `по 456`, `таска по 456`, or `исправь по 456` (e.g. "давай по 456", "пофикси баг по 456", "трек 7 по 456"). Never self-triggered on the assistant's own judgment.
- Requests without a 456 trigger phrase are executed as ordinary direct work per Section 13.
- **Proactive Suggestion (User Decision Gateway)**: For targeted, low-to-medium complexity tasks or ready plan tracks, the assistant may propose Protocol 456 (e.g. _"Хотите выполнить эту задачу по протоколу 456?"_). Launched only upon explicit user consent.

## 6-Phase Lifecycle (Phases 0-5)

### Phase 0: Intake & Quick Baseline Check

- Verify target files fresh with `Read` (Context Freshness - never from memory).
- Ensure git working tree is clean via `git status --porcelain`.
- Verify build baseline: run `node scripts/protocol-456.mjs verify-phase 0` (or `npm run build`).
- If input satisfies the Pre-Scoped Track condition, fast-track directly to Phase 3.

### Phase 1: Focused Plan & On-Demand Web Research

- Author a compact SDD plan (1-2 pages) containing an Executive Summary, concise ACs in EARS format, exact file paths, and test verification commands.
- **On-Demand Web Research**: When researching third-party library behaviors, breaking changes, or modern best practices, perform targeted searches via `WebSearch` against official documentation (e.g. `playwright.dev`, `nodejs.org`, `github.com`, `vitest.dev`). Focus on high-quality findings, pitfalls, and concrete code patterns.
- Do not spawn multi-agent research swarms, and do not perform heavy ISTQB syllabus taxonomies.

### Phase 2: Human Sign-Off Gate

- Present the compact plan artifact to the user with `RequestFeedback: true`.
- Zero code modifications are permitted until the user explicitly confirms approval (e.g. "approve", "делай", "да").

### Phase 3: In-Session TDD (Red -> Green -> Refactor)

- Phase 3a (RED): Write or extend a targeted failing test proving the defect or new capability. Verify failure.
- Phase 3b (GREEN): Implement the minimal code edit using `Edit`. Run target test until 100% green.
- Phase 3c (REFACTOR): Clean up temporary code, run linter/formatter.
- **Two-Strike Rule**: If test verification fails twice consecutively on the same issue, revert modified tracked files (`git checkout -- <file>`) and delete declared new files, then escalate to the user with root-cause analysis. Never use `git clean -fdx` or `git reset --hard`.

### Phase 4: Single-Reviewer Risk Audit

- Spawn exactly ONE specialized domain reviewer matching the task risk shape:
  - `security-auditor`: For injection, secrets, authentication, or path traversal.
  - `flake-sentinel`: For timing races, async promises, or flaky test assertions.
  - `framework-auditor`: For cross-language generator templates or multi-stack parity.
  - `code-reviewer`: For general correctness, architecture, and schema alignment.
- Zero review-arbiters: A single reviewer produces no multi-agent conflict to adjudicate.
- The reviewer tags all findings as `[CONFIRMED_IN_SCOPE]` (must fix now), `[DISMISSED_OUT_OF_SCOPE]` (non-blocking observation), or `[DEFERRED_TO_TODO]` (log to `TODO.md`). Mandatory in both full and fast-track modes.

### Phase 5: Fast Quality Gate, Doc Sync & Micro-Telemetry

- Verify build gate via `node scripts/protocol-456.mjs verify-phase 5` and re-run the targeted test.
- Update `CHANGELOG.md` with exactly one concise, keyword-first line under the active version header.
- Execute git commit strictly via `npm run commit -- "<message>"` to enforce mandatory evening 23:00 OpSec timestamps per CLAUDE.md Section 5.
- Emit the 4-line micro-telemetry summary table via `node scripts/protocol-456.mjs telemetry`.

## Batch Completion Gate (once per batch, before reporting the branch ready)

When Protocol 456 is executed across multiple consecutive tracks on the same branch:

- After the LAST track in the batch completes Phase 5, run the full CI test suite command specified in `.github/workflows/ci.yml` (e.g. `npx vitest run packages/engine/test packages/cli/test`) to catch cross-cutting regressions.
- If failures occur, fix them under the Two-Strike Rule before declaring the branch ready.
