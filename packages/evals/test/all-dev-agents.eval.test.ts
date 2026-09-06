import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Distinct from all-agents.eval.test.ts, which benchmarks the 7-agent roster
// generated INTO end-user scaffolded projects (via graders/golden datasets).
// This file instead verifies EITR's OWN 14 development-time agent
// definitions under .claude/agents/ - the files that drive Claude Code
// sessions working on the EITR repository itself (CLAUDE.md Section 13's
// Tier 2 pipeline, Section 6's model-routing policy).

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const agentsDir = path.join(repoRoot, '.claude', 'agents');

const EXPECTED_AGENT_NAMES = [
  'agent-reviewer',
  'architect',
  'code-reviewer',
  'core-developer',
  'doc-sync-enforcer',
  'eval-engineer',
  'framework-auditor',
  'innovation-brainstormer',
  'npm-release-engineer',
  'qa-guard',
  'review-arbiter',
  'skill-reviewer',
  'test-writer',
  'web-researcher',
];

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

describe('All 14 EITR Dev-Agent Definitions Evaluation Benchmark (.claude/agents/)', () => {
  it('AC-1: exactly the 14 expected agent .md files exist, 0 extra, 0 missing', async () => {
    const entries = await fs.readdir(agentsDir);
    const actualNames = entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
    expect(actualNames).toEqual([...EXPECTED_AGENT_NAMES].sort());
  });

  for (const name of EXPECTED_AGENT_NAMES) {
    describe(`agent: ${name}`, () => {
      it(`AC-2: ${name}.md declares name, description, tools, and model in frontmatter`, async () => {
        const text = await fs.readFile(path.join(agentsDir, `${name}.md`), 'utf8');
        const fm = parseFrontmatter(text);
        expect(fm.name, 'frontmatter "name" must be present').toBe(name);
        expect(fm.description, 'frontmatter "description" must be present').toBeTruthy();
        expect(
          fm.tools,
          'frontmatter "tools" must be present (CLAUDE.md Section 1 minimization)',
        ).toBeTruthy();
        expect(
          fm.model,
          'frontmatter "model" must be present (CLAUDE.md Section 6 routing)',
        ).toBeTruthy();
      });

      it(`AC-3: ${name}.md declares model exactly "sonnet" or "haiku", never "opus"`, async () => {
        const text = await fs.readFile(path.join(agentsDir, `${name}.md`), 'utf8');
        const fm = parseFrontmatter(text);
        expect(['sonnet', 'haiku']).toContain(fm.model);
      });

      it(`AC-4: ${name}.md contains 0 emoji characters`, async () => {
        const text = await fs.readFile(path.join(agentsDir, `${name}.md`), 'utf8');
        expect(EMOJI_PATTERN.test(text)).toBe(false);
      });
    });
  }
});
