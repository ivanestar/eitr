---
name: sdd-plan-writer
description: Writes a self-contained, step-by-step Spec-Driven Development (SDD) implementation plan for an AI coding agent to execute against an already-confirmed batch of work items (bugs, gaps, features) — exact file paths per task, EARS-style trigger/response acceptance criteria, a runnable verification command per task, explicit [NEEDS CLARIFICATION] markers instead of guessing, and dependency-ordered phases. Trigger on requests like "напиши SDD-план", "распиши план по шагам для агента", "сделай implementation plan для батча X" once the work items are already identified. Do NOT trigger for open-ended "what should we build" ideation — that needs investigation first, not this skill.
---

# SDD Plan Writer

## Purpose

An AI coding agent stops when the work _looks_ done. Without a check the agent itself can run,
"looks done" is the only signal available, and every silent mistake waits for a human to notice —
this is Anthropic's own diagnosis of why plans fail in practice, not a hypothetical concern (see
Anthropic's Claude Code best-practices documentation, which applies to agentic coding assistants
generally). A spec that says "add validation to the signup form" leaves the agent free to satisfy
that sentence in a dozen mutually-inconsistent ways; a spec that names the exact file, the exact
trigger/response behavior, and the exact command that proves it worked leaves no such freedom. This
skill exists to produce the second kind of spec, not the first — every task must carry its own
path, acceptance criterion, and verification command, or it does not go into the plan yet.

## When to use

**Precondition — the input must already be a finite, confirmed list of work items.** Each item
must already be understood well enough to name at least one concrete file it touches. Typical
inputs: the Core-gap rows of a closed `axis-closure-matrix` report, an already-agreed feature
description, a named bug with a known repro. If any item still requires "figure out what's
actually wrong first," send that item through investigation (a research/investigation agent, or
your own direct reading) BEFORE this skill runs — do not fold an open investigation into a plan
task; a plan task is for **known, scoped** work, not for discovery.

**Good trigger**: `"напиши SDD-план на все 7 гэпов из CI/CD-матрицы"` (a closed, named,
file-referenced batch already exists) — proceed directly.

**Bad trigger — do not proceed, redirect first**: `"придумай, как нам улучшить CI/CD"` (no
confirmed item list — this is ideation, redirect to research/`axis-closure-matrix` first, not a
plan) or `"напиши план для рефакторинга MCP-моста"` when no prior gap list or spec exists for it
(same redirect — investigate and enumerate concrete items first).

## The four required properties of every task (non-negotiable, per item)

A task that is missing any one of these four is not finished — do not add it to the plan in that
state; either resolve it or mark it `[NEEDS CLARIFICATION: ...]` (see below) and surface it to the
user before the plan goes to review.

1. **Exact file path(s).** Never "the CI config" — always the real path, e.g.
   `packages/engine/src/plan/templates/cicd.ts` for a new file, or
   `packages/engine/src/plan/templates/cicd.ts:24-25` with a line range when editing existing code
   at a known location (GitHub spec-kit's own task template embeds the literal path in every task
   line for exactly this reason — it is the documented convention this skill follows, not an
   invention). Line numbers are mandatory when the target lines are already known from reading the
   file; omit them only for a file that doesn't exist yet.
