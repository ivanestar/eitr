import { describe, it, expect } from 'vitest';
import * as prettier from 'prettier';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

// Guards the user-facing promise: the generated code is already clean AT generation — no need to
// run a formatter afterward. Any template/asset that drifts from the project's Prettier style fails.
const PRETTIER = { singleQuote: true, printWidth: 100, semi: true, trailingComma: 'all' as const };
const assetRoot = fileURLToPath(new URL('../assets/runtime/', import.meta.url));
const isFormattable = (p: string): boolean => p.endsWith('.ts') || p.endsWith('.json');

describe('generated output is Prettier-clean out of the box', () => {
  it('every emitted inline .ts/.json file is already formatted', async () => {
    const offenders: string[] = [];
    for (const file of plan(muiProfile(), planOptions()).files) {
      if (file.source.kind !== 'inline' || !isFormattable(file.path)) continue;
      const formatted = await prettier.format(file.source.text, {
        ...PRETTIER,
        filepath: file.path,
      });
      if (formatted !== file.source.text) offenders.push(file.path);
    }
    expect(offenders).toEqual([]);
  });

  it('every shipped asset .ts file is already formatted', async () => {
    const offenders: string[] = [];
    for (const file of plan(muiProfile(), planOptions()).files) {
      if (file.source.kind !== 'asset' || !isFormattable(file.path)) continue;
      const disk = readFileSync(join(assetRoot, file.source.assetId), 'utf8');
      const formatted = await prettier.format(disk, { ...PRETTIER, filepath: file.path });
      if (formatted !== disk) offenders.push(file.source.assetId);
    }
    expect(offenders).toEqual([]);
  });
});
