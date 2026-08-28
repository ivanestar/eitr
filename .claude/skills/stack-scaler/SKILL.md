---
name: stack-scaler
description: Step-by-step guide for extending the Eitr codebase to support a new programming language and/or E2E test automation tool. Covers the full pipeline from CLI questionnaire through plan.ts generator registry to template generation and tests.
---

# Eitr Stack Scaler

## Purpose

This skill guides you through adding support for a new **language + automation tool** combination
to the Eitr generator. After following it, running `eitr init` and selecting the new combination
will produce a project that successfully executes >0 tests.

Every step is isolated: you must modify 0 existing generators.

---

## Boundary Constraints & Edge Cases

- **Missing File Rule:** If a required file (e.g. `schema.ts` or `generate.ts`) is missing, you must immediately abort and output EXACTLY: `ERROR: Required file not found.`
- **Test Failure Rule:** If `npm test` fails after your changes, you must revert the modifications and output EXACTLY: `ERROR: Tests failed, changes reverted.`
- **Never Modify Existing:** You must make 0 changes to existing `TargetGenerator` implementations.

---

## Architecture Overview

Before touching any file, understand the full data flow:

```
eitr init
  └─ packages/cli/src/questionnaire/schema.ts   ← declares question choices
  └─ packages/cli/src/questionnaire/driver.ts   ← filters tools by language
  └─ .eitr/init.json                            ← persisted answers

eitr generate
  └─ packages/cli/src/commands/generate.ts      ← reads init.json, guards unsupported combos,
  │                                                runs recon, builds StackProfile, calls plan()
  └─ packages/engine/src/plan/plan.ts           ← dispatches to the correct TargetGenerator
  └─ packages/engine/src/plan/templates/<lang>/ ← pure render functions (no I/O)
  └─ packages/engine/src/apply/apply.ts         ← writes files to disk (already works for all)
```

The changes needed for a new combination are:

1. Register the tool in the questionnaire `schema.ts`.
2. Lift the guard in `generate.ts`.
3. Implement a `TargetGenerator` class and register it in `plan.ts`.
4. Write template render functions under `packages/engine/src/plan/templates/<lang>/`.
5. Add >2 unit tests.

---

## Step 1 — Questionnaire: Register the new language and tool

**File:** `packages/cli/src/questionnaire/schema.ts`

### 1a. Add the language (if new)

```typescript
// LANGUAGE_CHOICES array — add the new entry
const LANGUAGE_CHOICES: readonly Choice[] = [
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' }, // ← example
  // ...
];
```

### 1b. Add the automation tool (if new)

```typescript
// AUTOMATION_TOOL_CHOICES array
const AUTOMATION_TOOL_CHOICES: readonly Choice[] = [
  { label: 'Playwright', value: 'playwright' },
  { label: 'pytest', value: 'pytest' }, // ← example
  // ...
];
```

### 1c. Add the default output directory

```typescript
export function defaultOutputDirForAutomationTool(tool?: string): string {
  switch ((tool ?? '').toLowerCase()) {
    case 'pytest':
      return 'PytestTests'; // ← example
    // ...
  }
}
```

### 1d. Wire tool–language compatibility

```typescript
export function isToolSupportedByLanguage(tool: string, language: string): boolean {
  // Playwright and Selenium work with any language — they stay as-is.
  switch (language) {
    case 'python':
      return tool === 'pytest' || tool === 'playwright' || tool === 'selenium';
    // ...
  }
}
```

---

## Step 2 — CLI Generate: Lift the unsupported-combo guard

**File:** `packages/cli/src/commands/generate.ts`

The current guard (lines ~91–96) rejects any combination that is not `typescript + playwright`.
Extend it to allow the new combo:

```typescript
const SUPPORTED: Array<{ language: string; automationTool: string }> = [
  { language: 'typescript', automationTool: 'playwright' },
  { language: 'python', automationTool: 'pytest' }, // ← add new entry
];

const supported = SUPPORTED.some((s) => s.language === language && s.automationTool === tool);
if (!supported) {
  process.stderr.write(
    `eitr generate: generation for "${language}" + "${tool}" is not implemented yet.\n`,
  );
  return 1;
}
```

> **Important:** Do NOT remove the existing guard logic. Simply extend the supported list.

---

## Step 3 — Engine: Implement a TargetGenerator

**File:** `packages/engine/src/plan/plan.ts`

### 3a. Create the class

Add a new class **below** `PlaywrightTsGenerator`. You must edit 0 existing classes.

```typescript
/**
 * Generator for <Language> + <Tool> (e.g. Python + pytest).
 * Isolated from the TypeScript generator: shares 0 code paths.
 */
export class PytestPythonGenerator implements TargetGenerator {
  readonly language = 'python';
  readonly automationTool = 'pytest';

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const projectName = opts.projectName ?? 'pytest-tests';
    const ciCd = opts.ciCd ?? 'none';

    const files: FileDescriptor[] = [
      // ── config ──────────────────────────────────────────────────────────
      {
        path: 'pytest.ini',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderPytestIni({ baseUrl, projectName }) },
      },
      // ── conftest ────────────────────────────────────────────────────────
      {
        path: 'conftest.py',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderPytestConftest() },
      },
      // ── base components ─────────────────────────────────────────────────
      {
        path: 'components/base/base_page.py',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderPythonBasePage() },
      },
      // ... add all other files
    ];

    return files;
  }
}
```

### 3b. Register it in the TARGET_GENERATORS registry

