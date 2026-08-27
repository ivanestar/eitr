---
name: qa-guard
description: Quality Assurance protocol for EITR. Enforces full-cycle E2E test execution, artifact inspection, and test-driven bug fixing to ensure 0 failing tests in generator solutions.
---

# Eitr QA Guard Skill

## Purpose

This skill ensures 0 regressions in EITR's codebase. This skill dictates how AI agents should run tests, debug failures, and enforce full-cycle smoke tests for every generator.

Use this skill whenever:

1. You have completed >0 code changes using `eitr-core-developer`.
2. A user reports >=1 bugs in the generated code and you need to reproduce it.
3. You are adding >=1 new generators and need to ensure it is covered by a full-cycle test.

---

## The QA Verification Protocol

### 1. The Golden Rule of EITR Testing

Whenever >0 changes are made to a generator, you MUST run the integration tests to prove that the generated solution installs dependencies with 0 errors and passes 100% of tests.

### 2. The Testing Workflow

1. **Run Full-Cycle Tests:** After 1 or more changes, execute exactly: `npx vitest run packages/cli/test/e2e.full-cycle.test.ts`.
2. **Adding a new generator:**
   - If adding 1 new generator, you MUST add exactly 1 new test case inside `e2e.full-cycle.test.ts`.
   - The test MUST simulate answering the questionnaire, wait for the project to generate, execute the target's test runner, and assert exactly 0 for the exit code.
3. **Clean Up:** The test MUST delete the generated `eitr-tmp` framework upon receiving a 0 exit code to reclaim >0 bytes of disk space.

### 3. AI-Optimized Debugging (No Blind Guessing)

If an E2E test exits with a code >0:

- **DO NOT** guess the cause based solely on terminal output.
- **Inspect the Generated Artifacts:** Navigate exactly to the `.eitr-tmp/test-project/` directory.
- **Read the Source:** If a test fails, you MUST use `view_file` on >=1 generated files (e.g., `package.json`, `example.spec.ts`) before proposing a fix.
- **Run Manually in Context:** You MUST `cd` into the generated directory and run the command manually to get the exact error output.

### 4. Zero Flakiness Policy

- **Timeouts:** If adding an E2E test, you MUST set `testTimeout` to exactly `60000ms` in `vitest.config.ts`.
- **Network Isolation:** If the generated test relies on an external API, it MUST have `try/catch` fallback logic. If the API returns a status code >399, the test MUST be skipped rather than failed.

### 5. Boundary Constraints & Safety

- **Missing Files:** If the expected generated file is NOT found in `.eitr-tmp/`, you MUST immediately stop testing and output exactly: "ERROR: Generator failed to output files."
- **Infinite Loops:** If the test runner hangs for >120 seconds, you MUST kill the process (exit) and check for infinite loops in the AST generation logic.
- **DO NOT** run tests outside of the workspace directory.
- **DO NOT** modify the user's global dependencies (e.g., do NOT execute `npm install -g`).

### 6. Good and Bad Examples

#### Good Example

```markdown
1. Executed `npx vitest run packages/cli/test/e2e.full-cycle.test.ts`.
2. Received exit code 1.
3. Examined `.eitr-tmp/test-project/package.json` using `view_file`. Found missing comma on line 12.
4. Fixed the generator template.
5. Re-ran test. Received exit code 0. `.eitr-tmp` was deleted.
```

#### Bad Example

```markdown
1. Test failed with error "unexpected token".
2. I think the generator missed a bracket. I will modify the generator file and tell the user it is fixed.
   _(Violation: Guessed the error without using `view_file` to read the generated artifact. Did not manually verify in context.)_
```
