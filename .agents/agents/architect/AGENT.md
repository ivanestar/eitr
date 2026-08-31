---
name: architect
description: Architectural planning protocol for changes modifying > 5 files. Enforces creating Markdown artifacts with design documents and step-by-step plans BEFORE writing code.
subagent: true
---

# Eitr Architect Skill

## Purpose

This skill is triggered if a task modifies > 5 files, adds > 1 new language runner, or adds > 1 configuration engine.
Its core purpose is to prevent token waste by enforcing a "Design First, Code Later" policy.

## The Planning Protocol

When invoked, the AI must NOT write or modify any application code initially. Instead, it must execute exactly these steps:

### 1. Create a Design Document Artifact

Create a `.md` artifact containing exactly:

- **Goal:** 1-3 sentences stating the objective.
- **Current State:** 1-3 sentences describing the current mechanism.
- **Proposed Architecture:** How it will work. Include exactly 1 Mermaid diagram (`mermaid graph TD`) if > 3 components interact.
- **Impact Radius:** A markdown list of the exact > 0 files that will be created or modified.

### 2. Formulate a Step-by-Step Plan

Break the implementation down into steps.

- Each step must modify <= 3 files.
- Each step must specify the exact file paths.
- **Step 1:** [Description] (e.g., Update questionnaire schema in `fileA.ts`)
- **Step 2:** [Description] (e.g., Register new generator in `fileB.ts`)

### 3. Request Approval

Present the artifact to the user and explicitly output:

> "План готов. Пожалуйста, утверди архитектуру или внеси правки. Как только дашь добро, мы перейдем к Шагу 1."
> Stop execution and wait for the user to reply.

### 4. Stepwise Execution

Once the user inputs approval, execute the plan.

- Execute exactly 1 step per response.
- Do NOT execute > 1 step per response.
- After completing a step, run a verification command (e.g., `npm run typecheck`). If the exit code > 0, stop and fix the error before proceeding to the next step.

## Boundary Constraints & Safety

- **DO NOT** write > 0 lines of code before the user approves the plan.
- **DO NOT** modify any files outside of the "Impact Radius" list.
- **Holistic Pattern Matching**: When adding or modifying a feature, inspect how existing similar features are implemented across the ENTIRE stack (schema, CLI driver, prompt UI, reducer, generator, templates, tests, docs) and ensure 100% complete end-to-end implementation across all touchpoints.
- **Absolute Zero Emoji Policy**: NEVER use any emojis anywhere in code, prompts, CLI logs, generated templates, markdown documentation, or responses.
- **If the user rejects the plan:** Discard the current plan and ask for > 0 specific reasons for rejection, then generate a new plan.
- **If a file in the Impact Radius is missing during execution:** Stop and explicitly ask the user for guidance.

## Examples

### Good Example

```markdown
# Design Plan

- **Goal:** Implement the architect skill constraints.
- **Current State:** Missing constraints.
- **Proposed Architecture:** Update the markdown file.
- **Impact Radius:**
  - `skills/architect/SKILL.md`

## Steps

- **Step 1:** Rewrite the markdown file. (Modifies 1 file)

> "План готов. Пожалуйста, утверди архитектуру или внеси правки. Как только дашь добро, мы перейдем к Шагу 1."
```

### Bad Example

```markdown
# Design Plan

We will make massive changes to the application.

- Step 1: Do the trivial updates.
- Step 2: Fix all the files.

Let me know what you think!
```

_(Violation: "massive" and "trivial" are subjective adjectives. Impact Radius is missing. Exact trigger string for approval is missing.)_
