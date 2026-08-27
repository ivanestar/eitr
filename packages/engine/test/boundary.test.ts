import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../src/version.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const engineSrc = path.join(repoRoot, 'packages/engine/src');

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkTs(full)));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

async function readJson(rel: string): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(repoRoot, rel), 'utf8'));
}

describe('engine stays browser-free (D8/P6)', () => {
  it('no engine-src module statically value-imports @playwright/test (CORE-only: nothing does)', async () => {
    const offenders: string[] = [];
    for (const file of await walkTs(engineSrc)) {
      const text = await fs.readFile(file, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        // Allow `import type ... from '@playwright/test'`; a value `import ... from '@playwright/test'` is forbidden.
        if (/^import\s+(?!type\b)[^;]*from\s+['"]@playwright\/test['"]/.test(t)) {
          offenders.push(`${path.relative(repoRoot, file)}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no engine-src module imports node:child_process (spawning lives only in the CLI)', async () => {
    const offenders: string[] = [];
    for (const file of await walkTs(engineSrc)) {
      if (file.includes('templates')) continue; // Skip template generators emitting code for target projects
      const text = await fs.readFile(file, 'utf8');
      const lines = text.split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (
          /^import\s+.*from\s+['"](node:)?child_process['"]/.test(t) ||
          /^const\s+.*=\s*require\(['"](node:)?child_process['"]\)/.test(t)
        ) {
          offenders.push(`${path.relative(repoRoot, file)}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('version + pins', () => {
  it('ENGINE_VERSION matches all workspace package.json files and CHANGELOG.md', async () => {
    const rootPkg = await readJson('package.json');
    const enginePkg = await readJson('packages/engine/package.json');
    const cliPkg = await readJson('packages/cli/package.json');
    const evalsPkg = await readJson('packages/evals/package.json');

    expect(ENGINE_VERSION).toBe(rootPkg.version);
    expect(ENGINE_VERSION).toBe(enginePkg.version);
    expect(ENGINE_VERSION).toBe(cliPkg.version);
    expect(ENGINE_VERSION).toBe(evalsPkg.version);

    // Verify CHANGELOG.md contains the current ENGINE_VERSION as the top release header
    const changelogText = await fs.readFile(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    const match = changelogText.match(/##\s*\[(\d+\.\d+\.\d+)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(ENGINE_VERSION);
  });

  it('engine pins @playwright/test exactly as a devDependency only (no runtime dep after the verify purge)', async () => {
    const engine = await readJson('packages/engine/package.json');
    expect(engine.devDependencies?.['@playwright/test']).toBe('1.51.1');
    expect(engine.optionalDependencies).toBeUndefined();
  });
});
