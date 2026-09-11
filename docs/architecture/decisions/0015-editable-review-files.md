# 0015: A person reviews in the file, and the JSON stays the only record

## Status

Accepted

## Context

Every stage of the analysis pipeline (ADR 0012) ends with a review. The JSON is the artifact; a
script renders it to markdown so a person can read it, and until now the markdown was deleted after
sign-off. It had been left behind once and went on showing "criticality (draft)" for 45 entries a
person had already confirmed, because approval changed the JSON and nothing re-rendered the view.

Deleting it closed that failure and opened three others. A person could not correct the file they
were reading: every approval and correction went through the chat, and the assistant transcribed it
into the JSON, which is one more place for a mistake. The readable view was gone once the review
ended. And a person working in an IDE reads the file as plain text: VS Code and its forks open
markdown in the text editor and render it only on request, while JetBrains shows the source next to
the preview. So the edit surface is the raw file, not a rendered page.

Two things were not acceptable: keeping the JSON and a hand-edited markdown as two sources that can
disagree, and making the markdown the record, which would lose every part of a scan the view does
not show.

## Decision

**The JSON stays the only record. The review file is its current view, never deleted, and a person
may edit it; a script reads the edits back.**

- `render-review-artifact.mjs` always writes `artifacts/review/<kind>-review.md` for the site map,
  feature map and test conditions. Every entry carries a short label (F2, P5, C14) and, where there
  is something to approve, a box. Beside the file, `artifacts/review/.base/<kind>-review.json` keeps
  the rendering exactly as written, the hash of the JSON it came from, and what each label stands for.
- A person ticks what they approve, answers a question on its `Answer:` line, deletes a test
  condition's line to cut it, settles a disagreement on its `Verdict:` line, or corrects any text in
  place.
- `apply-review.mjs` compares the file with that rendering. What it can apply exactly it writes to the
  JSON: boxes, answers, cuts and restores. It keeps the result only if the stage's validator is no
  worse for it. Everything else the person changed comes back to the assistant, grouped by the entry
  it belongs to, to apply as a correction given in conversation would be. An approval on an entry the
  person also changed waits until the change is made.
- A JSON that changed after the file was rendered is refused: the person's file is kept under another
  name and every edit goes to the assistant to carry over. After every change the file is rendered
  again, so it never shows an older state than the record. `pipeline-status.mjs` lists a file edited
  and not yet applied.

The pattern is borrowed, not invented. Renovate's dependency dashboard is generated text with boxes
the bot reads back. `git rebase -i` reads only the command and the commit id from each line and
ignores the rest. Terraform refuses to apply a saved plan the state has moved past. `kubectl edit`
keeps an edit it could not apply. And the view-update literature makes stable identifiers the
condition for putting a view's edits back into its source.

## Alternatives Considered

- **A separate decisions file beside a read-only markdown.** Simplest to parse. Rejected because the
  person reads one file and edits another, copying labels across by hand.
- **The markdown as the record, the JSON generated from it.** Rejected: anchors, hashes and evidence
  would have to survive a round trip through prose, and whatever the view does not show would be lost.
- **Keep deleting the view and take corrections in chat only.** No divergence and no new code. Rejected
  because a person cannot edit what they are reading, and every correction passes through a
  transcription.

## Consequences

- Two new files per editable stage (`<kind>-review.md` and its `.base` copy), and one more script.
  `apply-review.mjs` has to follow every change to what the renderer prints.
- Free-text edits still pass through the assistant. The script guarantees they are not lost and are
  attributed to the right entry; it does not interpret them.
- A test condition a person cuts stays in the JSON with `cut: true`. It is never approved, nothing
  downstream uses it, and the generator does not rebuild it.
- The test-cases view stays read-only until the test-case stage is reworked.
