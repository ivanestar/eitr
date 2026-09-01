import { describe, it, expect } from 'vitest';
import {
  validateStartUrl,
  validateOutputDir,
  validateAnswer,
} from '../src/questionnaire/validators.js';
import { QUESTIONS } from '../src/questionnaire/schema.js';

describe('validateStartUrl', () => {
  it('prepends https:// to a scheme-less host', () => {
    const r = validateStartUrl('app.example.com');
    expect(r).toEqual({ ok: true, value: 'https://app.example.com/' });
  });

  it('keeps an explicit http/https URL (normalized)', () => {
    expect(validateStartUrl('http://localhost:4173/login')).toEqual({
      ok: true,
      value: 'http://localhost:4173/login',
    });
    expect(validateStartUrl('https://x.io').ok).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(validateStartUrl('  https://x.io  ')).toEqual({ ok: true, value: 'https://x.io/' });
  });

  it('rejects an empty value', () => {
    expect(validateStartUrl('   ').ok).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateStartUrl('ftp://x.io').ok).toBe(false);
    expect(validateStartUrl('mailto:a@b.c').ok).toBe(false);
    expect(validateStartUrl('file:///etc/hosts').ok).toBe(false);
  });

  it('rejects a syntactically invalid URL', () => {
    expect(validateStartUrl('has a space').ok).toBe(false);
  });
});

describe('validateOutputDir', () => {
  it('defaults empty input to "."', () => {
    expect(validateOutputDir('')).toEqual({ ok: true, value: '.' });
    expect(validateOutputDir('   ')).toEqual({ ok: true, value: '.' });
  });

  it('trims and keeps a provided directory', () => {
    expect(validateOutputDir('  e2e/tests ')).toEqual({ ok: true, value: 'e2e/tests' });
  });

  it('rejects an absolute path', () => {
    expect(validateOutputDir('/etc').ok).toBe(false);
    expect(validateOutputDir('C:\\\\Windows').ok).toBe(false);
  });

  it('rejects a path that escapes the project via ".."', () => {
    expect(validateOutputDir('../sibling').ok).toBe(false);
    expect(validateOutputDir('e2e/../../up').ok).toBe(false);
  });
});

describe('validateAnswer choice validation', () => {
  const toolQuestion = QUESTIONS.find((q) => q.id === 'automationTool')!;

  it('allows tools supported by the chosen language', () => {
    const res = validateAnswer(toolQuestion, 'playwright', { language: 'python' });
    expect(res).toEqual({ ok: true, value: 'playwright' });
  });

  it('rejects tools not supported by the chosen language', () => {
    const res = validateAnswer(toolQuestion, 'playwright-gradle', { language: 'python' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('is not supported for language "python"');
    }
  });

  it('allows supported tools for TypeScript and Python', () => {
    expect(validateAnswer(toolQuestion, 'playwright', { language: 'typescript' }).ok).toBe(true);
    expect(validateAnswer(toolQuestion, 'playwright', { language: 'python' }).ok).toBe(true);
    expect(validateAnswer(toolQuestion, 'pytest', { language: 'python' }).ok).toBe(true);
  });

  it('rejects javascript as a language choice (removed in Track 11)', () => {
    const langQuestion = QUESTIONS.find((q) => q.id === 'language')!;
    const res = validateAnswer(langQuestion, 'javascript');
    expect(res.ok).toBe(false);
  });
});
