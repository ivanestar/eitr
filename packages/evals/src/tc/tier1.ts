// The free half of the suite: over every dataset, the reference analysis goes through the stage's
// own scripts, and each mutation of it goes through them again. What comes out is two numbers that
// matter - how often the nets refuse an analysis that is right (they must not), and how much of each
// known way of going wrong they catch.
import { chromium, type Browser } from '@playwright/test';
import { datasetSpecs } from './covering.js';
import type { DatasetSpec } from './model.js';
import { prepareDataset, type PreparedDataset } from './project.js';
import { referenceAnalysis } from './reference.js';
import { runPipeline, writeConditions, type PipelineRun } from './pipeline.js';
import { gradeAnalysis, passesCritically, type GradeResult } from './graders.js';
import { MUTATIONS } from './mutations.js';

export interface MutationOutcome {
  id: string;
  expect: string;
  applicable: boolean;
  caughtBy: 'gate1' | 'gate2' | 'graders' | 'none';
  detail?: string | undefined;
}

export interface DatasetOutcome {
  id: string;
  split: DatasetSpec['split'];
  origin: DatasetSpec['origin'];
  factors: Record<string, string>;
  reference: {
    gate1: string;
    gate2: string | null;
    gate1Errors: string[];
    gate2Errors: string[];
    review: { entryCount: number; summary: string } | null;
    journeys: number | null;
    journeysGate: string | null;
    grade: {
      byGrader: Record<string, { passed: number; total: number }>;
      failures: string[];
      critical: boolean;
    };
  };
  mutations: MutationOutcome[];
  seconds: number;
}

async function withReference(
  prepared: PreparedDataset,
): Promise<{ run: PipelineRun; grade: GradeResult }> {
  const reference = referenceAnalysis(prepared);
  writeConditions(prepared.dir, reference);
  const run = await runPipeline(prepared.dir, { throughReview: true });
  const grade = run.analysis
    ? gradeAnalysis(prepared, run.analysis)
    : { items: [], byGrader: {}, notes: [] };
  return { run, grade };
}

export async function runDataset(
  spec: DatasetSpec,
  index: number,
  cacheRoot: string,
  browser: Browser,
): Promise<DatasetOutcome> {
  const started = Date.now();
  const prepared = await prepareDataset(spec, index, cacheRoot, browser);
  const reference = referenceAnalysis(prepared);
  const { run, grade } = await withReference(prepared);
  const failures = grade.items
    .filter((i) => !i.passed)
    .map((i) => i.grader + ': ' + i.what + (i.detail ? ' (' + i.detail + ')' : ''));
  const outcome: DatasetOutcome = {
    id: spec.id,
    split: spec.split,
    origin: spec.origin,
    factors: spec.factors as unknown as Record<string, string>,
    reference: {
      gate1: run.gate1.status,
      gate2: run.gate2 ? run.gate2.status : null,
      gate1Errors: run.gate1.errors.slice(0, 5),
      gate2Errors: run.gate2 ? run.gate2.errors.slice(0, 5) : [],
      review: run.review
        ? { entryCount: run.review.entryCount, summary: run.review.summary }
        : null,
      journeys: run.compose ? run.compose.journeys : null,
      journeysGate: run.journeysGate ? run.journeysGate.status : null,
      grade: { byGrader: grade.byGrader, failures, critical: passesCritically(grade) },
    },
    mutations: [],
    seconds: 0,
  };

  for (const mutation of MUTATIONS) {
    const analysis = structuredClone(reference);
    const applicable = mutation.apply(analysis, { prepared });
    if (!applicable) {
      outcome.mutations.push({
        id: mutation.id,
        expect: mutation.expect,
        applicable: false,
        caughtBy: 'none',
      });
      continue;
    }
    writeConditions(prepared.dir, analysis);
    const mutated = await runPipeline(prepared.dir);
    let caughtBy: MutationOutcome['caughtBy'] = 'none';
    let detail: string | undefined;
    if (mutated.gate1.status !== 'PASSED') {
      caughtBy = 'gate1';
      detail = mutated.gate1.errors[0];
    } else if (!mutated.generated) {
      caughtBy = 'gate1';
      detail = 'the generator refused it';
    } else if (mutated.gate2 && mutated.gate2.status !== 'PASSED') {
      caughtBy = 'gate2';
      detail = mutated.gate2.errors[0];
    } else if (mutated.analysis) {
      // Past both gates, the graders are what is left: any item they fail is the catch.
      const graded = gradeAnalysis(prepared, mutated.analysis);
      const failed = graded.items.filter((i) => !i.passed);
      if (failed.length > 0) {
        caughtBy = 'graders';
        detail = failed[0].grader + ': ' + failed[0].what;
      } else if (
        mutation.id === 'defect-not-targeted' &&
        graded.items.some((i) => i.grader === 'defect-targeted' && i.passed)
      ) {
        // Taking the condition out changed nothing to catch: the generator's own boundary probe, or
        // the main flow, covers the defect anyway. Not a failure of the nets - not a mutation either.
        outcome.mutations.push({
          id: mutation.id,
          expect: mutation.expect,
          applicable: false,
          detail: 'another condition still covers the defect',
          caughtBy: 'none',
        });
        continue;
      }
    }
    outcome.mutations.push({
      id: mutation.id,
      expect: mutation.expect,
      applicable: true,
      caughtBy,
      detail: detail ? detail.slice(0, 200) : undefined,
    });
  }
  writeConditions(prepared.dir, reference);
  outcome.seconds = Math.round((Date.now() - started) / 100) / 10;
  return outcome;
}

export async function runTier1(opts: {
  ids?: string[];
  limit?: number;
  cacheRoot: string;
  concurrency?: number;
  onProgress?: (done: number, total: number, last: DatasetOutcome) => void;
}): Promise<DatasetOutcome[]> {
  const { specs } = datasetSpecs();
  let chosen = specs;
  if (opts.ids && opts.ids.length > 0) chosen = specs.filter((s) => opts.ids!.includes(s.id));
  if (opts.limit) chosen = chosen.slice(0, opts.limit);
  const browser = await chromium.launch();
  const results: DatasetOutcome[] = [];
  const queue = chosen.map((spec) => ({ spec, index: specs.indexOf(spec) }));
  const workers = Math.max(1, Math.min(opts.concurrency ?? 4, queue.length));
  try {
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          try {
            const outcome = await runDataset(next.spec, next.index, opts.cacheRoot, browser);
            results.push(outcome);
            opts.onProgress?.(results.length, chosen.length, outcome);
          } catch (e) {
            results.push({
              id: next.spec.id,
              split: next.spec.split,
              origin: next.spec.origin,
              factors: next.spec.factors as unknown as Record<string, string>,
              reference: {
                gate1: 'ERROR',
                gate2: null,
                gate1Errors: [String(e).slice(0, 300)],
                gate2Errors: [],
                review: null,
                journeys: null,
                journeysGate: null,
                grade: { byGrader: {}, failures: [String(e).slice(0, 300)], critical: false },
              },
              mutations: [],
              seconds: 0,
            });
          }
        }
      }),
    );
  } finally {
    await browser.close();
  }
  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
}
