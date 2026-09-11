# 0021: A person reviews what only the domain can confirm; the assistant checks the rest under the person's veto

## Status

Accepted

## Context

The test conditions review listed every condition for a person to approve. On a site of template
forms that came to 651 lines, most of them the same few checks on every field: the limits and
required fields the markup declares, the malformed and hostile values checklist, and the generator's
combinations of valid values. A person asked to approve hundreds of such lines approves them without
reading, which is no review at all, and the conditions that do need a person - the rules of the
business, what a feature must produce - drown among them.

These two kinds differ in what settles them. A check built from `max="1000"` is right or wrong by the
page's own markup, and the gate already compares the two; a malformed-input probe is right for any
field that takes text. Whether "a refund needs a manager's approval" is right, only someone who knows
the business can say.

## Decision

**Every condition carries who reviews it. A person reviews what only the domain can confirm; the
assistant keeps or cuts the rest, and the person keeps a veto over each page's share.**

- The generator sets `reviewer` on every condition, on every pass. `person`: the analysis wrote it, it
  rests on words (a label, a person, a requirement, research), or it walks an entity's lifecycle.
  `assistant`: it was built from the markup, the checklist or the generator's combinations.
- Before the review, the assistant decides for each of its conditions whether it applies to this
  application - never whether the page passes it - through `scripts/assistant-check.mjs`, which
  records `reviewedBy: 'assistant'` or a cut with its reason, and refuses a decision on a person's
  condition or a cut without a reason. The gate refuses an assistant's approval of a person's condition.
- The review lists a person's conditions one by one. Each page's assistant-checked conditions are one
  line: what they are, on which fields and how many values each takes, how many were kept and cut and
  why. Its box is the veto: cleared, all of them leave testing; ticked, they come back as the person's.
- `pipeline-status.mjs` never counts the assistant's approvals as the review of the stage.

This follows risk-based testing - test effort, and review effort with it, goes where the product risk
is - and the practice for combinatorial testing, where what deserves a person's eye is the input model
(the parameters and their values), not each generated combination.

## Alternatives Considered

- **Keep every condition in the review, grouped.** Nothing is hidden. Rejected: a group of 90 lines is
  still 90 lines, and approving them in bulk without reading is the same non-review.
- **Approve the mechanical conditions automatically, with no assistant step.** Deterministic. Rejected:
  whether a check applies depends on the application (a SQL injection probe on a page that sends
  nothing to a server tests nothing), and that needs a reader.
- **Let the assistant review everything.** Fewest questions. Rejected: a model checking what a model
  wrote is one source, not two, and business rules are exactly where it is wrong in ways that pass
  every automated check.

## Consequences

- A person no longer sees each mechanical check. A wrong partition of a field - a value class the
  analysis misread - reaches the tests unless the person spots it in the page's one-line model or the
  gate catches it.
- The assistant's check is a single reading: it may cut a check that does apply. Its reasons are shown
  on the page's line, cuts stay in the file, and the veto brings the page's checks back.
- A run where a person has nothing to review is reviewed once the assistant has checked everything.
