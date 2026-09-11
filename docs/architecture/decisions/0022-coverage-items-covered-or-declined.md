# 0022: What the analysis says to test is tested, or declined with a reason the person sees

## Status

Accepted

## Context

A test conditions run on a site of 28 pages passed every gate and still covered nothing a person
would sign off on:

- 26 of the 29 conditions the analysis wrote were one sentence with the page title swapped in:
  "renders valid UI components and functional controls".
- No page that takes input had a condition saying what the input produces.
- The research recorded 36 checks for these kinds of feature, and one became a condition.
- The markup declared 26 limits, and no boundary recorded any of them.
- 48 of 49 copy and export controls were excused from their check with the reason meant for a
  result box.

The skill already asked for all of it. The gates checked that each record had the right shape, so
the cheapest path through them was a record of the right shape with nothing in it. An assistant
facing a check satisfies its letter when that costs less than doing the work. Rewording the
instruction does not change that; a check that reads a fact does.

## Decision

**The analysis names what it expects to be tested, and the gate holds each item to one of two ends:
tested, or declined with a reason the review shows.** Each check is a separate function; any of them
can be removed without touching the rest.

- **Outputs.** On every page that takes input, the analysis writes at least one positive behavior
  condition saying what the input produces. When the page records where its result appears (a field
  excluded as `result-output`, a copy, export or download control), the condition names it in
  `outputs`. A copy or export control can no longer be excused as `result-output`. A duplicate names
  the control a condition checks for it.
- **Limits.** Every `min`, `max`, `minlength` or `maxlength` the crawl recorded on a field needs a
  boundary. The assistant's check can still cut a probe that cannot apply, with the reason.
- **Research.** A condition cites a research check by its id. Every check of a feature's record is
  cited or listed in `research.declined` with the reason.
- **Rules.** A field constraint whose source is not the markup has an id. A partition, boundary or
  condition cites it with a `constraint` anchor, or the constraint says in `untestedReason` why
  nothing tests it.
- **Features.** A feature with no condition on any page says why in `untestedReason`.
- **Substance.** A condition the analysis wrote is refused when its description, expected outcome or
  input holds only words any page's condition could carry, once the page title, address and feature
  name are taken out.

The review opens each feature with one line of coverage and one line of what is left untested and
why. A declined item is visible where the person can overturn it in Notes.

## Alternatives Considered

- **Stronger wording in the skill.** Free. Rejected: the wording already asked for main flows,
  research checks and boundaries, and a live run skipped all three.
- **A second model pass that critiques coverage.** Could catch what no rule names. Rejected: a model
  reading a model's output is one projection, not two. It misses what the first pass missed, and it
  costs a full reading per run.
- **A minimum number of edge cases per feature.** Easy to check. Rejected: a count with no source
  invites padding, which is the failure being fixed.
- **Output partitions in the model** (classes of what a feature produces, next to classes of what it
  takes in). Closest to how equivalence partitioning treats outputs. Rejected for now: outputs,
  rules and research checks together reach the same edge cases without a second partition model, and
  a second model means more for a person to review.
- **Refusing features whose purposes read the same.** Caught every feature of the live run. Kept as a
  warning: sibling features can honestly share a shape of sentence.

## Consequences

- A person reviews more conditions, and each one says something about its page. On the site above the
  estimate is 80-110 instead of 29, approved one feature at a time.
- The description check is a word list, so it is a backstop and not the main defence. A condition can
  pass it with one real noun and still be weak. The structural checks (outputs, limits, citations)
  carry the weight.
- A decline is only as honest as its reason. The gate checks that there is a reason; the person
  judges whether it holds.
- The test-condition technique list has no entry for a plain known answer ("100 m is 328.084 ft"). A
  main flow uses a property, a metamorphic relation, a decision-table column or a positive
  error-guessing condition.
