---
name: ast-template-engineer
description: Protocol for safely modifying TypeScript AST templates. Enforces compilation checks and strict fallback rules.
---

# AST Template Engineer Skill

## Purpose

This skill dictates how AI agents must modify TypeScript template literals (AST generators) inside the EITR engine. It guarantees that generated code templates remain syntactically valid TypeScript and prevents broken string interpolations.

Trigger this skill automatically whenever you modify > 0 files matching the path `packages/engine/src/**/templates/*.ts`.

## Rules & Constraints

### 1. Mandatory Compilation Check

After modifying > 0 lines in an AST template file, you MUST verify its syntax before proposing the change to the user or making a commit.

- Execute exactly: `npm run typecheck` (or `npx tsc --noEmit <path-to-file>`).
- If the exit code is > 0, you MUST NOT proceed. You must read the error output and attempt a fix.

### 2. The Fallback Rule (Two-Strike Limit)

- If your compilation check fails >= 2 times consecutively on the same file, you MUST abort the modification.
- Execute exactly: `git checkout -- <file>` to revert the file to its last committed state.
- Output exactly: "ABORT: Reverting due to unresolvable AST compilation error."

### 3. Boundary Constraints & Safety

- **DO NOT** use the `multi_replace_file_content` tool for template refactors if the string spans > 50 lines. If modifying >50 lines, rewrite the specific AST node entirely.
- **DO NOT** remove existing `${}` interpolation variables unless explicitly requested by the user.

## Examples

### Good Example

```markdown
1. Modified `packages/engine/src/plan/templates/playwright.ts`.
2. Executed `npm run typecheck`.
3. Received exit code 1 (Missing backtick on line 45).
4. Fixed the missing backtick.
5. Re-ran `npm run typecheck`. Received exit code 0.
```

### Bad Example

```markdown
1. I updated the template string for the Java generator.
2. The code looks correct to me, so I will commit it now.
   _(Violation: Did not run `npm run typecheck`. Relied on visual inspection instead of a deterministic compiler check.)_
```
