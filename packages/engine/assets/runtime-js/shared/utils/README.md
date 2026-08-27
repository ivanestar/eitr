# Shared Utils

This folder contains **reusable helper functions** shared across tests and Page Objects.

## Conventions

- One file per concern, named `<concern>.ts` (e.g. `date.ts`, `random.ts`, `api.ts`).
- Functions must be pure and framework-agnostic where possible.
- Framework-specific helpers (React, Vue, etc.) are auto-generated here by the scaffolding engine.

## Examples

```ts
// random.ts
export function randomEmail() {
  return `test+${Date.now()}@example.com`;
}

// date.ts
export function todayIso() {
  return new Date().toISOString().split('T')[0];
}
```
