# 0005: Fixtures as the composition root

**Status:** Accepted

## Context

Page Objects need to be constructed somewhere before a test can use them, and that construction
point needs to guarantee test isolation (no state bleeding between tests) without requiring the test
author to remember to instantiate anything by hand.

## Decision

Page Objects are instantiated per-test via Playwright's `test.extend` fixture mechanism -
**test-scoped, never worker-scoped**. Containers and elements inside a Page Object are lazy getters,
not fixtures themselves - only the top-level Page Object/API-client boundary is a fixture.

## Alternatives Considered

- **Worker-scoped fixtures (shared across tests in a worker).** Rejected: reintroduces cross-test
  state coupling the fixture pattern exists to avoid - a mutation in one test could leak into the
  next test sharing that worker.
- **Manual instantiation in each test (`new LoginPage(page)`).** Rejected: this is exactly what the
  CPOM linter's Rule 5 (Fixture Dependency Injection) exists to catch - it's easy to forget, produces
  inconsistent construction across a suite, and bypasses whatever setup a fixture would otherwise
  centralize.

## Consequences

- Every generated test file's page-object access goes through `test.extend`-declared fixtures; the
  linter enforces this mechanically rather than relying on convention.
- Containers/elements as lazy getters (not fixtures) keeps construction cheap - a Page Object with
  20 possible child components doesn't pay for all 20 unless a test actually touches them.
