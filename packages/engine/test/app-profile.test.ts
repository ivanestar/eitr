import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAppProfile } from '../src/plan/templates/app-profile.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-app-profile-'));
  writeFileSync(join(dir, 'app-profile.mjs'), renderAppProfile(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  return dir;
}

function writeProfile(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'app-profile.json'),
    typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['app-profile.mjs', ...args], { cwd: dir, encoding: 'utf8' });
  return { result, output: result.stdout ? JSON.parse(result.stdout) : null };
}

function validProfile() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-08T10:00:00.000Z',
    applicationKind: {
      value: 'sandbox-demo',
      source: 'human',
      note: 'confirmed at core-purpose time',
      recordedAt: '2026-09-08T10:00:00.000Z',
    },
    crawlBoundary: {
      value: 'full-except',
      source: 'human',
      offLimits: ['the contact form'],
      recordedAt: '2026-09-08T10:00:00.000Z',
    },
    domainNotes: [
      {
        note: 'Refunds are processed by a nightly batch job.',
        statedDuring: '/define-test-conditions',
        recordedAt: '2026-09-08T10:00:00.000Z',
      },
    ],
  };
}

function validCorePurpose() {
  return {
    candidates: [
      {
        value: 'A practice sandbox of isolated UI patterns for test automation.',
        reasoning:
          'Every route demonstrates one widget in isolation, with no shared data between them.',
        evidence: [{ signal: 'heading-text', excerpt: 'Available Examples' }],
      },
    ],
    mostLikelyIndex: 0,
    reviewed: false,
  };
}

