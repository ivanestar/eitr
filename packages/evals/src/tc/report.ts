// What a run comes to, written for a person: whether the nets ever refuse a right analysis, how much
// of each known failure they catch, and - for a run of real assistants - how often what they wrote
// would find what the page gets wrong, with the input characteristics their failures cluster around.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasetOutcome } from './tier1.js';
import type { AgentRun } from './agents.js';
import { clusteredRate, passHatK, percent, wilson } from './stats.js';
import { FACTORS } from './model.js';

export function tier1Report(results: DatasetOutcome[]): string {
  const lines: string[] = [];
  const datasets = results.length;
  const referenceClean = results.filter(
    (r) =>
      r.reference.gate1 === 'PASSED' &&
      r.reference.gate2 === 'PASSED' &&
      r.reference.grade.failures.length === 0,
  );
  lines.push('# Test conditions - dataset suite, deterministic half');
  lines.push('');
  lines.push(
    'Datasets: ' +
      datasets +
      ' (' +
      results.filter((r) => r.origin === 'seed').length +
      ' from live failures, ' +
      results.filter((r) => r.split === 'held-out').length +
      ' held out)',
  );
  lines.push(
    'Reference analyses that pass every gate and every grader: ' +
      percent(wilson(referenceClean.length, datasets)),
  );
  const brokenGate = results.filter(
    (r) => r.reference.gate1 !== 'PASSED' || r.reference.gate2 !== 'PASSED',
  );
  if (brokenGate.length > 0) {
    lines.push('');
    lines.push(
      '**A reference a gate refuses is a broken dataset or an over-strict gate - both are findings:**',
    );
    for (const r of brokenGate.slice(0, 20))
      lines.push(
        '- ' +
          r.id +
          ' (' +
          r.factors.archetype +
          '): ' +
          (r.reference.gate1Errors[0] || r.reference.gate2Errors[0] || '').slice(0, 180),
      );
  }
  const graderFails = results.filter((r) => r.reference.grade.failures.length > 0);
  if (graderFails.length > 0) {
    lines.push('');
    lines.push('**A reference a grader fails is a grader that is wrong, until shown otherwise:**');
    for (const r of graderFails.slice(0, 20))
      lines.push(
        '- ' +
          r.id +
          ' (' +
          r.factors.archetype +
          '): ' +
          r.reference.grade.failures[0].slice(0, 180),
      );
  }
  lines.push('');
  lines.push('## What each way of going wrong runs into');
  lines.push('');
  lines.push(
    '| What was done to the analysis | Where it should be caught | Applicable | Caught | Where |',
  );
  lines.push('| --- | --- | --- | --- | --- |');
  const ids = Array.from(new Set(results.flatMap((r) => r.mutations.map((m) => m.id))));
  for (const id of ids) {
    const all = results.flatMap((r) => r.mutations.filter((m) => m.id === id));
    const applicable = all.filter((m) => m.applicable);
    const caught = applicable.filter((m) => m.caughtBy !== 'none');
    const where: Record<string, number> = {};
    for (const m of caught) where[m.caughtBy] = (where[m.caughtBy] || 0) + 1;
    const expect = all[0]?.expect ?? '';
    lines.push(
      '| ' +
        id +
        ' | ' +
        expect +
        ' | ' +
        applicable.length +
        ' | ' +
        percent(wilson(caught.length, applicable.length)) +
        ' | ' +
        Object.entries(where)
          .map(([k, v]) => k + ' ' + v)
          .join(', ') +
        ' |',
    );
  }
  const missed = results.flatMap((r) =>
    r.mutations
      .filter((m) => m.applicable && m.caughtBy === 'none')
      .map((m) => ({ dataset: r.id, id: m.id, factors: r.factors })),
  );
  if (missed.length > 0) {
    lines.push('');
    lines.push('## What nothing caught');
    lines.push('');
    for (const m of missed.slice(0, 40))
      lines.push(
        '- ' +
          m.id +
          ' on ' +
          m.dataset +
          ' (' +
          m.factors.archetype +
          ', ' +
          m.factors.defect +
          ')',
      );
  }
  lines.push('');
  lines.push(
    'Review size on the reference analyses: ' +
      Math.round(
        results.reduce((s, r) => s + (r.reference.review?.entryCount || 0), 0) /
          Math.max(1, datasets),
      ) +
      ' conditions a person reads per dataset, on average.',
  );
  lines.push(
    'Time: ' +
      Math.round(results.reduce((s, r) => s + r.seconds, 0)) +
      ' seconds of script runs over ' +
      datasets +
      ' datasets.',
  );
  return lines.join('\n') + '\n';
}

