import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAuthQuestions } from '../src/plan/templates/auth-questions.js';
import { renderAuthStatus } from '../src/plan/templates/auth-status.js';

type Status = {
  hasSession?: boolean;
  ciProvider?: string | null;
  rolesMissingSession?: string[];
};

type Result = {
  status: 'ASK' | 'STOP' | 'DONE' | 'FAILED';
  question?: {
    id: string;
    text: string;
    options: Array<{ id: string; label: string; recommended?: boolean }>;
    allowsFreeText: boolean;
    freeTextHint: string | null;
  };
  outcome?: { reason: string; message: string };
  plan?: {
    capture: boolean;
    roles: string[];
    roleLabels: Record<string, string>;
    envRoleStubs: boolean;
    wireCi: boolean;
    ciProvider: string | null;
    pushSecrets: boolean;
  };
  answered?: string[];
  errors?: string[];
};

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-auth-questions-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'auth-questions.mjs'), renderAuthQuestions(), 'utf8');
  writeFileSync(join(dir, 'scripts', 'auth-status.mjs'), renderAuthStatus(), 'utf8');
  return dir;
}

function ask(dir: string, answers: Record<string, string>, status?: Status): Result {
  const args = ['scripts/auth-questions.mjs', '--answers=' + JSON.stringify(answers)];
  if (status !== undefined) args.push('--status=' + JSON.stringify(status));
  const result = spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  return JSON.parse(result.stdout) as Result;
}

// The whole point of this file: walk the flow the way an assistant has to, one answer at a time,
// and assert what it is told to ask next. No model involved anywhere.
function walk(
  dir: string,
  replies: Record<string, string>,
  status: Status,
): { asked: string[]; final: Result } {
  const answers: Record<string, string> = {};
  const asked: string[] = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const result = ask(dir, answers, status);
    if (result.status !== 'ASK') return { asked, final: result };
    const id = result.question!.id;
    asked.push(id);
    if (!(id in replies)) {
      throw new Error('flow asked "' + id + '", which this walk has no reply for');
    }
    answers[id] = replies[id];
  }
  throw new Error('flow did not terminate');
}

const NO_CI: Status = { hasSession: false, ciProvider: null };
const WITH_CI: Status = { hasSession: false, ciProvider: 'github' };
const HAS_SESSION: Status = { hasSession: true, ciProvider: null };

