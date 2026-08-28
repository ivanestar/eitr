---
name: project-memory-keeper
description: Project state and context synchronization protocol. Enforces maintaining an AI_MEMORY.md file to preserve context across different chat sessions.
---

# Project Memory Keeper Skill

## Purpose

AI agents lose all context between different chat sessions. This skill establishes a persistent memory system for EITR, ensuring that in a new session, the AI can instantly pick up where the previous session left off without the user having to re-explain the entire project state.

## The Memory Protocol

### 1. The Single Source of Truth

The memory is stored in a file located at the root of the project: `AI_MEMORY.md`.
_Boundary Constraint:_ If the file doesn't exist, create it on the first invocation. If the file exceeds 500 lines, you MUST summarize the oldest entries to keep the file under 500 lines. Do NOT create multiple memory files.

### 2. When to Update Memory (Writing)

Update the `AI_MEMORY.md` file whenever EXACTLY one of these triggers occurs:

- If >3 files are modified in a single turn.
- If >10 user messages are exchanged in a single session.
- If the user explicitly asks to "save progress" or "обнови память".

**Format of `AI_MEMORY.md` (Example):**

```markdown
# EITR Project Memory & State

## Current Focus

- [What is the immediate next epic or task?]

## Recently Completed

- [Feature A added]
- [Bug B fixed in file X]

## Known Technical Debt & Deferred Bugs

- [List any bugs we noticed but decided to fix later]
- [Refactoring ideas]

## Core Architectural Decisions

- [e.g. We use vitest with a 30s timeout for E2E tests]
- [e.g. .eitr folders are gitignored and used for metadata]
```

### 3. How to Update Memory

Use the `Edit` tool to update the sections in `AI_MEMORY.md` rather than rewriting the entire file from scratch.
_Boundary Constraint:_ If the edit fails, you MUST report the exact error message to the user and retry exactly 1 time before aborting. You MUST NOT modify sections outside of your target update.

### 4. When to Read Memory (Reading)

If the user starts a new chat and says "прочти память" (read memory) or invokes this skill at the beginning of a session:

1. Use `Read` to read `AI_MEMORY.md`.
2. Acknowledge the state in exactly 1-2 sentences: _"Я прочитал память. Текущий фокус: [Фокус]. Готов продолжать."_
   _Boundary Constraint:_ If the `AI_MEMORY.md` file is missing when asked to read, you MUST output exactly: `ERROR: AI_MEMORY.md not found. Awaiting instructions.`

## Good Examples

**Good Example 1:**
User: "save progress"
Action: Agent uses `Edit` to add 1 bullet point under "Recently Completed" in `AI_MEMORY.md`. Agent outputs exactly 1 sentence acknowledging the save.

## Bad Examples

**Bad Example 1:**
User: "save progress"
Action: Agent rewrites the entire 300-line `AI_MEMORY.md` file from scratch, discarding historical data.
_(Violation: Did not use `Edit` for targeted update)._

**Bad Example 2:**
User: "read memory"
Action: Agent reads memory and outputs a 10-sentence summary of the whole file.
_(Violation: Exceeded the exact 1-2 sentence limit for acknowledgment)._
