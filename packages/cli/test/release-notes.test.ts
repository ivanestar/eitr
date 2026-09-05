import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractReleaseNotes } from '../../../scripts/extract-release-notes.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scriptPath = path.resolve(repoRoot, 'scripts/extract-release-notes.mjs');

function runScript(args: string[]) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: res.status,
    stdout: (res.stdout || '').replace(/\r\n/g, '\n'),
    stderr: (res.stderr || '').replace(/\r\n/g, '\n'),
  };
}

describe('extractReleaseNotes helper', () => {
  const sampleChangelog = `
# Changelog

Intro text.

## [1.2.0] - 2026-09-05

- **Added**: new feature A.
- **Fixed**: bug B.

## [1.1.0] - 2026-09-01

- **Changed**: behavior C.

## [1.0.0] - 2026-08-01

- **Added**: initial release.
`.trim();

  it('extracts top version correctly without header', () => {
    const notes = extractReleaseNotes(sampleChangelog, '1.2.0');
    expect(notes).toBe('- **Added**: new feature A.\n- **Fixed**: bug B.');
  });

  it('handles "v" prefix gracefully', () => {
    const notes = extractReleaseNotes(sampleChangelog, 'v1.1.0');
    expect(notes).toBe('- **Changed**: behavior C.');
  });

  it('extracts oldest/bottom version ending at EOF', () => {
    const notes = extractReleaseNotes(sampleChangelog, '1.0.0');
    expect(notes).toBe('- **Added**: initial release.');
  });

  it('throws helpful error for missing version', () => {
    expect(() => extractReleaseNotes(sampleChangelog, '9.9.9')).toThrow(
      'Release notes for version 9.9.9 not found in CHANGELOG.md',
    );
  });

  it('throws error for invalid or empty version', () => {
    expect(() => extractReleaseNotes(sampleChangelog, '')).toThrow(
      'Target version string is required',
    );
    expect(() => extractReleaseNotes(sampleChangelog, '   ')).toThrow('Invalid version supplied');
  });
});

describe('extract-release-notes CLI integration', () => {
  const tempOutputFile = path.join(repoRoot, 'scratch-temp-release-notes.md');

  afterEach(async () => {
    try {
      await fs.unlink(tempOutputFile);
    } catch {
      // Ignored if file does not exist
    }
  });

  it('extracts release notes for current version to stdout when called without arguments (zero-config default)', async () => {
    const rootPkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
    const { status, stdout, stderr } = runScript([]);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Protocol 123'); // From 0.33.0 release notes
    expect(stdout).not.toContain(`## [${rootPkg.version}]`);
  });

  it('extracts specific version when provided as positional argument', () => {
    const { status, stdout, stderr } = runScript(['0.1.0']);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('initial CLI scaffolding');
  });

  it('writes output to file when --file argument is passed', async () => {
    const { status, stdout } = runScript(['0.1.0', '--file', 'scratch-temp-release-notes.md']);
    expect(status).toBe(0);
    expect(stdout).toContain('[extract-release-notes] Extracted v0.1.0 notes');

    const content = await fs.readFile(tempOutputFile, 'utf8');
    expect(content).toContain('initial CLI scaffolding');
  });

  it('fails with exit code 1 when version does not exist in CHANGELOG', () => {
    const { status, stderr } = runScript(['99.99.99']);
    expect(status).toBe(1);
    expect(stderr).toContain('Release notes for version 99.99.99 not found in CHANGELOG.md');
  });
});
