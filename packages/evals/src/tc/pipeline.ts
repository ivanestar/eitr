// Running the stage's own deterministic scripts over an analysis: the two gates, the generator, the
// assistant's check, the review and what /design-test-cases makes of the result. Every step is the
// project's own script, so what the suite measures is what a person would get.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface StepResult {
  ok: boolean;
  status: number | null;
  json: any;
  stdout: string;
  stderr: string;
}

export function runScript(dir: string, script: string, args: string[] = []): Promise<StepResult> {
  return new Promise((done) => {
    const child = spawn('node', [join('scripts', script), ...args], { cwd: dir });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => {
      let json: any = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = null;
      }
      done({ ok: status === 0, status, json, stdout, stderr });
    });
  });
}

export const CONDITIONS_PATH = 'artifacts/analysis/test-conditions.json';

export function readConditions(dir: string): any {
  return JSON.parse(readFileSync(join(dir, CONDITIONS_PATH), 'utf8'));
}

export function writeConditions(dir: string, data: unknown) {
  writeFileSync(join(dir, CONDITIONS_PATH), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export interface Gate {
  status: string;
  errors: string[];
  warnings: string[];
}

export interface PipelineRun {
  gate1: Gate;
  generated: boolean;
  gate2: Gate | null;
  assistantCheck: { kept: number; cut: number; pending: number } | null;
  review: { summary: string; report: string; markdown: string; entryCount: number } | null;
  compose: { journeys: number } | null;
  journeysGate: Gate | null;
  // The analysis as it stood after generation - what the graders score.
  analysis: any;
}

function gateOf(step: StepResult): Gate {
  const json = step.json || {};
  return {
    status: String(json.status || (step.ok ? 'PASSED' : 'FAILED')),
    errors: Array.isArray(json.errors) ? json.errors : [],
    warnings: Array.isArray(json.warnings) ? json.warnings : [],
  };
}

// The whole chain, stopping where a real run would stop: a failed gate is the answer, not a step to
// push past.
export async function runPipeline(
  dir: string,
  opts: { throughReview?: boolean } = {},
): Promise<PipelineRun> {
  const out: PipelineRun = {
    gate1: gateOf(await runScript(dir, 'validate-test-conditions.mjs', ['--stage=parameters'])),
    generated: false,
    gate2: null,
    assistantCheck: null,
    review: null,
    compose: null,
    journeysGate: null,
    analysis: null,
  };
  if (out.gate1.status !== 'PASSED') return out;
  const generated = await runScript(dir, 'generate-test-conditions.mjs');
  out.generated = generated.ok && Boolean(generated.json && generated.json.status === 'GENERATED');
  if (!out.generated) return out;
  out.gate2 = gateOf(await runScript(dir, 'validate-test-conditions.mjs'));
  out.analysis = readConditions(dir);
  if (out.gate2.status !== 'PASSED' || !opts.throughReview) return out;
  const list = (await runScript(dir, 'assistant-check.mjs', ['list'])).json;
  const keep: Array<{ route: string; id: string }> = [];
  for (const page of (list && list.pages) || [])
    for (const c of page.conditions || []) keep.push({ route: page.routeId, id: c.id });
  writeFileSync(join(dir, 'decisions.json'), JSON.stringify({ keep, cut: [] }), 'utf8');
  const recorded = (
    await runScript(dir, 'assistant-check.mjs', ['record', '--file=decisions.json'])
  ).json;
  out.assistantCheck = recorded
    ? { kept: recorded.kept || 0, cut: recorded.cut || 0, pending: recorded.pending || 0 }
    : null;
  const rendered = (
    await runScript(dir, 'render-review-artifact.mjs', [
      '--kind=test-conditions',
      '--discard-edits',
    ])
  ).json;
  if (rendered) {
    const file = join(dir, 'artifacts/review/test-conditions-review.md');
    const markdown = rendered.markdown || (existsSync(file) ? readFileSync(file, 'utf8') : '');
    out.review = {
      summary: rendered.summary || '',
      report: rendered.report || '',
      markdown,
      entryCount: rendered.entryCount || 0,
    };
  }
  // What the next stage makes of it: approved the way a person approving the file would, then the
  // journeys composed from what they approved.
  const data = readConditions(dir);
  for (const entry of Object.values<any>(data.routes)) {
    for (const condition of entry.conditions || []) {
      if (condition.cut === true) continue;
      condition.reviewed = true;
      condition.reviewedBy = condition.reviewer === 'assistant' ? 'assistant' : 'human';
      condition.isSpeculative = false;
    }
  }
  writeConditions(dir, data);
  const composed = (await runScript(dir, 'compose-journeys.mjs')).json;
  out.compose = composed ? { journeys: composed.journeys || 0 } : null;
  out.journeysGate = gateOf(await runScript(dir, 'validate-journeys.mjs', ['--stage=structural']));
  writeConditions(dir, out.analysis);
  return out;
}
