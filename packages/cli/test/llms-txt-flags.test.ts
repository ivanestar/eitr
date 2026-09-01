// Drift guard: llms.txt ships an example `eitr new` command for headless/agent use. That example
// went stale once already (it referenced --url/--lang/--ci, none of which exist; the real flags
// are --start-url/--language/--ci-cd) and nothing caught it. This test makes the check
// deterministic instead of relying on a human/agent remembering to re-verify it by hand.
import { describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNew } from '../src/commands/new.js';
import { QUESTIONS, type QuestionId } from '../src/questionnaire/schema.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function choicesFor(id: QuestionId): readonly string[] {
  const q = QUESTIONS.find((question) => question.id === id);
  if (!q || q.kind === 'text') throw new Error(`question "${id}" has no choices`);
  return q.choices.map((c) => c.value);
}

async function captureNewHelp(): Promise<string> {
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    await runNew(['--help']);
    return spy.mock.calls.map((call) => String(call[0])).join('');
  } finally {
    spy.mockRestore();
  }
}

async function readLlmsTxt(): Promise<string> {
  return fs.readFile(path.join(repoRoot, 'llms.txt'), 'utf8');
}

describe('llms.txt example command stays in sync with the real CLI', () => {
  it('every --flag referenced in the llms.txt example exists in "eitr new --help"', async () => {
    const llmsTxt = await readLlmsTxt();
    const exampleMatch = /`npx @onlytests\/eitr new ([^`]+)`/.exec(llmsTxt);
    expect(
      exampleMatch,
      'llms.txt must contain a `npx @onlytests/eitr new ...` example',
    ).not.toBeNull();
    const flagsInExample = [...exampleMatch![1].matchAll(/--[a-z-]+/g)].map((m) => m[0]);
    expect(flagsInExample.length).toBeGreaterThan(0);

    const help = await captureNewHelp();
    const missing = flagsInExample.filter((flag) => !help.includes(flag));
    expect(
      missing,
      `llms.txt references flags "eitr new --help" doesn't list: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the --language values shown in llms.txt are all real language choices', async () => {
    const llmsTxt = await readLlmsTxt();
    const match = /--language <([^>]+)>/.exec(llmsTxt);
    expect(match, 'llms.txt must show a --language <a|b|...> value list').not.toBeNull();
    const listed = match![1].split('|');
    const real = choicesFor('language');
    const invalid = listed.filter((v) => !real.includes(v));
    expect(
      invalid,
      `llms.txt lists --language values that aren't real choices: ${invalid.join(', ')}`,
    ).toEqual([]);
  });

  it('the --ci-cd values shown in llms.txt are all real CI/CD choices', async () => {
    const llmsTxt = await readLlmsTxt();
    const match = /--ci-cd <([^>]+)>/.exec(llmsTxt);
    expect(match, 'llms.txt must show a --ci-cd <a|b|...> value list').not.toBeNull();
    const listed = match![1].split('|');
    const real = choicesFor('ciCd');
    const invalid = listed.filter((v) => !real.includes(v));
    expect(
      invalid,
      `llms.txt lists --ci-cd values that aren't real choices: ${invalid.join(', ')}`,
    ).toEqual([]);
  });
});
