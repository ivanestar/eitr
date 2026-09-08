import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAuthStatus } from '../../engine/src/plan/templates/auth-status.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scriptPath = path.resolve(repoRoot, 'scripts/seed-auth-state.mjs');

// A minimal stand-in for a generated project: the real auth-status.mjs it will be verified against,
// plus the CI marker and .env a full generation would have produced.
function setupGeneratedProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'eitr-seed-auth-'));
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  writeFileSync(path.join(dir, 'scripts', 'auth-status.mjs'), renderAuthStatus(), 'utf8');
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(dir, '.github', 'workflows', 'playwright.yml'), 'name: e2e\n', 'utf8');
  mkdirSync(path.join(dir, '.scaffold'), { recursive: true });
  writeFileSync(
    path.join(dir, '.scaffold', 'init.json'),
    JSON.stringify({ ciCd: 'github' }, null, 2),
    'utf8',
  );
  writeFileSync(path.join(dir, '.env'), 'E2E_BASE_URL=https://app.example.com\n', 'utf8');
  return dir;
}

function run(args: string[]): any {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return { ...JSON.parse(res.stdout), exitCode: res.status };
}

function seed(dir: string, state: string, ...extra: string[]) {
  return run([`--target=${dir}`, `--state=${state}`, ...extra]);
}

describe('scripts/seed-auth-state.mjs', () => {
  it('lists every state it can produce, with what each one is for', () => {
    const output = run(['--list']);
    expect(output.states.map((s: { name: string }) => s.name)).toEqual([
      'fresh',
      'session-exists',
      'roles-incomplete',
      'no-ci',
    ]);
    for (const state of output.states) expect(state.description.length).toBeGreaterThan(20);
  });

  it.each(['fresh', 'session-exists', 'roles-incomplete', 'no-ci'])(
    "seeds %s so the project's own auth-status.mjs reports it",
    (state) => {
      const dir = setupGeneratedProject();
      try {
        const output = seed(dir, state, '--verify');
        expect(output.mismatches).toEqual([]);
        expect(output.verified).toBe(true);
        expect(output.exitCode).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('roles-incomplete leaves exactly one role uncaptured', () => {
    const dir = setupGeneratedProject();
    try {
      const output = seed(dir, 'roles-incomplete', '--verify');
      expect(output.authStatus.declaredRoles).toEqual(['admin', 'viewer']);
      expect(output.authStatus.capturedRoles).toEqual(['admin']);
      expect(output.authStatus.rolesMissingSession).toEqual(['viewer']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('no-ci clears both the pipeline file and the questionnaire record it falls back to', () => {
    const dir = setupGeneratedProject();
    try {
      const output = seed(dir, 'no-ci', '--verify');
      expect(output.authStatus.ciProvider).toBeNull();
      expect(existsSync(path.join(dir, '.github', 'workflows', 'playwright.yml'))).toBe(false);
      expect(JSON.parse(readFileSync(path.join(dir, '.scaffold', 'init.json'), 'utf8')).ciCd).toBe(
        'none',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rewrites only the role slots in .env and leaves everything else alone', () => {
    const dir = setupGeneratedProject();
    try {
      writeFileSync(
        path.join(dir, '.env'),
        'E2E_BASE_URL=https://app.example.com\nE2E_ADMIN_USERNAME=stale\nCUSTOM_TOKEN=keep-me\n',
        'utf8',
      );
      seed(dir, 'fresh');
      const env = readFileSync(path.join(dir, '.env'), 'utf8');
      expect(env).toContain('E2E_BASE_URL=https://app.example.com');
      expect(env).toContain('CUSTOM_TOKEN=keep-me');
      expect(env).not.toContain('E2E_ADMIN_USERNAME');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('replaces a previous state rather than layering on top of it', () => {
    const dir = setupGeneratedProject();
    try {
      seed(dir, 'roles-incomplete');
      const output = seed(dir, 'session-exists', '--verify');
      expect(output.verified).toBe(true);
      expect(output.authStatus.capturedRoles).toEqual(['user']);
      expect(output.authStatus.declaredRoles).toEqual([]);
      expect(existsSync(path.join(dir, '.auth', 'admin.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--dry-run reports the changes without making any of them', () => {
    const dir = setupGeneratedProject();
    try {
      const output = seed(dir, 'session-exists', '--dry-run');
      expect(output.action).toBe('dry-run');
      expect(output.changes.length).toBeGreaterThan(0);
      expect(existsSync(path.join(dir, '.auth'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a directory that is not a generated project', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eitr-seed-auth-empty-'));
    try {
      const output = seed(dir, 'fresh');
      expect(output.exitCode).toBe(1);
      expect(output.error).toContain('does not look like a generated project');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses this generator's own source tree", () => {
    const output = run([`--target=${repoRoot}`, '--state=fresh']);
    expect(output.exitCode).toBe(1);
  });

  it('rejects an unknown state instead of guessing', () => {
    const dir = setupGeneratedProject();
    try {
      const output = seed(dir, 'whatever');
      expect(output.exitCode).toBe(1);
      expect(output.error).toContain('--state must be one of');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
