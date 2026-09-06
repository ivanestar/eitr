---
name: protocol-123
description: Strict 9-phase multi-agent autonomous engineering and bugfixing pipeline triggered by '123' or 'по 123'. Enforces SDD-first specification, multi-agent plan review, user sign-off gateway, TDD-driven execution (Red-Green-Refactor), multi-agent code/test review, two-strike self-healing, and QA verification.
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

1. **Full Protocol (`123`)**:
   - Streamlined 9-phase lifecycle: live web & codebase recon, invariants discovery feeding the Architect, single Lead Reviewer with Arbiter escalation gateway, and TDD execution.
2. **Fast Track (`123-fast`)**:
   - 1 research -> 1 plan -> User Approval Gateway -> 1 TDD execution (Red -> Green) -> 1 reviewer -> QA.
   - Used for single-file, pre-scoped fixes.

## Deterministic Orchestration Script

To eliminate LLM reasoning drift or omission of mandatory subagents (such as skipping `web-researcher` or invariant discovery), orchestrators can invoke the deterministic runner script:

- `node scripts/protocol-123.mjs plan [--mode=full|fast] [--json]`: Outputs the exact phase graph, mandatory subagents, and exit gates.
- `node scripts/protocol-123.mjs prompt <subagent>`: Emits the exact, non-negotiable prompt template for subagents (`web-researcher`, `test-conditions-designer`, `code-reviewer`, `review-arbiter`).
- `node scripts/protocol-123.mjs verify-phase <0-8>`: Runs mechanical validation for the phase gate.
- `node scripts/protocol-123.mjs telemetry`: Emits the standard telemetry summary table.

## 9-Phase Lifecycle (SDD + TDD Hybrid)

### Phase 0: Pre-Flight Baseline Check

- **Agent**: `qa-guard`.
- **Action**: Run `npm run build` or the targeted test suite _before_ writing any code or plans.
- **Rule**: If baseline is already failing (Red), explicitly document the broken baseline before starting so the agent does not attempt to repair unrelated failures.

### Phase 1: Research & Diagnosis (Explore, Web Recon & ISTQB Grounding)

- **Mandate**: **Uncompromising Engineering Rigor (Anti-Flattery Mandate)**. Act as a ruthless Senior SDET Partner. Unmask genuine production bottlenecks (MFA/SSO auth traps, deduplication gaps, context bloat, batch UX bottlenecks, lack of canvas support) and never artificially flatter or inflate assessment scores.
- **Agents**:
  - A general-purpose research subagent (scoped read-only tools: `grep_search`, `find_by_name`, `view_file`): Deeply inspect codebase, trace root causes, locate all call sites and dependencies, collect concrete line-level evidence, and map Impact Radius across the full stack. No dedicated persona needed for this - any general-purpose subagent can be scoped to it directly.
  - `web-researcher` (**Mandatory Unconditional Invocation**): The orchestrator MUST ALWAYS launch `web-researcher` before Phase 2 plan formulation — relying on pre-trained memory or mental shortcuts is strictly prohibited. `web-researcher` executes two mandatory investigation tracks:
    1. **Technical Upstream Recon**: Targeted live web searches on official documentation (Playwright, Cypress, MCP, LLM frameworks, Node.js) to ground decisions in current upstream best practices, deprecations, known browser/runtime bugs, and real-world production traps.
    2. **ISTQB Standards & Syllabi Alignment**: Live web search across official ISTQB syllabi (CTFL v4.0, CTAL-TAE v2.0, CTAL-TA v4.0, CT-GenAI, CT-AI, CT-SEC) and the official glossary (`glossary.istqb.org`) to anchor architecture concepts, entry/exit criteria, test oracles, and test design techniques in standard international testing taxonomy and principles.
  - **Phase 1 Handoff Gate**: Phase 2 formulation cannot proceed until `web-researcher` delivers its structured synthesis (Top Pitfalls to Avoid, Upstream Recommendations, and ISTQB Taxonomy Mapping).

### Phase 2: Invariants Discovery & Defensive Spec Formulation (SDD)

