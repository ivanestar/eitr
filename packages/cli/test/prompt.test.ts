import { describe, it, expect } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { createPromptSession } from '../src/questionnaire/prompt.js';

// Drives the REAL line-based prompt session headlessly by piping newline-terminated answers
// through node's own readline — no TTY, no raw mode. This is the exact production code path.
function makeStreams(): { input: PassThrough; output: Writable; chunks: string[] } {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { input, output, chunks };
}

const CHOICES = [
  { label: 'Alpha', value: 'a' },
  { label: 'Bravo', value: 'b' },
  { label: 'Charlie', value: 'c' },
];

describe('prompt session — text', () => {
  it('returns the typed line trimmed', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.text({ message: 'URL' });
    input.write('  https://x.io  \n');
    await expect(p).resolves.toEqual({ cancelled: false, value: 'https://x.io' });
    s.close();
  });

  it('applies the default on empty input', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.text({ message: 'Dir', default: '.' });
    input.write('\n');
    await expect(p).resolves.toEqual({ cancelled: false, value: '.' });
    s.close();
  });

  it('cancels on EOF (closed stdin)', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.text({ message: 'URL' });
    input.end();
    await expect(p).resolves.toEqual({ cancelled: true });
  });

  it('preserves buffered piped lines across sequential prompts (regression)', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    // Both lines arrive in one chunk before either question is asked.
    input.write('first\nsecond\n');
    await expect(s.text({ message: 'One' })).resolves.toEqual({ cancelled: false, value: 'first' });
    await expect(s.text({ message: 'Two' })).resolves.toEqual({
      cancelled: false,
      value: 'second',
    });
    s.close();
  });
});

describe('prompt session — select (numbered)', () => {
  it('resolves the chosen option value by number', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES });
    input.write('2\n');
    await expect(p).resolves.toEqual({ cancelled: false, value: 'b' });
    s.close();
  });

  it('empty input selects the default (initialValue)', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES, initialValue: 'c' });
    input.write('\n');
    await expect(p).resolves.toEqual({ cancelled: false, value: 'c' });
    s.close();
  });

  it('re-asks on an out-of-range or non-numeric answer, then accepts', async () => {
    const { input, output, chunks } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES });
    input.write('99\n');
    input.write('nope\n');
    input.write('3\n');
    await expect(p).resolves.toEqual({ cancelled: false, value: 'c' });
    expect(chunks.join('')).toMatch(/between 1 and 3/);
    s.close();
  });

  it('renders the option list with a default marker', async () => {
    const { input, output, chunks } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES, initialValue: 'b' });
    input.write('1\n');
    await p;
    const text = chunks.join('');
    expect(text).toContain('Alpha');
    expect(text).toContain('Bravo');
    expect(text).toContain('(default)');
    s.close();
  });

  it('cancels on EOF', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES });
    input.end();
    await expect(p).resolves.toEqual({ cancelled: true });
  });

  it('resolves by text value or label case-insensitively', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES });
    input.write('bravo\n');
    await expect(p).resolves.toEqual({ cancelled: false, value: 'b' });
    s.close();
  });

  it('resolves by unique prefix case-insensitively', async () => {
    const { input, output } = makeStreams();
    const s = createPromptSession(input, output);
    const p = s.select({ message: 'Pick', choices: CHOICES });
    input.write('ch\n');
    await expect(p).resolves.toEqual({ cancelled: false, value: 'c' });
    s.close();
  });

  it('re-asks on ambiguous match, then accepts', async () => {
    const { input, output, chunks } = makeStreams();
    const s = createPromptSession(input, output);
    const customChoices = [
      { label: 'Apple', value: 'apple' },
      { label: 'Apricot', value: 'apricot' },
      { label: 'Banana', value: 'banana' },
    ];
    const p = s.select({ message: 'Pick', choices: customChoices });
    input.write('ap\n'); // ambiguous (Apple, Apricot)
    input.write('b\n'); // unique (Banana)
    await expect(p).resolves.toEqual({ cancelled: false, value: 'banana' });
    expect(chunks.join('')).toContain('Multiple choices matched');
    s.close();
  });
});
