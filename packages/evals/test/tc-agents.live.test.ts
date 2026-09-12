import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { datasetSpecs } from '../src/tc/covering.js';
import { prepareDataset, type PreparedDataset } from '../src/tc/project.js';
import { runAgentBatch } from '../src/tc/agents.js';
import { judgeDefects } from '../src/tc/judge.js';
import { agentReport, writeReport } from '../src/tc/report.js';

// The paid half of the suite: a real assistant runs the real skill on datasets it has never seen.
// It costs money and takes hours, so it runs only when asked for by name:
//   TC_AGENTS=1 [TC_IDS=a,b] [TC_LIMIT=20] [TC_TRIALS=3] [TC_RUNNER=agy|claude] [TC_MODEL=...]
//   npx vitest run packages/evals/test/tc-agents.live.test.ts
const ENABLED = process.env.TC_AGENTS === '1';
const CACHE = process.env.TC_CACHE || join(tmpdir(), 'eitr-tc-evals', 'datasets');

describe.skipIf(!ENABLED)('test conditions - what a real assistant writes', () => {
  it(
    'runs the skill on the datasets and scores what it left behind',
    { timeout: 24 * 3600000 },
    async () => {
      const { specs } = datasetSpecs();
      const ids = String(process.env.TC_IDS ?? '')
        .split(',')
        .filter(Boolean);
      let chosen = ids.length > 0 ? specs.filter((s) => ids.includes(s.id)) : specs;
      if (process.env.TC_LIMIT) chosen = chosen.slice(0, Number(process.env.TC_LIMIT));
      const browser = await chromium.launch();
      const prepared: PreparedDataset[] = [];
      try {
        for (const spec of chosen)
          prepared.push(await prepareDataset(spec, specs.indexOf(spec), CACHE, browser));
      } finally {
        await browser.close();
      }
      const tag = process.env.TC_TAG || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const outRoot = join(tmpdir(), 'eitr-tc-evals', 'agent-runs', tag);
      const runs = await runAgentBatch(prepared, {
        runner: (process.env.TC_RUNNER as 'agy' | 'claude') || 'agy',
        model: process.env.TC_MODEL || 'gemini-3.8-flash-high',
        effort: 'high',
        trials: Number(process.env.TC_TRIALS || 1),
        concurrency: Number(process.env.TC_WORKERS || 2),
        timeoutMinutes: Number(process.env.TC_TIMEOUT || 45),
        outRoot,
      });

      // What code cannot decide: whether anything they wrote would catch the defect in the page.
      if (process.env.TC_JUDGE !== '0') {
        for (const run of runs) {
          if (!run.produced) continue;
          const dataset = prepared.find((p) => p.spec.id === run.datasetId)!;
          const analysisPath = join(
            outRoot,
            run.datasetId + '-t' + run.trial,
            'artifacts/analysis/test-conditions.json',
          );
          const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
          const judged = await judgeDefects(dataset, analysis, {
            recordDir: join(outRoot, 'judge'),
            model: process.env.TC_JUDGE_MODEL || 'claude-sonnet-4-6',
          });
          run.items = run.items.concat(judged);
          if (run.grade) {
            for (const item of judged) {
              const bucket = (run.grade.byGrader[item.grader] ||= { passed: 0, total: 0 });
              bucket.total += 1;
              if (item.passed) bucket.passed += 1;
              else run.grade.failures.push(item.grader + ': ' + item.what);
            }
          }
        }
        writeFileSync(join(outRoot, 'runs.json'), JSON.stringify(runs, null, 1), 'utf8');
      }

      const factorsOf: Record<string, Record<string, string>> = {};
      for (const dataset of prepared)
        factorsOf[dataset.spec.id] = dataset.spec.factors as unknown as Record<string, string>;
      const file = writeReport(
        'test-conditions-agents',
        agentReport(runs, factorsOf),
        join(import.meta.dirname, '..', 'reports'),
      );
      console.log('report: ' + file + '\nruns: ' + outRoot);
      expect(runs.length).toBeGreaterThan(0);
    },
  );
});