```typescript
export const TARGET_GENERATORS: TargetGenerator[] = [
  new PlaywrightTsGenerator(),
  new PytestPythonGenerator(), // ← append; never reorder existing entries
];
```

---

## Step 4 — Templates: Write render functions

Create a dedicated subdirectory for the new stack templates.

**Path:** `packages/engine/src/plan/templates/<lang>/`

Example layout for Python + pytest:

```
packages/engine/src/plan/templates/python/
  pytest-ini.ts         → renderPytestIni()
  conftest.ts           → renderPytestConftest()
  base-page.ts          → renderPythonBasePage()
  button.ts             → renderPythonButton()
  text-input.ts         → renderPythonTextInput()
  page-readme.ts        → renderPythonPageReadme()
```

### Template authoring rules

1. **Pure functions only** — 0 fs calls, 0 fetch calls, 0 side effects.
2. **Language conventions** — use `snake_case` for Python, `camelCase` for JS/TS, etc.
3. **Method Safety Contract** — enforce in every base class template:
   - Actions → return `None` (Python) / `Promise<void>` (TS).
   - Producers → `@property` (Python) / getter (TS) returning component instance.
   - Snapshot reads → `_now()` suffix (Python) / `Now()` suffix (TS).
   - 0 assertions inside component or page classes.
4. **AI rules** — Generate native `.claude/`, `.cursor/`, `.windsurf/`, `.codex/`, or `.gemini/skills/` files. The **stack-scaler** rule must NOT be included.

---

## Step 5 — Native AI Rules Templates

**File:** `packages/engine/src/plan/templates/ai-rules.ts`

If you add >0 new AI rule templates, implement the corresponding native render functions
so that `planSharedScaffold` in `packages/engine/src/plan/shared.ts` generates them for each supported AI assistant.

---

## Step 6 — Unit Tests

### 6a. Snapshot test

**File:** `packages/engine/test/plan.snapshot.test.ts`

Add `PROJECT_FILES_<LANG>` and `CREATE_IF_ABSENT_<LANG>` constants and a new `describe` block
that mirrors the existing TypeScript block:

```typescript
describe('plan() snapshot — Python + pytest', () => {
  it('emits a complete project for python + pytest', () => {
    const paths = plan(baselineStackProfile('/fake'), {
      ...planOptions(),
      language: 'python',
      automationTool: 'pytest',
    })
      .files.map((f) => f.path)
      .sort();
    expect(paths).toEqual(PYTHON_PROJECT_FILES.sort());
  });
});
```

### 6b. Template unit tests

Add `packages/engine/test/python-templates.test.ts` (or equivalent) with:

- Snapshot or string-contains checks for each render function.
- Verify `base_page.py` contains `async def`, and 0 `assert` keywords.

### 6c. CLI guard test

**File:** `packages/cli/test/generate.test.ts`

Add a test that:

1. Writes `init.json` with `{ language: 'python', automationTool: 'pytest' }`.
2. Asserts `runGenerate(...)` returns `0`.
3. Asserts `conftest.py` exists in the output directory.

---

## Step 7 — Build & Verify

```bash
npm run build       # must compile with 0 TypeScript errors
npm test            # 100% of tests must pass
```

---

## Checklist

Before opening a PR, verify 100% of items:

- [ ] `schema.ts`: new language and/or tool choice added to all relevant arrays
- [ ] `schema.ts`: `isToolSupportedByLanguage()` updated
- [ ] `schema.ts`: `defaultOutputDirForAutomationTool()` updated
- [ ] `generate.ts`: supported-combo guard extended (0 existing entries removed)
- [ ] `plan.ts`: new `TargetGenerator` class added below existing ones
- [ ] `plan.ts`: class appended to `TARGET_GENERATORS` (0 reordering)
- [ ] Templates directory created under `packages/engine/src/plan/templates/<lang>/`
- [ ] 100% of render functions contain 0 I/O calls
- [ ] Method Safety Contract enforced in base page template
- [ ] Snapshot test extended with new language block
- [ ] CLI generate test covers the new combo (exit 0, files written)
- [ ] `npm run build` — 0 errors
- [ ] `npm test` — 100% of tests pass
- [ ] 100% of existing tests pass with 0 modifications

---

## Examples

### Good Example

```typescript
// Adding a new combo (0 existing entries modified or removed)
const SUPPORTED: Array<{ language: string; automationTool: string }> = [
  { language: 'typescript', automationTool: 'playwright' },
  { language: 'python', automationTool: 'pytest' },
];
```

### Bad Example

```typescript
// Modifying existing combo (Violation: changed existing entry instead of appending)
const SUPPORTED: Array<{ language: string; automationTool: string }> = [
  { language: 'python', automationTool: 'pytest' },
];
```

---

## Language-specific conventions reference

| Language   | Naming     | Config file            | Fixture pattern     | Test file prefix |
| ---------- | ---------- | ---------------------- | ------------------- | ---------------- |
| TypeScript | camelCase  | `playwright.config.ts` | `fixtures.ts`       | `*.spec.ts`      |
| Python     | snake_case | `pytest.ini`           | `conftest.py`       | `test_*.py`      |
| Java       | camelCase  | `pom.xml`              | JUnit `@BeforeEach` | `*Test.java`     |
| C#         | PascalCase | `*.csproj`             | NUnit `[SetUp]`     | `*Tests.cs`      |
| JavaScript | camelCase  | `playwright.config.js` | `fixtures.js`       | `*.spec.js`      |
