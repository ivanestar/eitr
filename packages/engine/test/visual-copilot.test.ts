import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVisualCopilot } from '../src/plan/templates/visual-copilot.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { renderGitignore } from '../src/plan/templates/gitignore.js';
import { renderConventionsMd } from '../src/plan/templates/ai-rules.js';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-visual-copilot-'));
  writeFileSync(join(dir, 'visual-copilot.mjs'), renderVisualCopilot(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  return dir;
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['visual-copilot.mjs', ...args], { cwd: dir, encoding: 'utf8' });
  return JSON.parse(result.stdout);
}

function writeJson(dir: string, name: string, data: unknown): string {
  writeFileSync(join(dir, name), JSON.stringify(data, null, 2), 'utf8');
  return name;
}

// A manifest shaped exactly like what the in-page marking function returns: one anchor carrying a
// real URL, one button that navigates by script, and one anchor whose href addresses nothing.
function sampleManifest() {
  return {
    overlayId: 'eitr-visual-marks',
    truncated: false,
    total: 3,
    marks: [
      {
        n: 1,
        tag: 'a',
        accName: 'Checkout',
        urlAttr: '/checkout',
        rect: { x: 10, y: 20, w: 90, h: 30 },
      },
      {
        n: 2,
        tag: 'button',
        accName: 'Open dashboard',
        urlAttr: '',
        rect: { x: 10, y: 60, w: 90, h: 30 },
      },
      {
        n: 3,
        tag: 'a',
        accName: 'Menu',
        urlAttr: 'javascript:void(0)',
        rect: { x: 10, y: 100, w: 90, h: 30 },
      },
    ],
  };
}

function record(
  dir: string,
  route: string,
  verdict: unknown,
  manifest: unknown = sampleManifest(),
) {
  writeJson(dir, 'verdict.json', verdict);
  writeJson(dir, 'manifest.json', manifest);
  return run(
    dir,
    'record',
    '--route=' + route,
    '--verdict=verdict.json',
    '--manifest=manifest.json',
  );
}

