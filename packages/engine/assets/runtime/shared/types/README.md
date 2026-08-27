# Shared Types

This folder contains **TypeScript type definitions and interfaces** shared across tests and Page Objects.

## Conventions

- One file per domain entity, named `<entity>.types.ts` (e.g. `user.types.ts`, `order.types.ts`).
- Export only interfaces and type aliases — no runtime code.

## Examples

```ts
// user.types.ts
export interface User {
  email: string;
  password: string;
  role: 'admin' | 'viewer';
}
```
