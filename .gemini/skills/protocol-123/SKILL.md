---
name: protocol-123
description: Strict 8-phase multi-agent autonomous engineering and bugfixing pipeline triggered by '123' or 'по 123'. Enforces SDD-first specification, multi-agent plan review, user sign-off gateway, TDD-driven execution (Red-Green-Refactor), multi-agent code/test review, two-strike self-healing, and QA verification.
---

# The 123 Protocol Skill (v2.1)

## Purpose

Provides a 100% deterministic, enterprise-grade engineering workflow combining **Spec-Driven Architecture (SDD)** with **Test-Driven Execution (TDD)** and multi-agent verification swarms.

## Activation Rules & Trigger Phrases

- **Strict Trigger Rule (Explicit Activation Only)**:
  - The 123 Protocol is activated **STRICTLY AND ONLY** when the user explicitly requests it via keywords:
    - `123` / `по 123` (Full Swarm)
    - `таска по 123` / `исправь по 123`
    - `123-fast` (Fast Track for 1-file minor fixes)
  - For standard requests without "123", execute directly in standard mode.
  - **Proactive Suggestion (User Decision Gateway)**: For complex multi-file refactorings or architectural changes, the assistant may proactively ask: _"Хотите выполнить эту задачу по протоколу 123 с полным мульти-агентным ревью?"_. The 123 pipeline is launched ONLY if the user explicitly approves.

## Modes

1. **Full Swarm (`123`)**:
   - 2–3 independent reviewer subagents in Phase 3 (Plan Review) and Phase 6 (Code & Test Review).
   - Used for all standard features, multi-file changes, and bugfixes.
2. **Fast Track (`123-fast`)**:
   - 1 research -> 1 plan -> User Approval Gateway -> 1 TDD execution (Red -> Green) -> 1 reviewer -> QA.
   - Used only for single-file, low-risk fixes.

## 9-Phase Lifecycle (SDD + TDD Hybrid)

### Phase 0: Pre-Flight Baseline Check

- **Agent**: `qa-guard`.
- **Action**: Run `npm run build` or the targeted test suite _before_ writing any code or plans.
- **Rule**: If baseline is already failing (Red), explicitly document the broken baseline before starting so the agent does not attempt to repair unrelated failures.

### Phase 1: Research & Diagnosis (Explore & Web Recon)

- **Mandate**: **Uncompromising Engineering Rigor (Anti-Flattery Mandate)**. Act as a ruthless Senior SDET Partner. Unmask genuine production bottlenecks (MFA/SSO auth traps, deduplication gaps, context bloat, batch UX bottlenecks, lack of canvas support) and never artificially flatter or inflate assessment scores.
- **Agents**:
  - `researcher` (scoped read-only tools: `grep_search`, `find_by_name`, `view_file`): Deeply inspect codebase, trace root causes, locate all call sites and dependencies, collect concrete line-level evidence, and map Impact Radius across the full stack.
  - `web-researcher`: Perform live web search on official documentation (Playwright, Cypress, MCP, LLM frameworks, Node.js) to ground decisions in upstream best practices and prevent stale memory.

### Phase 2: Architectural Plan Formulation (Spec-Driven Architecture / SDD)

- **Agent**: `architect`.
- **Goal**: Synthesize findings into a formal, deterministic Markdown specification artifact.
- **Executive Summary & AC Matrix requirements**:
  1. **Executive Summary Table**: Target files list, breaking changes flag (`Yes` / `No`), test impact, risk assessment.
  2. **Acceptance Criteria (AC) $\rightarrow$ Test Matrix**:
     | Requirement / Bug Scenario | Target Test File                 | Assertion Type          |
     | -------------------------- | -------------------------------- | ----------------------- |
     | `AC-1: <Description>`      | `packages/*/test/<name>.test.ts` | `<Deterministic Check>` |
  3. **Exact Code Blocks**: Complete `before/after` chunks and line numbers.

### Phase 3: Independent Plan Review Swarm & Arbiter Adjudication

