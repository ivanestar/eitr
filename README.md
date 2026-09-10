# EITR

[![CI](https://github.com/ivanestar/eitr/actions/workflows/ci.yml/badge.svg)](https://github.com/ivanestar/eitr/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@onlytests/eitr.svg)](https://www.npmjs.com/package/@onlytests/eitr)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

EITR scaffolds a TypeScript + Playwright test framework from your app's URL and a short questionnaire.

---

## Why EITR

Standing up E2E automation on a new project usually means a week of boilerplate before you write a real test: project structure, a Page Object base layer, CI config, login/session handling, test data, TMS wiring. EITR scaffolds all of that from your app's URL and a short questionnaire, in one pass, so you start from a working framework instead of an empty repo.

The generated code doesn't depend on EITR at runtime – it's plain Playwright, plain CI config. Delete EITR right after scaffolding and nothing breaks.

---

## When to use EITR

A good fit when you have an existing web application and need to:

- stand up Playwright-based E2E/browser test automation from scratch;
- generate a Page Object layer instead of hand-rolling one;
- wire up login/SSO/MFA session reuse and test data generation;
- get CI and optional TMS sync generated alongside the tests.

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

- **Language & test framework:** TypeScript + Playwright
- **AI-assistant tooling:** Cursor, Claude Code, Devin Desktop, Copilot, Antigravity, Aider, Codex
- **CI/CD pipeline:** GitHub Actions, GitLab CI, Jenkins, TeamCity
- **Task tracker:** Jira, Azure DevOps (Work Items), or None / Skip
- **Test Management System (TMS):** Jira Xray, Azure DevOps (Test Plans), TestRail, Zephyr Scale

One stack, carried all the way through. More languages and runners get added when there is demand for them and the capacity to support them.

### 2. Fill in `.env` and capture a session

Fill in credentials (app login, TMS tokens) in the generated `.env`. If your app needs a login, run `npx @onlytests/eitr auth` (or `/auth-setup` in your AI editor) to log this in once – SSO/MFA included – and save an authenticated session to `.auth/user.json`. For a multi-role app, capture each role separately with `npx @onlytests/eitr auth --role admin`, which writes `.auth/admin.json`; `/auth-setup` also adds an `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD` slot per role to `.env`, and `/map-site` can then crawl as several roles to find where their access actually differs. Skip this step entirely for a public app.

### 3. Open in your AI editor

Open the generated directory in **Cursor**, **Claude Code**, **Devin Desktop**, **Antigravity**, or your assistant of choice.

### 4. Run a workflow

EITR ships guided, multi-stage workflows for different starting points. Right now there's one:

- **Greenfield** (no existing docs or tests): run `/ground-zero-setup`. It explores your live app in a real browser, builds a visual sitemap, drafts test conditions and test cases – pausing for your sign-off at each stage – and finishes by writing and running the tests. One command in, a working test suite out.

### 5. Run the tests

```bash
npx playwright test
```

---

## What you get

- Reusable Page Objects and primitives (`Button`, `TextInput`, `Table`, `Dialog`, and more) – the building blocks your tests, and any Page Objects your AI assistant writes later, extend directly instead of hand-rolling from scratch.
- CI/CD pipeline files for GitHub Actions, GitLab CI, Jenkins, or TeamCity, matched to your stack. Push the repo and the pipeline runs – nothing else to wire up.
- Optional TMS integration (Jira Xray, Azure DevOps, TestRail, Zephyr) to pull test cases and post results back.
- Native slash-commands and rules built for your AI assistant – Claude Code, Cursor, Devin Desktop, Copilot, Antigravity, Aider, Codex – that drive the whole workflow above, from `/ground-zero-setup` down to individual test authoring.

---

## Updating

Re-running the scaffolder on an existing project with the same stack never touches your own work – it only adds files that weren't there before (new skills, agents, etc.). One limitation: it can't safely patch files it already wrote, including the global rule files (CLAUDE.md, AGENTS.md, CONVENTIONS.md) – whatever you've since edited there stays untouched. If you want a project caught up on newer rules anyway, point your AI assistant at this repo's [CHANGELOG.md](CHANGELOG.md) and have it copy over what's relevant – a manual workaround, not something the CLI does for you.

---

## CLI Commands

| Command                      | Description                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `npx @onlytests/eitr new`    | Scaffold a new framework                                                                        |
| `npx @onlytests/eitr auth`   | Capture an authenticated session into `.auth/user.json` (`--role admin` for `.auth/admin.json`) |
| `npx @onlytests/eitr doctor` | Check your environment and installed AI-assistant tooling                                       |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). If you're an AI assistant working on EITR itself, also read [AGENTS.md](./AGENTS.md) and [docs/architecture/](./docs/architecture/README.md). See [MANIFESTO.md](MANIFESTO.md) for the values this is built on.

---

## Support

If EITR saves you time or helps your team stand up test automation faster, consider supporting its ongoing development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Y5A826FPBL)

---

## License

Apache License, Version 2.0 - see [LICENSE](LICENSE). Everything EITR generates in your repository is yours: no royalties, no restrictions, free for commercial and client work.
