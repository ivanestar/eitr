import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliSrc = fileURLToPath(new URL('../src', import.meta.url));

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkTs(full)));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const rel = (file: string): string => path.relative(cliSrc, file).split(path.sep).join('/');

describe('questionnaire source boundaries', () => {
  it('the driver and pure modules perform no direct IO', async () => {
    const pure = [
      'questionnaire/driver.ts',
      'questionnaire/validators.ts',
      'questionnaire/reducer.ts',
      'questionnaire/schema.ts',
      'questionnaire/io.ts',
    ];
    const banned: RegExp[] = [/process\.\w/, /node:fs/, /node:readline/];
    const offenders: string[] = [];
    for (const module of pure) {
      const text = await fs.readFile(path.join(cliSrc, module), 'utf8');
      for (const pattern of banned) {
        if (pattern.test(text)) offenders.push(`${module}: matched ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('within the questionnaire subsystem, only prompt.ts imports node:readline', async () => {
    const offenders: string[] = [];
    for (const file of await walkTs(path.join(cliSrc, 'questionnaire'))) {
      if (rel(file) === 'questionnaire/prompt.ts') continue;
      const text = await fs.readFile(file, 'utf8');
      if (/node:readline|setRawMode|emitKeypressEvents/.test(text)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it('imports only node: builtins, relative paths, or @eitr/engine (zero external deps)', async () => {
    const offenders: string[] = [];
    const importRe = /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g;
    for (const file of await walkTs(cliSrc)) {
      const text = await fs.readFile(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) {
        const spec = m[1];
        const allowed = spec.startsWith('.') || spec.startsWith('node:') || spec === '@eitr/engine';
        if (!allowed) offenders.push(`${rel(file)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