2. **EARS-style acceptance criterion.** State the condition and required response using one of the
   five fixed EARS patterns (Mavin et al., adopted by Kiro's `requirements.md`):
   - Ubiquitous: `THE <system> SHALL <response>`
   - Event-driven: `WHEN <trigger>, THE <system> SHALL <response>`
   - State-driven: `WHILE <precondition>, THE <system> SHALL <response>`
   - Optional: `WHERE <feature is included>, THE <system> SHALL <response>`
   - Unwanted behavior: `IF <trigger>, THEN THE <system> SHALL <response>`
     Fixed clause order and a closed keyword vocabulary are the point — they remove the free-text
     ambiguity a prose sentence like "make CI more secure" would leave open.
3. **A runnable verification command.** Not "confirm it works" — the literal command
   (`npm run build`, `npx vitest run packages/engine/test/contract.test.ts`, a specific `grep`
   confirming a string's absence) that produces a pass/fail signal the agent can read itself.
   "Looks correct" is never an acceptable verification step.
4. **A dependency/parallel marker.** Either `[P]` (independently executable — no other task in the
   plan touches the same file or a file it reads) or an explicit `depends: T0xx` naming which
   earlier task(s) must land first. Never leave a task's relationship to the others implicit.

### Worked example pair

**Bad task** (fails all four properties — this is what NOT to write):

> Add validation to the signup form.

**Good task** (all four properties present):

> `T014 [P]` In `src/auth/signupValidation.ts`, implement `validateEmail(input: string): boolean`.
> WHEN `input` does not match the RFC 5322 pattern THEN the function SHALL return `false`. Test
> cases: `user@example.com` → `true`, `invalid` → `false`, `user@.com` → `false`. Verify:
> `npm test -- signupValidation` — all 3 cases pass. Depends: none.

## Ambiguity handling

**Deterministic test for `[NEEDS CLARIFICATION]`**: after reading every file named in the source
item (the axis matrix row, the bug report, the referenced code), try to write all four required
task properties from "The four required properties" above using only facts already present in that
source material or on disk. If all four can be written without inventing a fact that appears
nowhere in the source, the item is **not** ambiguous — write the task. If at least one property
cannot be written without inventing something, mark it `[NEEDS CLARIFICATION: <the specific
question that needs an answer>]` in place of the acceptance criterion instead of guessing.

**Conflicting evidence is a separate case from missing evidence.** If two source documents (e.g.
the axis matrix's own description vs. the file it cites) state different required behavior for the
same item, do not silently pick one — mark the item `[NEEDS CLARIFICATION]` and quote both
conflicting statements verbatim in the Open Questions entry, naming both sources.

List every `[NEEDS CLARIFICATION]` marker once, in the "Open questions" section of the plan (see
Plan structure below) — surfaced to the user before the plan is sent for independent review, not
discovered by the reviewer or, worse, by the executing agent mid-task (GitHub spec-kit's own
convention for exactly this failure mode).

**Batch-readiness gate.** If more than 20% of a batch's items require `[NEEDS CLARIFICATION]`,
stop drafting the plan and tell the user the batch is not yet a confirmed, scoped list per this
skill's own "When to use" precondition — send the unresolved items back through investigation
first rather than publishing a plan that is mostly open questions.

## Plan structure (sections, in order)

1. **Scope.** One sentence naming the batch and its source (e.g. "all 7 Core rows from the CI/CD
   Pipeline Matrix, 2026-08-31"). List explicit non-goals — what this plan deliberately does NOT
   touch, even if adjacent (e.g. "does not touch the 3 unresolved rows the matrix left `—`").
2. **Open questions.** Every marker from "Ambiguity handling" above, listed once up front. Empty
   section explicitly says "None" rather than being omitted.
3. **Phases.** Group tasks the way GitHub spec-kit's own template does: a **Foundational** phase
   for anything that blocks multiple later tasks (e.g. "settle on one Playwright version across all
   templates" before any per-language CI task references that version), then per-item phases, then
   a final **Verification** phase. Tasks inside a phase that are mutually `[P]` may be described as
   executable in any order; tasks with a `depends:` marker must be listed after what they depend on.
4. **Tasks.** Numbered `T001`, `T002`, ... across the whole plan (not restarting per phase), each
   with the four required properties above.
5. **End-to-end verification.** One final task that proves the whole batch works together, not just
   each task in isolation — e.g. a full build + the relevant test suites for every package touched,
   run once after all tasks land. A plan whose only checks are per-task is not finished; integration
   between tasks needs its own check.
6. **Rollback note.** Default to one sentence per phase. Write a **per-task** rollback note instead
   whenever the task touches more than 1 file, or touches a file with no existing test coverage
   (`grep` the test suite for the file's basename to check) — either condition means a phase-level
   note would be too coarse to isolate that task's revert from its phase-mates. Otherwise per-phase
   is sufficient. State which files to `git checkout --` or which prior commit to reset to, scoped
   narrowly enough that reverting one task/phase doesn't discard other completed work.

## Independent review handoff

After drafting, send the plan to a **fresh** agent that did not author it (a new agent invocation,
not a continuation of this session) for adversarial review. Scope its brief explicitly to exactly 4
finding categories: (a) a source item with no corresponding task, (b) a task whose acceptance
criterion doesn't match its source item's described gap, (c) a verification command that wouldn't
actually catch the failure it claims to catch, (d) a `depends:`/`[P]` marker that is wrong —
references a task number that doesn't exist, comes later in the file, or claims independence from a
task that actually touches the same file. A finding outside these 4 categories (e.g. a security
concern, a style preference, a "better approach exists") goes into a separate "Out of scope — not
actioned" list in the review output and is never merged into the plan without the user's explicit
say-so.

**Bad brief** (unscoped — induces over-reporting per Anthropic's own guidance): "Review this SDD
plan and tell me what's wrong with it."

**Good brief** (scoped to the 4 categories above): "Review T001-T013 against the CI/CD Pipeline
Matrix's 7 Core rows only. Flag: (a) a matrix row with no corresponding task, (b) a task whose
acceptance criterion doesn't match its row's described gap, (c) a verification command that
wouldn't catch the row's described failure, (d) a `depends:`/`[P]` marker that is wrong. Do not
comment on code style, naming, or whether the chosen approach is the best one — those are already
decided. List anything else you notice separately under 'Out of scope — not actioned,' not merged
into the findings above."

## User approval gateway

Present the reviewed plan (as a published document/artifact — plans are published, never a
markdown file committed into the EITR source tree) to the user with a short summary of what the
independent review changed, and wait for explicit approval before any task begins execution - a
hard gate regardless of context, never skipped just because the review came back clean.

## Anti-patterns this skill exists to prevent

(Sourced from Anthropic's own named Claude Code failure patterns plus GitHub spec-kit's structural
countermeasures — cited, not invented.)

- **The trust-then-verify gap** — a task that looks plausible but has no runnable check, so a
  silently-broken implementation reads as "done." Every task's verification command exists to close
  this gap.
- **Ambiguous natural-language acceptance criteria** — "make it secure," "improve the UX" — resolve
  however the model feels like on the day. EARS phrasing exists to close this gap.
- **Decision amnesia** — a plan that only makes sense with context from the conversation that
  produced it. A plan handed to a fresh agent session must be fully self-contained: exact paths,
  exact criteria, exact commands, nothing implied.
- **Kitchen-sink batching** — folding unrelated work into one plan because it was convenient to
  think about at the same time. If a task doesn't trace to a scoped item from step "When to use,"
  it doesn't belong in this plan.
- **Unscoped adversarial review** — see "Independent review handoff" above; an unscoped reviewer
  manufactures work, it doesn't just catch real gaps.
- **Skipping the end-to-end check** — a plan where every task passes its own narrow verification
  but nothing proves the tasks work together is not finished.
