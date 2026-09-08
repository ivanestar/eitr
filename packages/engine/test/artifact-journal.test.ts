import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderArtifactJournal } from '../src/plan/templates/artifact-journal.js';
import { renderDebugLog } from '../src/plan/templates/debug-log.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-artifact-journal-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'artifact-journal.mjs'), renderArtifactJournal(), 'utf8');
  writeFileSync(join(dir, 'scripts', 'debug-log.mjs'), renderDebugLog(), 'utf8');
  return dir;
}

function run(dir: string, args: string[], env: NodeJS.ProcessEnv = {}): any {
  const result = spawnSync('node', [join('scripts', 'artifact-journal.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { ...JSON.parse(result.stdout), exitCode: result.status };
}

function record(dir: string, id: string, data: unknown) {
  return run(dir, ['record', '--stage=site-map', `--id=${id}`, `--data=${JSON.stringify(data)}`]);
}

function writeEnvelope(dir: string, relative: string, envelope: unknown) {
  const target = join(dir, ...relative.split('/'));
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, JSON.stringify(envelope, null, 2), 'utf8');
  return target;
}

describe('scripts/artifact-journal.mjs (real execution)', () => {
  it('begin creates an empty journal and reports nothing to resume', () => {
    const dir = setupProject();
    try {
      const output = run(dir, ['begin', '--stage=site-map']);
      expect(output.resumed).toBe(false);
      expect(output.recorded).toBe(0);
      expect(output.notice).toBeNull();
      expect(existsSync(join(dir, 'artifacts', '.journal', 'site-map.ndjson'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a unit survives on disk the moment it is recorded, without any fold', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/login', { title: 'Sign in' });
      const raw = readFileSync(join(dir, 'artifacts', '.journal', 'site-map.ndjson'), 'utf8');
      const line = JSON.parse(raw.trim());
      expect(line.id).toBe('/login');
      expect(line.data).toEqual({ title: 'Sign in' });
      expect(typeof line.recordedAt).toBe('string');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('begin on an interrupted run reports what is already there instead of starting over', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'A' });
      record(dir, '/b', { title: 'B' });

      const resumed = run(dir, ['begin', '--stage=site-map']);
      expect(resumed.resumed).toBe(true);
      expect(resumed.recorded).toBe(2);
      expect(resumed.notice).toContain('2 unit(s) already recorded');
      expect(run(dir, ['ids', '--stage=site-map']).ids).toEqual(['/a', '/b']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--reset discards a previous pass so a create run starts clean', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'A' });
      const output = run(dir, ['begin', '--stage=site-map', '--reset']);
      expect(output.resumed).toBe(false);
      expect(output.recorded).toBe(0);
      expect(run(dir, ['ids', '--stage=site-map']).ids).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recording an id twice is a correction: the last record wins on fold', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'partial' });
      record(dir, '/a', { title: 'complete' });

      const status = run(dir, ['status', '--stage=site-map']);
      expect(status.appendedLines).toBe(2);
      expect(status.recorded).toBe(1);

      writeEnvelope(dir, 'artifacts/site-map/site-map.json', { schemaVersion: 2 });
      run(dir, [
        'fold',
        '--stage=site-map',
        '--into=artifacts/site-map/site-map.json',
        '--key=routes',
      ]);
      const folded = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'site-map', 'site-map.json'), 'utf8'),
      );
      expect(folded.routes).toEqual({ '/a': { title: 'complete' } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fold fills the named key with sorted units and leaves the envelope untouched', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/z', { title: 'Z' });
      record(dir, '/a', { title: 'A' });
      writeEnvelope(dir, 'artifacts/site-map/site-map.json', {
        schemaVersion: 2,
        generatedAt: '2026-09-08T10:00:00.000Z',
        baseUrl: 'https://app.example.com',
        coverage: { boundedBy: 'maxPages', pagesVisited: 500 },
      });

      const output = run(dir, [
        'fold',
        '--stage=site-map',
        '--into=artifacts/site-map/site-map.json',
        '--key=routes',
      ]);
      expect(output.folded).toBe(2);

      const folded = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'site-map', 'site-map.json'), 'utf8'),
      );
      expect(Object.keys(folded.routes)).toEqual(['/a', '/z']);
      expect(folded.schemaVersion).toBe(2);
      expect(folded.baseUrl).toBe('https://app.example.com');
      expect(folded.coverage).toEqual({ boundedBy: 'maxPages', pagesVisited: 500 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fold --as=array produces a list, for artifacts whose collection is not keyed', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=api-contracts']);
      run(dir, [
        'record',
        '--stage=api-contracts',
        '--id=POST /session',
        '--data={"method":"POST","pathTemplate":"/session"}',
      ]);
      run(dir, [
        'record',
        '--stage=api-contracts',
        '--id=GET /users/{id}',
        '--data={"method":"GET","pathTemplate":"/users/{id}"}',
      ]);
      writeEnvelope(dir, 'artifacts/site-map/api-contracts.json', { schemaVersion: 1 });

      run(dir, [
        'fold',
        '--stage=api-contracts',
        '--into=artifacts/site-map/api-contracts.json',
        '--key=contracts',
        '--as=array',
      ]);
      const folded = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'site-map', 'api-contracts.json'), 'utf8'),
      );
      expect(Array.isArray(folded.contracts)).toBe(true);
      expect(folded.contracts.map((entry: { method: string }) => entry.method)).toEqual([
        'GET',
        'POST',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a unit passed as a file, for entries too large to inline', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      const unit = join(dir, 'unit.json');
      writeFileSync(unit, JSON.stringify({ title: 'From a file', regions: ['main'] }), 'utf8');
      const output = run(dir, ['record', '--stage=site-map', '--id=/a', '--file=unit.json']);
      expect(output.recorded).toBe(1);
      expect(run(dir, ['ids', '--stage=site-map']).ids).toEqual(['/a']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts a truncated final line as malformed rather than dropping it silently', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'A' });
      // The signature of a process killed mid-write.
      appendFileSync(
        join(dir, 'artifacts', '.journal', 'site-map.ndjson'),
        '{"id":"/b","recordedAt":"2026-09',
        'utf8',
      );
      const status = run(dir, ['status', '--stage=site-map']);
      expect(status.recorded).toBe(1);
      expect(status.malformedLines).toBe(1);
      expect(status.resumable).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('status on a stage that never ran reports absence rather than failing', () => {
    const dir = setupProject();
    try {
      const output = run(dir, ['status', '--stage=never-ran']);
      expect(output.exists).toBe(false);
      expect(output.recorded).toBe(0);
      expect(output.resumable).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fold refuses when the artifact envelope has not been written yet', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'A' });
      const output = run(dir, [
        'fold',
        '--stage=site-map',
        '--into=artifacts/site-map/site-map.json',
        '--key=routes',
      ]);
      expect(output.exitCode).toBe(1);
      expect(output.error).toContain('write the artifact envelope');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('discard removes the journal only when asked, never as a side effect of folding', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'A' });
      writeEnvelope(dir, 'artifacts/site-map/site-map.json', { schemaVersion: 2 });
      run(dir, [
        'fold',
        '--stage=site-map',
        '--into=artifacts/site-map/site-map.json',
        '--key=routes',
      ]);
      expect(existsSync(join(dir, 'artifacts', '.journal', 'site-map.ndjson'))).toBe(true);

      expect(run(dir, ['discard', '--stage=site-map']).removed).toBe(true);
      expect(existsSync(join(dir, 'artifacts', '.journal', 'site-map.ndjson'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a missing or malformed stage name instead of writing somewhere unexpected', () => {
    const dir = setupProject();
    try {
      expect(run(dir, ['begin']).exitCode).toBe(1);
      expect(run(dir, ['begin', '--stage=../escape']).exitCode).toBe(1);
      expect(run(dir, ['begin', '--stage=Site Map']).exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('record without any payload fails rather than committing an empty unit', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      const output = run(dir, ['record', '--stage=site-map', '--id=/a']);
      expect(output.exitCode).toBe(1);
      expect(output.error).toContain('--file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a debug record only when E2E_DEBUG is set', () => {
    const dir = setupProject();
    try {
      run(dir, ['begin', '--stage=site-map']);
      record(dir, '/a', { title: 'A' });
      expect(existsSync(join(dir, 'artifacts', '.debug'))).toBe(false);

      run(dir, ['record', '--stage=site-map', '--id=/b', '--data={"title":"B"}'], {
        E2E_DEBUG: '1',
      });
      const log = readFileSync(
        join(dir, 'artifacts', '.debug', 'artifact-journal.ndjson'),
        'utf8',
      ).trim();
      const entry = JSON.parse(log);
      expect(entry.source).toBe('artifact-journal');
      expect(entry.event).toBe('record');
      expect(entry.payload.id).toBe('/b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
