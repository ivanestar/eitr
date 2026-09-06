---
name: doc-sync-enforcer
description: Documentation and version synchronization protocol. Enforces synchronous updates to ARCHITECTURE.md, AGENTS.md, CHANGELOG.md, README.md, ENGINE_VERSION, and package manifests.
tools: Read, Edit, Grep, Glob, PowerShell
model: sonnet
---

# Doc Sync Enforcer Agent

## Purpose

This agent prevents architectural and version drift by ensuring that AI assistants immediately update technical documentation, release notes, and version manifests to reflect code reality.

Trigger this agent automatically at the end of any task that modifies source code, documentation, or release notes.

## Rules & Constraints

### 1. Synchronous Documentation Update Requirement

Before completing a task, inspect what files and systems were modified:

- Search for modified components, signatures, and commands in `ARCHITECTURE.md`, `AGENTS.md`, and `README.md`.
- If documented behavior, command flags, or architectural layers do not match the new code, update the corresponding documentation sections immediately.
- Update `CHANGELOG.md` under the appropriate release header (e.g. `[0.4.0]`) as a flat bullet list — no `### Added`/`### Fixed` subheadings. Each bullet is one dense sentence starting with a bold category prefix (`**Added**`, `**Changed**`, `**Fixed**`, `**Removed**`, `**Security**`); never append verification commands or reviewer-process narration (that belongs in the commit message, per CLAUDE.md Section 8).
- If an agent or skill file under `.claude/` was modified, run `node scripts/check-mirror-parity.mjs`. If it exits non-zero, reconcile every reported pair deterministically: the file you (or this task) just edited is authoritative; port its content verbatim (translating tool names/paths to the target system's native syntax per CLAUDE.md Section 15) into the other side of the pair, then re-run the script. Per the Two-Strike Rule, attempt this reconcile-and-rerun cycle at most 2 times; if the script still exits non-zero after 2 attempts, stop, output `[BLOCKED-PARITY]`, and report the remaining diff to the user instead of retrying further.

### 2. Mandatory Version Manifest Synchronization (Anti-Drift Guard)

Whenever a new version is introduced in `CHANGELOG.md` or a release bump is made:

1. Extract the latest top version string `X.Y.Z` from `CHANGELOG.md`.
2. Update `ENGINE_VERSION = 'X.Y.Z'` in `packages/engine/src/version.ts`.
3. Update `"version": "X.Y.Z"` in all 4 workspace manifests:
   - Root `package.json`
   - `packages/cli/package.json`
   - `packages/engine/package.json`
   - `packages/evals/package.json`
4. Run `npm install --package-lock-only` to synchronize `package-lock.json`.
5. Verify parity by executing `npx vitest run packages/engine/test/boundary.test.ts`.

### 3. Modification Constraints & Style

- Use targeted line replacements (`Edit`).
- **DO NOT** overwrite entire markdown files.
- Preserve all existing headers, table formats, and mermaid diagrams.
- Strictly adhere to the **Zero-Emoji Policy** (0 emojis in code, docs, changelogs, or logs).
- Adhere to the **Zero Lock-in Policy** (no framework creator branding in generated templates).

### 4. Boundary Constraints & Safety

- **Missing Documents**: If a core documentation file is missing, do NOT hallucinate a blank one; report the missing file.
- **Verification**: When code, generator templates, or version manifests are modified, run `npm run build` and `boundary.test.ts` to guarantee that code and versions compile and match cleanly. If the task modified ONLY markdown/documentation files (e.g. `README.md`, `TODO.md`, `CHANGELOG.md`), do NOT run build or test suites — verify via `npm run format:check` and mirror-parity check only.
