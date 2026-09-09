import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderMapFeaturesQuestions } from '../src/plan/templates/map-features-questions.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

type Status = {
  hasApplicationKind?: boolean;
  corePurposeCandidates?: Array<{ value: string }>;
  corePurposeSelected?: boolean;
};

type Option = { id: string; label: string; recommended?: boolean };
type Result = {
  status: 'ASK' | 'DONE' | 'FAILED';
  question?: { id: string; text: string; options: Option[]; allowsFreeText: boolean };
  plan?: Record<string, unknown>;
  errors?: string[];
};

const ANALYSED: Status = {
  hasApplicationKind: false,
  corePurposeCandidates: [{ value: 'A practice sandbox of isolated UI patterns.' }],
  corePurposeSelected: false,
};

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-map-features-questions-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'map-features-questions.mjs'),
    renderMapFeaturesQuestions(),
    'utf8',
  );
  return dir;
}

function ask(dir: string, answers: Record<string, string>, status: Status): Result {
  const result = spawnSync(
    'node',
    [
      join('scripts', 'map-features-questions.mjs'),
      '--answers=' + JSON.stringify(answers),
      '--status=' + JSON.stringify(status),
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  return JSON.parse(result.stdout);
}

// Walks the flow the way a skill does: ask, record the recommended (or first) option, ask again.
function walk(dir: string, answers: Record<string, string>, status: Status) {
  const asked: string[] = [];
  let current = { ...answers };
  for (let i = 0; i < 10; i++) {
    const result = ask(dir, current, status);
    if (result.status !== 'ASK') return { asked, final: result };
    asked.push(result.question!.id);
    const options = result.question!.options;
    const pick = options.find((o) => o.recommended) ?? options[0];
    current = { ...current, [result.question!.id]: pick.id };
  }
  throw new Error('question flow did not terminate');
}

describe('scripts/map-features-questions.mjs (real execution)', () => {
  it('asks what kind of application this is, once', () => {
    const dir = setupProject();
    try {
      const first = ask(dir, {}, ANALYSED);
      expect(first.question!.id).toBe('application-kind');
      expect(first.question!.options.map((o) => o.id)).toEqual([
        'production',
        'sandbox-demo',
        'internal-tool',
        'staging',
      ]);

      const already = walk(dir, {}, { ...ANALYSED, hasApplicationKind: true });
      expect(already.asked).not.toContain('application-kind');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A choice tool rejects a call carrying one option, and the analysis is deliberately told to
  // propose a single well-evidenced reading rather than pad the list.
  it('offers a real second option when the analysis produced exactly one candidate', () => {
    const dir = setupProject();
    try {
      const result = ask(dir, { 'application-kind': 'sandbox-demo' }, ANALYSED);
      expect(result.question!.id).toBe('core-purpose');
      expect(result.question!.options).toHaveLength(2);
      expect(result.question!.options[0].id).toBe('candidate:0');
      expect(result.question!.options[0].recommended).toBe(true);
      expect(result.question!.options[1].id).toBe('own-words');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never emits a single-option question, whatever the candidate count', () => {
    const dir = setupProject();
    try {
      for (const count of [1, 2, 3, 4]) {
        const candidates = Array.from({ length: count }, (_, i) => ({ value: `reading ${i}` }));
        const result = ask(
          dir,
          { 'application-kind': 'production' },
          { hasApplicationKind: false, corePurposeCandidates: candidates },
        );
        expect(result.question!.options.length, `${count} candidate(s)`).toBe(count + 1);
        expect(result.question!.options.filter((o) => o.recommended)).toHaveLength(1);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not ask about purpose before the analysis has proposed anything', () => {
    const dir = setupProject();
    try {
      const { asked, final } = walk(
        dir,
        {},
        { hasApplicationKind: true, corePurposeCandidates: [] },
      );
      expect(asked).not.toContain('core-purpose');
      expect(final.status).toBe('DONE');
      expect(final.plan!.purposeAsked).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stops asking once a purpose has been recorded', () => {
    const dir = setupProject();
    try {
      const { asked } = walk(
        dir,
        {},
        {
          hasApplicationKind: true,
          corePurposeCandidates: [{ value: 'x' }],
          corePurposeSelected: true,
        },
      );
      expect(asked).not.toContain('core-purpose');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says whether the recorded purpose carries its own evidence or is the human words', () => {
    const dir = setupProject();
    try {
      const picked = ask(
        dir,
        { 'application-kind': 'production', 'core-purpose': 'candidate:0' },
        ANALYSED,
      );
      expect(picked.status).toBe('DONE');
      expect(picked.plan!.corePurpose).toEqual({ source: 'observed', candidateIndex: 0 });

      const ownWords = ask(
        dir,
        { 'application-kind': 'production', 'core-purpose': 'own-words' },
        ANALYSED,
      );
      expect(ownWords.plan!.corePurpose).toEqual({ source: 'human', candidateIndex: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an answer that is not one of the options rather than recording it', () => {
    const dir = setupProject();
    try {
      const result = ask(dir, { 'application-kind': 'a-guess' }, ANALYSED);
      expect(result.status).toBe('FAILED');
      expect(result.errors!.join(' ')).toContain('not one of its options');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carries the application kind into the plan the skill acts on', () => {
    const dir = setupProject();
    try {
      const { final } = walk(dir, { 'application-kind': 'sandbox-demo' }, ANALYSED);
      expect(final.status).toBe('DONE');
      expect(final.plan!.applicationKind).toBe('sandbox-demo');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the questions are wired into what gets generated', () => {
  it('emits scripts/map-features-questions.mjs into the generated project', () => {
    const paths = plan(muiProfile(), planOptions()).files.map((f) => f.path);
    expect(paths).toContain('scripts/map-features-questions.mjs');
  });

  it('/map-features drives it, and /map-site no longer asks those questions', () => {
    const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const text = (name: string) =>
      (
        skills.find((s) => s.path.includes('/' + name + '/'))!.source as {
          kind: 'inline';
          text: string;
        }
      ).text;

    expect(text('map-features')).toContain('map-features-questions.mjs');
    expect(text('map-site')).not.toContain('application-kind');
    expect(text('map-site')).not.toContain('Core-Purpose');
  });
});