// The failure that put corePurpose in this file: a human answered the purpose question, and their
// answer went somewhere other than where the very next question's answer (applicationKind) went, so
// they could not find it afterwards.
describe('scripts/app-profile.mjs - core purpose lives with the other app-level facts', () => {
  it('accepts a confirmed purpose alongside applicationKind', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, {
        ...validProfile(),
        corePurpose: {
          ...validCorePurpose(),
          selected: {
            value: 'A practice sandbox of isolated UI patterns for test automation.',
            source: 'human',
            recordedAt: '2026-09-08T10:05:00.000Z',
          },
          reviewed: true,
          reviewedBy: 'human',
        },
      });
      const { result, output } = run(dir, '--validate');
      expect(output.errors).toEqual([]);
      expect(output.status).toBe('PASSED');
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts candidates that nobody has answered yet', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, { ...validProfile(), corePurpose: validCorePurpose() });
      expect(run(dir, '--validate').output.status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Recording the approval without recording the answer loses exactly the thing the question was
  // asked to obtain.
  it('rejects a purpose marked reviewed with nothing selected', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, {
        ...validProfile(),
        corePurpose: { ...validCorePurpose(), reviewed: true, reviewedBy: 'human' },
      });
      const { output } = run(dir, '--validate');
      expect(output.status).toBe('FAILED');
      expect(output.errors.join(' ')).toContain('corePurpose.selected is absent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a candidate with no evidence behind it', () => {
    const dir = setupProject();
    try {
      const purpose = validCorePurpose();
      purpose.candidates[0].evidence = [];
      writeProfile(dir, { ...validProfile(), corePurpose: purpose });
      const { output } = run(dir, '--validate');
      expect(output.status).toBe('FAILED');
      expect(output.errors.join(' ')).toContain('evidence must be a non-empty array');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a mostLikelyIndex that points outside the candidate list', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, {
        ...validProfile(),
        corePurpose: { ...validCorePurpose(), mostLikelyIndex: 3 },
      });
      expect(run(dir, '--validate').output.errors.join(' ')).toContain('mostLikelyIndex');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts role profiles, including a role that turned out to be no different', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, {
        ...validProfile(),
        roles: {
          admin: {
            name: 'admin',
            purpose: {
              value: 'Reached nothing the other crawled roles could not.',
              source: 'observed',
              recordedAt: '2026-09-08T10:05:00.000Z',
            },
            exclusiveRoutes: [],
            reviewed: true,
            reviewedBy: 'human',
          },
        },
      });
      expect(run(dir, '--validate').output.status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a role whose name disagrees with its own key', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, {
        ...validProfile(),
        roles: {
          admin: {
            name: 'administrator',
            purpose: { value: 'x', source: 'observed', recordedAt: '2026-09-08T10:05:00.000Z' },
            exclusiveRoutes: [],
            reviewed: false,
          },
        },
      });
      expect(run(dir, '--validate').output.errors.join(' ')).toContain('must equal its own key');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/app-profile.mjs (real execution)', () => {
  it('returns a well-formed empty profile when the file does not exist yet', () => {
    const dir = setupProject();
    try {
      const { result, output } = run(dir);
      // An absent profile is a normal state, not an error - a caller must never have to branch on
      // whether the file exists before reading it.
      expect(result.status).toBe(0);
      expect(output.exists).toBe(false);
      expect(output.schemaVersion).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports an absent profile as valid, since nothing durable has been learned yet', () => {
    const dir = setupProject();
    try {
      const { result, output } = run(dir, '--validate');
      expect(result.status).toBe(0);
      expect(output.status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads back every recorded fact', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, validProfile());
      const { output } = run(dir);
      expect(output.exists).toBe(true);
      expect(output.applicationKind.value).toBe('sandbox-demo');
      expect(output.crawlBoundary.offLimits).toEqual(['the contact form']);
      expect(output.domainNotes).toHaveLength(1);
      expect(output.domainNotes[0].note).toContain('nightly batch job');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('indexes only the artifacts that actually exist right now', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, validProfile());
      mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
      writeFileSync(join(dir, 'artifacts', 'site-map', 'site-map.json'), '{}', 'utf8');

      const { output } = run(dir);
      expect(output.artifactIndex.siteMap).toBe('artifacts/site-map/site-map.json');
      // A pointer to a file nothing ever wrote is worse than no pointer at all.
      expect(output.artifactIndex.testCases).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown applicationKind rather than passing a typo downstream', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      profile.applicationKind.value = 'sandbox';
      writeProfile(dir, profile);
      const { result, output } = run(dir, '--validate');
      expect(result.status).toBe(1);
      expect(output.errors.join(' ')).toContain('applicationKind.value must be one of');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires each fact to record where it came from and when', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      delete profile.applicationKind.source;
      delete profile.crawlBoundary.recordedAt;
      writeProfile(dir, profile);
      const { output } = run(dir, '--validate');
      expect(output.errors.join(' ')).toContain('applicationKind.source must be one of');
      expect(output.errors.join(' ')).toContain('crawlBoundary.recordedAt must be a non-empty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an empty domain note - a blank entry records nothing but looks like knowledge', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      profile.domainNotes[0].note = '   ';
      writeProfile(dir, profile);
      const { output } = run(dir, '--validate');
      expect(output.errors.join(' ')).toContain('domainNotes[0].note must be a non-empty string');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a note written on one entry, and refuses one that does not say which entry', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      profile.domainNotes.push({
        note: 'Only managers see orders',
        statedDuring: 'site-map review',
        recordedAt: '2026-09-11T10:00:00.000Z',
        about: { review: 'site-map', type: 'route', id: 'route-orders', path: '/orders' },
        withdrawnAt: '2026-09-11T11:00:00.000Z',
      });
      writeProfile(dir, profile);
      expect(run(dir, '--validate').output.errors).toEqual([]);

      profile.domainNotes[1].about = { review: 'site-map', type: 'button', id: 'x' };
      writeProfile(dir, profile);
      expect(run(dir, '--validate').output.errors.join(' ')).toContain(
        'domainNotes[1].about must name the entry it was written on',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a page a person left out, and refuses one nobody can be named for', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      profile.leftOutRoutes = [
        {
          path: '/defects/D-001',
          routeId: 'r1',
          by: 'human',
          at: '2026-09-11T10:00:00.000Z',
          note: 'not needed',
        },
      ];
      writeProfile(dir, profile);
      expect(run(dir, '--validate').output.status).toBe('PASSED');

      profile.leftOutRoutes.push({
        path: '/defects/D-001',
        by: 'auto-pilot',
        at: '2026-09-11T10:00:00.000Z',
      });
      writeProfile(dir, profile);
      const errors = run(dir, '--validate').output.errors.join(' ');
      expect(errors).toContain('appears more than once');
      expect(errors).toContain('only a person leaves a page out');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a test-type id it has never heard of - the registry is open by design', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      profile.testTypes = [
        { id: 'functional', inScope: true, decidedAt: '2026-09-08T10:00:00.000Z' },
        {
          id: 'accessibility',
          inScope: false,
          rationale: 'not in scope for the first regression net',
          decidedAt: '2026-09-08T10:00:00.000Z',
        },
        // A type nothing in this codebase knows about must still validate: adding one is meant to
        // be a single entry here, never a change to the pipeline.
        { id: 'chaos-resilience', inScope: false, decidedAt: '2026-09-08T10:00:00.000Z' },
      ];
      writeProfile(dir, profile);
      const { result, output } = run(dir, '--validate');
      expect(result.status).toBe(0);
      expect(output.status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a duplicated or badly-formed test-type id', () => {
    const dir = setupProject();
    try {
      const profile = validProfile() as Record<string, any>;
      profile.testTypes = [
        { id: 'functional', inScope: true, decidedAt: '2026-09-08T10:00:00.000Z' },
        { id: 'functional', inScope: false, decidedAt: '2026-09-08T10:00:00.000Z' },
        { id: 'Load Testing', inScope: true, decidedAt: '2026-09-08T10:00:00.000Z' },
      ];
      writeProfile(dir, profile);
      const { output } = run(dir, '--validate');
      expect(output.errors.join(' ')).toContain('appears more than once');
      expect(output.errors.join(' ')).toContain('must be a lowercase kebab-case string');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports malformed JSON as a validation failure rather than crashing', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, '{ not json');
      const { result, output } = run(dir, '--validate');
      expect(result.status).toBe(1);
      expect(output.errors.join(' ')).toContain('is not valid JSON');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not merge other artifacts into its output - it reports only its own facts plus pointers', () => {
    const dir = setupProject();
    try {
      writeProfile(dir, validProfile());
      mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
      writeFileSync(
        join(dir, 'artifacts', 'site-map', 'site-map.json'),
        JSON.stringify({ routes: { '/checkout': { routeId: 'r1' } } }),
        'utf8',
      );

      const { result } = run(dir);
      // Copying route data in here would put a second version of it in circulation; the pointer
      // is the whole contract.
      expect(result.stdout).not.toContain('/checkout');
      expect(result.stdout).toContain('artifacts/site-map/site-map.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('apiStyle', () => {
    it('accepts every style, including the two that admit a limit rather than name a protocol', () => {
      for (const style of ['rest', 'graphql', 'rpc', 'mixed', 'none-observable', 'unknown']) {
        const dir = setupProject();
        try {
          writeProfile(dir, {
            schemaVersion: 1,
            generatedAt: '2026-09-08T10:00:00.000Z',
            apiStyle: { value: style, source: 'observed', recordedAt: '2026-09-08T10:00:00.000Z' },
          });
          const { output } = run(dir, '--validate');
          expect(output.status, style + ': ' + JSON.stringify(output.errors)).toBe('PASSED');
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    });

    it('rejects a style nobody defined', () => {
      const dir = setupProject();
      try {
        writeProfile(dir, {
          schemaVersion: 1,
          generatedAt: '2026-09-08T10:00:00.000Z',
          apiStyle: { value: 'soap', source: 'human', recordedAt: '2026-09-08T10:00:00.000Z' },
        });
        const { output } = run(dir, '--validate');
        expect(output.status).toBe('FAILED');
        expect(output.errors.some((e: string) => e.includes('apiStyle'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
