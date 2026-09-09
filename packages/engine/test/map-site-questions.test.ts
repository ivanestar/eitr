import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderMapSiteQuestions } from '../src/plan/templates/map-site-questions.js';

type Status = {
  siteMapExists?: boolean;
  routeCount?: number;
  orphanedScreenshotCount?: number;
  capturedRoles?: string[];
  hasCrawlBoundary?: boolean;
  hasApiStyle?: boolean;
  contractsExist?: boolean;
  readableContractCount?: number;
  storedCrawlBoundary?: string | null;
  storedOffLimits?: string[] | null;
};

type Option = { id: string; label: string; recommended?: boolean };
type Result = {
  status: 'ASK' | 'STOP' | 'DONE' | 'FAILED' | 'LIST';
  phase?: string;
  question?: { id: string; text: string; options: Option[]; allowsFreeText: boolean };
  outcome?: { reason: string; message: string };
  plan?: Record<string, unknown>;
  errors?: string[];
  questions?: Array<{ id: string; phase: string; options: Option[]; dynamic: boolean }>;
  exitCode: number | null;
};

// Every field the script reads, at its "nothing has happened yet" value. A test names only what it
// is actually about, so a question that starts applying for an unrelated reason shows up as a
// failure rather than passing unnoticed.
const FRESH: Required<Status> = {
  siteMapExists: false,
  routeCount: 0,
  orphanedScreenshotCount: 0,
  capturedRoles: [],
  hasCrawlBoundary: false,
  hasApiStyle: false,
  contractsExist: false,
  readableContractCount: 0,
  storedCrawlBoundary: null,
  storedOffLimits: null,
};

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-map-site-questions-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'map-site-questions.mjs'), renderMapSiteQuestions(), 'utf8');
  return dir;
}

function ask(
  dir: string,
  phase: string,
  answers: Record<string, string>,
  status: Status = {},
): Result {
  const args = [
    join('scripts', 'map-site-questions.mjs'),
    `--phase=${phase}`,
    `--answers=${JSON.stringify(answers)}`,
    `--status=${JSON.stringify({ ...FRESH, ...status })}`,
  ];
  const res = spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  return { ...JSON.parse(res.stdout), exitCode: res.status };
}

// Drives the flow the way an assistant must: one answer at a time, asserting what it is told to ask
// next. No model anywhere in the loop.
function walk(
  dir: string,
  phase: string,
  replies: Record<string, string>,
  status: Status,
): { asked: string[]; final: Result } {
  const answers: Record<string, string> = {};
  const asked: string[] = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const result = ask(dir, phase, answers, status);
    if (result.status !== 'ASK') return { asked, final: result };
    const id = result.question!.id;
    asked.push(id);
    if (!(id in replies)) throw new Error(`flow asked "${id}", which this walk has no reply for`);
    answers[id] = replies[id];
  }
  throw new Error('flow did not terminate');
}

