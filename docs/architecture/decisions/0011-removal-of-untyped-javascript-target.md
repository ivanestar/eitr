# 0011: Removal of the untyped JavaScript target

**Status:** Accepted

## Context

EITR generated a plain-JavaScript variant of both its Playwright and Cypress targets alongside
the TypeScript ones. Playwright transpiles TypeScript natively without any extra build step, so
`.ts` tests run exactly as fast and zero-config as `.js` ones - the JavaScript variant bought
users nothing TypeScript didn't already give them for free. Worse, it actively worked against the
project's own architecture: the Component Page Object Model depends on compile-time type
contracts (generic collection types, strict parameter signatures, locator typing), all of which
degrade into untyped objects in JavaScript, and AI coding assistants rely heavily on LSP type
diagnostics to self-heal broken tests - diagnostics JavaScript cannot provide. The JavaScript
templates, adapters, and runtime asset tree also consumed a real, ongoing share of the engine's
template footprint and test-matrix surface area for what was, in every practical sense, a strictly
inferior duplicate of the TypeScript target. EITR was still in pre-release development with no
external users at the time of this decision, so there was no installed base requiring a staged
deprecation.

## Decision

JavaScript is removed as a supported language target, in full, immediately: the
`JavaScriptAdapter`, `PlaywrightJsGenerator`, `CypressJsGenerator`, the compiled `runtime-js/`
asset tree, and every CLI/questionnaire/template code path branching on `language === 'javascript'`
are deleted rather than deprecated. `packages/engine`'s public `plan()` API now throws a typed
`UnsupportedLanguageError` for any language outside the 4 remaining production targets
(TypeScript, Python, C#, Java), and the CLI rejects a legacy `.eitr/init.json` still containing
`language: 'javascript'` with an explicit migration message rather than failing silently or
generating broken output. Cypress remains a TypeScript-only automation tool going forward, with no
untyped variant.

## Alternatives Considered

- **Multi-stage deprecation (warn, then remove in a later major version).** Rejected: with 0
  external users at the time, a deprecation cycle exists to protect an installed base that didn't
  exist yet - it would have added process overhead without protecting anyone.
- **Keep the JavaScript target but stop actively maintaining it (freeze in place).** Rejected: a
  frozen target still ships in every generated-project matrix, every polyglot-parity check, and
  every CI run, so it keeps costing engine maintenance surface indefinitely while providing
  strictly less value than the TypeScript target it duplicates.
- **Keep JavaScript only for Cypress (since Cypress itself is withheld pending its own CPOM
  redesign).** Rejected: Cypress's withhold is unrelated and temporary; there is no reason to keep
  an inferior language variant alive for a tool that isn't even offered to users right now.

## Consequences

- The 100% Polyglot & Multi-Tool Parity Standard (`CLAUDE.md`/`AGENTS.md` Section 1) now applies
  across 4 languages (TypeScript, Python, C#, Java) for Playwright, and TypeScript only for
  Cypress, rather than 5 languages.
- Any `.eitr/init.json` persisted before this change with `language: 'javascript'` no longer
  generates anything; `eitr generate` surfaces a clear, actionable migration message instead of a
  generic "not implemented" error or silent misgeneration.
- `packages/engine`'s public API gains a typed `UnsupportedLanguageError` and exported
  `SupportedLanguage` union, giving callers a mechanical way to detect an unsupported language
  instead of pattern-matching a generic `Error` message.
