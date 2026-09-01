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
      'tsconfig.json',
      '.gitignore',
      'README.md',
      'tests/smoke.spec.ts',
      'components/widgets/table.ts',
      'components/primitives/link.ts',
      '.scaffold/manifest.json',
    ]) {
      expect(existsSync(join(cwd, rel)), rel).toBe(true);
    }
    // no legacy roots, no leftover staging dir, no separate machine-owned config file
    expect(existsSync(join(cwd, 'generated'))).toBe(false);
    expect(existsSync(join(cwd, '.scaffold-tmp'))).toBe(false);
    expect(existsSync(join(cwd, 'eitr.config.ts'))).toBe(false);

    execSync('npx tsc --noEmit', { cwd, stdio: 'ignore' });
  });

  it('emits a self-contained playwright.config.ts with baseURL and machine defaults inlined', async () => {
    const cwd = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwd);

    const pw = readFileSync(join(cwd, 'playwright.config.ts'), 'utf8');
    expect(pw).toContain('http://localhost:4173');
    expect(pw).toContain('defineConfig');
    expect(pw).toContain("testIdAttribute: 'data-testid'");
    expect(pw).toContain("name: 'chromium'");
    expect(existsSync(join(cwd, 'eitr.config.ts'))).toBe(false);
  });

  it('leaves every file byte-for-byte untouched on a second apply() into the same directory', async () => {
    const cwd = makeTempCwd();
    const genPlan = plan(muiProfile(), planOptions());
    await apply(genPlan, cwd);

    const before = readFileSync(join(cwd, 'components/primitives/link.ts'), 'utf8');
    const second = await apply(plan(muiProfile(), planOptions()), cwd);
    const after = readFileSync(join(cwd, 'components/primitives/link.ts'), 'utf8');

    // Every FileDescriptor is create-if-absent now (Track 1) - a second apply() is fully inert
    // for every generated file: everything is reported as skipped and no on-disk byte changes,
    // even for what used to be a 'regenerate'-policy CPOM primitive. The manifest itself is
    // always (re)written unconditionally on every apply() call - that isn't a FileDescriptor and
    // isn't subject to any writePolicy, so it's the one expected entry in `written`.
    expect(second.written).toEqual(['.scaffold/manifest.json']);
    expect(second.skipped.length).toBe(genPlan.files.length);
    expect(after).toBe(before);
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
    const m1 = decodeJson<Manifest>(
      readFileSync(join(cwdDefault, '.scaffold/manifest.json'), 'utf8'),
    );
    expect(m1.pendingRecon).toBeUndefined();

    const cwdPending = makeTempCwd();
    await apply(plan(muiProfile(), planOptions()), cwdPending, { pendingRecon: true });
    const m2 = decodeJson<Manifest>(
      readFileSync(join(cwdPending, '.scaffold/manifest.json'), 'utf8'),
    );
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
    expect(existsSync(join(cwd, 'eitr.config.ts'))).toBe(false);
    expect(existsSync(join(cwd, 'cypress/e2e/smoke.cy.ts'))).toBe(true);
    expect(result.written.length).toBeGreaterThan(0);

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
      expect(result.written.length).toBeGreaterThan(0);

      execSync('python -m compileall -q .', { cwd, stdio: 'ignore' });
    },
  );
});
