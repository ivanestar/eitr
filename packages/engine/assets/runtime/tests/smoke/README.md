# Smoke Tests

This folder contains **fast, high-level sanity checks** that verify the application is alive and reachable.

## Conventions

- Files named `<feature>.smoke.spec.ts` (e.g. `auth.smoke.spec.ts`, `navigation.smoke.spec.ts`).
- Each test should run in **under 5 seconds** — no deep business logic.
- Run on every deployment (CI gate) before the full regression suite.

## Examples of what to put here

- Verify app responds with HTTP 200 on key routes.
- Verify login page renders the username input.
- Verify critical navigation links are visible after login.
