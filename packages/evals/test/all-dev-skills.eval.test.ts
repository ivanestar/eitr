import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Distinct from all-skills.eval.test.ts, which benchmarks the 6-skill roster
// generated INTO end-user scaffolded projects (via graders/golden datasets).
// This file instead verifies EITR's OWN 11 development-time skill
// definitions under .claude/skills/ - the files that drive Claude Code
// sessions working on the EITR repository itself.

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const skillsDir = path.join(repoRoot, '.claude', 'skills');

const EXPECTED_SKILL_SLUGS = [
  'architecture-doc-writer',
  'ast-template-engineer',
  'axis-closure-matrix',
  'commit-writer',
  'framework-quality-audit',
  'project-memory-keeper',
  'protocol-123',
  'protocol-456',
  'sdd-plan-writer',
  'stack-scaler',
  'strategic-architecture-advisor',
];

// Skills whose description was rewritten (Phase E2 of the AI-agent/skill DoD
// closure batch, 2026-08-31) to the explicit third-person "Trigger on
// requests like ..." pattern modeled by framework-quality-audit. The other 4
// (architecture-doc-writer, protocol-123, protocol-456, stack-scaler) already
// convey their invocation condition in a different, equally valid way ("Load
// before X, or when asked to Y", "triggered by '123'"/"'456'", a
// self-descriptive purpose statement) and rewriting them was out of E2's
// explicit scope - CLAUDE.md Section 4's Strict Scope Boundaries rule bans
// opportunistic rewrites of files a task didn't call out.
const EXPLICIT_TRIGGER_PHRASE_SLUGS = [
  'ast-template-engineer',
  'axis-closure-matrix',
  'commit-writer',
  'framework-quality-audit',
  'project-memory-keeper',
  'sdd-plan-writer',
  'strategic-architecture-advisor',
];

const MAX_BODY_LINES = 500;

// Matches only the actual emoji-carrying Unicode blocks (misc symbols and
// pictographs, emoticons, transport/map symbols, dingbats, variation
// selector-16, regional indicators). Deliberately excludes the general
// arrows block (U+2190-U+21FF) and misc symbols/arrows-B (U+2B00-U+2BFF) -
// these files legitimately use typographic arrows (e.g. "X" -> "Y") in
// prose, which are not emoji under this repo's Zero-Emoji Policy.
const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fields: Record<string, string> = {};
  if (!m) return fields;
  for (const rawLine of m[1].split(/\r\n|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

describe('All 11 EITR Dev-Skill Definitions Evaluation Benchmark (.claude/skills/)', () => {
  it('AC-1: exactly the 11 expected skill directories exist, 0 extra, 0 missing', async () => {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const actualSlugs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(actualSlugs).toEqual([...EXPECTED_SKILL_SLUGS].sort());
  });

  for (const slug of EXPECTED_SKILL_SLUGS) {
    describe(`skill: ${slug}`, () => {
      it(`AC-2: ${slug}/SKILL.md declares name and description in frontmatter`, async () => {
        const text = await fs.readFile(path.join(skillsDir, slug, 'SKILL.md'), 'utf8');
        const fm = parseFrontmatter(text);
        expect(fm.name, 'frontmatter "name" must be present').toBe(slug);
        expect(fm.description, 'frontmatter "description" must be present').toBeTruthy();
      });

      it(`AC-3: ${slug}/SKILL.md main body is <= ${MAX_BODY_LINES} lines`, async () => {
        const text = await fs.readFile(path.join(skillsDir, slug, 'SKILL.md'), 'utf8');
        const lineCount = text.split(/\r\n|\n/).length;
        expect(lineCount).toBeLessThanOrEqual(MAX_BODY_LINES);
      });

      it(`AC-4: ${slug}/SKILL.md contains 0 emoji characters`, async () => {
        const text = await fs.readFile(path.join(skillsDir, slug, 'SKILL.md'), 'utf8');
        expect(EMOJI_PATTERN.test(text)).toBe(false);
      });

      if (EXPLICIT_TRIGGER_PHRASE_SLUGS.includes(slug)) {
        it(`AC-5: ${slug}/SKILL.md description states an explicit trigger condition with quoted examples`, async () => {
          const text = await fs.readFile(path.join(skillsDir, slug, 'SKILL.md'), 'utf8');
          const fm = parseFrontmatter(text);
          expect(fm.description).toMatch(/\bTrigger\b/);
          expect(fm.description).toMatch(/".+"/);
        });
      }
    });
  }
});
