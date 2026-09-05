# EITR Project Memory & State

## Current Focus

- **Task:** Polyglot Scaffolding Reorganization, Native Auth Architecture & Stack-Conforming AI Skills/Agents.
- **Protocol:** Protocol 123 (Phases 0–8 complete; 100% verified and safely committed locally).
- **Active Git Branch:** `feature/scaffold-polyglot-fixtures-auth`
- **Architectural Plan Artifact:** `C:\Users\Legion\.gemini\antigravity-cli\brain\1b898265-873f-4b48-84cf-fd77997294ee\polyglot_scaffold_auth_sdd_plan.md`
- **Next Step:** Ready for user instructions regarding remote push or PR creation.

## Recently Completed

- Protocol 123 Phases 0–8 for Polyglot Fixtures & Auth:
  1. Pillar 1: Scaffolding relocation (`tests/fixtures.ts` -> `fixtures/index.ts`, `tests/auth.setup.ts` -> `fixtures/auth.setup.ts`, Python `tests/test_auth_setup.py` -> `fixtures/auth_setup.py`, linters `fixtures` targetDirs, generator options forwarding). Verified via `packages/engine/test/dx-scaffolding-parity.test.ts`, `packages/cli/test/terminal-e2e.test.ts`, `packages/engine/test/e2e-scaffold.test.ts`.
  2. Pillar 2: Polymorphic operational skills (`resolveStackConventions` with language prioritization, 4 cross-language abstractions, C#/Java class filtering, Cypress `cy.session()` validation). Verified via `packages/engine/test/ai-skills-agents-parity.test.ts`.
  3. Pillar 3: Polymorphic AI agents (system prompt parameterization, worked examples native to target language). Verified via `packages/engine/test/ai-skills-agents-parity.test.ts` (9/9 green).
  4. Code Review Swarm (Phase 6): 3-agent swarm (`code-reviewer`, `framework-auditor`, `security-auditor`) with 13 findings; `review-arbiter` adjudicated 11 accepted, 2 dismissed.
  5. Self-Healing & Refinements (Phase 7): All 11 accepted findings resolved; `packages/engine/test/auth-setup.test.ts` quote expectation updated to match `JSON.stringify` (8/8 green).
  6. Verification Gate: `npm run build`, `npm run typecheck`, `node scripts/check-mirror-parity.mjs`, `npm run format:check`, targeted vitest suite (44/44 green), and offline eval suite `npm run eval` (208/208 green across 20 files).
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
