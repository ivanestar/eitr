import { describe, it, expect } from 'vitest';
import { runQuestionnaire } from '../src/questionnaire/driver.js';
import { CANCELLED, NAV_LEFT } from '../src/questionnaire/io.js';
import { createFakeIo } from './io.fake.js';

// Stub that prevents real HTTP calls during unit tests
const noDetect = async () => ({});

const textIds = (io: ReturnType<typeof createFakeIo>): string[] =>
  io.calls.filter((c) => c.type === 'text').map((c) => c.id);

describe('runQuestionnaire — interactive', () => {
  it('happy path collects and reduces every answer, asking in order', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://app.example.com/login'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });

    expect(result).toEqual({
      status: 'ok',
      answers: {
        schemaVersion: 1,
        aiAssistants: [],
        startUrl: 'https://app.example.com/login',
        outputDir: 'PlaywrightTests',
        stackHints: {
          language: 'typescript',
          automationTool: 'playwright',
        },
      },
    });
    expect(fake.calls.map((c) => `${c.type}:${c.id}`)).toEqual([
      'text:startUrl',
      'select:language',
      'select:automationTool',
      'select:ciCd',
      'multiSelect:aiAssistants',
      'select:taskTracker',
      'multiSelect:tmsProviders',
      'select:review',
    ]);
  });

  it('persists taskTracker and tmsProviders when selected in questionnaire', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://app.example.com/login'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        taskTracker: ['jira'],
        review: ['submit'],
      },
      multiSelect: {
        tmsProviders: [['xray']],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.answers.taskTracker).toBe('jira');
      expect(result.answers.tmsProviders).toEqual(['xray']);
    }
  });

  it('left-arrow navigation glides past framework/uiLibrary (skipInteractive hints) instead of asking them', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://app.example.com/login'] },
      select: {
        language: ['typescript'],
        // First answer 'playwright' on the forward pass; a left-press from ciCd should glide
        // all the way back to this question (skipping framework/uiLibrary) and re-ask it once.
        automationTool: ['playwright', 'playwright'],
        // First call returns NAV_LEFT (triggers the back-glide); second call (after re-landing
        // on automationTool and walking forward again) actually answers it.
        ciCd: [NAV_LEFT, 'none'],
        taskTracker: ['none'],
        review: ['submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });

    expect(result.status).toBe('ok');
    const askedIds = fake.calls.map((c) => `${c.type}:${c.id}`);
    expect(askedIds).not.toContain('select:framework');
    expect(askedIds).not.toContain('select:uiLibrary');
    // automationTool must have been asked twice: once forward, once after the back-glide landed on it.
    expect(askedIds.filter((c) => c === 'select:automationTool')).toHaveLength(2);
  });

  it('re-asks the SAME question after an invalid URL, then accepts', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['nope not a url', 'https://ok.com'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });

    expect(result.status).toBe('ok');
    expect(textIds(fake).filter((id) => id === 'startUrl')).toHaveLength(1);
    expect(fake.notes.some((n) => /valid URL/i.test(n))).toBe(true);
    if (result.status === 'ok') expect(result.answers.startUrl).toBe('https://ok.com/');
  });

  it('edit updates the RIGHT field and submit uses the POST-edit value', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://a.com', 'https://b.com'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['edit:startUrl', 'submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.answers.startUrl).toBe('https://b.com/');
      expect(result.answers.outputDir).toBe('PlaywrightTests');
      expect(result.answers.stackHints).toEqual({
        language: 'typescript',
        automationTool: 'playwright',
      });
    }
    expect(JSON.stringify(result)).not.toContain('a.com');
  });

  it('supports multiple sequential edits before submit', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://a.com', 'https://b.com'] },
      select: {
        language: ['typescript', 'python'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['edit:startUrl', 'edit:language', 'submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.answers.startUrl).toBe('https://b.com/');
      expect(result.answers.stackHints?.language).toBe('python');
    }
  });

  it('cancels at the first prompt', async () => {
    const fake = createFakeIo({ text: { startUrl: [CANCELLED] } });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result).toEqual({ status: 'cancelled' });
    expect(fake.calls).toHaveLength(1);
  });

  it('cancels at the review menu', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://a.com'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: [CANCELLED],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result).toEqual({ status: 'cancelled' });
  });

  it('cancels mid-edit', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://a.com', CANCELLED] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['edit:startUrl'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result).toEqual({ status: 'cancelled' });
  });

  it('skips a validly prefilled question (one driver for both paths)', async () => {
    const fake = createFakeIo({
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: { startUrl: 'https://seed.io' },
      detect: noDetect,
    });
    expect(result.status).toBe('ok');
    expect(textIds(fake)).not.toContain('startUrl');
    if (result.status === 'ok') expect(result.answers.startUrl).toBe('https://seed.io/');
  });

  it('drops an invalid prefill and prompts for it instead', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://ok.com'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: { startUrl: 'ftp://bad' },
      detect: noDetect,
    });
    expect(result.status).toBe('ok');
    expect(textIds(fake)).toContain('startUrl');
  });
});

