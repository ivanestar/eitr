---
name: commit-writer
description: Rules and guidelines for structuring and formatting Git commits in the EITR repository, covering Conventional Commits scoping, deterministic body triggers, and the mandatory 23:00 OpSec timestamp policy. Trigger on requests like "write a commit message", "commit this", "как закоммитить", "напиши commit message".
---

# Commit Writer Guidelines

You are responsible for formulating Git commit messages for the EITR project. Adhere strictly to the following rules whenever you commit code or suggest a commit message.

## 1. Conventional Commits Format

Use the standard Conventional Commits specification. The structure must be:
`<type>[optional scope]: <description>`
Max subject line length: exactly 72 characters.

### STRICTLY Allowed Types:

Do NOT invent new types. Use ONLY:

- `feat`: A new feature.
- `fix`: A bug fix.
- `chore`: Maintenance tasks, dependencies updates, tooling configurations.
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `docs`: Documentation only changes.
- `test`: Adding missing tests or correcting existing tests.
- `build`: Changes that affect the build system or external dependencies.

### STRICTLY Allowed Scopes:

- `(cli)`: Changes strictly within `packages/cli`.
- `(engine)`: Changes strictly within `packages/engine`.
- `(evals)`: Changes strictly within `packages/evals`.
- `(deps)`: Dependency updates across the repo.
- **Cross-package rule**: If a change touches >1 package simultaneously (e.g., engine and cli), do NOT combine scopes like `(cli, engine)`. Omit the scope entirely (e.g., `feat: universal support`).

## 2. Formatting Rules

- **Lowercase Subject**: The description must begin with a lowercase letter (e.g., `feat(engine): add java playwright adapter` instead of `feat(engine): Add Java Playwright adapter`).
- **No Emojis**: NEVER use emojis in commit messages. Emojis are strictly banned.
- **Imperative Mood**: Write the description in the imperative mood (e.g., "add feature", not "adds feature" or "added feature").
- **No Period**: Do not end the subject line with a period.

## 3. Deterministic Body Triggers

You MUST provide a multi-line commit body (minimum 2 lines) if ANY of the following are true:

1. The commit type is `fix`.
2. The commit modifies >3 files.
3. The commit spans >1 package (cross-package).

When required, leave exactly 1 empty line after the subject line, followed by the body. Wrap body lines at exactly 72 characters.
The body MUST contain:

- **Why**: Why the change is necessary.
- **What**: What approach was taken.

## 4. Boundary Constraints & Safety

- **Empty Commits**: If the proposed commit contains 0 files, you MUST NOT create a commit message and must abort the operation.
- **Missing Context**: If a commit body is required by the triggers above but no extra context is available, you MUST include the exact string: `No additional context available.` in the body.
- **Large Commits**: If the commit modifies >20 files, you MUST append the exact string `[LARGE-COMMIT]` at the end of the subject line.

## 5. Examples

### Good Example (Simple)

```text
feat(engine): support csharp in project generator
```

### Good Example (Complex with Body)

```text
fix(cli): resolve undefined argument crash on init

Why: The CLI parser was not correctly handling missing positional arguments,
causing a fatal crash when users ran the command without a path.

What: Added a default fallback parameter in the Commander.js setup and
injected a validation step before spawning the engine pipeline.
```

### Bad Example

```text
Added C# support [emoji]
```

_(Violation: Capitalized description, past tense, no type, emoji used, 0 rules followed)_

## 6. Self-Check Before Finalizing

Before outputting the commit message, ask: (1) can this be said shorter without losing meaning? (2) does anything here read like AI-slop (hype adjectives, filler, self-referential compliance narration) that needs rephrasing? Fix it before the message goes out, not after.

## 7. Automated Timestamp Sanitization (23:00 OpSec Policy)

Whenever committing code or executing `git commit` in this repository, you MUST enforce that both Author Date and Committer Date are strictly set to **23:00:00** of the current day in the local timezone:

1. **Mandatory Execution Path for AI Assistants:**
   Always execute git commits via the safe helper script:
   ```bash
   node scripts/git-safe-commit.mjs "<commit-message>"
   ```
   or:
   ```bash
   npm run commit -- "<commit-message>"
   ```
2. **Environment Variable Fallback:**
   If running `git commit` directly, you MUST set both environment variables before invocation:
   - `GIT_AUTHOR_DATE="YYYY-MM-DDT23:00:00<TZ>"`
   - `GIT_COMMITTER_DATE="YYYY-MM-DDT23:00:00<TZ>"`
3. **Absolute Prohibition:**
   NEVER execute raw `git commit` during business hours without unmasking/injecting the 23:00 evening timestamp.