describe('scripts/visual-copilot.mjs (real execution)', () => {
  it('begin starts a fresh pass, and reports a resumed one rather than silently continuing', () => {
    const dir = setupProject();
    try {
      const first = run(dir, 'begin');
      expect(first.resumed).toBe(false);
      expect(first.notice).toBeNull();

      const second = run(dir, 'begin');
      expect(second.resumed).toBe(true);
      expect(second.notice).toContain('previous visual pass');

      const reset = run(dir, 'begin', '--reset');
      expect(reset.resumed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('overlay emits browser-side source that actually parses, plus the options it needs', () => {
    const dir = setupProject();
    try {
      const output = run(dir, 'overlay');
      expect(output.options.selector).toContain('a[href]');
      expect(output.options.selector).toContain('button');
      expect(output.options.maxMarks).toBeGreaterThan(0);
      expect(output.options.urlAttrs).toContain('href');
      expect(output.overlayId).toBe('eitr-visual-marks');

      // The source is handed to page.evaluate, so a syntax error in it would only ever surface in
      // a live browser mid-crawl. Constructing it here is the cheapest possible proof it parses.
      expect(() => new Function('return (' + output.source + ')')()).not.toThrow();
      expect(() => new Function('return (' + output.teardownSource + ')')()).not.toThrow();
      expect(output.source).toContain('getBoundingClientRect');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('retake budget', () => {
    it('grants a bounded number of retakes for a page that is still rendering', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const first = run(dir, 'retake', '--route=/slow', '--reason=loading');
        expect(first.allowed).toBe(true);
        expect(first.attempt).toBe(1);
        expect(first.waitMs).toBeGreaterThan(0);

        const second = run(dir, 'retake', '--route=/slow', '--reason=loading');
        expect(second.allowed).toBe(true);
        expect(second.attempt).toBe(2);

        const third = run(dir, 'retake', '--route=/slow', '--reason=loading');
        expect(third.allowed).toBe(false);
        expect(third.waitMs).toBe(0);
        expect(third.reason).toContain('already re-shot');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('refuses a retake for a state that waiting cannot change', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = run(dir, 'retake', '--route=/cookie-wall', '--reason=blocked');
        expect(output.allowed).toBe(false);
        expect(output.reason).toContain('look the same however long you wait');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('counts each route separately, so one slow page cannot spend another page budget', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        run(dir, 'retake', '--route=/a', '--reason=loading');
        run(dir, 'retake', '--route=/a', '--reason=loading');
        const other = run(dir, 'retake', '--route=/b', '--reason=blank');
        expect(other.allowed).toBe(true);
        expect(other.attempt).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('record', () => {
    it('resolves a marked URL into a follow-up and a script-driven one into a click request', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/home', {
          renderState: 'ok',
          confidence: 'high',
          missedNavigation: [
            { mark: 1, label: 'Checkout', why: 'primary call to action' },
            { mark: 2, label: 'Open dashboard', why: 'navigates on click' },
            { mark: 3, label: 'Menu', why: 'href goes nowhere' },
          ],
        });

        expect(output.status).toBe('PASSED');
        expect(output.followUps).toHaveLength(1);
        expect(output.followUps[0]).toMatchObject({ mark: 1, url: '/checkout' });
        // A "#" or javascript: href addresses nothing, so it needs a press exactly like a button.
        expect(output.needsClick.map((item: { mark: number }) => item.mark)).toEqual([2, 3]);
        expect(output.triagePatch.state).toBe('ready');
        expect(output.triagePatch.confidence).toBe('high');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('drops a mark the page never had instead of trusting it', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/home', {
          renderState: 'ok',
          missedNavigation: [{ mark: 99, label: 'Invented', why: 'not on the page' }],
        });

        expect(output.followUps).toEqual([]);
        expect(output.needsClick).toEqual([]);
        expect(output.warnings.join(' ')).toContain('not in this route');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('strips the phantom-route flag, which a screenshot cannot be evidence for', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/ghost', {
          renderState: 'error-shell',
          anomalies: ['likely-phantom-route', 'broken-layout'],
        });

        expect(output.triagePatch.state).toBe('error_page');
        expect(output.triagePatch.flags).toEqual(['broken-layout']);
        expect(output.warnings.join(' ')).toContain('states a route is not real');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('turns a blocked view into a blocking-overlay patch naming what blocked it', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/landing', {
          renderState: 'blocked',
          blockedBy: 'cookie banner',
        });

        expect(output.triagePatch.blockingOverlay).toBe(true);
        expect(output.triagePatch.flags).toContain('blocked-by-cookie-banner');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('marks a page that never settled so a reader knows the screenshot is not the finished page', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/spinner', { renderState: 'loading' });
        expect(output.triagePatch.state).toBe('empty_state');
        expect(output.triagePatch.flags).toContain('still-rendering-at-capture');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('accepts the minimum verdict a worker can return and still produces a usable patch', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/plain', { renderState: 'ok' });
        expect(output.status).toBe('PASSED');
        expect(output.triagePatch).toEqual({ state: 'ready' });
        expect(output.followUps).toEqual([]);
        expect(output.needsClick).toEqual([]);
        expect(output.unmarkedRegions).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects a verdict whose renderState is not one of the known states', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/bad', { renderState: 'probably-fine' });
        expect(output.status).toBe('FAILED');
        expect(output.errors.join(' ')).toContain('renderState must be one of');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('caps how many candidates one route may propose and says that it did', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const manifest = sampleManifest();
        const output = record(
          dir,
          '/dense',
          {
            renderState: 'ok',
            missedNavigation: Array.from({ length: 20 }, () => ({ mark: 1, label: 'Checkout' })),
          },
          manifest,
        );
        expect(output.followUps.length).toBeLessThanOrEqual(12);
        expect(output.warnings.join(' ')).toContain('only the first');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps unmarked regions as prose for a human and never as a route', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        const output = record(dir, '/canvas', {
          renderState: 'ok',
          unmarkedRegions: [{ where: 'centre canvas', why: 'drawn menu, no DOM element under it' }],
        });
        expect(output.unmarkedRegions).toHaveLength(1);
        expect(output.unmarkedRegions[0].where).toBe('centre canvas');
        expect(output.followUps).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('pass-level reporting', () => {
    it('accumulates click candidates across routes for one consolidated question', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        record(dir, '/one', { renderState: 'ok', missedNavigation: [{ mark: 2 }] });
        record(dir, '/two', { renderState: 'ok', missedNavigation: [{ mark: 2 }] });

        const pending = run(dir, 'pending-clicks');
        expect(pending.count).toBe(2);
        expect(pending.items.map((item: { route: string }) => item.route)).toEqual([
          '/one',
          '/two',
        ]);
        expect(pending.note).toContain('Ask once');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('says nothing needs pressing when every candidate carried a URL', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        record(dir, '/one', { renderState: 'ok', missedNavigation: [{ mark: 1 }] });
        const pending = run(dir, 'pending-clicks');
        expect(pending.count).toBe(0);
        expect(pending.note).toContain('Nothing needs a click');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('warns when most of a pass named marks that did not exist', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        record(dir, '/one', {
          renderState: 'ok',
          missedNavigation: [{ mark: 51 }, { mark: 52 }, { mark: 53 }, { mark: 1 }],
        });

        const report = run(dir, 'report');
        expect(report.totals.candidatesDropped).toBe(3);
        expect(report.totals.candidatesProposed).toBe(4);
        expect(report.warnings.join(' ')).toContain('low-confidence');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reports a clean pass without inventing a warning', () => {
      const dir = setupProject();
      try {
        run(dir, 'begin');
        record(dir, '/one', { renderState: 'ok', missedNavigation: [{ mark: 1 }] });
        const report = run(dir, 'report');
        expect(report.warnings).toEqual([]);
        expect(report.totals.candidatesResolvedToUrl).toBe(1);
        expect(report.routes).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

// A script nothing invokes is worse than no script: it ships, it is documented, and it never runs.
// These check the wiring itself rather than the behaviour above.
describe('the visual pass is actually wired into what gets generated', () => {
  function mapSiteSkill(): string {
    const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const skill = skills.find((s) => s.path.includes('map-site'));
    expect(skill).toBeDefined();
    return (skill!.source as { kind: 'inline'; text: string }).text;
  }

  it('emits scripts/visual-copilot.mjs into the generated project', () => {
    const paths = plan(muiProfile(), planOptions()).files.map((f) => f.path);
    expect(paths).toContain('scripts/visual-copilot.mjs');
  });

  it('/map-site drives every command the script exposes', () => {
    const text = mapSiteSkill();
    for (const action of ['begin', 'overlay', 'retake', 'record', 'pending-clicks', 'report']) {
      expect(text).toContain('visual-copilot.mjs ' + action);
    }
  });

  it('/map-site resets screenshots on create and says update must not', () => {
    const text = mapSiteSkill();
    expect(text).toContain('map-site-status.mjs reset-screenshots');
    expect(text).toContain('`update` must never call it');
  });

  it('/map-site forbids pressing anything before the human has authorized the list', () => {
    const text = mapSiteSkill();
    expect(text).toContain('Do not press anything now');
    expect(text).toContain('Never press anything before that answer');
    // The ban everywhere else is what makes this one authorized exception safe to state at all.
    expect(text).toContain('not relaxed generally');
  });

  it('/map-site puts a visually proposed URL through the frontier gatekeeper like any other link', () => {
    const text = mapSiteSkill();
    expect(text).toContain('a visual proposal gets no special standing');
    expect(text).toContain('crawl-budget.mjs check');
  });

  it('CONVENTIONS.md tells an assistant the script exists and what it decides', () => {
    expect(renderConventionsMd('playwright', 'typescript')).toContain('scripts/visual-copilot.mjs');
  });

  it('every language ignores the transient marked-up copies', () => {
    for (const [tool, language] of [
      ['playwright', 'typescript'],
      ['playwright', 'python'],
      ['playwright', 'java'],
      ['playwright', 'csharp'],
      ['cypress', 'typescript'],
    ]) {
      expect(renderGitignore(tool, language)).toContain('artifacts/site-map/.visual-marks/');
    }
  });
});
