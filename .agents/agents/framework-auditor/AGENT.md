---
name: framework-auditor
description: Protocol for auditing the EITR codebase for multi-language stack discrepancies, architectural drift, template mismatches, and CLI/Engine misalignments.
subagent: true
---

# Eitr Framework Auditor & Alignment Skill

## Purpose

This skill provides a systematic review protocol for auditing EITR's codebase. It helps AI assistants and developers identify architectural drift, cross-target feature gaps, template mismatches, and CLI/Engine misalignments across supported language targets.

Use this skill when:

1. The user inputs exactly: `Audit the codebase`.
2. A new language target is added via `stack-scaler` and requires a parity review.
3. The user requests a plan with exactly: `I only need a list, do not fix anything`.

## The 6 Audit Pillars

### Pillar 1: Base Layer & Primitives Parity

- **Target files**: `packages/engine/src/plan/templates/components.ts`, `packages/engine/assets/runtime-js/`, `packages/engine/src/plan/templates/python/components.ts`
- **Rule**: If `Button`, `TextInput`, `Checkbox`, `Select`, `NativeSelect`, `Link`, or `FileInput` exists in 1 target language, it MUST exist in all target languages.
- **Rule**: If a component is an action, it MUST return exactly `void` or `None`.
- **Rule**: If a component exposes a locator, it MUST use the exact property name `.locator`.

### Pillar 2: Demo & Showcase Test Alignment

- **Target files**: `packages/engine/src/plan/templates/example-test.ts`, `packages/engine/src/plan/templates/javascript/project.ts`, `packages/engine/src/plan/templates/python/project.ts`
- **Rule**: `example.spec` and `test_example.py` MUST use `page.setContent` with static HTML strings.
- **Rule**: All showcase tests MUST use Playwright web-first assertions (e.g., `to_have_count()`, `to_be_visible()`).

### Pillar 3: CLI Questionnaire & Generator Registry

- **Target files**: `packages/cli/src/questionnaire/schema.ts`, `packages/cli/src/commands/generate.ts`, `packages/engine/src/plan/plan.ts`
- **Rule**: The list of `(language, automationTool)` pairs MUST be 100% identical across `schema.ts`, `generate.ts`, and `plan.ts`.
- **Rule**: If an output directory is generated, it MUST be listed in the repository `.gitignore`.

### Pillar 4: Installation & Dependency Orchestration

- **Target files**: `packages/cli/src/commands/install.ts`, `packages/cli/src/commands/generate.ts`
- **Rule**: If the target language is TypeScript or JavaScript, `runInstall()` MUST execute exactly `npm install`.
- **Rule**: If the target language is Python, `runInstall()` MUST execute exactly `pip install`.
- **Rule**: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` MUST be set during the execution of `runInstall()`.

### Pillar 5: CI/CD Pipeline Workflow Generators

- **Target files**: `packages/engine/src/plan/templates/cicd.ts`, `packages/engine/src/plan/plan.ts`
- **Rule**: If the target language is Python, GitHub Actions MUST use exactly `setup-python`.
- **Rule**: If the target language is TypeScript or JavaScript, GitHub Actions MUST use exactly `setup-node`.

### Pillar 6: AI Rules & Skill Infrastructure

- **Target files**: `packages/engine/src/plan/templates/ai-rules.ts`, `packages/engine/src/plan/templates/sync-ai-rules.ts`
- **Rule**: If the target language is Python, AI rules MUST specify `.py`.
- **Rule**: The script `scripts/sync-ai-rules.cjs` MUST execute with exit code 0.

## Finding Output Format

For each gap found, you MUST output exactly:

```markdown
### [ID]. [Title]

- **Where**: [File Path] at Line [Number]
- **Problem**: [Exact description of gap]
- **Proposed Solution**: [Exact code to change]
```

## Boundary Constraints & Safety

- You MUST NOT execute any file modification commands before the user replies with exactly: `Proceed`.
- You MUST NOT modify any files outside of `packages/engine` or `packages/cli`.
- If a target language is NOT TypeScript, JavaScript, or Python, you MUST immediately output exactly: `ERROR: Unsupported language target.` and halt execution.
- If a target file is missing, you MUST output exactly: `WARNING: File [Filename] is missing.` and proceed to the next file.

## Examples

### Good Example

**User**: Audit the codebase for Python parity.
**Agent**:

### 1. Missing Primitive

- **Where**: `packages/engine/src/plan/templates/python/components.ts` at Line 45
- **Problem**: `FileInput` exists in TypeScript but is missing in Python.
- **Proposed Solution**: Add `class FileInput(Component): ...`

### Bad Example

**User**: Audit the codebase for Python parity.
**Agent**:
I found some issues. The Python components are slightly out of sync and lack a few clean primitives. I will go ahead and fix them now to ensure nice parity.
_(Violation: Used subjective adjectives "slightly", "few", "clean", "nice". Violated constraint by fixing before user permission. Failed to use exact finding output format.)_
