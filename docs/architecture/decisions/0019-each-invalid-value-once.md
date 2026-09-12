# 0019: Each invalid value is tested once, and only valid values are paired

## Status

Accepted

## Context

The test condition generator built 2-way coverage over every parameter of a page and treated an
invalid partition the way PICT treats a negative value: never two in one vector, but each paired with
every valid value of every other parameter. A live run over a site of template forms showed what that
costs. A page with 27 fields, most of them carrying an "empty" invalid partition, got 124
combinatorial conditions, and the review listed the same line three times - `Verify condition_1 = ""`

- once for each value of an unrelated select beside it. The whole run came to 1050 conditions.

The application rejects an invalid value on its own account. The values beside it do not change that,
and a rejection that does depend on another field ("the end date must follow the start date") is a
rule between fields, which the analysis writes as a decision table.

## Decision

**Valid values are paired to 2-way coverage. Each invalid value gets one vector of its own, with every
other parameter at its first valid value.**

A route with a single parameter is still covered partition by partition. A vector never carries two
invalid values. An invalid value that no valid assignment of the others can accompany is reported in
`unsatisfiedPairs`, with the reason.

## Alternatives Considered

- **Keep PICT's pairing of negative values.** It catches error handling that depends on a neighbouring
  field's value. Rejected as the default: on form-heavy pages it multiplies conditions by the size of
  the other fields' domains and fills the review with lines that differ only in values the test is not
  about. The dependent case is covered where it exists, by the decision tables the analysis writes.
- **Stop generating invalid vectors and leave negatives to the analysis.** Fewer conditions still.
  Rejected: the invalid partitions the analysis records (a limit the markup states, an option the
  control does not offer) are exactly the cases a generator covers reliably and a model forgets.

## Consequences

- A defect where a field's validation breaks only beside a particular value of another field is not
  found by generated conditions; it needs a decision rule in the analysis.
- The count of negative conditions on a page equals the number of invalid partitions it records, so
  it stays proportional to what the analysis claimed rather than to the size of the form.
