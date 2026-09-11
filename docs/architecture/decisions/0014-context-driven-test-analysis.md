# 0014: Test analysis starts from what a feature means, and every condition says where its expected result comes from

## Status

Accepted

## Context

Stage 2 of the analysis pipeline (ADR 0012) defined test conditions per route from what the page
showed: the fields in the inventory, their HTML5 attributes, and a layer of invariants the model
wrote. A live run on a 28-route toolkit scored it 4/10. Techniques were applied to whatever could
be parsed, and the volume was generated mechanically. Nine conditions went to the home page's
language switcher, and seven to the pairwise tool that is the core of the product. A unit
converter's own "speed" option became an invalid input, and a placeholder became a maximum.

The failures had one root. An engineer first works out what a feature is for and what it must
guarantee, and then applies techniques to that model. The stage did it the other way round. Testing
is context dependent (ISTQB Foundation Level, principle 6). A field labelled "speed" is a device
setpoint on one application and a quantity to convert on another, and its limits, negatives and
failure modes differ completely between the two.

Three further forces shaped the answer:

- **Observed behaviour is not correct behaviour.** A condition built from what the markup states,
  or from what a probe saw the page do, only records the application as it is. It fails when the
  behaviour changes and passes on a defect that was already there: in Feathers' terms, it is a
  characterization test. It is useful for regression, but it is a different thing from a check that
  the behaviour is right, and the review could not tell the two apart.
- **Where no specification exists, the oracle problem is real.** The survey literature (Barr et al.,
  IEEE TSE 2015) lists specifications, models and metamorphic relations as the automated sources of
  a correct answer, and the human as the last one. The stage had no way to say which one a
  condition rested on.
- **Model-written test ideas are plausible first and right second.** Surveys of LLM-based test
  generation name hallucination as the main weakness, and the approaches that control it anchor
  every output to something external: constraints, cause-effect tables, retrieved sources.

## Decision

**Test analysis is per reviewed feature and context-driven. Every condition carries the provenance
of its expected result.** Concretely:

- Before any condition is written, the stage records an analysis of the feature in
  `test-conditions.json` (schema 3). It says what the feature does, how it serves the application's
  confirmed purpose, and what kind of feature it is. For every field it records what the value
  means, its role and unit, and the constraints it should obey. Each constraint names its source and
  what the page enforces today. The stage also records the feature's dependencies, and the questions
  only a person can settle. Every parameter must stand on a field meaning.
- **Code gathers facts and enforces the rules; the model supplies meaning and ideas; research is a
  safety net.**
  - `scripts/field-probe.mjs` types a value into a field and reads back what the page did. It does
    this only when the crawl boundary allows interaction. It submits only when the boundary allows
    any action and a person said the application is not production.
  - `scripts/test-research.mjs` keeps research per kind of feature. It requires at least five
    sources from four sites, and refuses any query that names the application.
  - The generator builds the mechanical conditions and ranks every condition.
- Every condition states:
  - its **layer**: field, rule, behaviour or frame;
  - its **oracle**: requirement, human, research, domain, observed or markup;
  - its **anchors**: what it rests on, checked to exist, with at least one matching the oracle;
  - its **likelihood**, with a reason.

  The review marks an observed or markup oracle as regression-only.

- **Priority is risk level: likelihood times the feature's impact.** It is computed by script, and
  nothing is removed for ranking low. The model may attach a note that a condition looks like a check
  for its own sake; the person reviewing decides.
- **The test basis is explicit.** `scripts/test-analysis-plan.mjs` decides whether the stage works
  from a crawled application, documents, or both. It asks when that is ambiguous, and it reports the
  step each feature is at. Anchors are polymorphic (control, probe, research, human, requirement,
  ticket, code, document), so requirements and tickets can back conditions today. A documents-only
  basis is planned and not built.

## Alternatives Considered

- **Two stages or two artifacts: field validation separately, business logic separately.** This
  would give each part its own flow and review. It was rejected because a rule between fields, or a
  limit that carries business meaning, falls between the two. It would also put the same parameter
  model in two places, against the pipeline's rule of one stage and one artifact. The `layer` field
  gives the same separation for filtering without splitting the model.
- **Generate the field layer deterministically from HTML5 attributes, without the model.** This
  would be cheaper and repeatable. It was rejected because attributes state what the markup enforces
  today, not what the field should accept. Where validation is missing, a generator has nothing to
  go on, which is exactly where knowing the field's meaning matters most. Code keeps the parts that
  are facts: probes, the accounting of every field, and single-fault combinations.
- **Adopt a curated rule base per kind of feature instead of research on demand.** This would give
  the same checks every time. It was rejected because it means enumerating kinds of feature ahead of
  demand, which does not scale to arbitrary applications. Research cached per kind of feature gets
  most of the repeatability at a fraction of the maintenance.
- **Let the model cut low-value conditions.** This would give a shorter review. It was rejected
  because a misreading of the application would silently delete a good check. Ranking plus a
  visible note keeps the cut with the person.

## Consequences

- Schema 3 is not readable as schema 2. A project re-runs `/define-test-conditions` rather than
  migrating, as the generator is one-shot.
- The stage costs more per feature: an analysis, research for each new kind of feature, probes, and
  the conditions only a reader has. Caching research per kind of feature and working riskiest-first
  bound it, but a large application still takes longer than a mechanical pass.
- Probing interacts with a live application within the recorded boundary, and it can only apply
  constraints the browser reports or the attributes state. It never presses submit under a
  safe-interactions boundary or on production.
- `/design-test-cases` and `/automate-test` still read conditions per route and do not yet use
  layer, oracle or priority. Teaching them to is the next track.
- Assistants without web access record research as skipped, with the reason. The analysis then rests
  on the model's reasoning and the page alone, and the review says so.
