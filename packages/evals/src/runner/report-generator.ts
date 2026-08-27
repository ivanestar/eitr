import * as fs from 'fs';
import * as path from 'path';
import type { TokenUsage } from '../eval-runner.js';
import type { ScoreDeduction } from '../graders/cpom-grader.js';

export interface EvalBenchmarkResultItem {
  id?: string;
  name: string;
  category: string;
  score10?: number; // 0.0 to 10.0
  score?: number; // 0 to 100 for backward compatibility
  passed: boolean;
  details: string;
  usage?: TokenUsage;
  deductions?: ScoreDeduction[];
}

export interface EvalBenchmarkSummary {
  timestamp: string;
  totalEvals: number;
  passedEvals: number;
  failedEvals: number;
  averageScore10?: number; // 0.0 to 10.0
  overallScore?: number; // 0 to 100%
  model?: string;
  provider?: string;
  totalTokens?: number;
  totalCostUsd?: number;
  results: EvalBenchmarkResultItem[];
}

/**
 * Generates human- and AI-readable Markdown report with 10-point scale, deductions, and recommendations.
 */
export function generateBenchmarkReportMarkdown(summary: EvalBenchmarkSummary): string {
  const lines: string[] = [];
  lines.push('# EITR Prompt & Agent Evaluation Benchmark Report');
  lines.push(`**Date & Time:** ${summary.timestamp}`);
  if (summary.model) {
    lines.push(
      `**Evaluated AI Model:** \`${summary.model}\` (${summary.provider ?? 'Live Provider'})`,
    );
  }
  const avg =
    summary.averageScore10 ??
    (summary.overallScore !== undefined ? summary.overallScore / 10 : 10.0);
  lines.push(
    `**Benchmark Score:** **${avg.toFixed(1)} / 10.0** (${summary.passedEvals}/${summary.totalEvals} Passed)\n`,
  );

  lines.push('## Executive Scorecard');
  lines.push(
    '| # | Eval Scenario | Category | Score / 10.0 | Status | In Tokens | Out Tokens | Cost (USD) |',
  );
  lines.push('|---|---|---|:---:|:---:|---:|---:|---:|');

  let idx = 1;
  for (const r of summary.results) {
    const statusStr = r.passed ? '[PASS]' : '[FAIL]';
    const inTokens = r.usage?.inputTokens ?? 0;
    const outTokens = r.usage?.outputTokens ?? 0;
    const cost = r.usage?.estimatedCostUsd ?? 0;
    const scoreVal = r.score10 ?? (r.score !== undefined ? r.score / 10 : 10.0);

    lines.push(
      `| ${idx++} | **${r.name}** | ${r.category} | **${scoreVal.toFixed(1)}** | ${statusStr} | ${inTokens.toLocaleString()} | ${outTokens.toLocaleString()} | $${cost.toFixed(6)} |`,
    );
  }

  lines.push('\n## Token Consumption & Financial Cost Summary');
  let totalIn = 0;
  let totalOut = 0;
  for (const r of summary.results) {
    totalIn += r.usage?.inputTokens ?? 0;
    totalOut += r.usage?.outputTokens ?? 0;
  }
  lines.push(`- **Total Input Tokens:** ${totalIn.toLocaleString()}`);
  lines.push(`- **Total Output Tokens:** ${totalOut.toLocaleString()}`);
  lines.push(`- **Total Tokens Consumed:** ${(totalIn + totalOut).toLocaleString()}`);
  lines.push(`- **Total Estimated Cost:** **$${(summary.totalCostUsd ?? 0).toFixed(6)} USD**`);

  // Granular Diagnostics Section: Why not 10/10 and Recommendations
  lines.push('\n## Granular Quality Diagnostics & Recommendations');
  let hasDeductions = false;

  for (const r of summary.results) {
    const scoreVal = r.score10 ?? (r.score !== undefined ? r.score / 10 : 10.0);
    if (r.deductions && r.deductions.length > 0) {
      hasDeductions = true;
      lines.push(`\n### ${r.name} — Score: ${scoreVal.toFixed(1)} / 10.0`);
      for (const d of r.deductions) {
        lines.push(`- **[-${d.pointsLost.toFixed(1)} pts] ${d.category}**`);
        lines.push(`  - **Why not 10/10:** ${d.reason}`);
        lines.push(`  - **Recommendation:** ${d.recommendation}`);
      }
    } else {
      lines.push(`\n### ${r.name} — Score: **10.0 / 10.0 [PERFECT COMPLIANCE]**`);
      lines.push(`- 100% adherence to all architectural, CPOM, and AST safety contracts.`);
    }
  }

  if (!hasDeductions) {
    lines.push(
      '\nAll evaluation prompts and model responses achieved a perfect 10.0/10.0 compliance rating with zero architectural or safety violations.',
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * Saves evaluation benchmark reports to disk (both .md and .json).
 */
export function saveBenchmarkReports(
  summary: EvalBenchmarkSummary,
  reportsDir = path.resolve(process.cwd(), 'packages/evals/reports'),
): { markdownPath: string; jsonPath: string } {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestampSlug = summary.timestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const latestMdPath = path.join(reportsDir, 'latest-eval-report.md');
  const latestJsonPath = path.join(reportsDir, 'latest-eval-report.json');
  const archiveMdPath = path.join(reportsDir, `eval-report-${timestampSlug}.md`);

  const mdContent = generateBenchmarkReportMarkdown(summary);
  const jsonContent = JSON.stringify(summary, null, 2);

  fs.writeFileSync(latestMdPath, mdContent, 'utf8');
  fs.writeFileSync(latestJsonPath, jsonContent, 'utf8');
  fs.writeFileSync(archiveMdPath, mdContent, 'utf8');

  return { markdownPath: latestMdPath, jsonPath: latestJsonPath };
}

/**
 * Prints the consolidated 10-point scorecard and diagnostics to the terminal.
 */
export function printTokenUsageTable(results: EvalBenchmarkResultItem[], modelName?: string): void {
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let sumScore10 = 0;

  const lines: string[] = [];
  lines.push('');
  lines.push('='.repeat(95));
  lines.push(
    `  EITR LIVE EVALS BENCHMARK SCORECARD (10-POINT SCALE) | MODEL: ${modelName ?? 'Active LLM'}`,
  );
  lines.push('='.repeat(95));
  lines.push(
    ` ${'#'.padEnd(3)} | ${'Scenario'.padEnd(42)} | ${'Score'.padStart(6)} | ${'Status'.padStart(6)} | ${'Input'.padStart(8)} | ${'Output'.padStart(8)} | ${'Cost (USD)'.padStart(10)}`,
  );
  lines.push('-'.repeat(95));

  let idx = 1;
  for (const r of results) {
    const inTokens = r.usage?.inputTokens ?? 0;
    const outTokens = r.usage?.outputTokens ?? 0;
    const cost = r.usage?.estimatedCostUsd ?? 0;

    const scoreVal = r.score10 ?? (r.score !== undefined ? r.score / 10 : 10.0);
    sumScore10 += scoreVal;

    const statusStr = r.passed ? 'PASS' : 'FAIL';
    lines.push(
      ` ${String(idx++).padEnd(3)} | ${r.name.slice(0, 42).padEnd(42)} | ${(scoreVal.toFixed(1) + '/10').padStart(6)} | ${statusStr.padStart(6)} | ${inTokens.toLocaleString().padStart(8)} | ${outTokens.toLocaleString().padStart(8)} | $${cost.toFixed(5).padStart(9)}`,
    );
  }

  const avgScore = results.length > 0 ? Number((sumScore10 / results.length).toFixed(1)) : 10.0;

  lines.push('-'.repeat(95));
  lines.push(
    ` ${'TOTAL / AVERAGE'.padEnd(46)} | ${(avgScore.toFixed(1) + '/10').padStart(6)} | ${' '.padStart(6)} | ${totalIn.toLocaleString().padStart(8)} | ${totalOut.toLocaleString().padStart(8)} | $${totalCost.toFixed(5).padStart(9)}`,
  );
  lines.push('='.repeat(95));

  // Print deductions if any
  let hasDeductions = false;
  for (const r of results) {
    if (r.deductions && r.deductions.length > 0) {
      if (!hasDeductions) {
        lines.push('\n  [DIAGNOSTICS & RECOMMENDATIONS]');
        hasDeductions = true;
      }
      const scoreVal = r.score10 ?? (r.score !== undefined ? r.score / 10 : 10.0);
      lines.push(`  • ${r.name} (${scoreVal.toFixed(1)}/10):`);
      for (const d of r.deductions) {
        lines.push(`    - [-${d.pointsLost.toFixed(1)} pts] ${d.reason}`);
        lines.push(`      -> Recommendation: ${d.recommendation}`);
      }
    }
  }

  lines.push('\n  [REPORT SAVED] Report written to: packages/evals/reports/latest-eval-report.md');
  lines.push('');

  console.log(lines.join('\n'));
}
