// The judgements code cannot make: whether a condition would actually catch the defect seeded into
// the page, and whether the result it expects is the right one for the input it names. A model does
// them, one binary question at a time, from a different family than the assistant under evaluation -
// a model judging its own output rates it too kindly. Every judgement is written down with what it
// was shown, so a person can label a sample of them and the judge can be checked against that.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PreparedDataset } from './project.js';
import type { GradeItem } from './graders.js';

export interface JudgeOptions {
  runner?: 'agy' | 'claude';
  model?: string;
  // Where each judgement is written, for calibration against a person's own labels.
  recordDir: string;
  timeoutMinutes?: number;
}

interface JudgeAnswer {
  catching: string[];
  why: string;
}

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    catching: {
      type: 'array',
      items: { type: 'string' },
      description: 'ids of the conditions that would fail on the described defect',
    },
    why: { type: 'string' },
  },
  required: ['catching', 'why'],
});

function ask(prompt: string, opts: JudgeOptions): Promise<string> {
  const runner = opts.runner ?? 'agy';
  const model = opts.model ?? 'claude-sonnet-4-6';
  const args =
    runner === 'agy'
      ? [
          '-p',
          prompt,
          '--model',
          model,
          '--effort',
          'medium',
          '--output-format',
          'json',
          '--json-schema',
          SCHEMA,
          '--print-timeout',
          (opts.timeoutMinutes ?? 10) + 'm',
          '--disable-slash-commands',
        ]
      : ['-p', prompt, '--model', model, '--output-format', 'json'];
  return new Promise((done) => {
    // No shell: the prompt is one argument, and a shell would split it on the first space.
    const viaCmd = process.platform === 'win32' && runner !== 'agy';
    const child = viaCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', runner, ...args])
      : spawn(runner, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), (opts.timeoutMinutes ?? 10) * 60000);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', () => {
      clearTimeout(timer);
      done(stdout || stderr);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      done(String(e));
    });
  });
}

function parseAnswer(raw: string): JudgeAnswer | null {
  try {
    const outer = JSON.parse(raw);
    const text =
      typeof outer === 'object' && outer && 'response' in outer
        ? String((outer as any).response)
        : raw;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      catching: Array.isArray(parsed.catching) ? parsed.catching.map(String) : [],
      why: String(parsed.why || ''),
    };
  } catch {
    const match = raw.match(/\{[\s\S]*"catching"[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return {
        catching: Array.isArray(parsed.catching) ? parsed.catching.map(String) : [],
        why: String(parsed.why || ''),
      };
    } catch {
      return null;
    }
  }
}

// Does anything the analysis wrote actually catch what the page gets wrong?
export async function judgeDefects(
  prepared: PreparedDataset,
  analysis: any,
  opts: JudgeOptions,
): Promise<GradeItem[]> {
  const items: GradeItem[] = [];
  mkdirSync(opts.recordDir, { recursive: true });
  for (const route of prepared.routes.filter((r) => r.inFeature)) {
    const page = prepared.gold.pages.find((p) => p.path === route.path);
    const entry = analysis.routes ? analysis.routes[route.routeId] : null;
    if (!page || !entry || page.defects.length === 0) continue;
    const conditions = (entry.conditions || [])
      .filter((c: any) => c && c.cut !== true)
      .map((c: any) => ({
        id: String(c.conditionId),
        description: String(c.description || ''),
        expected: String(c.expectedOutcome || ''),
        input: String(c.sourceInput || ''),
      }));
    if (conditions.length === 0) continue;
    for (const defect of page.defects) {
      const prompt = [
        'You are checking a list of test conditions against one defect in a web page.',
        '',
        'The page: ' + page.title + ' - ' + page.archetype,
        'The defect: ' + defect.description,
        'What the page does: ' + defect.wrong,
        'What it should do: ' + defect.correct,
        'It happens when: ' + defect.trigger,
        '',
        'The test conditions, each with what it does and what it expects:',
        ...conditions.map(
          (c: any) =>
            '- ' +
            c.id +
            ': ' +
            c.description +
            (c.input ? ' | input: ' + c.input : '') +
            ' | expects: ' +
            c.expected,
        ),
        '',
        'A condition catches the defect when running it on this page would fail: it exercises the case the defect happens in AND expects the result the page should give, not the one it gives today.',
        'Answer with JSON only: {"catching": ["<ids of conditions that would fail>"], "why": "<one sentence>"}. An empty list is the right answer when none of them would.',
      ].join('\n');
      const raw = await ask(prompt, opts);
      const answer = parseAnswer(raw);
      const known = new Set(conditions.map((c: any) => c.id));
      const catching = (answer?.catching || []).filter((id) => known.has(id));
      const passed = catching.length > 0;
      items.push({
        grader: 'defect-judge',
        page: page.path,
        what: 'a condition would catch: ' + defect.description.slice(0, 70),
        passed,
        detail: catching.join(', ') || answer?.why?.slice(0, 160),
      });
      writeFileSync(
        join(
          opts.recordDir,
          prepared.spec.id + '-' + route.routeId.slice(0, 8) + '-' + defect.id + '.json',
        ),
        JSON.stringify(
          {
            dataset: prepared.spec.id,
            page: page.path,
            defect,
            conditions,
            prompt,
            raw: raw.slice(0, 4000),
            answer,
            verdict: passed,
          },
          null,
          1,
        ),
        'utf8',
      );
    }
  }
  return items;
}

// Fifty judgements a person marks agree/disagree with, and the agreement that comes back.
export function calibrationSheet(recordDir: string, limit = 50): string {
  if (!existsSync(recordDir)) return '';
  const files = readdirSync(recordDir)
    .filter((f) => f.endsWith('.json'))
    .slice(0, limit);
  const lines = [
    '# Judge calibration',
    '',
    'Each item below is one judgement the model made. Mark it yourself: put x in [ ] if you agree with the verdict.',
    'When you are done, save the file and say so - the agreement is computed from it.',
    '',
  ];
  for (const file of files) {
    const record = JSON.parse(readFileSync(join(recordDir, file), 'utf8'));
    lines.push('## ' + file.replace('.json', ''));
    lines.push('');
    lines.push('Defect: ' + record.defect.description);
    lines.push(
      'It happens when: ' +
        record.defect.trigger +
        '. The page does: ' +
        record.defect.wrong +
        '. It should: ' +
        record.defect.correct,
    );
    lines.push('');
    lines.push('Conditions:');
    for (const condition of record.conditions)
      lines.push(
        '- ' + condition.id + ': ' + condition.description + ' | expects: ' + condition.expected,
      );
    lines.push('');
    lines.push(
      'The judge says: ' +
        (record.verdict
          ? 'caught by ' + (record.answer?.catching || []).join(', ')
          : 'nothing here would catch it') +
        ' - ' +
        (record.answer?.why || ''),
    );
    lines.push('');
    lines.push('- [ ] I agree with this verdict');
    lines.push('');
  }
  return lines.join('\n');
}
