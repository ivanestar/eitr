import { describe, it, expect, afterEach } from 'vitest';
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
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('apply() idempotency (runnable project)', () => {
  it('never touches any create-if-absent file that still exists, hand-edited or not (playwright.config.ts, package.json)', async () => {
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
      expect(readFileSync(join(cwd, rel), 'utf8')).toBe(edits[rel]);
    }
  });

  it('recreates a genuinely missing file but never touches one that still exists, even hand-edited (partial/interrupted apply)', async () => {
    const cwd = makeTempCwd();
    const genPlan = plan(muiProfile(), planOptions());
    await apply(genPlan, cwd);

    unlinkSync(join(cwd, 'components/base/component.ts'));
    writeFileSync(join(cwd, 'components/primitives/button.ts'), '// stale/partial\n', 'utf8');

    const second = await apply(genPlan, cwd);

    // Every file the first apply() wrote is create-if-absent (Track 1: no 'regenerate' policy
    // exists any more) - a genuinely missing file (e.g. from an interrupted first apply) is still
    // recreated, since "missing" and "exists" are the only two states apply() distinguishes.
    for (const assetTarget of Object.values(BASE_ASSET_FILES)) {
      expect(existsSync(join(cwd, assetTarget)), assetTarget).toBe(true);
    }
    expect(second.written).toContain('components/base/component.ts');

    // A file that still exists on disk - even hand-edited/stale - is never touched. This is the
    // deliberate behavior change from the old 'regenerate' policy, which used to clobber it back
    // to the canonical content; EITR is a one-shot generator now, so it never does that.
    const button = readFileSync(join(cwd, 'components/primitives/button.ts'), 'utf8');
    expect(button).toContain('stale/partial');
    expect(second.skipped).toContain('components/primitives/button.ts');
  });
});
