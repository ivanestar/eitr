import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderOverlayLedger } from '../src/plan/templates/overlay-ledger.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { planAiAgents } from '../src/plan/templates/ai-agents.js';
import { renderConventionsMd } from '../src/plan/templates/ai-rules.js';
import { renderSiteMapSchema } from '../src/plan/templates/site-map-schema.js';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

function setupProject(boundary?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-overlay-ledger-'));
  writeFileSync(join(dir, 'overlay-ledger.mjs'), renderOverlayLedger(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  if (boundary) {
    writeFileSync(
      join(dir, 'artifacts', 'analysis', 'app-profile.json'),
      JSON.stringify({ crawlBoundary: { value: boundary, source: 'human' } }, null, 2),
      'utf8',
    );
  }
  return dir;
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['overlay-ledger.mjs', ...args], { cwd: dir, encoding: 'utf8' });
  return { ...JSON.parse(result.stdout), exitCode: result.status };
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'modal',
    title: 'We use cookies',
    headingText: 'We use cookies',
    textExcerpt: 'This site stores cookies on your device.',
    controls: [
      { label: 'Accept all', tag: 'button', role: '' },
      { label: 'Close', tag: 'button', role: '' },
    ],
    components: ['form'],
    coveragePct: 64,
    ...overrides,
  };
}

function open(dir: string, route: string, routeId: string, obs: unknown = observation()) {
  writeFileSync(join(dir, 'observation.json'), JSON.stringify(obs, null, 2), 'utf8');
  return run(
    dir,
    'open',
    '--route=' + route,
    '--route-id=' + routeId,
    '--observation=observation.json',
  );
}

