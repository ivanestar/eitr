# Changelog

All notable changes to this project are documented here, newest release first. Each entry is one
dense line: a bold category prefix (`Added`/`Changed`/`Fixed`/`Removed`/`Security`) followed by what
changed, and why only if it isn't obvious. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Verification detail (the exact command
or test run to confirm a fix) lives in the corresponding commit message, not here — `git log` is the
audit trail; this file is release notes.

## [0.1.0] - 2026-09-06

- **Added**: deterministic CPOM scaffolder for Playwright across TypeScript, Python, C#, and Java (Cypress, TypeScript-only), with React/Vue/Angular/Svelte and MUI/Ant Design/Radix adapters.
- **Added**: native CI/CD generation (GitHub Actions, GitLab CI, Jenkins, TeamCity) with per-language sharding, CPOM contract linting, and dependency-vulnerability scanning.
- **Added**: TMS integration (Jira Xray, Azure DevOps, TestRail, Zephyr) through an embedded MCP bridge — ticket CRUD, result posting, attachments.
- **Added**: native AI-agent/skill layer for 6 assistants (Claude Code, Cursor, Windsurf, Copilot, Antigravity, Aider, Codex).
- **Added**: `/ground-zero-setup` — a guided greenfield pipeline (site mapping, business-intent inference, test-condition derivation, test-case design, test synthesis) with a human sign-off gateway at every stage, ending in a running test suite.
- **Added**: session/auth capture (`eitr auth`) with SSO/MFA support, self-healing (`/heal-test`), and swarm-based parallel route processing.
- **Security**: non-root generated Docker images, argv-based MCP tool execution, dependency CVE patches.
