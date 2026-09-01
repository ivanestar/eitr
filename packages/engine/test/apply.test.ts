import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/apply/apply.js';
import { plan } from '../src/plan/plan.js';
import { decodeJson } from '../src/persist/json-codec.js';
import { execSync } from 'node:child_process';
import { BASE_ASSET_FILES } from '../src/plan/assets.js';
import { muiProfile, planOptions } from './helpers.js';
import type { Manifest } from '../src/types/manifest.js';

const rootNodeModules = join(process.cwd(), 'node_modules');
const tmpDirs: string[] = [];
function makeTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-apply-'));
  if (existsSync(rootNodeModules)) {
    try {
      symlinkSync(rootNodeModules, join(dir, 'node_modules'), 'junction');
    } catch {
      // Ignore symlink errors if any
    }
  }
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('apply() (runnable project)', () => {
  it('writes a complete self-contained project into a clean temp dir', async () => {
    const cwd = makeTempCwd();
    const result = await apply(plan(muiProfile(), planOptions()), cwd);

    for (const assetTarget of Object.values(BASE_ASSET_FILES)) {
      expect(existsSync(join(cwd, assetTarget)), assetTarget).toBe(true);
    }
    for (const rel of [
      'package.json',
      'playwright.config.ts',
      'eitr.config.ts',
      'tsconfig.json',
      '.gitignore',
      'README.md',
      'tests/smoke.spec.ts',
      'components/widgets/table.ts',
      'components/primitives/link.ts',
      '.eitr/manifest.json',
    ]) {
      expect(existsSync(join(cwd, rel)), rel).toBe(true);
    }
    // no legacy roots and no leftover staging dir
    expect(existsSync(join(cwd, 'generated'))).toBe(false);
    expect(existsSync(join(cwd, '.eitr-tmp'))).toBe(false);
    expect(result.clobberedOwnedFiles).toEqual([]);

    execSync('npx tsc --noEmit', { cwd, stdio: 'ignore' });
  });

  it('emits a runnable playwright.config.ts (baseURL + spreads eitrConfig) and machine-default eitr.config.ts', async () => {
    const cwd = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwd);

    const pw = readFileSync(join(cwd, 'playwright.config.ts'), 'utf8');
    expect(pw).toContain('http://localhost:4173');
    expect(pw).toContain("from './eitr.config'");
    expect(pw).toContain('defineConfig');

    const eitrConf = readFileSync(join(cwd, 'eitr.config.ts'), 'utf8');
    expect(eitrConf).toContain("testIdAttribute: 'data-testid'");
    expect(eitrConf).toContain("name: 'chromium'");
    expect(eitrConf).not.toContain('baseURL'); // baseURL lives only in playwright.config.ts
  });

  it('emits package.json with the pinned Playwright dep and a typecheck script', async () => {
    const cwd = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwd);
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    expect(pkg.devDependencies['@playwright/test']).toBe('1.62.1');
    expect(pkg.scripts.test).toBe('playwright test --project=chromium');
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    expect(pkg.type).toBe('module');
  });

  it('an asset file resolves and is readable with non-empty content', async () => {
    const cwd = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwd);
    const src = readFileSync(join(cwd, 'components/base/component.ts'), 'utf8');
    expect(src).toContain('export abstract class Component');
  });

  it('records pendingRecon in the manifest only when requested', async () => {
    const cwdDefault = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwdDefault);
    const m1 = decodeJson<Manifest>(readFileSync(join(cwdDefault, '.eitr/manifest.json'), 'utf8'));
    expect(m1.pendingRecon).toBeUndefined();

    const cwdPending = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwdPending, { pendingRecon: true });
    const m2 = decodeJson<Manifest>(readFileSync(join(cwdPending, '.eitr/manifest.json'), 'utf8'));
    expect(m2.pendingRecon).toBe(true);
  });

  it('throws for a merge-fragment writePolicy', async () => {
    const cwd = makeTempCwd();
    const genPlan = plan(muiProfile(), planOptions());
    genPlan.files.push({
      path: 'fragment.ts',
      writePolicy: 'merge-fragment',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: '// fragment' },
    });
    await expect(apply(genPlan, cwd)).rejects.toThrow('merge-fragment not implemented');
  });

  it('applies a complete runnable TypeScript + Cypress project', async () => {
    const cwd = makeTempCwd();
    const cyPlan = plan(muiProfile(), {
      ...planOptions(),
      language: 'typescript',
      automationTool: 'cypress',
    });
    const result = await apply(cyPlan, cwd);

    expect(existsSync(join(cwd, 'cypress.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'eitr.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'cypress/e2e/smoke.cy.ts'))).toBe(true);
    expect(result.clobberedOwnedFiles).toEqual([]);

    if (existsSync(join(rootNodeModules, 'cypress'))) {
      execSync('npx tsc --noEmit', { cwd, stdio: 'ignore' });
    }
  });

  it(
    'applies a complete runnable Python + Playwright project and checks python syntax',
    { timeout: 90000 },
    async () => {
      const cwd = makeTempCwd();
      const pyPlan = plan(muiProfile(), {
        ...planOptions(),
        language: 'python',
        automationTool: 'playwright',
      });
      const result = await apply(pyPlan, cwd);

      expect(existsSync(join(cwd, 'pyproject.toml'))).toBe(true);
      expect(existsSync(join(cwd, 'conftest.py'))).toBe(true);
      expect(existsSync(join(cwd, 'components/base/base_page.py'))).toBe(true);
      expect(result.clobberedOwnedFiles).toEqual([]);

      execSync('python -m compileall -q .', { cwd, stdio: 'ignore' });
    },
  );
});
