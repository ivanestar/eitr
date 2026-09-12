// The paid half of the suite: the real skill, run by a real assistant, on a dataset it has never
// seen. Every trial gets its own copy of the project and its own run of the application, so trials
// never share state; what the assistant leaves in artifacts/analysis/test-conditions.json is what
// the graders score.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, trialCopy, REPO_ROOT, type PreparedDataset } from './project.js';
import { runScript } from './pipeline.js';
import { gradeAnalysis, passesCritically, type GradeResult } from './graders.js';

export const AGENT_PROMPT = [
  '/define-test-conditions',
  '',
  'This run is unattended - nobody is there to answer. Work through the skill to its Human Sign-Off Gateway and stop there:',
  '- answer the stage\'s own question about what a person already knows with "nothing";',
  '- never ask me anything: where the skill says only a person can settle something, write it into the analysis as a question and carry on;',
  '- approve nothing - leave every condition for the person, and stop once the review file is rendered.',
  'Web search is not available in this run. Use the research record already under artifacts/analysis/research when there is one; otherwise record research as skipped with that reason.',
].join('\n');

export interface AgentOptions {
  runner: 'agy' | 'claude';
  model: string;
  effort?: 'low' | 'medium' | 'high';
  timeoutMinutes?: number;
  outRoot: string;
}

export interface AgentRun {
  datasetId: string;
  trial: number;
  runner: string;
  model: string;
  ok: boolean;
  seconds: number;
  usage: Record<string, number> | null;
  error?: string | undefined;
  transcript: string;
  // What the assistant left behind.
  produced: boolean;
  gate: { status: string; errors: string[] } | null;
  review: { entryCount: number; summary: string } | null;
  grade: {
    byGrader: Record<string, { passed: number; total: number }>;
    failures: string[];
    critical: boolean;
  } | null;
  items: GradeResult['items'];
}

// An assistant CLI takes its workspace from the project it last had open, not from the folder it is
// started in: a first run of this suite attached to the repository and worked on a project there
// instead of on its own copy. Nothing runs now until the assistant has shown, in its own words, that
// the folder it is in is the copy - and a guard watches the world outside it while the batch runs.
export interface SandboxProof {
  ok: boolean;
  reported: string;
  detail: string;
}

export async function proveSandbox(dir: string, opts: AgentOptions): Promise<SandboxProof> {
  const token = 'marker-' + Math.random().toString(36).slice(2, 10);
  writeFileSync(join(dir, 'sandbox-marker.txt'), token, 'utf8');
  const prompt =
    'Answer with one line of JSON and nothing else: {"cwd": "<the absolute path of the folder you are working in>", "marker": "<the contents of sandbox-marker.txt in that folder>"}. Read no other file and write nothing.';
  const args =
    opts.runner === 'agy'
      ? [
          '-p',
          prompt,
          '--new-project',
          '--model',
          opts.model,
          '--dangerously-skip-permissions',
          '--output-format',
          'json',
          '--print-timeout',
          '5m',
          '--disable-slash-commands',
        ]
      : [
          '-p',
          prompt,
          '--model',
          opts.model,
          '--dangerously-skip-permissions',
          '--output-format',
          'json',
        ];
  const cli = await runCli(opts.runner, args, dir, 6 * 60000);
  const text = cli.stdout + ' ' + cli.stderr;
  const sawToken = text.includes(token);
  const sawOutside = /E:[\\/]PROJECTS[\\/]eitr(?![\\/]?["']?\s*$)/i.test(
    text.replace(/\\\\/g, '\\'),
  );
  return {
    ok: sawToken && !sawOutside,
    reported: text.slice(0, 600),
    detail: sawToken
      ? sawOutside
        ? 'it named a path outside its copy'
        : 'it read the marker in its own copy'
      : 'it never read the marker',
  };
}

// Anything outside the sandbox that must not change while a batch runs.
export function watchOutside(paths: string[]): () => string[] {
  const before = new Map<string, string>();
  const snapshot = (root: string) => {
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!existsSync(current)) continue;
      const stat = statSync(current);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(current)) {
          if (entry === 'node_modules' || entry === '.git') continue;
          stack.push(join(current, entry));
        }
      } else {
        before.set(current, String(stat.mtimeMs));
      }
    }
  };
  for (const path of paths) snapshot(path);
  return () => {
    const changed: string[] = [];
    const after = new Map(before);
    before.clear();
    for (const path of paths) snapshot(path);
    for (const [file, mtime] of before) if (after.get(file) !== mtime) changed.push(file);
    for (const file of after.keys()) if (!before.has(file)) changed.push(file + ' (gone)');
    return changed;
  };
}

// No shell: a prompt is one argument, and a shell would split it on the first space. Claude Code
// ships as a .cmd shim on Windows, which needs cmd.exe to start it - agy is an executable and does
// not.
function runCli(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((done) => {
    const viaCmd = process.platform === 'win32' && command !== 'agy';
    const child = viaCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd })
      : spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr, timedOut });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ code: null, stdout, stderr: stderr + String(e), timedOut });
    });
  });
}

