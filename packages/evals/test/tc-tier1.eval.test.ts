import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTier1 } from '../src/tc/tier1.js';
import { tier1Report, writeReport } from '../src/tc/report.js';
import { MUTATIONS } from '../src/tc/mutations.js';

// The deterministic half of the test-conditions suite. By default a sample, so it stays runnable
// during development; TC_ALL=1 runs every dataset and is what a report should be written from.
const LIMIT: number | undefined =
  process.env.TC_ALL === '1' ? undefined : Number(process.env.TC_LIMIT || 12);
const CACHE = process.env.TC_CACHE || join(tmpdir(), 'eitr-tc-evals', 'datasets');

describe('test conditions - datasets, reference analyses and what the nets catch', () => {
  it(
    'refuses no reference analysis, and catches every way of going wrong at least somewhere',
    { timeout: 3600000 },
    async () => {
      const results = await runTier1({
        ...(LIMIT === undefined ? {} : { limit: LIMIT }),
        cacheRoot: CACHE,
        concurrency: Number(process.env.TC_WORKERS || 4),
      });
      const report = tier1Report(results);
      const file = writeReport(
        'test-conditions-tier1',
        report,
        join(import.meta.dirname, '..', 'reports'),
      );
      console.log('report: ' + file);

      // 1. A reference analysis is what a careful analyst writes. A gate that refuses one is either
      //    over-strict or reading a broken dataset; both have to be fixed, never waived.
      const refused = results.filter(
        (r) => r.reference.gate1 !== 'PASSED' || r.reference.gate2 !== 'PASSED',
      );
      expect(
        refused.map(
          (r) => r.id + ': ' + (r.reference.gate1Errors[0] || r.reference.gate2Errors[0]),
        ),
      ).toEqual([]);

      // 2. The graders have to agree that the reference is right, or they are measuring the wrong thing.
      const misgraded = results.filter((r) => r.reference.grade.failures.length > 0);
      expect(misgraded.map((r) => r.id + ': ' + r.reference.grade.failures[0])).toEqual([]);

      // 3. Every way of going wrong is caught somewhere, on every dataset it applies to.
      const missed: string[] = [];
      for (const result of results) {
        for (const mutation of result.mutations) {
          if (mutation.applicable && mutation.caughtBy === 'none')
            missed.push(mutation.id + ' on ' + result.id);
        }
      }
      expect(missed).toEqual([]);

      // 4. Every operator is exercised somewhere in the sample, or the suite is not measuring it.
      const applicable = new Set(
        results.flatMap((r) => r.mutations.filter((m) => m.applicable).map((m) => m.id)),
      );
      const unexercised = MUTATIONS.map((m) => m.id).filter((id) => !applicable.has(id));
      expect(unexercised).toEqual([]);
    },
  );
});
