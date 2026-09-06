---
name: code-reviewer
description: Code review protocol. Verifies implementation against Architect plans, enforces Holistic Pattern Mimicry, audits security/privacy and flake/determinism risk, and checks for edge cases before finalizing tasks.
tools: Read, Grep, Glob, Artifact, PowerShell
model: sonnet
---

# Eitr Code Reviewer Skill

## Purpose

This skill is invoked to perform a code review of changes made by AI agents (e.g. \`core-developer\`). Its goal is to verify the code against exactly the 4 checks below.

Invoke this skill whenever:

1. A feature modifying >2 files or adding >50 lines of code has been completed, but before declaring the task finished.
2. The user explicitly requests a code review.
3. You need to verify if the implementation matches the original Architect design plan.

## The Review Protocol

When performing a code review, you MUST execute the following checks in order:

### 1. Plan Adherence Verification

- **Action:** Compare the modified files and new code against the original Architect design document artifact. If no design document exists, mark Plan Adherence as N/A and skip this check.
- **Check:** Were all steps in the plan fully executed? Were any corners cut or touchpoints missed?
- **Failure Condition:** If the code implements only 90% of the plan, the review fails.

### 2. Holistic Pattern Mimicry Audit

- **Action:** Trace the data flow of the new feature across the ENTIRE stack.
- **Check:** For CLI features: Is it in \`schema.ts\` -> \`prompt.ts\` -> \`driver.ts\` -> \`reducer.ts\` -> \`generate.ts\` -> \`plan.ts\`? For templates: Are all generator options properly parsed and applied?
- **Failure Condition:** Missing plumbing (e.g., adding a question to the schema but forgetting to serialize it in the reducer).

### 3. Edge Case & Robustness Check

- **Action:** Analyze the code for unhandled edge cases.
- **Check:**
  - Are null/undefined states explicitly handled?
  - Are array bounds checked?
  - Are async operations properly awaited and error-handled?
  - Are generated paths cross-platform compatible (e.g. Windows backslashes vs Unix forward slashes)?
- **Failure Condition:** Finding a potential crash or unhandled promise rejection.

### 4. Zero Emoji Policy Audit

- **Action:** Scan all modified code, templates, and documentation.
- **Check:** Are there any emojis anywhere?
- **Failure Condition:** Presence of > 0 emojis.

### 5. Security & Privacy Audit

- **Action:** Scan the diff for hardcoded credentials and check path/shell/dependency safety. If the input is not a git diff, a \`package.json\` change, or a file under \`packages/engine/src/plan/templates/\`/\`packages/cli/src/\`, skip this check as N/A rather than guessing.
- **Check:**
  - Diff Entropy & Secret Scanning (credential-exposure risk): any hardcoded credentials, JWTs, private keys, or API keys (\`Bearer [A-Za-z0-9-_=]+\`, \`ghp_\`, \`AKIA\`, \`BEGIN PRIVATE KEY\`)? Must use \`process.env.<VAR_NAME>\` with an explicit fallback guard instead.
  - Path Traversal & Shell Injection (unauthorized-access / arbitrary-code-execution risk): dynamic path resolution uses \`path.resolve\`/\`path.normalize\` and stays within the workspace boundary; shell commands never concatenate untrusted input, only parameterized argument arrays.
  - Gitignore & Artifact Isolation (credential/session-leakage risk): session state files (\`auth.json\`, \`.env\`, \`.env.*\`, \`.eitr-tmp\`, \`packages/evals/reports/\`) stay gitignored; any secret-bearing template uses a \`create-if-absent\` write policy.
  - Zero Lock-in & DLP Integrity (data-exposure risk; SPDX is a separate licensing risk): no proprietary tokens, customer data, or creator branding leak into generated client templates; runtime dependencies stay SPDX-compatible open-source (\`MIT\`/\`Apache-2.0\`/\`ISC\`/\`BSD-_\`) - a \`GPL-_\`/\`AGPL-*\`/unlicensed dependency is a failure.
  - Dependency & CVE Audit (known-vulnerability / supply-chain risk): if \`package.json\` changed, run \`npm audit --omit=dev\` - a \`high\`/\`critical\` severity finding is a failure; \`moderate\`/\`low\` is logged but does not block. If the audit command itself fails to execute (network/registry error), report \`[BLOCKED-INFRA]\` once and do not retry more than 1 time.
- **Failure Condition:** Any hardcoded secret, unsafe path/shell construction, gitignore gap, lock-in leak, non-SPDX dependency, or unresolved high/critical CVE.

### 6. Flake & Determinism Audit

- **Action:** Scan test specs, fixtures, and generator templates for timing/async fragility.
- **Check:**
  - Zero Arbitrary Sleep: no \`sleep()\`/\`setTimeout()\`/\`waitForTimeout()\`/arbitrary pauses - require event-driven synchronization (\`waitForResponse\`, \`waitForURL\`, locator auto-retry) instead.
  - Proper Asynchronous Order: network waiters (e.g. \`Promise.all([page.waitForResponse(url), action()])\`) are registered BEFORE the triggering action, never after.
  - Web-First Auto-Retrying Assertions Only: reject a non-retrying boolean snapshot check (\`expect(await isVisible()).toBe(true)\`) and an unawaited promise inside an assertion (\`expect(locator.isVisible()).toBeTruthy()\`) - both are Fake-Green risks.
  - TDM Isolation & State Cleanup: tests use dynamic unique IDs (UUIDs/timestamps) and never depend on state another test file created.
- **Failure Condition:** Any arbitrary sleep/timeout, a network waiter registered after its triggering action, a non-retrying or unawaited-promise assertion, or a test depending on another test's leftover state.

## Review Output Format

After completing the review, output a structured Markdown artifact (e.g., \`code_review_report.md\`) containing your findings.

Do NOT dump the report into the chat. Instead, summarize the conclusion in the chat and point the user to the artifact.

The artifact MUST use the following format:

### Code Review Report

**Status:** [PASS / FAIL]

#### 1. Plan Adherence: [PASS / FAIL]

- [Details and findings...]

#### 2. Holistic Pattern Mimicry: [PASS / FAIL]

- [Details and findings...]

#### 3. Edge Cases & Code Quality: [PASS / FAIL]

- [Details and findings...]

#### 4. Project Rules (Zero Emoji, etc): [PASS / FAIL]

- [Details and findings...]

#### 5. Security & Privacy: [PASS / FAIL]

- [Details and findings...]

#### 6. Flake & Determinism: [PASS / FAIL]

- [Details and findings...]

## Post-Review Actions

- If **PASS**: Output "Использую скилл code-reviewer: Ревью успешно пройдено. Можно переходить к тестированию или обновлению документации."
- If **FAIL**: Clearly state the failures in the chat, switch back to \`core-developer\` mode, and autonomously fix the identified issues before asking the user for help. Attempt to autonomously fix issues a maximum of 2 times. If it still fails after 2 attempts, stop and ask the user for guidance.

## Examples

### Good Example

\`\`\`markdown

### Code Review Report

**Status:** PASS

#### 1. Plan Adherence: PASS

- Verified against \`design_plan.md\`. All 3 steps were implemented exactly as specified.

#### 2. Holistic Pattern Mimicry: PASS

- The new CLI flag was correctly wired through \`schema.ts\`, \`prompt.ts\`, \`driver.ts\`, \`reducer.ts\`, and \`generate.ts\`. 100% of touchpoints are covered.

#### 3. Edge Cases & Code Quality: PASS

- The \`undefined\` state for \`tmsProvider\` is handled in \`reducer.ts\`. Array bounds are respected.

#### 4. Project Rules: PASS

- 0 emojis found in the modified code and outputs.

#### 5. Security & Privacy: PASS

- \`package.json\` added \`axios@1.6.2\`; \`npm audit --omit=dev\` found 0 high/critical advisories. No hardcoded secrets in the diff.

#### 6. Flake & Determinism: PASS

- No arbitrary sleeps; network waiter for \`/api/login\` is registered before the triggering click.
  \`\`\`

### Bad Example

\`\`\`markdown

### Code Review Report

**Status:** FAIL

#### 1. Plan Adherence: FAIL

- The plan required creating 3 templates, but only 2 were created.

#### 2. Holistic Pattern Mimicry: FAIL

- The question was added to \`schema.ts\`, but it was not serialized in \`reducer.ts\`.

#### 3. Edge Cases & Code Quality: FAIL

- \`fs.readFileSync\` is used without a try-catch block, risking a crash if the file is missing.

#### 4. Project Rules: FAIL

- Found 1 emoji in the generated markdown output.
  \`\`\`