export async function runAgentTrial(
  prepared: PreparedDataset,
  trial: number,
  opts: AgentOptions,
): Promise<AgentRun> {
  const started = Date.now();
  const runDir = join(opts.outRoot, prepared.spec.id + '-t' + trial);
  trialCopy(prepared, runDir);
  const server = await serve(prepared.files, prepared.port);
  const timeoutMs = (opts.timeoutMinutes ?? 60) * 60000;
  let cli: { code: number | null; stdout: string; stderr: string; timedOut: boolean };
  try {
    const args =
      opts.runner === 'agy'
        ? [
            '-p',
            AGENT_PROMPT,
            '--new-project',
            '--model',
            opts.model,
            '--effort',
            opts.effort ?? 'high',
            '--dangerously-skip-permissions',
            '--output-format',
            'json',
            '--print-timeout',
            (opts.timeoutMinutes ?? 60) + 'm',
          ]
        : [
            '-p',
            AGENT_PROMPT,
            '--model',
            opts.model,
            '--dangerously-skip-permissions',
            '--output-format',
            'json',
          ];
    cli = await runCli(opts.runner, args, runDir, timeoutMs);
  } finally {
    server.close();
  }
  const transcript = join(runDir, 'agent-run.json');
  writeFileSync(
    transcript,
    JSON.stringify(
      {
        stdout: cli.stdout,
        stderr: cli.stderr.slice(0, 20000),
        code: cli.code,
        timedOut: cli.timedOut,
      },
      null,
      2,
    ),
    'utf8',
  );
  let usage: Record<string, number> | null = null;
  try {
    const parsed = JSON.parse(cli.stdout);
    usage =
      parsed.usage ||
      (parsed.total_cost_usd !== undefined
        ? { costUsd: parsed.total_cost_usd, ...(parsed.usage || {}) }
        : null);
  } catch {
    usage = null;
  }
  const run: AgentRun = {
    datasetId: prepared.spec.id,
    trial,
    runner: opts.runner,
    model: opts.model,
    ok: cli.code === 0 && !cli.timedOut,
    seconds: Math.round((Date.now() - started) / 1000),
    usage,
    error: cli.timedOut
      ? 'timed out'
      : cli.code === 0
        ? undefined
        : 'exit ' + cli.code + ' ' + cli.stderr.slice(0, 300),
    transcript,
    produced: false,
    gate: null,
    review: null,
    grade: null,
    items: [],
  };
  const conditionsPath = join(runDir, 'artifacts/analysis/test-conditions.json');
  if (!existsSync(conditionsPath)) return run;
  let analysis: any = null;
  try {
    analysis = JSON.parse(readFileSync(conditionsPath, 'utf8'));
  } catch {
    run.error = (run.error ? run.error + '; ' : '') + 'the analysis it left is not valid JSON';
    return run;
  }
  run.produced = true;
  const gate = await runScript(runDir, 'validate-test-conditions.mjs');
  run.gate = {
    status: gate.json ? String(gate.json.status) : 'ERROR',
    errors: gate.json && Array.isArray(gate.json.errors) ? gate.json.errors.slice(0, 20) : [],
  };
  const rendered = (
    await runScript(runDir, 'render-review-artifact.mjs', [
      '--kind=test-conditions',
      '--discard-edits',
    ])
  ).json;
  if (rendered)
    run.review = { entryCount: rendered.entryCount || 0, summary: rendered.summary || '' };
  // The dataset directory the graders read from is the prepared one; the trial's own copy carries
  // the same inventories, so grading against the prepared dataset is grading against this run.
  const graded = gradeAnalysis(prepared, analysis);
  run.items = graded.items;
  run.grade = {
    byGrader: graded.byGrader,
    failures: graded.items
      .filter((i) => !i.passed)
      .map((i) => i.grader + ': ' + i.what + (i.detail ? ' (' + i.detail + ')' : '')),
    critical: passesCritically(graded),
  };
  return run;
}

export async function runAgentBatch(
  prepared: PreparedDataset[],
  opts: AgentOptions & {
    trials?: number;
    concurrency?: number;
    onRun?: (run: AgentRun) => void;
    watch?: string[];
    skipProof?: boolean;
  },
): Promise<AgentRun[]> {
  mkdirSync(opts.outRoot, { recursive: true });
  // Nothing outside the copies may change while the batch runs; the first thing that does stops it.
  const guard = watchOutside(opts.watch ?? [REPO_ROOT]);
  if (!opts.skipProof) {
    const proofDir = trialCopy(prepared[0], join(opts.outRoot, '_sandbox-proof'));
    const proof = await proveSandbox(proofDir, opts);
    writeFileSync(join(opts.outRoot, 'sandbox-proof.json'), JSON.stringify(proof, null, 1), 'utf8');
    if (!proof.ok)
      throw new Error(
        'the assistant did not show it is confined to its own copy (' +
          proof.detail +
          '): ' +
          proof.reported.slice(0, 300),
      );
    const strayed = guard();
    if (strayed.length > 0)
      throw new Error(
        'the proof run changed files outside the copy: ' + strayed.slice(0, 5).join(', '),
      );
  }
  const trials = opts.trials ?? 1;
  const queue = prepared.slice();
  const runs: AgentRun[] = [];
  const workers = Math.max(1, Math.min(opts.concurrency ?? 2, queue.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const dataset = queue.shift();
        if (!dataset) return;
        // Trials of one dataset run one after another: they share the port its application is on.
        for (let trial = 1; trial <= trials; trial++) {
          const run = await runAgentTrial(dataset, trial, opts);
          const strayed = guard();
          if (strayed.length > 0) {
            run.error =
              (run.error ? run.error + '; ' : '') +
              'it changed files outside its copy: ' +
              strayed.slice(0, 5).join(', ');
            runs.push(run);
            writeFileSync(join(opts.outRoot, 'runs.json'), JSON.stringify(runs, null, 1), 'utf8');
            throw new Error(
              'a run reached outside its copy - batch stopped: ' + strayed.slice(0, 5).join(', '),
            );
          }
          runs.push(run);
          opts.onRun?.(run);
          // Written as each run finishes, so a batch that dies keeps what it earned.
          writeFileSync(join(opts.outRoot, 'runs.json'), JSON.stringify(runs, null, 1), 'utf8');
        }
      }
    }),
  );
  return runs;
}
