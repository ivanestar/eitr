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

const VALUE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    right: { type: 'boolean', description: 'whether the result it expects follows from its input' },
    why: { type: 'string' },
  },
  required: ['right', 'why'],
});

function ask(prompt: string, opts: JudgeOptions, schema: string = SCHEMA): Promise<string> {
  const runner = opts.runner ?? 'agy';
  const model = opts.model ?? 'claude-sonnet-4-6';
  const args =
    runner === 'agy'
      ? [
          '-p',
          prompt,
          '--model',
          model,
          // Only the models that reason at a level take the flag; the rest refuse to start with it.
          ...(/^gemini/i.test(model) ? ['--effort', 'medium'] : []),
          '--output-format',
          'json',
          '--json-schema',
          schema,
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

// The first complete object in a text. An answer often arrives twice - once in a fenced block, once
// as the runner's own copy - so reading to the last brace parses neither.
function firstObject(text: string): any | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// What the assistant answered, whatever shape its runner wrapped it in.
function answerObject(raw: string): any | null {
  let outer: any = null;
  try {
    outer = JSON.parse(raw);
  } catch {
    return firstObject(raw);
  }
  if (outer && typeof outer === 'object') {
    if (outer.structured_output && typeof outer.structured_output === 'object')
      return outer.structured_output;
    if ('response' in outer) return firstObject(String(outer.response));
  }
  return firstObject(raw);
}

function parseAnswer(raw: string): JudgeAnswer | null {
  const parsed = answerObject(raw);
  if (!parsed || !Array.isArray(parsed.catching)) return null;
  return { catching: parsed.catching.map(String), why: String(parsed.why || '') };
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
      const passed = answer !== null && catching.length > 0;
      items.push({
        grader: 'defect-judge',
        page: page.path,
        what: 'a condition would catch: ' + defect.description.slice(0, 70),
        passed,
        detail:
          answer === null
            ? 'the judge gave no answer: ' + raw.slice(0, 120)
            : catching.join(', ') || answer.why.slice(0, 160),
        unresolved: answer === null,
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

// The other judgement code cannot make: an analysis that works its main flow on an input of its own
// states a value the gold never names, and only arithmetic on the page's own behaviour says whether
// it is right. The gold's worked example is what the judge is given to reason from.
export async function judgeValues(
  prepared: PreparedDataset,
  items: GradeItem[],
  opts: JudgeOptions,
): Promise<void> {
  mkdirSync(opts.recordDir, { recursive: true });
  for (const item of items) {
    if (!item.deferred || !item.subject) continue;
    const page = prepared.gold.pages.find((p) => p.path === item.page);
    if (!page) continue;
    const inputs = Object.entries(page.mainFlow.inputs)
      .map(([testId, value]) => {
        const field = page.fields.find((f) => f.testId === testId);
        return (field ? field.label : testId) + ' = ' + value;
      })
      .join(', ');
    const prompt = [
      'You are checking one test condition against how a web page works.',
      '',
      'The page: ' + page.title + ' - ' + page.archetype,
      'What its fields mean: ' +
        page.fields.map((f) => f.label + ' (' + f.meaning + ')').join('; '),
      'A worked example of the page done right: with ' +
        inputs +
        ' the result is ' +
        page.mainFlow.expectTokens.join(', ') +
        '.',
      '',
      'The condition an analyst wrote:',
      item.subject.text,
      '',
      'Question: does the result this condition expects follow from the input it names, by the same rules the worked example follows? Ignore wording, spelling and rounding to a sensible number of places; only the value matters.',
      'Answer with JSON only: {"right": true|false, "why": "<one sentence>"}.',
    ].join('\n');
    const raw = await ask(prompt, opts, VALUE_SCHEMA);
    const parsed = answerObject(raw);
    const right = parsed && typeof parsed.right === 'boolean' ? parsed.right : null;
    const why = parsed ? String(parsed.why || '') : '';
    item.passed = right === true;
    item.deferred = false;
    item.unresolved = right === null;
    item.detail = (right === null ? 'the judge gave no answer: ' + raw.slice(0, 120) : why).slice(
      0,
      200,
    );
    writeFileSync(
      join(
        opts.recordDir,
        'value-' + prepared.spec.id + '-' + item.subject.conditionId.slice(0, 12) + '.json',
      ),
      JSON.stringify(
        { dataset: prepared.spec.id, page: item.page, prompt, raw: raw.slice(0, 4000), right, why },
        null,
        1,
      ),
      'utf8',
    );
  }
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
    if (!record.defect) {
      lines.push('Page: ' + record.page);
      lines.push('');
      lines.push(
        'The judge was asked whether the result one condition expects follows from its input, and says: ' +
          (record.right ? 'it does' : 'it does not') +
          ' - ' +
          (record.why || ''),
      );
      lines.push('');
      lines.push('- [ ] I agree with this verdict');
      lines.push('');
      continue;
    }
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
