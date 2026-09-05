# EITR

[![CI](https://github.com/ivanestar/eitr/actions/workflows/ci.yml/badge.svg)](https://github.com/ivanestar/eitr/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@onlytests/eitr.svg)](https://www.npmjs.com/package/@onlytests/eitr)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

EITR builds a test-automation ecosystem inside your project. Point it at a URL, pick your stack, and it generates a complete, working framework - so you can stand up automation and start showing results on day one instead of weeks into setup.

Playwright across TypeScript, Python, C#, and Java.

---

## Why EITR

- **From URL to running suite in minutes.** Point it at your app, answer a few questions, and the wizard generates everything — project structure, page objects, CI configs, TMS wiring — and installs dependencies in one pass.
- **No dependency on EITR.** The generated code is yours: plain Playwright, plain CI configs, no special runtime needed. Delete EITR after scaffolding and nothing breaks.
- **Handles the annoying parts.** Login/MFA session reuse, CI sharding, test data factories, TMS sync — the boilerplate that normally takes a week to set up right.

---

## When to use EITR

A good fit when you have an existing web application and need to:

- stand up Playwright-based E2E/browser test automation from scratch;
- generate a Page Object layer instead of hand-rolling one;
- wire up login/SSO/MFA session reuse and test data generation;
- get CI (GitHub Actions, GitLab CI, Jenkins, TeamCity) and optional TMS sync (Jira Xray, Azure DevOps, TestRail, Zephyr) generated alongside the tests.

Not the right tool for:

- unit or component-level testing (use your stack's native unit-test runner);
- API-only testing with no browser involved;
- load/performance testing;
- security scanning;
- a project that already has a mature E2E framework and isn't migrating.

---

## Quick Start

### 1. Scaffold your project

```bash
npx @onlytests/eitr new
```

The wizard inspects your target URL and prompts for your project stack:

- **Language & test framework:** TypeScript, Python, C#, Java (Playwright)
- **AI-assistant tooling:** Cursor, Claude Code, Windsurf, Copilot, Antigravity, Aider, Codex
- **CI/CD pipeline:** GitHub Actions, GitLab CI, Jenkins, TeamCity
- **Task tracker:** Jira, Azure DevOps (Work Items), or None / Skip
- **Test Management System (TMS):** Jira Xray, Azure DevOps (Test Plans), TestRail, Zephyr Scale

### 2. Open in your AI editor

Open the generated directory in **Cursor**, **Claude Code**, **Windsurf**, **Antigravity**, or your assistant of choice.

### 3. Automate from scratch (Zero-Docs / Greenfield)

In your AI assistant's chat:

- **Need login?** Run `/auth-setup` first to capture your authenticated session (for multi-role apps, log in under the highest-access role like Admin to map all areas).
- **Public app?** Run `/ground-zero-setup` directly.

The `/ground-zero-setup` command explores your live app in a real browser, builds a visual sitemap (`site-map.json`), formulates test conditions, and drafts complete test cases (pausing for your sign-off at each stage) — then seamlessly offers to generate executable tests via `/automate-test`.

---

## What you get

- **A typed Page Object layer (CPOM):** base classes and primitives (`Button`, `TextInput`, `Table`, `Dialog`, and more) with a clean split between state reads and actions, so tests stay readable as the suite grows.
- **A standalone project.** The generated framework has no runtime dependency on EITR - it's yours to run, edit, and ship.
- **CI/CD wired up.** GitHub Actions, GitLab CI, Jenkins, or TeamCity, generated to match your stack.
- **Optional TMS integration.** Jira Xray, Azure DevOps, TestRail, or Zephyr - pull test cases, post results.
- **Editor configs for AI-assisted work,** if your team uses one: Claude Code, Cursor, Windsurf, Copilot, Antigravity, Aider, Codex.

---

## Workflow

1. **`eitr new`** - scaffold the framework against your app's URL.
2. **`.env`** - fill in credentials (app login, TMS tokens) in the generated `.env`.
3. **`eitr auth`** - opens a browser, you log in once (SSO/MFA included), session gets saved to `.auth/user.json` so tests run authenticated.
4. **Map the app and write Page Objects and tests.** In an AI editor, slash commands (`/map-site`, `/scan-and-generate-pom`, `/automate-test`, `/bulk-rescan`, `/heal-test`) read the live app DOM, TMS tickets, and trace files to do this for you.
5. **`npx playwright test`** - run it.

---

## CLI Commands

| Command                           | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| `npx @onlytests/eitr new`         | Scaffold a new framework                                |
| `npx @onlytests/eitr auth`        | Capture an authenticated session into `.auth/user.json` |
| `npx @onlytests/eitr doctor --ai` | Check environment and AI-tooling setup                  |

---

## Component Page Object Model (CPOM)

```text
tests/                    test scenarios and assertions
pages/                    page compositions (DashboardPage, LoginPage)
components/               domain widgets (Header, NavigationMenu, Cart)
components/primitives/    UI atoms (Button, TextInput, Dialog, Table, ...)
core/                     BasePage, Component, Collection, Container
```

- Assertions live in tests only - components expose actions and state readers, nothing else.
- State reads use a `Now()` suffix (`isVisibleNow()`) and don't auto-retry; actions do.
- Locators prioritize `getByTestId` -> `getByRole` -> `getByLabel`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). If you're an AI assistant working on EITR itself, also read [AGENTS.md](./AGENTS.md) and [docs/architecture/](./docs/architecture/README.md).

---

## Support

If EITR saves you time or helps your team stand up test automation faster, consider supporting its ongoing development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Y5A826FPBL)

---

## License

Apache License, Version 2.0 - see [LICENSE](LICENSE). Everything EITR generates in your repository is yours: no royalties, no restrictions, free for commercial and client work.