- **Workflow Pipeline (Invariants -> Defensive Architecture)**:
  1. **Step 2a (Invariants Discovery)**: `test-conditions-designer` uncovers the critical positive requirements and negative invariants / boundary conditions BEFORE the Architect finalizes the plan.
     - **High-Signal Invariants Cap**: Enforce density over volume (MAX 15–20 total conditions: 6–10 atomic positive ACs and 8–12 critical negative boundary invariants across the 9 closed taxonomy categories).
     - **Taxonomy Categories**: `invalid_input`, `boundary`, `missing_precondition`, `concurrent_conflict`, `state_violation`, `permission_denied`, `external_failure`, `data_integrity`, `error_path`.
     - **Defensive Oracle Polarity**: Assert graceful error handling, input sanitization, and state preservation — NEVER unhandled crashes.
  2. **Step 2b (Defensive Architecture Plan)**: `architect` takes the discovered invariants on input and designs the formal Markdown SDD plan with proactive architectural defenses (sanitization, retry bounds, error boundary wrapping, null safety).
- **Executive Summary & Specification requirements**:
  1. **Executive Summary Table**: Target files list, breaking changes flag (`Yes` / `No`), test impact, risk assessment.
  2. **Acceptance Criteria (AC) -> Test Matrix**:
     | Requirement / Bug Scenario | Target Test File                 | Assertion Type          |
     | -------------------------- | -------------------------------- | ----------------------- |
     | `AC-1: <Description>`      | `packages/*/test/<name>.test.ts` | `<Deterministic Check>` |
  3. **Exact Code Blocks**: Complete `before/after` chunks and line numbers.
  4. **Embedded Invariants Matrix**: The discovered positive and negative conditions mapped to corresponding architectural defenses.

### Phase 3: Lead Plan Review (Single Strong Reviewer)

