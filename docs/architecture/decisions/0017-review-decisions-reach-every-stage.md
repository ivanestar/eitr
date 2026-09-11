# 0017: What a person decides in a review reaches every later stage, and a page left out stays out

## Status

Accepted

## Context

ADR 0015 made the review file editable and promised that nothing a person writes in it is lost. A
live review of a site map showed where that promise stopped. The person settled a disagreement about
a broken page with a sentence on its `Verdict:` line and deleted the page's route from the file.
Neither reached the site map. The verdict was not read, because only a bare `works` or `broken`
counted; the deleted route went back to the assistant as a correction with nowhere in the site map to
record it; and the file was redrawn from the unchanged JSON before anything applied either, which
erased both. At the next stage the page became a feature.

The same review showed three more gaps. The site map was the one review with no box to approve an
entry, so the pipeline could not tell a site map under review from an approved one and showed the
person at the next stage while they were still reviewing this one. The page and its disagreement
appeared twice in the file, with nothing linking them. And there was no place in any review file for
context that belongs to no single entry.

## Decision

**A decision a person makes in a review file is applied by a script, recorded where every later stage
reads it, and never erased by redrawing the file.**

- Every editable review works the same way: a box and `ALL` to approve, deleting an entry to take it
  out, a verdict or an answer on its line, text corrected in place, and a "Your notes" block at the
  end. The site map gains boxes; each approved route carries `reviewed` and `reviewedBy`, and
  `pipeline-status.mjs` holds the pipeline at the site map until every remaining route is approved.
- Deleting a route in the site map review, or a page in the feature map review, leaves that page out
  of every later stage. `apply-review.mjs` marks the route `removed` with `removedBy: "human"` in the
  site map - every later stage already skips a route that is not active - and records the decision in
  `app-profile.json` `leftOutRoutes`, which outlives a fresh crawl: `crawl-budget.mjs` reads it when a
  pass starts and refuses those pages. The feature map is re-derived at once. Ticking the page under
  "Left out by you" brings it back.
- A verdict is read from its first words, in English or Russian, and the rest is kept as the person's
  note. One the script cannot read goes back to the assistant to ask about, and is recorded through
  `apply-review.mjs --verdict`, with the same checks as one read from the file.
- `render-review-artifact.mjs` refuses to redraw a file with edits `apply-review.mjs` has not read.
  Corrections it hands to the assistant wait in `artifacts/review/.pending/` until the assistant
  confirms them with `--done`, and every redrawn file shows them until then.
- The lines under "Your notes" are kept in `app-profile.json` `domainNotes`, where every later stage
  already looks for what a person told the project.

Excluding a page from a scope that tools respect everywhere is how testing proxies do it: Burp's
"Remove from scope" on a site map node writes a scope rule every tool follows, and ZAP excludes a node
from its spider the same way. Deleting a line to drop what it stands for is `git rebase -i`'s
convention, and refusing to overwrite unapplied edits is what `kubectl edit` does.

## Alternatives Considered

- **Record a left-out page as an off-limits area of the crawl.** Least new code, since the crawl
  already enforces those. Rejected: off-limits means "the crawl must not go there", a boundary a person
  sets for safety, and a page that is simply not worth testing would stay hidden even after it is
  fixed, until someone edits the boundary by hand.
- **Mark the route removed in the site map and nothing else.** Every stage already skips it, at no
  extra cost. Rejected: a full `/map-site create` rebuilds the site map, so the next crawl would map
  the page again and the person's decision would be lost.
- **Keep leaving deletions to the assistant as corrections.** No new mechanism. Rejected: it is the
  path that failed, and the site map had no field to write the decision into.

## Consequences

- The site map review now needs an approval like every other stage, one more step before
  `/map-features`; `ALL` makes it one tick. Auto-pilot approves routes as it approves everything else.
- A person cannot quietly lose a review by asking for the view to be redrawn: `--discard-edits` does
  it, keeps their file beside it, and exists for the person to choose, not the assistant.
- A page left out stays out until someone ticks it back, on every later crawl. The review keeps
  listing it, so the decision stays visible rather than becoming a gap nobody remembers making.