export function agentReport(
  runs: AgentRun[],
  factorsOf: Record<string, Record<string, string>>,
): string {
  const lines: string[] = [];
  const byDataset = new Map<string, AgentRun[]>();
  for (const run of runs) {
    if (!byDataset.has(run.datasetId)) byDataset.set(run.datasetId, []);
    byDataset.get(run.datasetId)!.push(run);
  }
  const finished = runs.filter((r) => r.produced);
  lines.push('# Test conditions - what the assistants wrote');
  lines.push('');
  lines.push(
    'Runs: ' +
      runs.length +
      ' over ' +
      byDataset.size +
      ' datasets (' +
      runs.filter((r) => !r.ok).length +
      ' did not finish, ' +
      (runs.length - finished.length) +
      ' left no analysis)',
  );
  const models = Array.from(new Set(runs.map((r) => r.runner + ' ' + r.model)));
  lines.push('Assistant: ' + models.join(', '));
  const seconds = runs.map((r) => r.seconds).sort((a, b) => a - b);
  if (seconds.length > 0)
    lines.push(
      'Time per run: median ' +
        seconds[Math.floor(seconds.length / 2)] +
        's, longest ' +
        seconds[seconds.length - 1] +
        's',
    );
  const tokens = runs.reduce(
    (sum, r) => sum + (r.usage ? Number(r.usage.total_tokens || r.usage.totalTokens || 0) : 0),
    0,
  );
  if (tokens > 0)
    lines.push(
      'Tokens: ' +
        tokens.toLocaleString('en-US') +
        ' over ' +
        runs.length +
        ' runs (' +
        Math.round(tokens / runs.length).toLocaleString('en-US') +
        ' per run)',
    );
  lines.push('');
  lines.push('## Whether the analysis holds up');
  lines.push('');
  const gatePassed = finished.filter((r) => r.gate && r.gate.status === 'PASSED');
  lines.push(
    '- Left an analysis the gate passes: ' + percent(wilson(gatePassed.length, runs.length)),
  );
  const critical = finished.filter((r) => r.grade && r.grade.critical);
  lines.push('- Nothing critical wrong with it: ' + percent(wilson(critical.length, runs.length)));
  const perfect = finished.filter((r) => r.grade && r.grade.failures.length === 0);
  lines.push('- Every grader passed: ' + percent(wilson(perfect.length, runs.length)));
  const perTask = Array.from(byDataset.values()).map((trials) => ({
    passed: trials.filter((t) => t.grade && t.grade.critical).length,
    total: trials.length,
  }));
  const k = Math.min(...Array.from(byDataset.values()).map((t) => t.length));
  if (k > 1)
    lines.push(
      '- Right on every one of ' +
        k +
        ' trials (pass^' +
        k +
        '): ' +
        (passHatK(perTask, k) * 100).toFixed(1) +
        '%',
    );
  lines.push('');
  lines.push('## Per check');
  lines.push('');
  lines.push('| What is checked | Passed | ');
  lines.push('| --- | --- |');
  const graders = Array.from(
    new Set(finished.flatMap((r) => Object.keys(r.grade?.byGrader || {}))),
  );
  for (const grader of graders) {
    const clusters = finished
      .map((r) => r.grade?.byGrader[grader] || { passed: 0, total: 0 })
      .filter((c) => c.total > 0);
    lines.push('| ' + grader + ' | ' + percent(clusteredRate(clusters)) + ' |');
  }
  lines.push('');
  lines.push('## Where it breaks');
  lines.push('');
  lines.push('| Input characteristic | Runs | Nothing critical wrong |');
  lines.push('| --- | --- | --- |');
  for (const factor of FACTORS) {
    for (const level of factor.levels) {
      const relevant = runs.filter((r) => (factorsOf[r.datasetId] || {})[factor.id] === level);
      if (relevant.length === 0) continue;
      const ok = relevant.filter((r) => r.grade && r.grade.critical).length;
      lines.push(
        '| ' +
          factor.id +
          ' = ' +
          level +
          ' | ' +
          relevant.length +
          ' | ' +
          percent(wilson(ok, relevant.length)) +
          ' |',
      );
    }
  }
  const failures = new Map<string, number>();
  for (const run of finished)
    for (const failure of run.grade?.failures || [])
      failures.set(failure.split(':')[0], (failures.get(failure.split(':')[0]) || 0) + 1);
  lines.push('');
  lines.push('## What goes wrong most');
  lines.push('');
  for (const [grader, count] of Array.from(failures.entries()).sort((a, b) => b[1] - a[1]))
    lines.push('- ' + grader + ': ' + count);
  return lines.join('\n') + '\n';
}

export function writeReport(name: string, body: string, reportsDir: string): string {
  mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(reportsDir, name + '-' + stamp + '.md');
  writeFileSync(file, body, 'utf8');
  return file;
}
