# EITR Project Memory & State

## Current Focus

- **Task:** Protocol 123 v3.0 Streamlining: Invariants-First Architecture, Single Lead Reviewer, On-Demand Arbiter Escalation & Runner Test Suite.
- **Protocol:** Protocol 123 v3.0 (Implemented, 100% verified and ready for commit).
- **Active Git Branch:** `feature/protocol-123-streamlined`
- **Next Step:** Safe commit under OpSec 23:00 and user reporting.

## Recently Completed

- Protocol 123 v3.0 Redesign:
  1. Invariants-First Discovery in Phase 2: `test-conditions-designer` discovers positive and negative boundary invariants (with high-signal cap of 6-10 positive ACs and 8-12 negative invariants across 9 taxonomy categories) to directly inform the `architect`'s defensive SDD plan.
  2. Single Strong Lead Reviewer in Phase 3 & 6: `code-reviewer` audits the plan and git diff using a comprehensive 5-point rubric (architecture, types, security, determinism, polyglot parity). `review-arbiter` preserved on-demand for multi-agent conflict escalations.
  3. Deterministic Runner & Evals Parity: Updated `scripts/protocol-123.mjs` with new phase graph and prompt templates; created comprehensive unit test suite `packages/evals/test/protocol-123-runner.test.ts` (11 tests, 100% green); wired into `npm run eval` (219/219 green across 21 files).
  4. Mirror Parity: Synchronized `.agents/skills/protocol-123/SKILL.md` and `.claude/skills/protocol-123/SKILL.md` (0 drift).
- Polyglot Scaffolding Reorganization & Native Auth (`feature/scaffold-polyglot-fixtures-auth`):
  1. Pillar 1: Scaffolding relocation (`tests/fixtures.ts` -> `fixtures/index.ts`, `tests/auth.setup.ts` -> `fixtures/auth.setup.ts`, Python `tests/test_auth_setup.py` -> `fixtures/auth_setup.py`).
  2. Pillar 2: Polymorphic operational skills (`resolveStackConventions`, 4 cross-language abstractions).
  3. Pillar 3: Polymorphic AI agents and multi-stack worked examples.
- Ko-fi Funding & Support Section: `.github/FUNDING.yml` and `README.md` Support section with official Ko-fi SVG button.
- Protocol 456 Redesign: Lightweight E2E engineering pipeline with deterministic runner (`scripts/protocol-456.mjs`), on-demand micro web-research, and 22 unit tests (`feature/protocol-456-lightweight` merged into `main`).
- Protocol 123 Phases 0–3 for Polyglot Fixtures & Auth: baseline check (Phase 0), upstream & codebase recon (Phase 1), formal SDD plan with 100 positive + 40 negative test conditions (Phase 2), 3-agent plan review swarm + review-arbiter adjudication with 25 accepted findings (Phase 3).

## Known Technical Debt & Deferred Bugs

- Pre-scoped tracks in Protocol 456 skip Phases 1 & 2 directly to Phase 3.
- Cypress is TypeScript-only; cross-language rules apply to Cypress within that 1 language.

## Core Architectural Decisions

- Zero-Config Default Verification: `npm test` after scaffolding must pass offline without requiring a local web server (keep setup project opt-in).
- Zero Lock-in: generated framework files must never mention "EITR" or "Eitr".
- OpSec 23:00 commit timestamps via `node scripts/git-safe-commit.mjs` or `npm run commit`.
- Branch-based workflow: feature work on `feature/<slug>`, no commits directly to `main`, no PR/push without explicit direct user instruction.
