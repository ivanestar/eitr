import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderGroundZeroQuestions } from '../src/plan/templates/ground-zero-questions.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

type Status = {
  authNextStep?: string | null;
  rolesMissingSession?: string[];
  stage?: string | null;
};
type Option = { id: string; label: string; recommended?: boolean };
type Result = {
  status: 'ASK' | 'DONE' | 'FAILED';
  phase?: string;
  question?: { id: string; text: string; options: Option[]; allowsFreeText: boolean };
  plan?: Record<string, unknown>;
  errors?: string[];
};

const READY: Status = {
  authNextStep: 'session-exists',
  rolesMissingSession: [],
  stage: 'not-started',
};

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-ground-zero-questions-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'ground-zero-questions.mjs'),
    renderGroundZeroQuestions(),
    'utf8',
  );
  return dir;
}

function ask(dir: string, phase: string, answers: Record<string, string>, status: Status): Result {
  const result = spawnSync(
    'node',
    [
      join('scripts', 'ground-zero-questions.mjs'),
      '--phase=' + phase,
      '--answers=' + JSON.stringify(answers),
      '--status=' + JSON.stringify(status),
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  return JSON.parse(result.stdout);
}

describe('scripts/ground-zero-questions.mjs (real execution)', () => {
  it('asks the run mode first, with Guided recommended', () => {
    const dir = setupProject();
    try {
      const first = ask(dir, 'preflight', {}, READY);
      expect(first.question!.id).toBe('mode');
      expect(first.question!.options.map((o) => o.id)).toEqual(['guided', 'auto-pilot']);
      expect(first.question!.options.find((o) => o.recommended)!.id).toBe('guided');

      const done = ask(dir, 'preflight', { mode: 'auto-pilot' }, READY);
      expect(done.status).toBe('DONE');
      expect(done.plan).toMatchObject({
        mode: 'auto-pilot',
        reviewedBy: 'auto-pilot',
        captureMissingRoles: false,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks about declared roles with no session, naming them, and only then', () => {
    const dir = setupProject();
    try {
      const missing = {
        ...READY,
        authNextStep: 'roles-incomplete',
        rolesMissingSession: ['admin'],
      };
      const asked = ask(dir, 'preflight', { mode: 'guided' }, missing);
      expect(asked.question!.id).toBe('missing-roles');
      expect(asked.question!.text).toContain('admin');
      expect(asked.question!.options.map((o) => o.id)).toEqual(['capture-now', 'continue-without']);
      expect(
        ask(dir, 'preflight', { mode: 'guided', 'missing-roles': 'capture-now' }, missing).plan,
      ).toMatchObject({
        captureMissingRoles: true,
        rolesMissingSession: ['admin'],
      });

      expect(ask(dir, 'preflight', { mode: 'guided' }, READY).status).toBe('DONE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offers the same four choices at every reviewed stage, naming the command that comes next', () => {
    const dir = setupProject();
    try {
      for (const [stage, next] of [
        ['site-map-pending-review', '/map-features'],
        ['feature-map-reviewed', '/define-test-conditions'],
        ['test-conditions-pending-review', '/design-test-cases'],
      ]) {
        const gate = ask(dir, 'gate', {}, { ...READY, stage });
        expect(gate.question!.id).toBe('stage-gate');
        expect(gate.question!.options.map((o) => o.id)).toEqual([
          'approve-continue',
          'approve-pause',
          'reject',
          'stop',
        ]);
        expect(gate.question!.options[0]).toMatchObject({
          label: 'Approve and continue to ' + next,
          recommended: true,
        });
        expect(
          ask(dir, 'gate', { 'stage-gate': 'approve-continue' }, { ...READY, stage }).plan,
        ).toMatchObject({
          approve: true,
          continueTo: next,
          rework: false,
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks only whether to go on after the drafted test cases, and nothing where there is no gate', () => {
    const dir = setupProject();
    try {
      const drafted = ask(dir, 'gate', {}, { ...READY, stage: 'test-cases-drafted' });
      expect(drafted.question!.options.map((o) => o.id)).toEqual(['continue', 'pause']);
      expect(
        ask(dir, 'gate', { 'stage-gate': 'continue' }, { ...READY, stage: 'test-cases-drafted' })
          .plan,
      ).toMatchObject({
        approve: false,
        continueTo: '/automate-test',
      });

      for (const stage of ['not-started', 'test-closure']) {
        const none = ask(dir, 'gate', {}, { ...READY, stage });
        expect(none.status).toBe('DONE');
        expect(none.plan!.gate).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an answer that is not one of the options rather than recording it', () => {
    const dir = setupProject();
    try {
      const wrong = ask(
        dir,
        'gate',
        { 'stage-gate': 'continue' },
        { ...READY, stage: 'site-map-pending-review' },
      );
      expect(wrong.status).toBe('FAILED');
      expect(wrong.errors!.join(' ')).toContain('not one of its options');
      expect(ask(dir, 'preflight', { mode: 'fast' }, READY).status).toBe('FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the real state from the status scripts when nothing is injected', () => {
    const dir = setupProject();
    try {
      writeFileSync(
        join(dir, 'scripts', 'pipeline-status.mjs'),
        "process.stdout.write(JSON.stringify({ stage: 'feature-map-pending-review' }));",
        'utf8',
      );
      const result = spawnSync(
        'node',
        [join('scripts', 'ground-zero-questions.mjs'), '--phase=gate'],
        {
          cwd: dir,
          encoding: 'utf8',
        },
      );
      const gate = JSON.parse(result.stdout) as Result;
      expect(gate.question!.options[0].label).toBe(
        'Approve and continue to /define-test-conditions',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the questions are wired into what gets generated', () => {
  it('emits scripts/ground-zero-questions.mjs, and /ground-zero-setup drives its questions with it', () => {
    const paths = plan(muiProfile(), planOptions()).files.map((f) => f.path);
    expect(paths).toContain('scripts/ground-zero-questions.mjs');

    const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const text = (
      skills.find((s) => s.path.includes('/ground-zero-setup/'))!.source as {
        kind: 'inline';
        text: string;
      }
    ).text;
    expect(text).toContain('ground-zero-questions.mjs --phase=preflight');
    expect(text).toContain('ground-zero-questions.mjs --phase=gate');
  });
});
