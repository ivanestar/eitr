import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSkillBriefing } from '../src/plan/templates/skill-briefing.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { plan } from '../src/plan/plan.js';
import { muiProfile, planOptions } from './helpers.js';

function setupProject(tool = 'playwright', language = 'typescript'): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-skill-briefing-'));
  writeFileSync(join(dir, 'skill-briefing.mjs'), renderSkillBriefing(tool, language), 'utf8');
  return dir;
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', ['skill-briefing.mjs', ...args], { cwd: dir, encoding: 'utf8' });
  return { ...JSON.parse(result.stdout), exitCode: result.status };
}

function skillTexts(): Map<string, string> {
  const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
  const byName = new Map<string, string>();
  for (const descriptor of skills) {
    const match = /skills[\\/]([^\\/]+)[\\/]SKILL\.md$/.exec(descriptor.path);
    if (!match) continue;
    byName.set(match[1], (descriptor.source as { kind: 'inline'; text: string }).text);
  }
  return byName;
}

describe('scripts/skill-briefing.mjs (real execution)', () => {
  it('answers for every skill this project actually generates', () => {
    const dir = setupProject();
    try {
      const known: string[] = run(dir, 'list').skills;
      for (const generated of skillTexts().keys()) {
        expect(known, 'no briefing authored for /' + generated).toContain(generated);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says what happens, how, and why - in that order, for every skill', () => {
    const dir = setupProject();
    try {
      for (const skill of run(dir, 'list').skills) {
        const briefing: string = run(dir, '--skill=' + skill).briefing;
        expect(briefing, skill).toContain('What happens:');
        expect(briefing, skill).toContain('How:');
        expect(briefing, skill).toContain('Why:');
        expect(briefing.indexOf('What happens:'), skill).toBeLessThan(briefing.indexOf('How:'));
        expect(briefing.indexOf('How:'), skill).toBeLessThan(briefing.indexOf('Why:'));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('discloses the cost and the side effects before the decision, not after', () => {
    const dir = setupProject();
    try {
      // Every skill with a real side effect has to say something about it up front. These are the
      // three whose omission actually costs: an hours-long crawl, a stage that writes and runs
      // code, and a stage that rewrites files across the project.
      const crawl: string = run(dir, '--skill=map-site').briefing;
      expect(crawl).toContain('Before you decide:');
      expect(crawl).toMatch(/hours|minutes/);
      expect(crawl).toContain('live application');

      const automate: string = run(dir, '--skill=automate-test').briefing;
      expect(automate).toContain('approve');
      expect(automate).toContain('auto-pilot');

      const rescan: string = run(dir, '--skill=bulk-rescan').briefing;
      expect(rescan).toContain('blast radius');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the pipeline entry point in the agreed block shape, word for word', () => {
    const dir = setupProject();
    try {
      expect(run(dir, '--skill=ground-zero-setup').briefing).toBe(
        [
          'What happens:',
          'Takes a brand-new project all the way to running, verified tests: it crawls your app, works out what it is made of, decides what to test, writes readable test cases, then writes and runs the actual test code.',
          '',
          'How:',
          'It runs the existing stage commands in order and adds no analysis of its own, pausing after each one so you approve what it found before it goes further. It always resumes from wherever the project actually is, so stopping is free and re-running it never starts over.',
          '',
          'Why:',
          'Done by hand, this means remembering which command follows which and working out where you left off after every pause.',
          '',
          'Before you decide:',
          '',
          '  • It signs in to your application and crawls it live, under limits you set at the crawl stage.',
          '  • No test code is ever written without your explicit approval of the proposal - in guided mode and in auto-pilot alike.',
          '  • The stage list, how long this takes, and where the pauses are come next, from the pipeline itself.',
        ].join('\n'),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives every briefing the same shape: headings on their own line, one blank line between blocks', () => {
    const dir = setupProject();
    try {
      for (const skill of run(dir, 'list').skills) {
        const briefing: string = run(dir, '--skill=' + skill).briefing;
        for (const heading of ['What happens:', 'How:', 'Why:']) {
          expect(briefing, skill).toMatch(new RegExp('(^|\\n)' + heading + '\\n\\S'));
        }
        expect(briefing, skill).not.toMatch(/\n{3}/);
        expect(briefing, skill).not.toMatch(/\s$/);
        for (const line of briefing.split('\n')) {
          if (line.startsWith('  ')) expect(line, skill).toMatch(/^ {2}• \S/);
          if (line.startsWith('[')) expect(line, skill).toMatch(/^\[(WARNING|NOTE)\] [^:]+:$/);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('puts the facts that must not be missed under their own label rather than in the list', () => {
    const dir = setupProject();
    try {
      const crawl: string = run(dir, '--skill=map-site').briefing;
      expect(crawl).toContain('[WARNING] Time and cost:\nThis is the long one');
      expect(crawl).toContain('[WARNING] Live application:\nIt touches your live application.');

      const automate: string = run(dir, '--skill=automate-test').briefing;
      expect(automate).toContain(
        '[NOTE] Your control:\nNothing is written until you approve the proposal',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('offers options that name their own outcome rather than yes and no', () => {
    const dir = setupProject();
    try {
      for (const skill of run(dir, 'list').skills) {
        const result = run(dir, '--skill=' + skill);
        if (!result.question) continue;
        const labels: string[] = result.question.options.map(
          (option: { label: string }) => option.label,
        );
        // A structured choice tool rejects a single-option call outright, and a Yes/No pair is what
        // the guidance this shape follows explicitly warns against - a label should say what will
        // happen if it is picked.
        expect(labels.length, skill).toBeGreaterThanOrEqual(2);
        for (const label of labels) {
          expect(['Yes', 'No', 'OK', 'Cancel'], skill).not.toContain(label);
        }
        expect(result.question.text, skill).not.toMatch(/are you sure/i);
        expect(
          result.question.options.map((option: { id: string }) => option.id),
          skill,
        ).toContain('start');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not ask twice for one decision when running inside the chain', () => {
    const dir = setupProject();
    try {
      const direct = run(dir, '--skill=map-features');
      expect(direct.askConfirmation).toBe(true);
      expect(direct.question).not.toBeNull();

      const inChain = run(dir, '--skill=map-features', '--context=chain');
      expect(inChain.askConfirmation).toBe(false);
      expect(inChain.question).toBeNull();
      expect(inChain.briefing).toBe(direct.briefing);
      expect(inChain.skipReason).toContain('chain gate');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lets the pipeline entry point ask its own mode question instead of a redundant one', () => {
    const dir = setupProject();
    try {
      const result = run(dir, '--skill=ground-zero-setup');
      expect(result.askConfirmation).toBe(false);
      expect(result.question).toBeNull();
      expect(result.skipReason).toContain('same decision');
      expect(result.briefing).toContain('approval');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders the stack it was generated for rather than a hardcoded one', () => {
    const dir = setupProject('cypress', 'typescript');
    try {
      expect(run(dir, '--skill=auth-setup').briefing).toContain('cy.session()');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const pythonDir = setupProject('playwright', 'python');
    try {
      expect(run(pythonDir, '--skill=scan-and-generate-pom').briefing).toContain('_page.py');
    } finally {
      rmSync(pythonDir, { recursive: true, force: true });
    }
  });

  it('refuses an unknown skill instead of inventing a briefing for it', () => {
    const dir = setupProject();
    try {
      const result = run(dir, '--skill=not-a-skill');
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A briefing nothing prints is a briefing nobody reads. These check the wiring rather than the text.
describe('every generated skill actually prints its own briefing', () => {
  it('emits scripts/skill-briefing.mjs into the generated project', () => {
    const paths = plan(muiProfile(), planOptions()).files.map((f) => f.path);
    expect(paths).toContain('scripts/skill-briefing.mjs');
  });

  it('calls the briefing script with its own name', () => {
    for (const [name, text] of skillTexts()) {
      expect(text, name).toContain('skill-briefing.mjs --skill=' + name);
    }
  });

  it('tells the model to print the briefing verbatim rather than summarizing it', () => {
    for (const [name, text] of skillTexts()) {
      expect(text, name).toContain('VERBATIM');
    }
  });

  it('carries no leftover hand-written entry check that would ask a second time', () => {
    for (const [name, text] of skillTexts()) {
      expect(text, name).not.toContain('Continue, or stop here?');
    }
  });

  it('shows the next stage briefing at the chain gate, where the decision is actually taken', () => {
    const chain = skillTexts().get('ground-zero-setup')!;
    expect(chain).toContain('--context=chain');
    expect(chain).toContain('Approve and continue to');
  });

  it('never asks about a review artifact without showing where it is', () => {
    const mapFeatures = skillTexts().get('map-features')!;
    expect(mapFeatures).toContain(
      'Never ask a question about a file without showing where the file is',
    );
  });
});
