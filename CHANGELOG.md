# Changelog

All notable changes to this project are documented here, newest release first, following
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-06

- **Added**: deterministic CPOM scaffolder for Playwright across TypeScript, Python, C#, and Java (Cypress, TypeScript-only), with React/Vue/Angular/Svelte and MUI/Ant Design/Radix adapters.
- **Added**: native CI/CD generation (GitHub Actions, GitLab CI, Jenkins, TeamCity) with per-language sharding, CPOM contract linting, and dependency-vulnerability scanning.
- **Added**: TMS integration (Jira Xray, Azure DevOps, TestRail, Zephyr) through an embedded MCP bridge — ticket CRUD, result posting, attachments.
- **Added**: native AI-agent/skill layer for 6 assistants (Claude Code, Cursor, Devin Desktop, Copilot, Antigravity, Aider, Codex).
- **Added**: `/ground-zero-setup` — a guided greenfield pipeline (site mapping, business-intent inference, test-condition derivation, test-case design, test synthesis) with a human sign-off gateway at every stage, ending in a running test suite.
- **Added**: session/auth capture (`eitr auth`) with SSO/MFA support, self-healing (`/heal-test`), and swarm-based parallel route processing.
- **Added**: token-based API authentication (`ApiClient.setAuthToken`) alongside cookie-shared browser sessions across TypeScript, Python, C#, Java, and Cypress, with `/auth-setup` observing the login request itself for an access token.
- **Added**: contract-grounded API-layer test generation — `/map-site` and `/auth-setup` record observed network contracts, and `/design-test-cases`/`/automate-test` draft and synthesize real API test cases from them instead of guessing endpoints.
- **Added**: Page Object getter/action synchronization and a bounded cross-Page-Object consolidation pass in `pom-engineer`, plus a closed-set post-automation self-review step in `/automate-test`.
- **Changed**: Windsurf support renamed to Devin Desktop (its 2026 rebrand) with native `.devin/` conventions — shared skills discovery with Antigravity, `.devin/rules/*.md` task/agent rules, and project-scoped MCP config (`.devin/mcp_config.json`), a capability the old Windsurf never had.
- **Changed**: `CLAUDE.md`/`AGENTS.md` no longer duplicate `CONVENTIONS.md`'s locator-priority contract — Claude Code's version imports it natively (`@CONVENTIONS.md`), others point at it instead. Cursor and Copilot gained path-scoped rule files (`.cursor/rules/*.mdc`, `.github/instructions/*.instructions.md`) alongside their existing always-loaded ones.
- **Removed**: ~30 unused rule-template functions (Gemini, and one-off Claude/Windsurf/Codex wrappers) that duplicated logic already covered by the shared renderers above.
- **Removed**: the generated `/protocol-123` skill — its rigor duplicated `/automate-test`, `/heal-test`, and `/define-test-conditions` without their mechanical validation gates; its one distinct capability (live web research for unfamiliar libraries) is now a conditional step in `/automate-test`'s own component-resolution stage.
- **Changed**: `/scan-and-generate-pom`, `/heal-test`, and `/bulk-rescan` now explain what they're about to do and wait for confirmation before running standalone, matching the pattern `/map-site`/`/define-test-conditions`/`/design-test-cases` already used; `/bulk-rescan` additionally reports the affected route count before touching any file; `/define-test-conditions` now asks once, optionally, whether the user has business rules or past incidents the crawler couldn't infer from the UI alone.
- **Security**: non-root generated Docker images, argv-based MCP tool execution, dependency CVE patches.