describe('scripts/overlay-ledger.mjs (real execution)', () => {
  it('reads the crawl boundary the human already set and states the dialog policy', () => {
    const dir = setupProject('read-only');
    try {
      const begun = run(dir, 'begin');
      expect(begun.boundary).toBe('read-only');
      expect(begun.allowedMethods).toEqual(['reload']);
      expect(begun.dialogPolicy).toContain("page.on('dialog')");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hands back browser-side detection source rather than describing selectors in prose', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const probe = run(dir, 'probe');
      expect(probe.source).toContain('elementFromPoint');
      expect(probe.source).toContain(':modal');
      expect(probe.options.selector).toContain('[aria-modal="true"]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names an overlay screenshot with the routeId last, so prune-screenshots keeps it', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/checkout', 'route-uuid-1');
      expect(opened.investigate).toBe(true);
      expect(opened.screenshot).toBe(
        'artifacts/site-map/screenshots/checkout-overlay-1--route-uuid-1.jpg',
      );
      expect(opened.screenshot.split('--').pop()).toBe('route-uuid-1.jpg');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('documents one overlay once, however many routes it appears on', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const first = open(dir, '/a', 'id-a');
      const second = open(dir, '/b', 'id-b');
      expect(first.investigate).toBe(true);
      expect(second.known).toBe(true);
      expect(second.investigate).toBe(false);
      expect(second.screenshot).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offers only a reload under a read-only boundary, and never a committing control', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      expect(opened.dismissPlan).toEqual(['reload']);
      expect(opened.warnings.join(' ')).toContain('Read-only boundary');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tries the cheap non-committal moves first when interaction is allowed', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      expect(opened.dismissPlan).toEqual(['escape', 'close-control', 'backdrop', 'reload']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops close-control from the plan when every control commits to something', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({
          controls: [
            { label: 'Accept all', tag: 'button', role: '' },
            { label: 'Delete account', tag: 'button', role: '' },
          ],
        }),
      );
      expect(opened.dismissPlan).toEqual(['escape', 'backdrop', 'reload']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('answers a native dialog by dismissing it, at any boundary', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({ kind: 'native-dialog', title: '', message: 'Are you sure?', controls: [] }),
      );
      expect(opened.dismissPlan).toEqual(['native-dismiss']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records a verified dismissal and reuses the method that worked on the next route', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const first = open(dir, '/a', 'id-a');
      run(dir, 'attempt', '--overlay=' + first.overlayId, '--method=escape', '--cleared=false');
      const cleared = run(
        dir,
        'attempt',
        '--overlay=' + first.overlayId,
        '--method=close-control',
        '--cleared=true',
      );
      expect(cleared.resolved).toBe(true);
      expect(cleared.dismissal).toEqual({ method: 'close-control', verified: true });

      const second = open(dir, '/b', 'id-b');
      expect(second.dismissPlan[0]).toBe('close-control');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to call a route finished while an overlay is still open', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      const pending = run(dir, 'pending', '--route=/a');
      expect(pending.mustResolve).toBe(true);
      expect(pending.open).toBe(1);

      run(dir, 'attempt', '--overlay=' + opened.overlayId, '--method=escape', '--cleared=true');
      const after = run(dir, 'pending', '--route=/a');
      expect(after.mustResolve).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks the human instead of pressing a control the boundary forbade', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      const exhausted = run(
        dir,
        'attempt',
        '--overlay=' + opened.overlayId,
        '--method=reload',
        '--cleared=false',
      );
      expect(exhausted.exhausted).toBe(true);
      expect(exhausted.escalate).toBe('ask-human');
      expect(exhausted.question).toContain('Close');
      expect(exhausted.authorizeWith).toContain('authorize --overlay=' + opened.overlayId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies one human authorization to every later appearance of that same overlay', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      run(dir, 'attempt', '--overlay=' + opened.overlayId, '--method=reload', '--cleared=false');
      const authorized = run(
        dir,
        'authorize',
        '--overlay=' + opened.overlayId,
        '--method=close-control',
      );
      expect(authorized.nextMethod).toBe('close-control');

      const second = open(dir, '/b', 'id-b');
      expect(second.dismissPlan).toContain('close-control');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives up rather than looping when nothing can clear the overlay', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({ controls: [{ label: 'Accept all', tag: 'button', role: '' }] }),
      );
      for (const method of opened.dismissPlan.slice(0, -1)) {
        run(
          dir,
          'attempt',
          '--overlay=' + opened.overlayId,
          '--method=' + method,
          '--cleared=false',
        );
      }
      const last = run(
        dir,
        'attempt',
        '--overlay=' + opened.overlayId,
        '--method=' + opened.dismissPlan[opened.dismissPlan.length - 1],
        '--cleared=false',
      );
      expect(last.gaveUp).toBe(true);
      expect(last.instruction).toContain('blocked-by-overlay');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hands back the exact overlay array to store on the route entry', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      run(dir, 'attempt', '--overlay=' + opened.overlayId, '--method=escape', '--cleared=true');
      const entries = run(dir, 'entries', '--route=/a');
      expect(entries.overlays).toHaveLength(1);
      expect(entries.overlays[0]).toMatchObject({
        kind: 'modal',
        title: 'We use cookies',
        dismissal: { method: 'escape', verified: true },
      });
      expect(entries.overlays[0].screenshot).toContain('--id-a.jpg');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('masks PII in overlay text before it reaches a committed artifact', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({
          title: 'Signed in as ivan@example.com',
          textExcerpt: 'Your account 998877665544 is ready',
        }),
      );
      run(dir, 'attempt', '--overlay=' + opened.overlayId, '--method=escape', '--cleared=true');
      const entries = run(dir, 'entries', '--route=/a');
      expect(entries.overlays[0].title).toBe('Signed in as [REDACTED]');
      expect(entries.overlays[0].textExcerpt).toContain('[REDACTED]');
      expect(entries.overlays[0].textExcerpt).not.toContain('998877665544');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The ledger used to judge each space-separated word on its own, so a number written in groups
  // never had six digits in any one word, and an address glued to a label was not a whole-word match.
  it('masks numbers written in groups and addresses glued to a label', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({
          title: 'Call +1 (555) 123-4567',
          textExcerpt: 'Card 4111 1111 1111 1111 on file. Contact:ann@corp.example',
        }),
      );
      run(dir, 'attempt', '--overlay=' + opened.overlayId, '--method=escape', '--cleared=true');
      const overlay = run(dir, 'entries', '--route=/a').overlays[0];
      expect(overlay.title).toBe('Call +[REDACTED]');
      expect(overlay.textExcerpt).toBe('Card [REDACTED] on file. Contact:[REDACTED]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('calls out site-wide furniture once instead of per route', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      open(dir, '/a', 'id-a');
      open(dir, '/b', 'id-b');
      const third = open(dir, '/c', 'id-c');
      expect(third.warnings.join(' ')).toContain('site-wide furniture');
      const report = run(dir, 'report');
      expect(report.recurring).toHaveLength(1);
      expect(report.recurring[0].routes).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports what is still open at the end of a pass', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      open(dir, '/a', 'id-a');
      const report = run(dir, 'report');
      expect(report.unresolved).toHaveLength(1);
      expect(report.totals.resolved).toBe(0);
      expect(report.summary).toContain('1 overlay(s) met');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an unknown dismissal method rather than recording a made-up one', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(dir, '/a', 'id-a');
      const result = run(
        dir,
        'attempt',
        '--overlay=' + opened.overlayId,
        '--method=wish-it-away',
        '--cleared=true',
      );
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says what is still open when a crashed pass is resumed', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      open(dir, '/a', 'id-a');
      const resumed = run(dir, 'begin');
      expect(resumed.resumed).toBe(true);
      expect(resumed.openOverlays).toBe(1);
      expect(resumed.notice).toContain('still recorded as open');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live-observed: consent banners arrive in the visitor's language ("닫기", "閉じる", a Polish
  // banner on an English site), and a bare cross has no letters for an English word list to match.
  it('finds the close control by a lone cross, a dismiss attribute or a close class, whatever the language', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const cross = open(
        dir,
        '/a',
        'id-a',
        observation({
          title: 'Cookies',
          controls: [
            { label: 'Принять', tag: 'button', role: '' },
            { label: '×', tag: 'button', role: '' },
          ],
        }),
      );
      expect(cross.closeControl).toEqual({ index: 1, label: '×', how: 'glyph' });
      expect(cross.dismissPlan).toContain('close-control');
      expect(cross.labelRequest).toBeNull();

      const byAttribute = open(
        dir,
        '/b',
        'id-b',
        observation({ title: 'Promo', controls: [{ label: '', tag: 'button', dismiss: true }] }),
      );
      expect(byAttribute.closeControl.how).toBe('dismiss-attribute');

      const byClass = open(
        dir,
        '/c',
        'id-c',
        observation({
          title: 'Newsletter',
          controls: [{ label: '', tag: 'button', classHint: 'popup__close icon' }],
        }),
      );
      expect(byClass.closeControl.how).toBe('close-class');

      // Words outrank a class: this is an accept button, whatever its class says.
      const wordsWin = open(
        dir,
        '/d',
        'id-d',
        observation({
          title: 'Consent',
          controls: [{ label: 'Accept and close', tag: 'button', classHint: 'cookie-close' }],
        }),
      );
      expect(wordsWin.closeControl).toBeNull();
      expect(wordsWin.dismissPlan).not.toContain('close-control');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks about labels it cannot read, presses only what the answer names as closing, and remembers it', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const banner = observation({
        title: 'Cookies',
        controls: [
          { label: 'Принять все', tag: 'button', role: '' },
          { label: 'Закрыть', tag: 'button', role: '' },
        ],
      });
      const opened = open(dir, '/a', 'id-a', banner);
      expect(opened.dismissPlan).toEqual(['escape', 'backdrop', 'reload']);
      expect(opened.labelRequest.controls).toEqual([
        { index: 0, label: 'Принять все' },
        { index: 1, label: 'Закрыть' },
      ]);

      writeFileSync(join(dir, 'labels.json'), JSON.stringify({ 0: 'consent' }), 'utf8');
      const partial = run(dir, 'label', '--overlay=' + opened.overlayId, '--answers=labels.json');
      expect(partial.exitCode).toBe(1);
      expect(partial.errors.join(' ')).toContain('1 ("Закрыть")');

      writeFileSync(join(dir, 'labels.json'), JSON.stringify({ 0: 'consent', 1: 'close' }), 'utf8');
      const labelled = run(dir, 'label', '--overlay=' + opened.overlayId, '--answers=labels.json');
      expect(labelled.closeControl).toEqual({ index: 1, label: 'Закрыть', how: 'assistant' });
      expect(labelled.dismissPlan).toEqual(['escape', 'close-control', 'backdrop', 'reload']);

      const again = open(dir, '/b', 'id-b', banner);
      expect(again.closeControl).toEqual({ index: 1, label: 'Закрыть', how: 'assistant' });
      expect(again.labelRequest).toBeNull();

      expect(run(dir, 'report').assistantChoices).toEqual([
        { title: 'Cookies', kind: 'modal', pressed: 'Закрыть', routes: 2 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Live: a product link "... Huawei Pura XMax ..." counted as a close control, because "x" in the
  // English list matched the start of any word.
  it('matches close words whole, and asks nothing about an overlay made only of links', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const xbox = open(
        dir,
        '/a',
        'id-a',
        observation({
          title: 'Deal',
          controls: [{ label: 'See Xbox games', tag: 'button', role: '' }],
        }),
      );
      expect(xbox.closeControl).toBeNull();
      expect(xbox.dismissPlan).not.toContain('close-control');

      const card = open(
        dir,
        '/b',
        'id-b',
        observation({
          title: 'Etui',
          controls: [{ label: 'Luksusowe etui Huawei Pura XMax', tag: 'a', role: '' }],
        }),
      );
      expect(card.closeControl).toBeNull();
      expect(card.labelRequest).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a "close" answer on a label its own list says commits to something', () => {
    const dir = setupProject('safe-interactions');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({
          title: 'Hinweis',
          controls: [
            { label: 'Einstellungen', tag: 'button', role: '' },
            { label: 'OK', tag: 'button', role: '' },
          ],
        }),
      );
      writeFileSync(join(dir, 'labels.json'), JSON.stringify({ 0: 'other', 1: 'close' }), 'utf8');
      const labelled = run(dir, 'label', '--overlay=' + opened.overlayId, '--answers=labels.json');
      expect(labelled.closeControl).toBeNull();
      expect(labelled.dismissPlan).not.toContain('close-control');
      expect(labelled.warnings.join(' ')).toContain('OK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('under a read-only boundary an answer only makes the human question possible, never a press', () => {
    const dir = setupProject('read-only');
    try {
      run(dir, 'begin');
      const opened = open(
        dir,
        '/a',
        'id-a',
        observation({
          title: 'Cookies',
          controls: [
            { label: 'Принять все', tag: 'button', role: '' },
            { label: 'Закрыть', tag: 'button', role: '' },
          ],
        }),
      );
      writeFileSync(join(dir, 'labels.json'), JSON.stringify({ 0: 'consent', 1: 'close' }), 'utf8');
      const labelled = run(dir, 'label', '--overlay=' + opened.overlayId, '--answers=labels.json');
      expect(labelled.dismissPlan).toEqual(['reload']);
      const exhausted = run(
        dir,
        'attempt',
        '--overlay=' + opened.overlayId,
        '--method=reload',
        '--cleared=false',
      );
      expect(exhausted.escalate).toBe('ask-human');
      expect(exhausted.question).toContain('Закрыть');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A script nothing invokes is worse than no script: it ships, it is documented, and it never runs.
// These check the wiring rather than the behaviour above.
describe('overlay handling is actually wired into what gets generated', () => {
  function mapSiteSkill(): string {
    const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const skill = skills.find((s) => s.path.includes('map-site'));
    expect(skill).toBeDefined();
    return (skill!.source as { kind: 'inline'; text: string }).text;
  }

  it('emits scripts/overlay-ledger.mjs into the generated project', () => {
    const paths = plan(muiProfile(), planOptions()).files.map((f) => f.path);
    expect(paths).toContain('scripts/overlay-ledger.mjs');
  });

  it('/map-site drives every command the ledger exposes', () => {
    const text = mapSiteSkill();
    for (const action of [
      'begin',
      'probe',
      'open',
      'label',
      'attempt',
      'pending',
      'entries',
      'report',
    ]) {
      expect(text).toContain('overlay-ledger.mjs ' + action);
    }
  });

  it('/map-site passes the page verdict to the crawl budget and stops on a halt', () => {
    const text = mapSiteSkill();
    expect(text).toContain('--access=<access.state from record>');
    expect(text).toContain('--mitigated=');
    expect(text).toContain('A `halt` in any answer ends the pass');
    expect(text).toContain('page-inventory.mjs classify');
  });

  it('/map-site registers the dialog handler that keeps a native dialog from stalling the crawl', () => {
    const text = mapSiteSkill();
    expect(text).toContain("page.on('dialog')");
    expect(text).toContain('auto-dismisses one ONLY while no listener exists');
  });

  it('/map-site checks itself before finishing a route rather than trusting recall', () => {
    const text = mapSiteSkill();
    expect(text).toContain('overlay-ledger.mjs pending --route=');
    expect(text).toContain('did I close everything I opened');
  });

  it('/map-site re-probes after an authorized press, which is what usually raises a modal', () => {
    const text = mapSiteSkill();
    expect(text).toContain('most likely thing in this whole crawl to raise a modal');
  });

  it('the site map schema carries the overlay record the ledger produces', () => {
    const schema = renderSiteMapSchema();
    expect(schema).toContain('"overlays"');
    expect(schema).toContain('"dismissal"');
    expect(schema).toContain('"native-dialog"');
  });

  it('the Page Object engineer is told what an overlay record is for', () => {
    const agents = planAiAgents(['antigravity'], 'playwright', 'typescript');
    const pomEngineer = agents.find((a) => a.path.includes('pom-engineer'));
    expect(pomEngineer).toBeDefined();
    const text = (pomEngineer!.source as { kind: 'inline'; text: string }).text;
    expect(text).toContain('`overlays` is a list of dialogs');
    expect(text).toContain('gave-up');
  });

  it("the project's own conventions name the ledger among the deterministic helpers", () => {
    const conventions = renderConventionsMd('playwright', 'typescript');
    expect(conventions).toContain('scripts/overlay-ledger.mjs');
  });
});
