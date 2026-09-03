---
name: protocol-456
description: 5-phase engineering pipeline triggered by '456' or 'по 456' for executing ONE track from an already-approved plan (e.g. an SDD remediation spec) - core-developer implements, tests prove the fix, one independent reviewer checks code+tests together, doc-sync closes it out. Skips Protocol 123's research/plan-formulation/plan-review-swarm/user-approval-gate phases because the plan already went through its own review before this protocol starts. Once every track in the current batch has landed, a Batch Completion Gate mirrors CI's own full-suite check locally before the branch is reported ready. Trigger only on the literal keyword '456'/'по 456' - never self-invoke.
---

# The 456 Protocol Skill (v1.2)

## Purpose

A sibling of Protocol 123 with 5 phases instead of 9: for the specific case where a plan already exists and has already been reviewed, executing one already-decided, already-scoped unit of work (a "track") skips the research, plan-drafting, plan-review-swarm, and user-approval-gate phases that already happened when the plan itself was produced and reviewed - repeating them here would be redundant ceremony, not additional safety. Modeled directly on how EITR's own `master_sdd_remediation_spec.md` Track 10 (MCP command-injection fix) was actually executed end-to-end and confirmed effective by the maintainer.

## Precondition (checked before triggering, not a phase)

456 requires an already-reviewed plan/track as input, not something drafted in the same breath as the request. A track qualifies when all three are true:

1. It names exact target file(s).
2. It gives step-by-step edits, or a concrete before/after code description.
3. It states its own verification command (a test file path, a build command, or an equivalent runnable check).

**Good** (qualifies): "Track 10: replace the shell-string `spawnSync` call in `packages/engine/src/plan/templates/mcp-server.ts`'s `executeTestRun` with argv-based execution (`shell: false`); verify via `npx vitest run packages/engine/test/mcp-protocol-system.test.ts`." - names the file, gives the specific edit, states the verification command.

**Bad** (does not qualify): "Fix the MCP injection issue." - no file, no steps, no verification command. All 3 properties fail; this is not 456. Either produce a plan first (`sdd-plan-writer`, `architect`, or Protocol 123 from scratch), or - if small enough not to need a written plan at all - handle it as ordinary Tier 1 direct work per Section 13.

## Activation Rules & Trigger Phrases

- **Strict Trigger Rule (Explicit Activation Only)**: activated STRICTLY AND ONLY when the user explicitly invokes it via `456` / `по 456` (e.g. "давай по 456", "трек 7 по 456") - the same explicit-only discipline as Protocol 123. Never self-triggered on the assistant's own judgment that a plan "looks ready."
- A ready-plan track requested WITHOUT the "456" keyword is executed as ordinary Tier 1/Tier 2 direct work per Section 13 instead - 456 is opt-in, not a silent default just because a plan document happens to exist.
- **Proactive Suggestion (User Decision Gateway)**: when a plan/track meeting the Precondition above exists and the user asks to implement it, the assistant may propose Protocol 456 (e.g. _"Хотите, чтобы я прогнал этот трек по протоколу 456?"_). Launched only on the user's explicit agreement, same as 123.

## 5-Phase Lifecycle

### Phase 0: Ready-Plan Intake

- Read the plan track in full with a fresh `Read` call (Context Freshness - never from memory, even if read minutes ago). Confirm all 3 Precondition properties are present; if any is missing, stop - that is the Precondition failing, not a gap to improvise around.
- Branch discipline applies in full: sync `main` first (Fetch Before Branching), then a dedicated `fix/`/`feature/` branch matching the track's Conventional Commits type - never stack an unrelated track onto an existing branch.
- No research phase, no `architect`, no plan-review swarm, no user-approval gate - the plan already carries that authority (Precondition).
- If reading the track surfaces a genuine contradiction - the plan names a file, line, or API that does not exist in the current codebase, or two of the plan's own steps directly conflict - stop and ask the user rather than guessing. A cosmetic wording issue, or a stale line number the surrounding code still makes unambiguous, is not a contradiction and does not stop the phase.

### Phase 1: Implementation

- `core-developer` implements the track's steps as specified; for a track at or under Section 13's own Tier 1 threshold (at most 5 files, at most 1 new language runner, at most 1 new configuration/generator engine), do it directly in-session instead of spawning a subagent, per this project's standing Claude-Code-direct-work preference.
- `Read` before every `Edit` (Context Freshness); zero opportunistic refactoring beyond the track's own stated scope (Strict Scope Boundaries).
- If the track's own steps turn out to be wrong or incomplete once the real code is read (a prerequisite the plan's author didn't know about, a stale line number, a false assumption about current state), fix the plan document itself alongside the code - the plan is a living record of what actually happened, not only an upfront prediction.

