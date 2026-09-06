# Changelog

All notable changes to this project are documented here, newest release first, following
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-06

- **Added**: deterministic CPOM scaffolder for Playwright across TypeScript, Python, C#, and Java (Cypress, TypeScript-only), with React/Vue/Angular/Svelte and MUI/Ant Design/Radix adapters.
- **Added**: native CI/CD generation (GitHub Actions, GitLab CI, Jenkins, TeamCity) with per-language sharding, CPOM contract linting, and dependency-vulnerability scanning.
- **Added**: TMS integration (Jira Xray, Azure DevOps, TestRail, Zephyr) through an embedded MCP bridge — ticket CRUD, result posting, attachments.
- **Added**: native AI-agent/skill layer for 6 assistants (Claude Code, Cursor, Windsurf, Copilot, Antigravity, Aider, Codex).
- **Added**: `/ground-zero-setup` — a guided greenfield pipeline (site mapping, business-intent inference, test-condition derivation, test-case design, test synthesis) with a human sign-off gateway at every stage, ending in a running test suite.
- **Added**: session/auth capture (`eitr auth`) with SSO/MFA support, self-healing (`/heal-test`), and swarm-based parallel route processing.
- **Added**: token-based API authentication (`ApiClient.setAuthToken`) alongside cookie-shared browser sessions across TypeScript, Python, C#, Java, and Cypress, with `/auth-setup` observing the login request itself for an access token.
- **Added**: contract-grounded API-layer test generation — `/map-site` and `/auth-setup` record observed network contracts, and `/design-test-cases`/`/automate-test` draft and synthesize real API test cases from them instead of guessing endpoints.
- **Added**: Page Object getter/action synchronization and a bounded cross-Page-Object consolidation pass in `pom-engineer`, plus a closed-set post-automation self-review step in `/automate-test`.
- **Security**: non-root generated Docker images, argv-based MCP tool execution, dependency CVE patches.
