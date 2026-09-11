# 0020: A note is written on the entry it is about, and kept with the project's knowledge

## Status

Accepted

## Context

Each review file had one "Your notes" block at the end. A person reviewing a long file who wanted to
say something about a route, a page or a condition had to scroll to the end and name the entry there,
or write a line under the entry that came back to the assistant as a correction of the entry's text.
Both are awkward, and neither kept what was said with the entry it was about.

## Decision

**Every entry a person decides on has a place for a note under it, and each note is kept in
`app-profile.json` `domainNotes` with what it is about.**

- Routes, features, pages and entities carry a `Notes:` line; a condition takes its note after `//` at
  the end of its own line, so a review of hundreds of conditions does not double in length.
- `apply-review.mjs` reads the note, stores it with `about` - the review, the kind of entry and its id
  - and hands it to the assistant to act on like a correction given in conversation. A note is not a
    change to the entry: a ticked box beside it is still an approval.
- One note is current per entry. Changing or clearing it marks the old one `withdrawnAt` instead of
  deleting it, so a condition citing it as `domainNotes:<index>` still resolves.
- The renderer shows the current note on its line again; "Your notes" keeps what belongs to no entry.

## Alternatives Considered

- **Store the note on the record itself** (`note` on a route, feature, page or condition). Close to the
  entry. Rejected: the feature map is re-derived and conditions are regenerated, so a note would need
  carrying across every rebuild, and later stages would have to look for notes in four files.
- **Keep one block and let the person name the entry.** No change. Rejected: it is the jumping around
  that asked for this, and a note naming "R12" loses its meaning when the file is redrawn.

## Consequences

- `domainNotes` grows with every note and every change of one; withdrawn notes stay. Readers skip
  entries with `withdrawnAt`.
- A note is about an entry as it was when written. When a page is regrouped or a condition regenerated
  under a new id, the note stays with the old id and no longer shows in the review.
