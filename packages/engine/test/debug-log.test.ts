import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderDebugLog } from '../src/plan/templates/debug-log.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-debug-log-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'debug-log.mjs'), renderDebugLog(), 'utf8');
  return dir;
}

function run(dir: string, args: string[], env: NodeJS.ProcessEnv = {}): any {
  const result = spawnSync('node', [join('scripts', 'debug-log.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { ...JSON.parse(result.stdout), exitCode: result.status };
}

// Drives the module the way an instrumented script does, rather than through the CLI.
function callAsModule(dir: string, env: NodeJS.ProcessEnv = {}) {
  const driver = join(dir, 'driver.mjs');
  writeFileSync(
    driver,
    [
      "import { debugLog, debugEnabled, debugRun } from './scripts/debug-log.mjs';",
      "const wrote = debugLog('sample', 'did-something', { detail: 42 });",
      "const value = debugRun('sample', 'wrapped', { a: 1 }, () => 'done');",
      'process.stdout.write(JSON.stringify({ enabled: debugEnabled(), wrote, value }));',
    ].join('\n'),
    'utf8',
  );
  const result = spawnSync('node', ['driver.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(result.stdout);
}

describe('scripts/debug-log.mjs (real execution)', () => {
  it('is off by default: importing and calling it writes nothing', () => {
    const dir = setupProject();
    try {
      const output = callAsModule(dir, { E2E_DEBUG: '' });
      expect(output.enabled).toBe(false);
      expect(output.wrote).toBe(false);
      expect(output.value).toBe('done');
      expect(existsSync(join(dir, 'artifacts', '.debug'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records both a plain log and a wrapped call when E2E_DEBUG is set', () => {
    const dir = setupProject();
    try {
      const output = callAsModule(dir, { E2E_DEBUG: '1' });
      expect(output.enabled).toBe(true);
      expect(output.wrote).toBe(true);
      // Wrapping must not change what the wrapped call returns.
      expect(output.value).toBe('done');

      const tail = run(dir, ['tail', '--source=sample'], { E2E_DEBUG: '1' });
      expect(tail.logs.sample).toHaveLength(2);
      expect(tail.logs.sample[0].event).toBe('did-something');
      expect(tail.logs.sample[0].payload).toEqual({ detail: 42 });
      expect(tail.logs.sample[1].event).toBe('wrapped');
      expect(tail.logs.sample[1].payload.result).toBe('done');
      expect(typeof tail.logs.sample[1].payload.durationMs).toBe('number');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('status says how to turn it on when it is off, and lists what was recorded when it is on', () => {
    const dir = setupProject();
    try {
      const off = run(dir, ['status'], { E2E_DEBUG: '' });
      expect(off.enabled).toBe(false);
      expect(off.hint).toContain('E2E_DEBUG=1');
      expect(off.sources).toEqual([]);

      callAsModule(dir, { E2E_DEBUG: '1' });
      const on = run(dir, ['status'], { E2E_DEBUG: '1' });
      expect(on.enabled).toBe(true);
      expect(on.hint).toBeNull();
      expect(on.sources).toEqual([{ source: 'sample', records: 2 }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clear removes recorded logs', () => {
    const dir = setupProject();
    try {
      callAsModule(dir, { E2E_DEBUG: '1' });
      expect(run(dir, ['clear']).removed).toBe(1);
      expect(run(dir, ['status'], { E2E_DEBUG: '1' }).sources).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts the documented truthy values and treats anything else as off', () => {
    const dir = setupProject();
    try {
      expect(callAsModule(dir, { E2E_DEBUG: 'true' }).enabled).toBe(true);
      expect(callAsModule(dir, { E2E_DEBUG: 'yes' }).enabled).toBe(true);
      expect(callAsModule(dir, { E2E_DEBUG: '0' }).enabled).toBe(false);
      expect(callAsModule(dir, { E2E_DEBUG: 'off' }).enabled).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown action', () => {
    const dir = setupProject();
    try {
      expect(run(dir, ['dump']).exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
