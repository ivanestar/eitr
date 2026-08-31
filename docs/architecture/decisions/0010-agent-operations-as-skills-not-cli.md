# 0010: AI-agent-driven operations ship as assistant skills, never CLI commands

**Status:** Accepted

## Context

[0007](0007-remove-fake-map-rescan-cli-commands.md) already settled this narrowly for `/map-site`
and `/bulk-rescan` - both need live browser/DOM access a headless CLI stub cannot legitimately fake.
That ADR fixed one concrete case, not the general question. The 2026-08-30
`strategic-architecture-advisor` session proposed several new capabilities (a universal
investigate tool, `/legacy-audit`, a Decision Journal report view over the shared event log,
scripted `sdet-orchestrator` dispatch) and each one needs the same skill-vs-CLI call made again,
with nothing written down to make the answer automatic. Deciding this ad hoc per feature is exactly
how 0007's fabrication problem happened in the first place: a CLI command was allowed to exist
where a skill was the only thing that could do the job honestly, and nobody had a standing rule to
catch that before it shipped.

## Decision

Any capability requiring agent reasoning, LLM judgment, or live browser/DOM access ships
exclusively as a native per-assistant skill/slash-command - never a CLI/npx command run in a bare
terminal. CLI commands stay reserved for genuinely deterministic, pre-assistant-context setup
(`eitr new`, `eitr auth`, `eitr install`) - these necessarily run _before_ any AI assistant is even
configured, so there is no skill to invoke yet and no reasoning step to protect.

Separately: a purely deterministic script that a human would naturally want to trigger _during_ a
chat session with their assistant (not reasoning-dependent, but human-facing) still gets a thin
skill wrapper for invocation convenience, even though the underlying computation stays a plain
script. The wrapper exists to keep the human inside their assistant's interface for something
they'd naturally ask for mid-conversation - it is not a claim that the computation itself needs a
model in the loop.

## Alternatives Considered

- **Decide skill-vs-CLI ad hoc per new feature.** Rejected: this is exactly the gap that let
  `eitr map`/`eitr rescan` ship as fabricated CLI commands before 0007 caught it - without a
  standing default, every future feature re-opens the same ambiguity and can get it wrong again.
- **Expose agent-reasoning capabilities as CLI commands with an "AI mode" flag.** Rejected: this
  either fakes work a stub CLI structurally cannot do (0007's original problem), or duplicates
  logic the skill already implements correctly through the assistant's own tool access - doubling
  the maintenance surface for the same capability, the same reason 0007 rejected "keep the CLI as
  a thin wrapper."
- **Route genuinely deterministic setup steps (`eitr new`/`auth`/`install`) through a skill too, for
  consistency.** Rejected: these run before any assistant is configured on a fresh checkout, so
  there is no skill to invoke; forcing agent/model involvement into deterministic, reasoning-free
  setup would add cost and non-determinism where [0001](0001-deterministic-core-only-scaffolder.md)/
  [0002](0002-no-llm-in-core.md) deliberately keep none.

## Consequences

- Every future EITR capability proposal states upfront whether it needs agent reasoning or live-DOM
  access (skill) versus is purely deterministic pre-assistant setup (CLI) - genuine ambiguity
  resolves in favor of a skill, since a skill can always shell out to a plain script but a plain
  script can never safely absorb reasoning it wasn't built to do.
- Applied to the four extensions proposed in the 2026-08-30 session: the investigate tool and
  `/legacy-audit` were already speced as skills from the start, no change needed; the shared event
  log's Decision Journal report view was speced as a bare `node scripts/eitr-events.mjs report`
  command and now needs a `/decision-journal` skill wrapper around it; scripted `sdet-orchestrator`
  dispatch stays a purely agent-internal script with no user-facing wrapper, since a human has no
  standalone reason to request "just the dispatch plan" outside a skill that already needs it.
- A skill wrapper around an otherwise-deterministic script (like the Decision Journal case) is not
  scope creep - it is the same "keep the human in their assistant's interface" convention every
  other operational skill already follows, applied consistently rather than as a special case.
