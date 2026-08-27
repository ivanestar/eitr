import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/apply/apply.js';
import { plan } from '../src/plan/plan.js';
import { BASE_ASSET_FILES } from '../src/plan/assets.js';
import { muiProfile, planOptions } from './helpers.js';

const tmpDirs: string[] = [];
function makeTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-idem-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('apply() idempotency (runnable project)', () => {
  it('overwrites a hand-edited tool-owned file (eitr.config.ts) and warns once', async () => {
    const cwd = makeTempCwd();
    const genPlan = plan(muiProfile(), planOptions());
    await apply(genPlan, cwd);

    const configPath = join(cwd, 'eitr.config.ts');
    writeFileSync(configPath, '// hand-edited, should be clobbered\n', 'utf8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secondResult = await apply(genPlan, cwd);

    expect(secondResult.clobberedOwnedFiles).toContain('eitr.config.ts');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(readFileSync(configPath, 'utf8')).not.toContain('hand-edited');
  });

  it('never clobbers create-if-absent user files (playwright.config.ts, package.json)', async () => {
    const cwd = makeTempCwd();
    const genPlan = plan(muiProfile(), planOptions());
    await apply(genPlan, cwd);

    const edits: Record<string, string> = {
      'playwright.config.ts': '// my baseURL edits\n',
      'package.json': '{ "name": "mine" }\n',
    };
    for (const [rel, text] of Object.entries(edits)) writeFileSync(join(cwd, rel), text, 'utf8');

    const secondResult = await apply(genPlan, cwd);

    for (const rel of Object.keys(edits)) {
      expect(secondResult.skipped, rel).toContain(rel);
      expect(secondResult.clobberedOwnedFiles).not.toContain(rel);
      expect(readFileSync(join(cwd, rel), 'utf8')).toBe(edits[rel]);
    }
  });

  it('converges to the full expected tree from a partial (interrupted) apply', async () => {
    const cwd = makeTempCwd();
    const genPlan = plan(muiProfile(), planOptions());
    await apply(genPlan, cwd);

    unlinkSync(join(cwd, 'components/base/component.ts'));
    writeFileSync(join(cwd, 'components/primitives/button.ts'), '// stale/partial\n', 'utf8');

    await apply(genPlan, cwd);

    for (const assetTarget of Object.values(BASE_ASSET_FILES)) {
      expect(existsSync(join(cwd, assetTarget)), assetTarget).toBe(true);
    }
    const button = readFileSync(join(cwd, 'components/primitives/button.ts'), 'utf8');
    expect(button).not.toContain('stale/partial');
    expect(button).toContain('export class Button');
  });
});
