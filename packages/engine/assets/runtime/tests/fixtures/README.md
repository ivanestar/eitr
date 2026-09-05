# Test Data & Fixtures

This folder contains **static test data files** (JSON, CSV, etc.) used by tests as input data.

> Note: This folder is for **data files only**. Playwright test fixtures (Page Object registrations)
> are defined in `fixtures/index.ts` — not here.

## Conventions

- Files named `<entity>.<format>` (e.g. `users.json`, `products.csv`).
- Data must be environment-agnostic (no hardcoded URLs or credentials).

## Examples

```json
// users.json
[
  { "email": "admin@example.com", "role": "admin" },
  { "email": "viewer@example.com", "role": "viewer" }
]
```