### Phase 2: Tests

- Run the track's own stated verification command first. If the track fixes a defect (a bug, a vulnerability, a false positive), also add or extend a targeted regression test that demonstrably fails against the pre-fix code and passes after - proof the specific problem is closed, not just "the existing suite is still green."
- `test-writer` may be used for test synthesis on a track above Section 13's Tier 1 threshold (Phase 1); at or under that threshold, write the test directly in-session, matching Phase 1's own rule.
- **If the verification command fails after implementation**: treat this as a defect in the implementation, not a stopping point. Apply the Two-Strike Rule - at most 2 fix attempts on the same failure; if it still fails, `git checkout -- <file>` to roll back and escalate to the user with root-cause analysis, exactly as Section 2 requires everywhere else. Do not proceed to Phase 3 with a failing verification command.

### Phase 3: Review (code and tests together, one diff)

- One independent reviewer, chosen by the track's actual risk shape rather than a fixed default: `security-auditor` for anything touching injection, secrets, auth, or path handling; `code-reviewer` for general correctness; `flake-sentinel` for timing- or concurrency-sensitive test changes; `framework-auditor` for cross-language template/parity changes.
- No fixed swarm size and no `review-arbiter` - arbiter exists to reconcile conflicting verdicts across multiple reviewers, and with one reviewer there is nothing to reconcile. Reuse Protocol 123's own severity vocabulary for findings (`CRITICAL` / `MAJOR` / `MINOR`) instead of inventing a separate one. Escalate to a second reviewer only if the first reviewer returns at least 1 `CRITICAL` finding, or the maintainer explicitly disputes a `MAJOR` finding - not on a fixed schedule, and not for `MINOR` findings alone.
- Announce the review agent invocation per the Mandatory Agent Invocation Notification rule, the same as any other agent spawn.
- Triage every CONFIRMED finding individually: fix it immediately if it is within the track's own scope (Two-Strike Rule still governs), or route it to `TODO.md` with the reviewer's own reasoning attached if it is real but lower-priority or out of the track's scope. Never silently drop a finding, and never fix a finding the review itself judged out of scope without saying so.

### Phase 4: Doc Sync

- `CHANGELOG.md`: one entry, or folded into an existing still-unreleased entry on the same topic rather than narrating a multi-step debugging journey across several bullets - the entry describes the final state, not the path there.
- Mark the plan document itself with a status note at the top of the track, no more than 5 lines: `Status: DONE`, the actual commit hash(es), the exact verification command(s) run and their result, and what was found in review but deliberately not actioned, with the reason in one clause. No rationale narrative or restated background beyond that.
- Route any deferred or lower-priority findings from Phase 3 into `TODO.md` per its existing conventions; nothing found in review is allowed to simply evaporate unrecorded.
- No Telemetry Summary table - that reporting ceremony belongs to Protocol 123.

## Batch Completion Gate (once per batch, before reporting the branch ready)

A track's own Phase 2 verification command only proves that track in isolation - it cannot catch a cross-cutting check that spans the whole generated output regardless of which track touched it (e.g. `packages/engine/test/format.test.ts`, which asserts every emitted file across the entire plan is already Prettier-formatted - a real failure discovered in production use of this protocol, on a PR that had cleanly passed every individual track's own Phase 2). CI's `Build & Verify` job runs the full local suite before merge is even considered; discovering a failure there instead of locally means a push -> wait for CI -> diagnose from CI logs -> fix -> push -> wait again round trip, which costs strictly more time and tokens than running the same check once, locally, before the push - directly against 456's own purpose of conserving both.

- After the LAST track in the current batch has finished Phase 4 - not after every individual track, since running this per-track would reintroduce the cost 456 exists to avoid - and before telling the user the branch is ready for a PR, run the exact command the `Build & Verify` job's `Run Full Test Suite` step actually runs. Read `.github/workflows/ci.yml` fresh to get that exact command rather than trusting a memorized one - the workflow can change independently of this skill, and a stale cached command would silently stop mirroring CI (at the time of writing: `npx vitest run packages/engine/test packages/cli/test`).
- This is a narrow, protocol-scoped exception to Section 8's "No Full Test Suite Execution Without Approval": the batch of tracks just executed under this same 456 invocation already carries the user's consent for this one specific check, since it runs nothing CI was not already about to run against the same commits regardless. It is not blanket permission to run full suites for any other purpose.
- If this surfaces a failure, treat it exactly like a Phase 2 verification failure - root-cause it, fix it as its own small commit (attributed to whichever track actually caused it, or its own standalone `fix` commit if the cause predates this batch), and re-run this same gate command until clean, under the same Two-Strike Rule as Phase 2.
- Only once this gate is clean does the batch's branch get reported to the user as ready for a PR.
