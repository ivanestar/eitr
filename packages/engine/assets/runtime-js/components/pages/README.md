# Pages

This folder contains **Page Object** classes built with the Component Page Object Model (CPOM).

## Conventions

- One file per page/screen, named `<kebab-case-page-name>.page.ts` (e.g. `checkout.page.ts`).
- Every class **must** extend `BasePage` and declare a `readonly path` property.
- Declare elements with `this.child(PrimitiveClass, spec)` using a typed `LocatorSpec` object.
- Expose only high-level business methods (e.g. `submitOrder()`, not `clickButton()`).
- See `login-page.example.ts` for a reference implementation.