// A structured choice tool needs at least two options and rejects a call carrying one - live
// observed as "each question requires at least 2 options, got 1", which killed a question before
// the human ever saw it. Every question this script emits is therefore either a real choice with
// two or more options, or an open question with none at all and allowsFreeText set. Exactly one
// option is the shape that has no valid way to be asked, so it must never be emitted.
describe('scripts/auth-questions.mjs - every emitted question is askable', () => {
  const STATUSES: Array<[string, Status]> = [
    ['no session, no CI', { hasSession: false, ciProvider: null }],
    ['no session, CI configured', { hasSession: false, ciProvider: 'github' }],
    ['session exists', { hasSession: true, ciProvider: 'github' }],
    [
      'roles declared but not captured',
      { hasSession: true, ciProvider: 'gitlab', rolesMissingSession: ['viewer'] },
    ],
  ];

  // Every question is reached by driving the flow down each of its own branches, so a question that
  // only appears under one combination of answers is still checked.
  function collectQuestions(dir: string, status: Status) {
    const seen = new Map<string, NonNullable<Result['question']>>();
    const explore = (answers: Record<string, string>, depth: number) => {
      if (depth > 8) return;
      const result = ask(dir, answers, status);
      if (result.status !== 'ASK' || !result.question) return;
      const question = result.question;
      seen.set(question.id, question);
      const replies = question.options.length > 0 ? question.options.map((o) => o.id) : ['admin'];
      for (const reply of replies) {
        explore({ ...answers, [question.id]: reply }, depth + 1);
      }
    };
    explore({}, 0);
    return [...seen.values()];
  }

  it.each(STATUSES)('never emits a single-option question (%s)', (_label, status) => {
    const dir = setupProject();
    try {
      const questions = collectQuestions(dir, status);
      expect(questions.length).toBeGreaterThan(0);
      for (const question of questions) {
        expect(
          question.options.length,
          `question "${question.id}" has exactly one option, which no choice tool accepts`,
        ).not.toBe(1);
        if (question.options.length === 0) {
          expect(
            question.allowsFreeText,
            `question "${question.id}" offers no options and no free text, so it cannot be answered`,
          ).toBe(true);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives every option a distinct id and a non-empty label', () => {
    const dir = setupProject();
    try {
      for (const [, status] of STATUSES) {
        for (const question of collectQuestions(dir, status)) {
          const ids = question.options.map((o) => o.id);
          expect(new Set(ids).size, `duplicate option ids in "${question.id}"`).toBe(ids.length);
          for (const option of question.options) expect(option.label.trim()).not.toBe('');
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/auth-questions.mjs (real execution)', () => {
  describe('ordering', () => {
    // Whether to approve a login-capture procedure is not a question anyone has a basis to answer
    // before it is established that their app has a login at all.
    it('asks whether there is a login before explaining anything', () => {
      const dir = setupProject();
      try {
        const result = ask(dir, {}, NO_CI);
        expect(result.status).toBe('ASK');
        expect(result.question!.id).toBe('has-login');
        expect(result.question!.options.map((o) => o.id)).toEqual(['yes', 'no']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('asks for approval only after a login is established', () => {
      const dir = setupProject();
      try {
        expect(ask(dir, { 'has-login': 'yes' }, NO_CI).question!.id).toBe('proceed');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('offers exactly one recommended option per question that has one', () => {
      const dir = setupProject();
      try {
        const seen: string[] = [];
        const answers: Record<string, string> = {};
        const replies: Record<string, string> = {
          'has-login': 'yes',
          proceed: 'continue',
          roles: 'all',
          'role-names': 'admin',
          ci: 'yes',
          'push-secrets': 'yes',
        };
        for (let guard = 0; guard < 20; guard += 1) {
          const result = ask(dir, answers, WITH_CI);
          if (result.status !== 'ASK') break;
          const recommended = result.question!.options.filter((o) => o.recommended === true);
          expect(recommended.length, result.question!.id).toBeLessThanOrEqual(1);
          seen.push(result.question!.id);
          answers[result.question!.id] = replies[result.question!.id];
        }
        expect(seen.length).toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('questions that must not be asked', () => {
    // Three options describing something that does not exist.
    it('never asks about an existing session on a project that has none', () => {
      const dir = setupProject();
      try {
        const { asked } = walk(
          dir,
          { 'has-login': 'yes', proceed: 'continue', roles: 'single' },
          NO_CI,
        );
        expect(asked).not.toContain('existing-session');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('asks about an existing session when there is one', () => {
      const dir = setupProject();
      try {
        const { asked } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            'existing-session': 'capture-fresh',
            roles: 'single',
          },
          HAS_SESSION,
        );
        expect(asked).toContain('existing-session');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // A CI question on a project generated without CI offers to wire a pipeline that is not there.
    it('never asks the CI question on a project generated without CI', () => {
      const dir = setupProject();
      try {
        const { asked, final } = walk(
          dir,
          { 'has-login': 'yes', proceed: 'continue', roles: 'single' },
          NO_CI,
        );
        expect(asked).not.toContain('ci');
        expect(final.status).toBe('DONE');
        expect(final.plan!.wireCi).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('asks the CI question when a provider is actually configured', () => {
      const dir = setupProject();
      try {
        const { asked } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'single',
            ci: 'yes',
            'push-secrets': 'no',
          },
          WITH_CI,
        );
        expect(asked).toContain('ci');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // Pushing secrets to a remote project is the one irreversible outward-facing action here, so it
    // never rides along on the answer to a different question.
    it('asks about pushing secrets as its own question, never bundled into the CI answer', () => {
      const dir = setupProject();
      try {
        const { asked } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'single',
            ci: 'yes',
            'push-secrets': 'no',
          },
          WITH_CI,
        );
        expect(asked.indexOf('push-secrets')).toBeGreaterThan(asked.indexOf('ci'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('never asks for role names when the answer was a single user', () => {
      const dir = setupProject();
      try {
        const { asked } = walk(
          dir,
          { 'has-login': 'yes', proceed: 'continue', roles: 'single' },
          NO_CI,
        );
        expect(asked).not.toContain('role-names');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('asks for role names for both multi-role answers', () => {
      const dir = setupProject();
      try {
        for (const answer of ['all', 'some']) {
          const { asked } = walk(
            dir,
            {
              'has-login': 'yes',
              proceed: 'continue',
              roles: answer,
              'role-names': 'admin, customer',
            },
            NO_CI,
          );
          expect(asked, answer).toContain('role-names');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('every terminal outcome', () => {
    function stops(answers: Record<string, string>, reason: string, status: Status = NO_CI) {
      const dir = setupProject();
      try {
        const result = ask(dir, answers, status);
        expect(result.status).toBe('STOP');
        expect(result.outcome!.reason).toBe(reason);
        expect(result.outcome!.message.length).toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('stops immediately when the app has no login, before anything is explained', () => {
      stops({ 'has-login': 'no' }, 'no-login');
    });

    it('stops when the human declines to proceed', () => {
      stops({ 'has-login': 'yes', proceed: 'stop' }, 'declined');
    });

    it('stops when the human keeps the session that already exists', () => {
      stops(
        { 'has-login': 'yes', proceed: 'continue', 'existing-session': 'reuse' },
        'reusing-session',
        HAS_SESSION,
      );
    });

    it('stops when the human wants local only', () => {
      stops(
        { 'has-login': 'yes', proceed: 'continue', roles: 'single', ci: 'no' },
        'local-only',
        WITH_CI,
      );
    });

    // Answering "no roles and no login at all" contradicts having said there is a login. Picking
    // whichever answer came last means either capturing a session nobody wants or skipping one
    // they do, so the flow stops and names the disagreement instead.
    it('stops on a contradiction rather than resolving it', () => {
      stops(
        { 'has-login': 'yes', proceed: 'continue', roles: 'none-and-no-login' },
        'contradiction',
      );
    });
  });

  describe('the plan the answers add up to', () => {
    it('normalizes role names into filesystem-and-env-safe slugs', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'all',
            'role-names': 'Admin, Read Only, Vendor-Manager',
          },
          NO_CI,
        );
        expect(final.status).toBe('DONE');
        expect(final.plan!.roles).toEqual(['admin', 'read_only', 'vendor_manager']);
        expect(final.plan!.envRoleStubs).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // The flat single-user case keeps the E2E_USERNAME/E2E_PASSWORD names that already exist.
    it('creates no per-role credential slots for a single user', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          { 'has-login': 'yes', proceed: 'continue', roles: 'single' },
          NO_CI,
        );
        expect(final.plan!.roles).toEqual([]);
        expect(final.plan!.envRoleStubs).toBe(false);
        expect(final.plan!.capture).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('carries the CI provider through only when CI was actually agreed', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'single',
            ci: 'yes',
            'push-secrets': 'yes',
          },
          WITH_CI,
        );
        expect(final.plan!.wireCi).toBe(true);
        expect(final.plan!.ciProvider).toBe('github');
        expect(final.plan!.pushSecrets).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps pushSecrets false when the human declined that specific step', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'single',
            ci: 'yes',
            'push-secrets': 'no',
          },
          WITH_CI,
        );
        expect(final.plan!.wireCi).toBe(true);
        expect(final.plan!.pushSecrets).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('adds a role alongside an existing session without replacing it', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            'existing-session': 'add-role',
            roles: 'some',
            'role-names': 'vendor',
          },
          HAS_SESSION,
        );
        expect(final.plan!.capture).toBe(true);
        expect(final.plan!.roles).toEqual(['vendor']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('answers it refuses', () => {
    // An invented option id is exactly what free-text interpretation could produce, so it fails
    // loudly rather than being carried into a plan.
    it('rejects an option id that is not one this question offers', () => {
      const dir = setupProject();
      try {
        const result = ask(dir, { 'has-login': 'maybe' }, NO_CI);
        expect(result.status).toBe('FAILED');
        expect(result.errors!.some((e) => e.includes('is not one of the options'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects an answer to a question that does not exist', () => {
      const dir = setupProject();
      try {
        const result = ask(dir, { 'invented-question': 'yes' }, NO_CI);
        expect(result.status).toBe('FAILED');
        expect(result.errors!.some((e) => e.includes('is not a question in this flow'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('accepts any free text for a question that allows it', () => {
      const dir = setupProject();
      try {
        const result = ask(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'all',
            'role-names': 'whatever the human typed',
          },
          NO_CI,
        );
        expect(result.status).toBe('DONE');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('exits non-zero on a malformed answers payload rather than guessing', () => {
      const dir = setupProject();
      try {
        const result = spawnSync('node', ['scripts/auth-questions.mjs', '--answers=not-json'], {
          cwd: dir,
          encoding: 'utf8',
        });
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout).status).toBe('FAILED');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('free-text handling is declared, not left to be remembered', () => {
    it('marks which questions accept a human own words, and which do not', () => {
      const dir = setupProject();
      try {
        expect(ask(dir, {}, NO_CI).question!.allowsFreeText).toBe(false);
        const roles = ask(dir, { 'has-login': 'yes', proceed: 'continue' }, NO_CI).question!;
        expect(roles.id).toBe('roles');
        expect(roles.allowsFreeText).toBe(true);
        expect(roles.freeTextHint).toContain('exactly one option id');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // "Every branch is covered" should be a checkable fact, not a claim. This drives the flow down
  // every path that can reach each option and asserts that nothing in the script's own declared
  // question set was left unexercised - so adding a question or an option without a test for it
  // fails here rather than passing quietly.
  describe('completeness', () => {
    it('exercises every question and every option the script declares', () => {
      const dir = setupProject();
      try {
        const listed = JSON.parse(
          spawnSync('node', ['scripts/auth-questions.mjs', '--list'], {
            cwd: dir,
            encoding: 'utf8',
          }).stdout,
        ) as {
          questions: Array<{ id: string; options: Array<{ id: string }>; allowsFreeText: boolean }>;
        };

        const seenQuestions = new Set<string>();
        const seenOptions = new Set<string>();

        // Every distinct path through the flow, written out rather than generated: each one is a
        // situation a real person can be in, and naming them is what makes a gap visible.
        const paths: Array<{ replies: Record<string, string>; status: Status }> = [
          { replies: { 'has-login': 'no' }, status: NO_CI },
          { replies: { 'has-login': 'yes', proceed: 'stop' }, status: NO_CI },
          {
            replies: { 'has-login': 'yes', proceed: 'continue', roles: 'none-and-no-login' },
            status: NO_CI,
          },
          {
            replies: { 'has-login': 'yes', proceed: 'continue', roles: 'single' },
            status: NO_CI,
          },
          {
            replies: {
              'has-login': 'yes',
              proceed: 'continue',
              roles: 'all',
              'role-names': 'admin, customer',
            },
            status: NO_CI,
          },
          {
            replies: {
              'has-login': 'yes',
              proceed: 'continue',
              roles: 'some',
              'role-names': 'admin',
            },
            status: NO_CI,
          },
          {
            replies: { 'has-login': 'yes', proceed: 'continue', 'existing-session': 'reuse' },
            status: HAS_SESSION,
          },
          {
            replies: {
              'has-login': 'yes',
              proceed: 'continue',
              'existing-session': 'capture-fresh',
              roles: 'single',
            },
            status: HAS_SESSION,
          },
          {
            replies: {
              'has-login': 'yes',
              proceed: 'continue',
              'existing-session': 'add-role',
              roles: 'some',
              'role-names': 'vendor',
            },
            status: HAS_SESSION,
          },
          {
            replies: { 'has-login': 'yes', proceed: 'continue', roles: 'single', ci: 'no' },
            status: WITH_CI,
          },
          {
            replies: {
              'has-login': 'yes',
              proceed: 'continue',
              roles: 'single',
              ci: 'yes',
              'push-secrets': 'yes',
            },
            status: WITH_CI,
          },
          {
            replies: {
              'has-login': 'yes',
              proceed: 'continue',
              roles: 'single',
              ci: 'yes',
              'push-secrets': 'no',
            },
            status: WITH_CI,
          },
        ];

        for (const path of paths) {
          const { asked } = walk(dir, path.replies, path.status);
          for (const id of asked) {
            seenQuestions.add(id);
            seenOptions.add(id + '=' + path.replies[id]);
          }
        }

        const missingQuestions = listed.questions
          .map((q) => q.id)
          .filter((id) => !seenQuestions.has(id));
        expect(missingQuestions, 'questions never reached by any path').toEqual([]);

        const missingOptions: string[] = [];
        for (const question of listed.questions) {
          for (const option of question.options) {
            if (!seenOptions.has(question.id + '=' + option.id)) {
              missingOptions.push(question.id + '=' + option.id);
            }
          }
        }
        expect(missingOptions, 'options never answered by any path').toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // Without --status it must read the project's real state rather than assuming one, which is the
  // whole reason it is not a static list of questions.
  it('reads real state from auth-status.mjs when none is injected', () => {
    const dir = setupProject();
    try {
      const result = spawnSync(
        'node',
        ['scripts/auth-questions.mjs', '--answers=' + JSON.stringify({ 'has-login': 'yes' })],
        { cwd: dir, encoding: 'utf8' },
      );
      const output = JSON.parse(result.stdout) as Result;
      expect(output.status).toBe('ASK');
      expect(output.question!.id).toBe('proceed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The flow is English because its ids have to be stable, not because the conversation is. An
  // answer given in another language still records an id, so nothing here depends on the language -
  // except role names, which are recorded as words and become filenames and env variable names.
  describe('answers given in another language', () => {
    it('refuses a role name that cannot become a filename, naming it, instead of dropping it', () => {
      const dir = setupProject();
      try {
        const result = ask(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'all',
            'role-names': 'Админ, Только чтение',
          },
          NO_CI,
        );
        expect(result.status).toBe('FAILED');
        expect(result.errors!.some((e) => e.includes('"Админ"'))).toBe(true);
        expect(result.errors!.some((e) => e.includes('"Только чтение"'))).toBe(true);
        expect(result.errors!.some((e) => e.includes('do not transliterate'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // The regression this exists for: the plan used to come back with roles: [] and
    // envRoleStubs: false, and the flow carried on to capture one unnamed session, so a person who
    // named two roles had no way to tell their answer had been discarded.
    it('never returns a plan that silently lost a role the human named', () => {
      const dir = setupProject();
      try {
        const result = ask(
          dir,
          { 'has-login': 'yes', proceed: 'continue', roles: 'all', 'role-names': '管理者' },
          NO_CI,
        );
        expect(result.status).not.toBe('DONE');
        expect(result.plan).toBeUndefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('refuses only the unusable name when the rest are fine', () => {
      const dir = setupProject();
      try {
        const result = ask(
          dir,
          { 'has-login': 'yes', proceed: 'continue', roles: 'all', 'role-names': 'admin, Гость' },
          NO_CI,
        );
        expect(result.status).toBe('FAILED');
        expect(result.errors!).toHaveLength(1);
        expect(result.errors![0]).toContain('"Гость"');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps the human own wording alongside the machine name', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'all',
            'role-names': 'Admin, Read Only',
          },
          NO_CI,
        );
        expect(final.plan!.roles).toEqual(['admin', 'read_only']);
        expect(final.plan!.roleLabels).toEqual({ admin: 'Admin', read_only: 'Read Only' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('accepts a latin name a human supplied for a role they named in their own language', () => {
      const dir = setupProject();
      try {
        const { final } = walk(
          dir,
          {
            'has-login': 'yes',
            proceed: 'continue',
            roles: 'all',
            'role-names': 'admin, readonly',
          },
          NO_CI,
        );
        expect(final.status).toBe('DONE');
        expect(final.plan!.roles).toEqual(['admin', 'readonly']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
