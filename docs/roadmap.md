# EITR: AI-First SDET Platform -- Roadmap & Future Horizons

> Progress tracking and future horizons for EITR as a comprehensive AI-First test automation platform.
> Status: Active Roadmap and Engineering Progression.

---

## Milestone Progress Overview

- [x] **Milestone 1: AI-Layer Redesign & Multi-Assistant Ecosystem (Foundation & Hardening)**
- [x] **Milestone 2: Auth Bootstrap & Recon 2.0 with Topology Graph**
- [x] **Milestone 3: TMS MCP Integrations, TMS Validator and Automation Pipeline (`/automate-ticket`)**
- [x] **Milestone 4: Anti-Fake-Green Assertion Engine, TDM Teardown and Trace-Based Self-Healing**
- [x] **Milestone 5: Ecosystem Orchestration, Bulk Re-Recon and CI/CD Quality Gates**
- [x] **Milestone 6: 100% Polyglot Parity (TS, JS, Python, C#, Java) & Protocol 123 SDET Meta-Agents**
- [x] **Milestone 7: Embedded MCP Test Runner Bridge (`mcp__run_test`, `mcp__inspect_dom`)**

---

## Milestone 1: AI Layer Redesign & Multi-Assistant Ecosystem

**Goal:** Generated projects include a modular multi-agent framework, operational runbook skills, MCP configs, and corporate proxy support out-of-the-box.

### Key Completed Capabilities:

- **1.1. Specialized Agent Roles under Unified Facade:**
  - `sdet-orchestrator`: DAG router and single entry facade.
  - `sdet-architect`: Architecture governance, fixture dependency injection (`test.extend`), CPOM validation.
  - `pom-engineer`: DOM inspection, Page Object generation with 3-tier locator hierarchy (`getByTestId` -> `getByRole` -> `getByLabel`).
  - `test-automator`: Dynamic TDM, API fast-path preconditions, `test.step()` demarcation, linear AST test generation.
  - `assertion-auditor`: Anti-fake-green guard with auto-retrying web assertions and dual-layer validation (UI + API).
  - `trace-debugger`: 4-point trace triage in `trace.zip` and Two-Strike self-healing.
- **1.2. Operational Skills:**
  - `/auth-bootstrap` (`/auth-setup`), `/scan-and-generate-pom`, `/automate-ticket`, `/heal-test`, `/bulk-rescan`, `/map-site`.
- **1.3. Multi-Editor Support:**
  - Native configurations for Cursor, Claude Code, Windsurf, VS Code Copilot, Antigravity, and Codex.

---

## Milestone 2: Auth Bootstrap & Recon 2.0 with Topology Graph

**Goal:** Reliable session authentication and deep route mapping with component deduplication.

### Key Completed Capabilities:

- **2.1. Authentication Module (`eitr auth`):**
  - Headed login capture (MFA/SSO/OAuth) with `.auth/user.json` storage and TOTP 2FA auto-generation.
- **2.2. Route Topology Crawler (`eitr map`):**
  - Autonomous crawling, `docs/site-map.json`, and interactive SVG/HTML `docs/app-graph.html`.
  - Shared Widget Mining (extracting repeating elements into `components/widgets/`).

> **2.3. 3-Tier Component Sanity Engine — removed.** The generated `sanity` Playwright project,
> the mandatory `test:sanity` CI step, and the dedicated `tests/pom-sanity/*.sanity.spec.ts`
> pipeline were never fully wired into scaffolded projects and have been removed rather than
> completed. AI agent and operational-skill system prompts were updated in lockstep: every
> instruction that previously told an agent to run `npm run test:sanity` or generate a
> `*.sanity.spec.ts` file now instructs it to verify each Page Object directly against the live
> DOM instead, with no persistent sanity test artifact and no generated project shipping a
> dedicated sanity test project or CI gate.

---

## Milestone 3: TMS MCP Integrations & Automated Test Pipeline

**Goal:** End-to-end automation from TMS requirement tickets directly to verified CPOM tests.

### Key Completed Capabilities:

- **3.1. TMS MCP Stdio Bridge (`.mcp/tms-bridge/` & `scripts/mcp-server/`):**
  - Support for Jira Xray, Azure DevOps, TestRail, Zephyr with local caching and offline fallback.
- **3.2. Requirements Pre-Processing (`tms-validator`):**
  - Ticket atomicity validation, measurable expected results check, and GIGO scorecard rejection.
- **3.3. Linear Test Synthesis & Human Sign-Off Gateway:**
  - Strict AST linearity (zero branching/loops), fixture DI, and Proposal Matrix artifacts for 1-click batch approval.

---

## Milestone 4: Anti-Fake-Green Assertion Engine & Trace-Based Self-Healing

**Goal:** Eliminate false-green passes, guarantee test data idempotency, and autonomously repair broken locators.

### Key Completed Capabilities:

- **4.1. Assertion Hardening (`assertion-auditor`):**
  - 100% Expected Results mapping, unawaited promise guard, dual-layer validation (UI DOM + API response interception).
- **4.2. Test Data Management (TDM) & Teardown Registry:**
  - Dynamic synthetic TDM helpers (UUID, phone, email, name, amount, date) across all 5 languages.
  - LIFO teardown execution in `ApiClient` with automatic fixture cleanup.
- **4.3. Trace-Based Self-Healing (`trace-debugger`):**
  - Fail-fast real bug triage and Two-Strike isolated repair loop with automatic rollback on repeat failure.

---

## Milestone 5: Ecosystem Orchestration, Bulk Re-Recon & CI/CD Gates

**Goal:** Long-term maintenance tools, bulk locator updating on redesigns, and automated CI quality checks.

### Key Completed Capabilities:

- **5.1. Bulk Re-Recon (`eitr rescan` / `eitr recon`):**
  - Updates Page Object locators while preserving public method signatures and verifying via the project's test suite (`--verify`, `npm test`).
- **5.2. CPOM Contract Linter (`scripts/lint-cpom.js`):**
  - Zero-dependency static audit of CPOM rules (no `sleep`, mandatory `Now()`, no assertions in components, fixture DI).
- **5.3. Pre-Commit Hooks & Docker Preset:**
  - Pre-commit formatting and eval gates (`.githooks/pre-commit`), Playwright Noble LTS Dockerfile.

---

## Future Horizons & Backlog

### Horizon 1: Headless Trace AI Explainer (`eitr trace explain <trace.zip>`)

- Terminal utility that unpacks `trace.zip`, extracts failed DOM snapshots, console errors, and network logs, outputting a concise Markdown triage report without launching a browser.

### Horizon 2: Visual Regression CPOM Primitive (`VisualComparison`)

- Built-in primitive for pixel-level visual regression with automatic masking of dynamic regions (timestamps, random UUIDs, user avatars).

### Horizon 3: Multi-Region Distributed Crawling

- Parallel crawler support across geo-distributed proxies for multi-locale e-commerce and SaaS platforms.