describe('runQuestionnaire — non-interactive', () => {
  it('takes valid flags with ZERO io calls', async () => {
    const fake = createFakeIo({});
    const result = await runQuestionnaire(fake.io, {
      mode: 'non-interactive',
      prefill: { startUrl: 'https://x.io', outputDir: 'e2e', uiLibrary: 'mui' },
    });
    expect(result).toEqual({
      status: 'ok',
      answers: {
        schemaVersion: 1,
        aiAssistants: [],
        startUrl: 'https://x.io/',
        outputDir: 'e2e',
        stackHints: {
          language: 'typescript',
          automationTool: 'playwright',
          uiLibrary: 'mui',
        },
      },
    });
    expect(fake.calls).toHaveLength(0);
    expect(fake.notes).toHaveLength(0);
  });

  it('defaults optional fields when only the required flag is given', async () => {
    const fake = createFakeIo({});
    const result = await runQuestionnaire(fake.io, {
      mode: 'non-interactive',
      prefill: { startUrl: 'https://x.io' },
    });
    expect(result).toEqual({
      status: 'ok',
      answers: {
        schemaVersion: 1,
        aiAssistants: [],
        startUrl: 'https://x.io/',
        outputDir: 'PlaywrightTests',
        stackHints: { language: 'typescript', automationTool: 'playwright' },
      },
    });
  });

  it('errors (no prompt) when the required flag is missing', async () => {
    const fake = createFakeIo({});
    const result = await runQuestionnaire(fake.io, { mode: 'non-interactive', prefill: {} });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('start-url');
    expect(fake.calls).toHaveLength(0);
  });

  it('errors on an invalid flag through the SAME validator', async () => {
    const fake = createFakeIo({});
    const result = await runQuestionnaire(fake.io, {
      mode: 'non-interactive',
      prefill: { startUrl: 'ftp://bad' },
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('start-url');
  });

  it('uses a derived output directory from the selected automation tool', async () => {
    const fake = createFakeIo({});
    const result = await runQuestionnaire(fake.io, {
      mode: 'non-interactive',
      prefill: { startUrl: 'https://x.io', language: 'java', automationTool: 'playwright-gradle' },
    });

    expect(result).toEqual({
      status: 'ok',
      answers: {
        schemaVersion: 1,
        aiAssistants: [],
        startUrl: 'https://x.io/',
        outputDir: 'PlaywrightJavaTests',
        stackHints: { language: 'java', automationTool: 'playwright-gradle' },
      },
    });
  });

  it('errors in non-interactive mode if language and automation tool are incompatible', async () => {
    const fake = createFakeIo({});
    const result = await runQuestionnaire(fake.io, {
      mode: 'non-interactive',
      prefill: {
        startUrl: 'https://x.io',
        language: 'python',
        automationTool: 'playwright-gradle',
      },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('is not supported for language "python"');
    }
  });
});

describe('runQuestionnaire — language and automation tool interactive filtering', () => {
  it('filters E2E automation tool choices based on the chosen language', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://app.com'] },
      select: {
        language: ['python'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
    });

    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result.status).toBe('ok');

    const automationToolCall = fake.calls.find((c) => c.id === 'automationTool');
    expect(automationToolCall).toBeDefined();
    expect(automationToolCall?.choices).toEqual(['playwright', 'pytest']);
  });

  it('resets incompatible E2E automation tool to playwright when language is edited to an incompatible one', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://app.com'] },
      select: {
        language: ['java', 'typescript'],
        automationTool: ['playwright-gradle'],
        ciCd: ['none'],
        review: ['edit:language', 'submit'],
      },
    });

    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // It should have reset from playwright-gradle to playwright because typescript does not support playwright-gradle.
      expect(result.answers.stackHints?.language).toBe('typescript');
      expect(result.answers.stackHints?.automationTool).toBe('playwright');
    }
    expect(fake.notes.some((n) => /resetting E2E automation tool to Playwright/i.test(n))).toBe(
      true,
    );
  });

  it('re-prompts after invalid URL and accepts valid one', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['has a space', 'https://valid.example.com'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.answers.startUrl).toBe('https://valid.example.com/');
    }
  });

  it('returns empty AI assistants by default and handles multiSelect selection', async () => {
    const fake = createFakeIo({
      text: { startUrl: ['https://app.example.com'] },
      select: {
        language: ['typescript'],
        automationTool: ['playwright'],
        ciCd: ['none'],
        review: ['submit'],
      },
      multiSelect: {
        aiAssistants: [['cursor', 'claude']],
      },
    });
    const result = await runQuestionnaire(fake.io, {
      mode: 'interactive',
      prefill: {},
      detect: noDetect,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.answers.aiAssistants).toEqual(['cursor', 'claude']);
    }
  });
});