- **Review Scope**: Comprehensive single-reviewer audit of the plan against code quality, security, multi-stack parity, and test determinism before presenting to the user.
- **Agent**: `code-reviewer` (Lead Reviewer), armed with a 5-point unified rubric:
  1. Architecture & Plan Compliance (spec adherence, CPOM contracts, Zero Lock-in).
  2. TypeScript & Language Safety (strict typing, zero `any`, cross-platform paths).
  3. Security & Privacy (no hardcoded secrets, safe credential retrieval from env, path traversal prevention, gitignore).
  4. Flake & Determinism (zero arbitrary sleep, proper async order, web-first auto-retrying assertions).
  5. Polyglot Parity (multi-language alignment across TS, Python, C#, Java).
- **Arbiter Escalation Gateway (`review-arbiter`)**:
  - For standard single-reviewer execution, findings are output directly as actionable bullet points (`[SEVERITY] File:Line -- Issue -- Fix`) and hardened into the plan, eliminating extra token round-trips.
  - In multi-party or high-conflict escalations, `review-arbiter` remains available to adjudicate disputed findings against Ground Truth (`AGENTS.md`, `CONVENTIONS.md`).
- **Token Economy**: Reviewers return concise, high-signal bullet points (`[SEVERITY] File:Line -- Issue -- Fix`).
- **Hardening**: Automatically revise the plan artifact based on reviewer findings before presenting to the user.

### Phase 4: User Approval Gateway (Human Intent Lock)

- **Artifact**: Save hardened plan in artifacts directory (`brain/<conv-id>/...`).
- **Request Feedback**: Set `RequestFeedback: true`.
- **CRITICAL LOCK**: Absolutely ZERO code modifications are permitted until the user explicitly reviews and approves the plan.

### Phase 5: Test-Driven Execution (TDD: Red $\rightarrow$ Green $\rightarrow$ Refactor)

- **Phase 5a (RED Phase - `test-writer` & `eval-engineer`)**:
  - `test-writer`: Synthesize targeted unit/integration tests covering 100% of the Phase 2 AC Matrix and Test Conditions Matrix (both positive paths and negative boundary vectors).
  - `eval-engineer` (Mandatory Eval Parity): Whenever creating or modifying an AI agent, operational skill, or rule generator, synthesize dedicated eval tests in `packages/evals/test/` to verify prompt fidelity and negative constraint adherence.
  - Run the test to verify that it fails (Red) on the existing baseline, confirming non-vacuous assertions.
- **Phase 5b (GREEN Phase - `core-developer`)**:
  - Implement the minimal targeted code modifications strictly adhering to the approved spec to make all tests pass (Green).
- **Phase 5c (REFACTOR Phase - `core-developer`)**:
  - Clean up formatting and imports adhering strictly to project paradigms with zero opportunistic refactoring.

### Phase 6: Lead Code & Test Review (Single Strong Reviewer)

- **Agent**: `code-reviewer` (Lead Reviewer) inspecting the actual `git diff` for both application code and new tests.
- **Review Rubric**:
  - Plan compliance, types, code style, Zero Lock-in, AC Matrix 100% coverage.
  - Security scanning (diff entropy, secrets protection, shell injection prevention).
  - Flake sentinel checks (zero arbitrary sleep, web-first auto-retrying assertions).
- **Arbiter Escalation Gateway (`review-arbiter`)**: Available on-demand if multi-party arbitration is required.
- **Test Quality Rubric**:
  - _Anti-Tautology Guard_: Forbid trivial checks (`expect(true).toBe(true)`).
  - _Anti-Vacuous Guard_: Verify dynamic assertions on actual state.
  - _Sandbox Cleanup_: Enforce temp directory cleanup in `afterAll`/`afterEach`.

### Phase 7: Autonomous Self-Healing with Two-Strike Rule

- **Action**: Apply targeted fixes for reviewer findings immediately.
- **Two-Strike Rule**: Max 2 fix attempts per defect. If a fix fails twice, immediately roll back the file (`git checkout -- <file>`) and escalate to the user with root cause analysis.

### Phase 8: QA Guard, Evals Benchmark, Doc Sync & Final Report

- **Mandatory Pre-Test Build**: `qa-guard` MUST ALWAYS execute `npm run build` (compiling all TypeScript sources and runtime JS assets) **BEFORE** running test suites, ensuring that tests run against fresh build artifacts.
- **Continuous Prompt Benchmark**: Execute the full `npm run eval` suite (deterministic eval tests across every file listed in the `"eval"` script in the root `package.json` — never hardcode a test/file count here, it drifts every time a test is added; run `npm run eval` itself to see the current total; the suite also runs in CI via the "Run Deterministic Eval Suite" step in `.github/workflows/ci.yml`) to guarantee 0 regressions across all AI agents, skills, and assistant rules.
- **Targeted Tests**: Run targeted vitest files for modified modules.
- **Agent `doc-sync-enforcer`**: Synchronize `CHANGELOG.md`, `README.md`, `ARCHITECTURE.md`, `TODO.md`, `ENGINE_VERSION` in `packages/engine/src/version.ts`, and workspace package manifests (`package.json`, `packages/*/package.json`).
- **Final Report**: Deliver a structured, high-signal summary report in chat, including the **Protocol 123 Telemetry Summary** table:
  ```markdown
  ### Protocol 123 Telemetry Summary

  | Phase                           | Duration  | Est. Tokens (In/Out) | Est. Cost ($) | Status         |
  | ------------------------------- | --------- | -------------------- | ------------- | -------------- |
  | Phase 0: Pre-Flight Baseline    | 2.1s      | 1.2k / 0.3k          | $0.002        | PASSED         |
  | Phase 1: Recon & Web Research   | 4.5s      | 4.2k / 1.5k          | $0.009        | PASSED         |
  | Phase 2: Invariants & SDD Plan  | 5.0s      | 4.5k / 2.5k          | $0.012        | PASSED         |
  | Phase 3: Lead Plan Review       | 3.2s      | 3.5k / 1.2k          | $0.007        | PASSED         |
  | Phase 4: Human Intent Lock      | User      | 0 / 0                | $0.000        | APPROVED       |
  | Phase 5: TDD Execution          | 6.5s      | 5.0k / 3.0k          | $0.014        | PASSED         |
  | Phase 6: Lead Code Review       | 3.5s      | 3.8k / 1.4k          | $0.008        | PASSED         |
  | Phase 7: Two-Strike Self-Heal   | 0.0s      | 0 / 0                | $0.000        | SKIPPED        |
  | Phase 8: Quality Gate & Handoff | 3.0s      | 2.0k / 0.8k          | $0.004        | PASSED         |
  | **TOTAL**                       | **27.8s** | **24.2k / 10.7k**    | **~$0.056**   | **100% GREEN** |
  ```

## UX Progress Notification Standard

On each phase transition, the agent MUST output a visible line in chat:
`[123 Protocol] Фаза X/8: [Описание текущего действия]...`