describe('scripts/map-site-questions.mjs - preflight', () => {
  it('asks nothing but the boundary on a first crawl of a fresh project', () => {
    const dir = setupProject();
    try {
      const { asked, final } = walk(
        dir,
        'preflight',
        { 'crawl-boundary': 'safe-interactions' },
        {},
      );
      expect(asked).toEqual(['crawl-boundary']);
      expect(final.status).toBe('DONE');
      expect(final.plan!.mode).toBe('create');
      expect(final.plan!.crawlBoundary).toBe('safe-interactions');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Skipping a question because it was already answered has to hand that answer forward. Leaving
  // the plan empty gave a second crawl neither a question nor a boundary, which is worse than
  // asking again - live-observed.
  it('does not re-ask a boundary already set, and still delivers it', () => {
    const dir = setupProject();
    try {
      const { asked, final } = walk(
        dir,
        'preflight',
        {},
        { hasCrawlBoundary: true, storedCrawlBoundary: 'safe-interactions' },
      );
      expect(asked).toEqual([]);
      expect(final.status).toBe('DONE');
      expect(final.plan!.crawlBoundary).toBe('safe-interactions');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carries forward off-limits areas named on an earlier run', () => {
    const dir = setupProject();
    try {
      const { asked, final } = walk(
        dir,
        'preflight',
        {},
        {
          hasCrawlBoundary: true,
          storedCrawlBoundary: 'full-except',
          storedOffLimits: ['the contact form', 'billing'],
        },
      );
      expect(asked).toEqual([]);
      expect(final.plan!.crawlBoundary).toBe('full-except');
      expect(final.plan!.offLimits).toBe('the contact form, billing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offers to refresh rather than discard when a map already exists', () => {
    const dir = setupProject();
    try {
      const { asked, final } = walk(
        dir,
        'preflight',
        { 'existing-site-map': 'update', 'crawl-boundary': 'read-only' },
        { siteMapExists: true, routeCount: 45 },
      );
      expect(asked[0]).toBe('existing-site-map');
      expect(final.plan!.mode).toBe('update');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recreate is what actually resets the map, and only when chosen', () => {
    const dir = setupProject();
    try {
      const { final } = walk(
        dir,
        'preflight',
        { 'existing-site-map': 'recreate', 'crawl-boundary': 'full' },
        { siteMapExists: true, routeCount: 45 },
      );
      expect(final.plan!.mode).toBe('create');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks about stranded screenshots only when some exist', () => {
    const dir = setupProject();
    try {
      const without = walk(dir, 'preflight', { 'crawl-boundary': 'read-only' }, {});
      expect(without.asked).not.toContain('orphaned-screenshots');

      const withThem = walk(
        dir,
        'preflight',
        { 'orphaned-screenshots': 'delete', 'crawl-boundary': 'read-only' },
        { orphanedScreenshotCount: 5507 },
      );
      expect(withThem.asked).toContain('orphaned-screenshots');
      expect(withThem.final.plan!.pruneOrphanedScreenshots).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('follows the boundary with an off-limits question only when areas were excluded', () => {
    const dir = setupProject();
    try {
      const excluded = walk(
        dir,
        'preflight',
        { 'crawl-boundary': 'full-except', 'off-limits': 'the contact form, billing' },
        {},
      );
      expect(excluded.asked).toEqual(['crawl-boundary', 'off-limits']);
      expect(excluded.final.plan!.offLimits).toBe('the contact form, billing');

      for (const boundary of ['read-only', 'safe-interactions', 'full']) {
        const other = walk(dir, 'preflight', { 'crawl-boundary': boundary }, {});
        expect(other.asked, `off-limits asked for ${boundary}`).toEqual(['crawl-boundary']);
        expect(other.final.plan!.offLimits).toBeNull();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/map-site-questions.mjs - roles', () => {
  it('asks nothing about roles when there is one session or none', () => {
    const dir = setupProject();
    try {
      for (const capturedRoles of [[], ['user']]) {
        const { asked, final } = walk(
          dir,
          'preflight',
          { 'crawl-boundary': 'read-only' },
          { capturedRoles },
        );
        expect(asked, `asked about ${capturedRoles.length} role(s)`).not.toContain('roles');
        expect(final.plan!.roles).toEqual(capturedRoles);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds its options from the sessions that actually exist', () => {
    const dir = setupProject();
    try {
      const result = ask(dir, 'preflight', {}, { capturedRoles: ['admin', 'customer', 'vendor'] });
      expect(result.question!.id).toBe('roles');
      expect(result.question!.options.map((o) => o.id)).toEqual([
        'all',
        'only:admin',
        'only:customer',
        'only:vendor',
      ]);
      expect(result.question!.options.filter((o) => o.recommended)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plans one pass per role, or exactly the one chosen', () => {
    const dir = setupProject();
    try {
      const capturedRoles = ['admin', 'customer'];
      const all = walk(
        dir,
        'preflight',
        { roles: 'all', 'crawl-boundary': 'read-only' },
        { capturedRoles },
      );
      expect(all.final.plan!.roles).toEqual(['admin', 'customer']);

      const one = walk(
        dir,
        'preflight',
        { roles: 'only:admin', 'crawl-boundary': 'read-only' },
        { capturedRoles },
      );
      expect(one.final.plan!.roles).toEqual(['admin']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/map-site-questions.mjs - postcrawl', () => {
  // A crawl that finished and did read some API traffic - the ordinary outcome. Tests about the
  // unreadable case override readableContractCount explicitly.
  const CRAWLED: Status = {
    siteMapExists: true,
    routeCount: 45,
    contractsExist: true,
    readableContractCount: 5,
  };

  it('asks the API style only when nothing readable was observed', () => {
    const dir = setupProject();
    try {
      const readable = walk(dir, 'postcrawl', {}, { ...CRAWLED, readableContractCount: 12 });
      expect(readable.asked).not.toContain('api-style');

      const unreadable = walk(
        dir,
        'postcrawl',
        { 'api-style': 'none-observable' },
        { ...CRAWLED, readableContractCount: 0 },
      );
      expect(unreadable.asked).toContain('api-style');
      expect(unreadable.final.plan!.apiStyle).toBe('none-observable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Forcing a choice here would record a guess as an established fact, and later stages draft
  // API-level tests from it. An admitted gap is the better outcome.
  it('accepts "I don\'t know" about the API, and records nothing rather than a guess', () => {
    const dir = setupProject();
    try {
      const asking = ask(dir, 'postcrawl', {}, { ...CRAWLED, readableContractCount: 0 });
      expect(asking.question!.id).toBe('api-style');
      expect(asking.question!.options[0].id).toBe('unknown');
      expect(asking.question!.options[0].recommended).toBe(true);

      const { final } = walk(
        dir,
        'postcrawl',
        { 'api-style': 'unknown' },
        { ...CRAWLED, readableContractCount: 0 },
      );
      expect(final.status).toBe('DONE');
      expect(final.plan!.apiStyle).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never asks the API style when a human already answered it', () => {
    const dir = setupProject();
    try {
      const { asked } = walk(
        dir,
        'postcrawl',
        {},
        { ...CRAWLED, readableContractCount: 0, hasApiStyle: true },
      );
      expect(asked).not.toContain('api-style');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A live run produced a two-route map from a deep-link start URL and carried it forward into every
  // later stage as if it were the whole application.
  it('treats a thin route list as a finding and can stop the run on it', () => {
    const dir = setupProject();
    try {
      const stopped = walk(
        dir,
        'postcrawl',
        { 'thin-result': 'restart' },
        { ...CRAWLED, routeCount: 1 },
      );
      expect(stopped.asked[0]).toBe('thin-result');
      expect(stopped.final.status).toBe('STOP');
      expect(stopped.final.outcome!.reason).toBe('restart-with-different-start');

      const accepted = walk(
        dir,
        'postcrawl',
        { 'thin-result': 'accept' },
        { ...CRAWLED, routeCount: 2 },
      );
      expect(accepted.final.status).toBe('DONE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not raise a thin result on an ordinary map', () => {
    const dir = setupProject();
    try {
      const { asked } = walk(dir, 'postcrawl', {}, CRAWLED);
      expect(asked).not.toContain('thin-result');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/map-site-questions.mjs - contract', () => {
  it('lists every question it can ever ask, with its phase', () => {
    const dir = setupProject();
    try {
      const res = spawnSync('node', [join('scripts', 'map-site-questions.mjs'), '--list'], {
        cwd: dir,
        encoding: 'utf8',
      });
      const output = JSON.parse(res.stdout);
      expect(output.phases).toEqual(['preflight', 'postcrawl']);
      expect(output.questions.map((q: { id: string }) => q.id)).toEqual([
        'existing-site-map',
        'orphaned-screenshots',
        'roles',
        'crawl-boundary',
        'off-limits',
        'thin-result',
        'api-style',
      ]);
      for (const question of output.questions) {
        expect(['preflight', 'postcrawl']).toContain(question.phase);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Same invariant auth-questions holds: exactly one option is the shape no choice tool can render.
  it('never offers exactly one option, across every reachable state', () => {
    const dir = setupProject();
    const states: Status[] = [
      {},
      { siteMapExists: true, routeCount: 45 },
      { siteMapExists: true, routeCount: 1, contractsExist: true },
      { orphanedScreenshotCount: 12 },
      { capturedRoles: ['admin'] },
      { capturedRoles: ['admin', 'customer'] },
      { capturedRoles: ['a', 'b', 'c', 'd'] },
      { siteMapExists: true, routeCount: 45, contractsExist: true, readableContractCount: 0 },
      { siteMapExists: true, routeCount: 45 },
    ];
    try {
      for (const phase of ['preflight', 'postcrawl']) {
        for (const status of states) {
          const seen = new Map<string, Option[]>();
          // The same answer set is reached by many orderings, and each visit costs a process. Left
          // unmemoized the walk is exponential and times out under parallel load; deduplicating by
          // the answer set explores every distinct state exactly once.
          const visited = new Set<string>();
          const explore = (answers: Record<string, string>, depth: number) => {
            if (depth > 8) return;
            const key = Object.keys(answers)
              .sort()
              .map((k) => k + '=' + answers[k])
              .join('&');
            if (visited.has(key)) return;
            visited.add(key);
            const result = ask(dir, phase, answers, status);
            if (result.status !== 'ASK' || !result.question) return;
            seen.set(result.question.id, result.question.options);
            const replies =
              result.question.options.length > 0
                ? result.question.options.map((o) => o.id)
                : ['free text answer'];
            for (const reply of replies) {
              explore({ ...answers, [result.question!.id]: reply }, depth + 1);
            }
          };
          explore({}, 0);
          for (const [id, options] of seen) {
            expect(options.length, `"${id}" offered exactly one option`).not.toBe(1);
          }
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('rejects an answer that is not one of its own options', () => {
    const dir = setupProject();
    try {
      const result = ask(dir, 'preflight', { 'crawl-boundary': 'whatever' }, {});
      expect(result.status).toBe('FAILED');
      expect(result.exitCode).toBe(1);
      expect(result.errors!.join(' ')).toContain('is not one of the options');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an answer to a question it does not ask', () => {
    const dir = setupProject();
    try {
      const result = ask(dir, 'preflight', { 'favourite-colour': 'blue' }, {});
      expect(result.status).toBe('FAILED');
      expect(result.errors!.join(' ')).toContain('not a question this flow asks');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown phase rather than silently picking one', () => {
    const dir = setupProject();
    try {
      const result = ask(dir, 'midcrawl', {}, {});
      expect(result.status).toBe('FAILED');
      expect(result.errors!.join(' ')).toContain('--phase must be one of');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts free text for the questions that have no fixed options', () => {
    const dir = setupProject();
    try {
      const result = ask(
        dir,
        'preflight',
        { 'crawl-boundary': 'full-except', 'off-limits': 'anything I like' },
        {},
      );
      expect(result.status).toBe('DONE');
      expect(result.plan!.offLimits).toBe('anything I like');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
