# 0016: Analysis conclusions are checked against independent records, and every disagreement is journaled

## Status

Accepted

## Context

Most conclusions in the analysis pipeline rest on one reading. That a page works comes from a
screenshot the assistant looked at. That a page is low-risk comes from the assistant's judgment, and
the evidence quoted for it is the assistant's own quote. That a field's meaning is certain is the
assistant saying so. Yet the project already records other facts about the same things as a matter
of course: the status the server returned, what the page's markup carries, the calls it made, what
each crawled role was allowed to reach.

A reading confirmed from an independent direction is worth more than one that is not. That idea has
limits, and the design had to respect them:

- **Independence is the whole value, and it is easy to overstate.** Knight and Leveson found that
  independently written versions of one program failed on the same inputs far more often than chance
  predicts. For language models, agreement between samples of one model is not evidence that the
  answer is right (EMNLP 2025). Two readings of the same page by the same assistant are closer to one
  source than two.
- **Disagreement is normal, not a failure.** Reviews of triangulation in research find full
  convergence rare. Divergence is common, and it is itself informative. A rule requiring two sources
  to agree would stall half the conclusions, or push the assistant to invent a second confirmation.
- **Authority outweighs a count.** A 404 settles whether a page exists on its own; a person's answer
  outweighs any number of inferences.

## Decision

**A conclusion is checked, by script, against the independent records the project already holds.
Where they disagree, the assistant looks again first, and whatever still disagrees goes to the
person with both sides named. Every disagreement and how it was settled is journaled.**

- `scripts/corroboration.mjs` checks two stages:
  - The site map: whether the crawl saw the page itself. It compares the server's status, the page's
    access verdict, the screenshot, and the page's own calls.
  - The feature map:
    - whether a page's rating is at least what its records ask for. A page that changes data or
      handles a password is never low; a role boundary makes a page high.
    - whether each quoted piece of evidence is on the recorded page. The page inventory now records
      headings for this.
- Every reading belongs to a group - server, page markup, screenshot, traffic, the assistant - so a
  disagreement says which independent directions disagree.
- Nothing blocks. The review shows each disagreement where the person decides: under the page in
  the feature map, and with a `Verdict:` line in the site map.
- `artifacts/analysis/sensor-journal.jsonl` records each disagreement when it is first seen, and how
  it was settled:
  - the assessment changed;
  - a person approved it as it stood;
  - a person gave a verdict.

  `corroboration.mjs report` says, per kind of record, how often it disagreed and how often it turned
  out right.

- Confidence is capped where the sources are counted:
  - a field meaning or constraint in the test conditions may claim `high` only with a second
    independent source (a probe, research, a person, a document);
  - the feature map already caps criticality confidence by its strongest signal.
- A saved session is checked for expiry from its own file (`auth-status.mjs`) before a crawl starts
  from it.

## Alternatives Considered

- **A hard gate: at least two sources must agree.** Rejected for the reasons above: it stalls on
  the normal case and rewards inventing a second source.
- **A second independent model opinion on every conclusion.** Rejected as the default: two models
  of one family share blind spots, and the cost doubles. It stays an option for the few expensive
  decisions no record can check.

## Consequences

- The assistant has one more step before each review in those two stages, and some disagreements
  reach the person that used to be decided silently.
- The journal is only as good as the resolutions recorded. An approval given before a disagreement
  existed settles nothing, and such a disagreement stays open until something changes.
- The checks cover the analysis stages only. Applying the same idea to the generated tests - a state
  change confirmed through the UI, the API and the database - is a separate decision.
