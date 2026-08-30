# 0008: Deterministic-over-AI preference for this project's own process

**Status:** Accepted

## Context

This repository's own development process (not the generated framework's) is followed by AI
assistants operating under `CLAUDE.md`/`AGENTS.md`. Several rules in those files depend entirely on
an assistant correctly remembering and following a written instruction every time - e.g. never
running a raw `git commit`, always formatting before a commit, syncing with `origin/main` before
branching. A written rule alone has no mechanism to catch its own violation; the failure mode is
silent until something downstream (a failed CI check, a lost hand-edit) surfaces it.

## Decision

Whenever a piece of this project's own process behavior can be enforced by deterministic code (a
Claude Code hook, a script, a CI gate) with **zero loss of quality, flexibility, or correctness in
every legitimate case**, implement it in code rather than relying on a written rule alone. The bar
is 100% safety: if there is any non-trivial chance a deterministic implementation would produce a
wrong or overly blunt outcome on some legitimate case a human's judgment would have handled
correctly, do not silently automate it - either leave it as a written, judgment-based rule, or
surface the specific tradeoff to the developer for an explicit decision.

## Alternatives Considered

- **Automate everything that's plausible to automate, accepting some false-positive risk.**
  Rejected explicitly: this project's earlier experience with Dependabot (routine PRs that cost more
  debugging effort than the bump was worth) is the concrete cautionary example of automation whose
  cost exceeded its value once actually exercised. The 100%-safety bar exists specifically to avoid
  repeating that pattern for process rules.
- **Leave everything as written rules, no hooks.** Rejected: a written-only rule for a check that is
  a pure, unambiguous fact about the world (a stale git branch, a banned Unicode character class, a
  known file-pair diff) is strictly weaker than mechanical enforcement for zero additional cost -
  not automating a genuinely safe check is leaving reliability on the table for no reason.

## Consequences

- A rule requiring understanding of conversational intent, prose content, or which files are
  semantically related to a change (e.g. "create a PR only when the user just asked for one",
  Grep-Confirmed Removal, Named-Proof Completion Claims) stays judgment-only by design under this
  rule, not as an oversight - these fail the 100%-safety bar.
- Before trusting a new deterministic check's actual scope, verify it empirically (a known-positive
  and known-negative test case) rather than assuming from its name or docstring - this project's own
  `check-mirror-parity.mjs` sounded like it covered root `CLAUDE.md`/`AGENTS.md` sync but only ever
  diffed paired agent/skill files; the assumption was caught only by testing it.
