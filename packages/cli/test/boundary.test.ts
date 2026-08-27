import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliSrc = path.join(repoRoot, 'packages/cli/src');

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkTs(full)));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('CLI is a peer consumer of @eitr/engine only (D8/P6)', () => {
  it('every engine-referencing import statement targets exactly the "@eitr/engine" package entry', async () => {
    const offenders: string[] = [];
    for (const file of await walkTs(cliSrc)) {
      const text = await fs.readFile(file, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        // Matches both `import ... from '<spec>'` and `import('<spec>')`; flags anything
        // mentioning 'engine' that is not the exact public package specifier — catches a deep
        // path (@eitr/engine/dist/...), a relative reach-in (../../engine/src/...), or a
        // bare 'dist' reference.
        const match = /(?:from\s+|import\()\s*['"]([^'"]*engine[^'"]*)['"]/.exec(t);
        if (match && match[1] !== '@eitr/engine') {
          offenders.push(`${path.relative(repoRoot, file)}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no CLI source file value- or type-imports "@playwright/test" directly', async () => {
    const offenders: string[] = [];
    for (const file of await walkTs(cliSrc)) {
      const text = await fs.readFile(file, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (/['"]@playwright\/test['"]/.test(t)) {
          offenders.push(`${path.relative(repoRoot, file)}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a deep import into engine dist/internal fails to resolve against the exports map', async () => {
    // @vite-ignore: the specifier must reach Node's real ESM resolver at runtime (proving the
    // exports map truly blocks it) rather than being pre-analyzed/rewritten by Vite's import
    // analysis, which would otherwise fail the whole test file at transform time instead of
    // producing the rejected promise this assertion checks for.
    const deepPath = '@eitr/engine' + '/dist/index.js';
    await expect(import(/* @vite-ignore */ deepPath)).rejects.toThrow();
  });
});
