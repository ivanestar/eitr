# Test Examples

This folder contains **illustrative test scenarios** demonstrating non-trivial patterns and advanced CPOM usage.

## Conventions

- Files named `<feature>.example.spec.ts`.
- These tests are **not** part of the smoke suite — they are reference implementations.
- Useful for: multi-step flows, parameterized tests, API + UI hybrid scenarios.

## Examples of what to put here

- `table-filter.example.spec.ts` — filtering a data grid and verifying row count.
- `multi-tab.example.spec.ts` — opening a new tab and asserting cross-tab state.
- `api-setup.example.spec.ts` — seeding data via API before a UI test.