- **Subagents**: Swarm of 2–3 independent reviewers selected from the modular pool:
  1. `code-reviewer`: Code correctness, type safety, missing imports.
  2. `skill-reviewer` / `DX Reviewer`: Elimination of ambiguous instructions (no "search for", "apply equivalent").
  3. `security-auditor`: Secret detection, path traversal, injection vulnerability audit.
  4. `flake-sentinel`: Concurrency safety, race condition prevention, auto-retrying assertions.
  5. `framework-auditor`: Multi-language stack parity (TS, JS, Python, Java, C#).
- **Arbiter Adjudication (`review-arbiter`)**:
  - Validates raw reviewer findings against Ground Truth (`AGENTS.md`, `CONVENTIONS.md`).
  - Classifies into `ACCEPTED [CRITICAL/MAJOR]`, `DISMISSED: FALSE_POSITIVE`, `DISMISSED: HALLUCINATED_RULE`, `DISMISSED: OUT_OF_SCOPE`.
  - Outputs concise Arbiter Verdict Artifact before presenting to the user.
- **Token Economy**: Reviewers return concise, high-signal bullet points (`[SEVERITY] File:Line -- Issue -- Fix`).
- **Hardening**: Automatically revise the plan artifact based on reviewer findings before presenting to the user.

### Phase 4: User Approval Gateway (Human Intent Lock)

- **Artifact**: Save hardened plan in artifacts directory (`brain/<conv-id>/...`).
- **Request Feedback**: Set `RequestFeedback: true`.
- **CRITICAL LOCK**: Absolutely ZERO code modifications are permitted until the user explicitly reviews and approves the plan.

### Phase 5: Test-Driven Execution (TDD: Red $\rightarrow$ Green $\rightarrow$ Refactor)

- **Phase 5a (RED Phase - `test-writer` & `eval-engineer`)**:
  - `test-writer`: Synthesize targeted unit/integration tests covering 100% of the Phase 2 AC Matrix.
  - `eval-engineer` (Mandatory Eval Parity): Whenever creating or modifying an AI agent, operational skill, or rule generator, synthesize dedicated eval tests in `packages/evals/test/` to verify prompt fidelity and negative constraint adherence.
  - Run the test to verify that it fails (Red) on the existing baseline, confirming non-vacuous assertions.
- **Phase 5b (GREEN Phase - `core-developer`)**:
  - Implement the minimal targeted code modifications strictly adhering to the approved spec to make all tests pass (Green).
- **Phase 5c (REFACTOR Phase - `core-developer`)**:
  - Clean up formatting and imports adhering strictly to project paradigms with zero opportunistic refactoring.

### Phase 6: Independent Code & Test Review Swarm & Arbiter Adjudication

- **Subagents**: Swarm of 2–3 independent reviewers auditing the actual `git diff` for both application code and new tests:
  1. `code-reviewer`: Plan compliance, types, code style, Zero Lock-in, AC Matrix 100% coverage.
  2. `security-auditor`: Diff entropy scanning, secrets protection, shell injection prevention.
  3. `flake-sentinel`: AST timing safety (0 `sleep()`, 0 `waitForTimeout()`), Web-First assertions, test determinism.
- **Arbiter Adjudication (`review-arbiter`)**:
  - Evaluates code diff comments, filters out bogus warnings, and issues final Actionable Verdict.
- **Test Quality Rubric**:
  - _Anti-Tautology Guard_: Forbid trivial checks (`expect(true).toBe(true)`).
  - _Anti-Vacuous Guard_: Verify dynamic assertions on actual state.
  - _Sandbox Cleanup_: Enforce temp directory cleanup in `afterAll`/`afterEach`.

### Phase 7: Autonomous Self-Healing with Two-Strike Rule

- **Action**: Apply targeted fixes for reviewer findings immediately.
- **Two-Strike Rule**: Max 2 fix attempts per defect. If a fix fails twice, immediately roll back the file (`git checkout -- <file>`) and escalate to the user with root cause analysis.

### Phase 8: QA Guard, Evals Benchmark, Doc Sync & Final Report

- **Mandatory Pre-Test Build**: `qa-guard` MUST ALWAYS execute `npm run build` (compiling all TypeScript sources and runtime JS assets) **BEFORE** running test suites, ensuring that tests run against fresh build artifacts.
- **Continuous Prompt Benchmark**: Execute `npm run eval` (44+ deterministic eval tests) to guarantee 0 regressions across all AI agents, skills, and assistant rules.
- **Targeted Tests**: Run targeted vitest files for modified modules.
- **Agent `doc-sync-enforcer`**: Synchronize `CHANGELOG.md`, `README.md`, `ARCHITECTURE.md`, `TODO.md`, `ENGINE_VERSION` in `packages/engine/src/version.ts`, and workspace package manifests (`package.json`, `packages/*/package.json`).
- **Final Report**: Deliver a structured, high-signal summary report in chat, including the **Protocol 123 Telemetry Summary** table:
  ```markdown
  ### Protocol 123 Telemetry Summary

  | Phase                           | Duration  | Est. Tokens (In/Out) | Est. Cost ($) | Status         |
  | ------------------------------- | --------- | -------------------- | ------------- | -------------- |
  | Phase 0: Pre-Flight Baseline    | 2.1s      | 1.2k / 0.3k          | $0.002        | PASSED         |
  | Phase 1: Recon & Ingestion      | 4.5s      | 3.5k / 1.1k          | $0.007        | PASSED         |
  | Phase 2: Spec Formulation (SDD) | 3.8s      | 2.8k / 1.8k          | $0.008        | PASSED         |
  | Phase 3: Plan Review & Arbiter  | 6.2s      | 8.4k / 2.2k          | $0.016        | PASSED         |
  | Phase 4: Human Intent Lock      | User      | 0 / 0                | $0.000        | APPROVED       |
  | Phase 5: TDD Dual Synthesis     | 7.1s      | 5.2k / 3.4k          | $0.015        | PASSED         |
  | Phase 6: Code Review & Arbiter  | 5.4s      | 7.1k / 1.9k          | $0.014        | PASSED         |
  | Phase 7: Self-Healing (Triage)  | 0.0s      | 0 / 0                | $0.000        | SKIPPED        |
  | Phase 8: Quality Gate & Handoff | 3.0s      | 2.0k / 0.8k          | $0.004        | PASSED         |
  | **TOTAL**                       | **32.1s** | **30.2k / 11.5k**    | **~$0.066**   | **100% GREEN** |
  ```

## UX Progress Notification Standard

On each phase transition, the agent MUST output a visible line in chat:
`[123 Protocol] Фаза X/8: [Описание текущего действия]...`
