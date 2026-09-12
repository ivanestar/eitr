# The test-conditions dataset suite

What `/define-test-conditions` is worth, measured against applications whose every defect is known.
The reasoning behind the design is in
[ADR 0023](../../../../docs/architecture/decisions/0023-how-test-conditions-are-evaluated.md).

## Running it

```bash
npm run eval:tc                 # a sample of datasets, free, a couple of minutes
TC_ALL=1 npm run eval:tc        # every dataset - what a report should come from
TC_AGENTS=1 npm run eval:tc:agents   # paid: a real assistant runs the real skill
```

Useful switches: `TC_LIMIT` (how many datasets), `TC_IDS` (which ones), `TC_WORKERS`, `TC_CACHE`
(where built datasets live, `%TEMP%/eitr-tc-evals` by default). For the paid half: `TC_RUNNER`
(`agy` or `claude`), `TC_MODEL`, `TC_TRIALS` (3 gives pass^3), `TC_JUDGE=0` to leave the judge out,
`TC_TAG` to name the run.

Reports land in `packages/evals/reports/`; the runs themselves, with every transcript, stay under
the cache directory.

## What is in here

| File                     | What it holds                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `model.ts`               | the 18 factors a dataset varies, what each probes, and which combinations are possible                |
| `covering.ts`            | the mixed-strength covering array, and the datasets that reproduce live failures                      |
| `archetypes-*.ts`        | ten kinds of page: their markup, their behaviour, and their answer key                                |
| `apps.ts`                | a dataset's whole application: pages, home, site frame, research record, notes, API                   |
| `gold.ts`                | the answer key's shape                                                                                |
| `project.ts`             | a dataset on disk - generated project, inventories from the project's own scripts, upstream artifacts |
| `reference.ts`           | the analysis a careful analyst writes, built from the answer key                                      |
| `mutations.ts`           | twenty ways an analysis goes wrong, and where each should be caught                                   |
| `graders.ts`             | what an analysis is worth, in code                                                                    |
| `judge.ts`               | the one judgement code cannot make, and the sheet a person labels to check it                         |
| `pipeline.ts`            | the stage's own scripts, run over an analysis                                                         |
| `tier1.ts` / `agents.ts` | the free half and the paid half                                                                       |
| `stats.ts` / `report.ts` | error bars, pass^k, and the report                                                                    |

## Reading the numbers

- **A gate that refuses a reference analysis** is a failure of the gate or of the dataset, never of
  the analyst. The suite asserts there are none before anything else.
- **A grader that fails a reference analysis** is a broken grader until shown otherwise.
- **Caught / applicable** per mutation says how much of that way of going wrong the nets catch. A
  mutation nothing catches is a hole, and the suite fails on it.
- For the paid half, **pass@1** is how often one run is right and **pass^k** how often k runs all
  are; the difference is how much the result depends on luck.
- **defect-targeted** matches the words the answer key expects, and an analysis writes its own - it
  calls "a discount over 100 percent is rejected" a miss where the key says 150. Read
  **defect-judge** for whether a condition would actually fail on the defect, and the calibration
  sheet for whether the judge can be believed.
- **main-flow-value** passes on its own only where the analysis states the value the key names. An
  analysis that works its main flow on an input of its own goes to the judge; without a judge it
  counts as failed, so a run with `TC_JUDGE=0` reads lower than it is.
- Rates over items carry a confidence interval clustered by dataset: items of one dataset fail
  together, and treating them as independent would make the interval look narrower than it is.

## Adding to it

A failure seen on a real run belongs here as a factor level or a dataset in `SEED_FACTORS`, with the
page that reproduces it. A new kind of page is an archetype module plus its entry in `CAPABILITIES`:
the covering array picks up the new combinations by itself.
