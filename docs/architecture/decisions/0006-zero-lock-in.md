# 0006: Zero lock-in for generated output

**Status:** Accepted

## Context

A scaffolder that leaves its generated output dependent on the scaffolder's own runtime creates an
ongoing obligation for every project it touches - version upgrades, licensing, and continued
existence of the tool all become the generated project's problem too. This directly conflicts with
the product vision of EITR being a one-time deterministic bootstrap, not an ongoing runtime
dependency.

## Decision

Every generated project is a complete, standalone, ordinary project in its target language
(TypeScript, JavaScript, Python, C#, or Java) with **no runtime dependency on `@eitr/engine`** and
no reference to EITR anywhere in generated code, comments, or file names. `@eitr/engine` is a
build-time tool only, never imported by anything it generates.

## Alternatives Considered

- **Ship a thin runtime helper package generated projects import** (e.g. shared component base
  classes as an npm dependency). Rejected: this is exactly the lock-in this decision exists to avoid
  - a generated project would break if that package were ever deprecated, paywalled, or simply
    stopped being maintained.
- **Reference EITR in generated comments/READMEs for attribution.** Rejected as a default: this is
  the "No EITR" rule (`CLAUDE.md`/`AGENTS.md` Section 9) - a generated framework must never mention
  its creator, so a user can hand it to a client or open-source it without EITR being visible
  anywhere in the deliverable.

## Consequences

- Every template and generator function is audited against this rule (`CLAUDE.md`/`AGENTS.md`
  Section 9's "Zero Lock-in Verification"); a template that would introduce a runtime dependency on
  EITR is a defect, not a style choice.
- The engine can be replaced, forked, or discontinued without breaking any project it already
  generated - the generated output has no forward dependency on the generator's continued existence.
