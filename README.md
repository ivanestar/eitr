# EITR: Universal Test Automation Platform Scaffolder

[![CI](https://github.com/ivanestar/eitr/actions/workflows/ci.yml/badge.svg)](https://github.com/ivanestar/eitr/actions/workflows/ci.yml)
[![License: Fair Source (FSL-1.1)](https://img.shields.io/badge/License-Fair%20Source%20(FSL--1.1)-orange.svg)](https://fsl.software/FSL-1.1-ALv2.template.md)
[![npm version](https://img.shields.io/npm/v/@onlytests/eitr.svg)](https://www.npmjs.com/package/@onlytests/eitr)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![CLA Assistant](https://img.shields.io/badge/CLA-Assistant-blue.svg)](.github/workflows/cla.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

EITR is a zero-lock-in scaffolding engine that generates the **Core** of resilient, enterprise-grade, and AI-native UI test automation frameworks. It autonomously inspects your web application, scaffolds a Component Page Object Model (CPOM) architecture, connects your test suite to your Test Management System (Jira Xray, Azure DevOps, TestRail, Zephyr), and configures an embedded Model Context Protocol (MCP) bridge for AI assistants (Cursor, Claude Code, Windsurf, Copilot, Antigravity, Aider).

---

## Core Principles

1. **100% Zero Lock-in:** Generated code is completely autonomous with zero runtime dependencies on `@eitr/engine`. The framework belongs 100% to your team.
2. **Polyglot & Multi-Tool:** Full native Playwright support across 5 languages (TypeScript, JavaScript, Python, C# (.NET), and Java). Cypress is supported natively for TypeScript and JavaScript only, matching Cypress's own language runtime.
3. **Component Page Object Model (CPOM):** Typed base classes (`BasePage`, `Component`, `Collection`, `Container`) and production-grade primitives (`Button`, `TextInput`, `Table`, `Dialog`, `DragAndDrop`, `Canvas`) enforcing strict separation of state reads (`Now()` suffixes) and user actions.
4. **AI-Native & MCP Integration:** An embedded, zero-dependency JSON-RPC MCP Stdio server (`scripts/mcp-server/`) allowing AI assistants to directly run isolated tests, inspect semantic DOM trees, fetch TMS test cases, and post execution results.
5. **Zero-Emoji Policy:** Clean, professional engineering style with zero visual noise across code, CLI outputs, and documentation.

---

## Quick Start (Single Command)

To scaffold a complete, production-ready test automation framework, run:

```bash
# Run directly via npx
npx @onlytests/eitr new

# Or install globally
npm install -g @onlytests/eitr
eitr new
```

The interactive wizard will automatically:

- Perform headless reconnaissance against your target application URL.
- Configure your language, test runner, UI library, TMS provider, CI/CD pipeline, and AI editors.
- Scaffold the complete, modular directory structure.
- Install dependencies and Playwright browser binaries (when auto-install is enabled).
- Generate a `.env` configuration pre-populated with your target `E2E_BASE_URL`.

---

## End-to-End SDET User Journey

Follow this 6-step workflow to get from an empty repository to automated CI/CD execution:

### Step 1. Initial Framework Scaffolding

Run `npx @onlytests/eitr new` (or `eitr new` if installed globally), enter your target application URL (e.g. `https://app.example.com`), and select your tech stack options. With auto-installation enabled, all package dependencies and browser engines are installed automatically.

### Step 2. Environment Configuration (`.env`)

A `.env.example` (and `.env`) file is generated in the project root with `E2E_BASE_URL` pre-populated from the wizard prompt.
Add your authentication and TMS integration secrets:

```env
# Application Base URL (pre-populated from the wizard)
E2E_BASE_URL=https://app.example.com

# Test User Credentials
E2E_USERNAME=test_user@example.com
E2E_PASSWORD=SecurePassword123!
TOTP_SECRET=JBSWY3DPEHPK3PXP

# TMS Integration Secrets (Optional)
JIRA_HOST=https://yourcompany.atlassian.net
JIRA_EMAIL=automation@company.com
JIRA_API_TOKEN=your_jira_api_token
```

### Step 3. Capture Authenticated Session (`eitr auth`)

To bypass login screens and MFA in automated tests:

```bash
npx eitr auth
```

A browser window will open. Complete the login flow manually (including SSO, MFA, or Captcha). EITR will capture session cookies and tokens, saving them to `.auth/user.json`. All automated tests will automatically launch in an authenticated state.

### Step 4. Application Topology Mapping (`eitr map`)

Run the autonomous crawler to discover application routes and build a visual graph:

```bash
npx eitr map https://app.example.com
```

EITR traverses the application, produces `docs/site-map.json`, and generates an interactive, zero-dependency visual topology dashboard at `docs/app-graph.html` showing routes, Component Page Objects, and test coverage.

### Step 5. Synthesize Page Objects & Automate TMS Tickets via AI

Open the generated project in your AI editor (Cursor, Claude Code, Windsurf, VS Code Copilot, or Antigravity).

Use pre-configured slash commands in the AI chat:

- To generate a Component Page Object for a page:
  ```text
  /scan-and-generate-pom /dashboard
  ```
- To synthesize an end-to-end test directly from a Jira / Azure DevOps / TestRail ticket:
  ```text
  /automate-ticket TC-1042
  ```

The AI assistant fetches the ticket's steps and expected results via the embedded MCP bridge, reuses existing Page Objects, and generates a robust CPOM test matching project conventions.

### Step 6. Execution, Failure Triage & Self-Healing

- **Run Tests:**
  ```bash
  npx playwright test
  ```
- **AI-Powered Failure Triage:** If a test fails, trigger:
  ```text
  /tms-triage test-results/failed-test/trace.zip
  ```
  The AI analyzes the Playwright Trace, identifies the root cause (e.g. backend HTTP 500), deduplicates defects, and attaches the diagnostic report to the TMS card.
- **Self-Healing on UI Redesigns:** When the UI layout changes:
  ```bash
  npx eitr rescan
  ```
  or run `/heal-test tests/login.spec.ts` to automatically update stale locators.

---

## Core CLI Commands

| Command                            | Description                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `npx eitr new`                     | Interactive scaffolding wizard with stack detection and auto-installation          |
| `npx eitr auth`                    | Interactive session capture and storageState generation in `.auth/user.json`       |
| `npx eitr map <url>`               | Autonomous route discovery, topology mapping, and `docs/app-graph.html` generation |
| `npx eitr rescan` (alias: `recon`) | High-speed locator re-scan and Page Object verification following UI updates       |
| `npx eitr doctor --ai`             | System environment diagnostics and AI assistant tooling readiness audit            |

---

## AI Assistant Slash Commands

Every generated project includes operational skills and MCP tools configured for Cursor, Claude Code, Windsurf, Copilot, and Antigravity:

| Slash Command                  | Purpose & Description                                                                            | Data Sources                                                                                                   | SDET Value                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/automate-ticket <ID>`        | Fetches test case details from TMS, synthesizes a CPOM test, and reports status.                 | • TMS API via MCP (`mcp__tms__get_test_case`)<br>• Existing `pages/` and `components/`<br>• `.env` credentials | Eliminates manual ticket-to-code transcription; produces spec-compliant tests in seconds. |
| `/scan-and-generate-pom <URL>` | Scans route DOM, extracts interactive widgets, and generates a CPOM class with 3-Tier locators.  | • Accessibility DOM Snapshot<br>• `docs/site-map.json`<br>• `components/primitives/`                           | Generates clean Page Objects without manual locator authoring.                            |
| `/tms-triage [trace.zip]`      | Triages Playwright Trace archives, clusters duplicate errors, and logs root-cause defect in TMS. | • Playwright Trace Archive<br>• Network HAR & Console logs<br>• TMS API (`mcp__tms__post_test_result`)         | Pinpoints exact root causes (backend 500, network race) instead of generic timeouts.      |
| `/heal-test <specPath>`        | Diagnoses broken tests following UI redesigns and updates Page Object locators.                  | • Playwright Trace / Screenshots<br>• Live application DOM<br>• Target Page Object source                      | Repairs broken locators autonomously with zero manual DevTools inspection.                |
| `/auth-setup`                  | Generates TOTP 2FA tokens, configures API fast-path login, and validates `.auth/user.json`.      | • `process.env.TOTP_SECRET`<br>• App Authentication API Endpoint                                               | Solves MFA/SSO login barriers for hermetic, fast test runs.                               |
| `/bulk-rescan`                 | Dispatches a parallel worker swarm to concurrently rescan and update all Page Objects.           | • `docs/site-map.json`<br>• `docs/app-graph.html`<br>• All files in `pages/**/*.ts`                            | Updates the entire test suite in minutes following major frontend redesigns.              |

---

## Component Page Object Model (CPOM) Architecture

Generated frameworks adhere strictly to the CPOM design pattern:

```text
tests/ (Test scenarios & Web-First assertions)
   │
   ▼
pages/ (Page compositions: DashboardPage, LoginPage)
   │
   ▼
components/ (Domain widgets: Header, NavigationMenu, Cart)
   │
   ▼
components/primitives/ (UI atoms: Button, TextInput, Dialog, Table, DragAndDrop, Canvas)
   │
   ▼
core/ (BasePage, Component, Collection, Container)
```

**CPOM Architectural Rules:**

- **Zero Assertions in Components:** Components encapsulate interactions and state readers only. All assertions (`expect(...)`) reside exclusively in test spec files.
- **Mandatory `Now()` Suffix for Snapshot Reads:** Synchronous state queries use the `Now()` suffix (e.g. `isVisibleNow()`, `isEnabledNow()`) and do not auto-retry.
- **3-Tier Locator Priority:** Selectors prioritize `getByTestId` -> `getByRole` -> `getByLabel`.

---

## Contributing & Contributor License Agreement (CLA)

We welcome contributions from the community! Before submitting a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md) and note that all contributors must accept our [Individual Contributor License Agreement (CLA)](CLA.md) via the automated CLA Assistant bot.

If you are an AI assistant or human engineer contributing to EITR, also review [AGENTS.md](./AGENTS.md) and [docs/architecture.md](./docs/architecture.md) before submitting modifications.

---

## License & Fair Source

This project is licensed under the **Functional Source License, Version 1.1 (FSL-1.1-Apache-2.0)** - see the [LICENSE](LICENSE) file for details.

- **100% Free for Internal Use & Outsource Delivery:** EITR is completely free for individuals, enterprise teams, and outsourcing consultants to scaffold, build, and deliver automated test frameworks for internal use and paying clients.
- **Non-Compete (Fair Source):** You may not use EITR to provide a competing commercial product or hosted SaaS test generation service prior to the Change Date.
- **Automatic Apache 2.0 Conversion:** Exactly 2 years after publication, each version of EITR automatically converts to the standard, permissive **Apache License, Version 2.0**.
- **100% Generated Output Exemption:** All test suites, Page Objects, CPOM architectures, and code generated by EITR in your target repositories belong 100% to you and are completely free of any licensing restrictions or royalties.
- **Enterprise & Competing Use Waivers:** See [COMMERCIAL.md](COMMERCIAL.md) for custom partnerships, TMS plugins, and dedicated SLAs.
