import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderEnvRoleStubs } from '../src/plan/templates/env-role-stubs.js';

function setupProject(envContents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-env-role-stubs-'));
  writeFileSync(join(dir, 'env-role-stubs.mjs'), renderEnvRoleStubs(), 'utf8');
  if (envContents !== undefined) {
    writeFileSync(join(dir, '.env'), envContents, 'utf8');
  }
  return dir;
}

function run(dir: string, ...args: string[]) {
  return spawnSync('node', ['env-role-stubs.mjs', ...args], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/env-role-stubs.mjs (real execution)', () => {
  it('adds an empty username/password pair per role, in the role-infix naming form', () => {
    const dir = setupProject('E2E_BASE_URL=https://example.test\n');
    try {
      const result = run(dir, '--roles=admin,customer');
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.roles).toEqual(['admin', 'customer']);
      expect(output.added).toEqual([
        'E2E_ADMIN_USERNAME',
        'E2E_ADMIN_PASSWORD',
        'E2E_CUSTOMER_USERNAME',
        'E2E_CUSTOMER_PASSWORD',
      ]);

      const env = readFileSync(join(dir, '.env'), 'utf8');
      expect(env).toContain('E2E_BASE_URL=https://example.test');
      expect(env).toContain('E2E_ADMIN_USERNAME=');
      expect(env).toContain('E2E_CUSTOMER_PASSWORD=');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent: a second run with the same roles adds nothing and rewrites no value', () => {
    const dir = setupProject('E2E_BASE_URL=https://example.test\n');
    try {
      run(dir, '--roles=admin');
      writeFileSync(
        join(dir, '.env'),
        readFileSync(join(dir, '.env'), 'utf8').replace(
          'E2E_ADMIN_PASSWORD=',
          'E2E_ADMIN_PASSWORD=already-filled-in',
        ),
        'utf8',
      );

      const second = run(dir, '--roles=admin');
      const output = JSON.parse(second.stdout);
      expect(output.added).toEqual([]);
      expect(output.alreadyPresent).toEqual(['E2E_ADMIN_USERNAME', 'E2E_ADMIN_PASSWORD']);
      // The existing value survives untouched - this script never overwrites a filled-in secret.
      expect(readFileSync(join(dir, '.env'), 'utf8')).toContain(
        'E2E_ADMIN_PASSWORD=already-filled-in',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a commented-out placeholder as already present rather than duplicating the line', () => {
    const dir = setupProject('# E2E_ADMIN_USERNAME=\n# E2E_ADMIN_PASSWORD=\n');
    try {
      const output = JSON.parse(run(dir, '--roles=admin').stdout);
      expect(output.added).toEqual([]);
      expect(output.alreadyPresent).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes spaces and hyphens into the env-safe slug used everywhere else', () => {
    const dir = setupProject('');
    try {
      const output = JSON.parse(run(dir, '--roles=Read Only').stdout);
      expect(output.roles).toEqual(['read_only']);
      expect(output.added).toEqual(['E2E_READ_ONLY_USERNAME', 'E2E_READ_ONLY_PASSWORD']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a role name that cannot become a variable name, rather than mangling it silently', () => {
    const dir = setupProject('');
    try {
      const result = run(dir, '--roles=admin$;rm');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('invalid role name');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates .env when it does not exist yet', () => {
    const dir = setupProject();
    try {
      const output = JSON.parse(run(dir, '--roles=admin').stdout);
      expect(output.envCreated).toBe(true);
      expect(existsSync(join(dir, '.env'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires --roles rather than guessing a default role set', () => {
    const dir = setupProject('');
    try {
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('missing --roles');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
