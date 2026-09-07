import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAuthStatus } from '../src/plan/templates/auth-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-auth-status-'));
  writeFileSync(join(dir, 'auth-status.mjs'), renderAuthStatus(), 'utf8');
  return dir;
}

function run(dir: string) {
  const result = spawnSync('node', ['auth-status.mjs'], { cwd: dir, encoding: 'utf8' });
  return JSON.parse(result.stdout);
}

describe('scripts/auth-status.mjs (real execution)', () => {
  it('detects gitlab from .gitlab-ci.yml on disk even with no .scaffold/init.json present', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, '.gitlab-ci.yml'), 'stages: [test]\n', 'utf8');
      const output = run(dir);
      expect(output.ciProvider).toBe('gitlab');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects github from .github/workflows/playwright.yml', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
      writeFileSync(join(dir, '.github', 'workflows', 'playwright.yml'), 'name: CI\n', 'utf8');
      expect(run(dir).ciProvider).toBe('github');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects jenkins from a Jenkinsfile', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'Jenkinsfile'), 'pipeline {}\n', 'utf8');
      expect(run(dir).ciProvider).toBe('jenkins');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects teamcity from .teamcity/settings.kts', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.teamcity'), { recursive: true });
      writeFileSync(join(dir, '.teamcity', 'settings.kts'), '// kts\n', 'utf8');
      expect(run(dir).ciProvider).toBe('teamcity');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to .scaffold/init.json only when no generated pipeline file exists on disk', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.scaffold'), { recursive: true });
      writeFileSync(
        join(dir, '.scaffold', 'init.json'),
        JSON.stringify({ ciCd: 'gitlab' }),
        'utf8',
      );
      expect(run(dir).ciProvider).toBe('gitlab');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a real generated pipeline file on disk wins over a stale/contradicting init.json', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.scaffold'), { recursive: true });
      writeFileSync(
        join(dir, '.scaffold', 'init.json'),
        JSON.stringify({ ciCd: 'github' }),
        'utf8',
      );
      writeFileSync(join(dir, '.gitlab-ci.yml'), 'stages: [test]\n', 'utf8');
      expect(run(dir).ciProvider).toBe('gitlab');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports null when neither a pipeline file nor init.json names a provider', () => {
    const dir = setupProject();
    try {
      expect(run(dir).ciProvider).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports session and env-fill facts alongside ciProvider', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.auth'), { recursive: true });
      writeFileSync(join(dir, '.auth', 'admin.json'), '{}', 'utf8');
      writeFileSync(join(dir, '.env'), 'E2E_USERNAME=filled\nE2E_PASSWORD=\n', 'utf8');

      const output = run(dir);
      expect(output.hasSession).toBe(true);
      expect(output.sessionFiles).toEqual(['admin.json']);
      expect(output.authEnvFilled).toBe(true);
      expect(output.nextStep).toBe('session-exists');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports capture-needed and no auth env filled on a bare project', () => {
    const dir = setupProject();
    try {
      const output = run(dir);
      expect(output.hasSession).toBe(false);
      expect(output.authEnvFilled).toBe(false);
      expect(output.nextStep).toBe('capture-needed');
      expect(output.declaredRoles).toEqual([]);
      expect(output.rolesMissingSession).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads declared roles from the per-role .env slots, filled or not', () => {
    const dir = setupProject();
    try {
      writeFileSync(
        join(dir, '.env'),
        [
          'E2E_BASE_URL=https://example.test',
          'E2E_ADMIN_USERNAME=someone',
          'E2E_ADMIN_PASSWORD=',
          '# E2E_CUSTOMER_USERNAME=',
          '# E2E_CUSTOMER_PASSWORD=',
        ].join('\n'),
        'utf8',
      );
      const output = run(dir);
      // A commented-out slot still means the role was declared - it just has not been filled in.
      expect(output.declaredRoles).toEqual(['admin', 'customer']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports roles-incomplete when a declared role has no captured session of its own', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.auth'), { recursive: true });
      writeFileSync(join(dir, '.auth', 'admin.json'), '{}', 'utf8');
      writeFileSync(join(dir, '.env'), 'E2E_ADMIN_USERNAME=\nE2E_CUSTOMER_USERNAME=\n', 'utf8');

      const output = run(dir);
      expect(output.capturedRoles).toEqual(['admin']);
      expect(output.declaredRoles).toEqual(['admin', 'customer']);
      expect(output.rolesMissingSession).toEqual(['customer']);
      expect(output.nextStep).toBe('roles-incomplete');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports session-exists once every declared role has its own session', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.auth'), { recursive: true });
      writeFileSync(join(dir, '.auth', 'admin.json'), '{}', 'utf8');
      writeFileSync(join(dir, '.auth', 'customer.json'), '{}', 'utf8');
      writeFileSync(join(dir, '.env'), 'E2E_ADMIN_USERNAME=\nE2E_CUSTOMER_USERNAME=\n', 'utf8');

      const output = run(dir);
      expect(output.rolesMissingSession).toEqual([]);
      expect(output.nextStep).toBe('session-exists');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a flat single-user project declares no roles, so it never reports roles-incomplete', () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, '.auth'), { recursive: true });
      writeFileSync(join(dir, '.auth', 'user.json'), '{}', 'utf8');
      writeFileSync(join(dir, '.env'), 'E2E_USERNAME=someone\nE2E_PASSWORD=secret\n', 'utf8');

      const output = run(dir);
      expect(output.declaredRoles).toEqual([]);
      expect(output.rolesMissingSession).toEqual([]);
      expect(output.nextStep).toBe('session-exists');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
