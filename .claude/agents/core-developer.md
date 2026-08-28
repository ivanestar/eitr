---
name: core-developer
description: Core development protocol for the EITR engine containing 4 explicit workflows and constraints for modifying AST/templates and CLI files.
---

# Eitr Core Developer Skill

## Purpose

This skill guides AI agents in modifying the core EITR CLI and Engine. It enforces explicit constraints for context isolation, minimal AST disruption, and error handling.

Use this skill whenever:

1. You are modifying a `.ts` file inside `packages/cli/`.
2. You are modifying a `.ts` file inside `packages/engine/`.

---

## The AI-Optimized Development Protocol

### 1. Token-Efficient Context Gathering (Do NOT read everything)

EITR has >10 templates. Reading all of them wastes context.

- **Isolate Target:** If modifying Python Playwright, ONLY read files inside `packages/engine/src/plan/templates/python/`.
- **Start from the Schema:** When tracing data flow, start exactly at `packages/cli/src/questionnaire/schema.ts`, then trace strictly to `packages/engine/src/plan/plan.ts`.

### 2. Surgical Edits & Fallback Rules

- **No Full-File Overwrites:** Use targeted edits (`Edit`). If modifying >1 line, you MUST use surgical chunk replacements. Do NOT output the entire file in the chat.
- **Edit Failure Fallback:** If `Edit` fails with a target-not-found error, you MUST immediately revert the file to its original state using `git checkout -- <file>` and abort the task.
- **Preserve Template Purity:** When modifying generator templates, the new indentation MUST match the original indentation exactly (0 spaces difference).

### 3. CLI Modifications & Error Handling

- **Clear Prompts:** If modifying the questionnaire strings, the prompt text MUST be < 80 characters.
- **Deterministic Failures:** If adding a network call or a filesystem operation, you MUST wrap it in a `try/catch`. In the `catch` block, you MUST print a string starting with "Error: " and immediately execute `process.exit(1)`.
- **Zero Junk:** Ensure no files starting with `.` (except `.gitignore`) or named `temp` are written to the user's workspace during execution.

### 4. Implementation Workflow

1. Clarify the target file path.
2. Read ONLY the target file.
3. Determine the exact line numbers (startLine, endLine).
4. Execute `Edit`.

---

## Examples

**Good Example (Surgical Edit):**

```markdown
### Intent: Add logging to plan.ts

- **Action**: Use `Edit` targeting lines 45-48.
- **Result**: Edit succeeds. Indentation matches exactly (4 spaces).
- **Error Handling**: Wrapped fs.readFileSync in try/catch, prints "Error: file not found", calls process.exit(1).
```

**Bad Example (Violation):**

```markdown
### Intent: Add logging to plan.ts

- **Action**: Use `Write` to overwrite the entire 500-line file.
- **Violation**: 1 rule broken (No Full-File Overwrites).
- **Error Handling**: Fails gracefully without calling process.exit(1).
- **Violation**: 1 rule broken (Deterministic Failures requires process.exit(1)).
```
