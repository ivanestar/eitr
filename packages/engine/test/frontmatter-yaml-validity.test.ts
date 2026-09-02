import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { planAiAgents } from '../src/plan/templates/ai-agents.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';

// Real YAML-parse verification, not content-string assertions: two real generation bugs already
// shipped from an unescaped free-text field (a skill/agent description, an argument hint)
// interpolated raw into a `key: value` frontmatter line - an unquoted `[create|update]` parsed as
// a flow-sequence (array) instead of a string, and an unquoted description containing "Two modes:
// create..." failed to parse at all (a colon+space inside a plain scalar reads as a nested
// mapping). A `.toContain(...)` check on the description text would not catch either failure mode
// - the text is still present, it just breaks the YAML document it's embedded in. Only actually
// parsing every generated frontmatter block with a real YAML parser proves this.

const ALL_ASSISTANTS = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

function extractFrontmatter(text: string): string | undefined {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1];
}

describe('every generated agent/skill frontmatter block is valid YAML', () => {
  it('planAiAgents: all Markdown frontmatter parses cleanly for every assistant', () => {
    const files = planAiAgents(ALL_ASSISTANTS, 'playwright', 'typescript');
    const mdFiles = files.filter((f) => f.path.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
    for (const file of mdFiles) {
      const frontmatter = extractFrontmatter(file.source.text);
      expect(frontmatter, `${file.path} should have a --- frontmatter block`).toBeDefined();
      expect(
        () => parseYaml(frontmatter!),
        `${file.path}'s frontmatter must be valid YAML`,
      ).not.toThrow();
    }
  });

  it('planAiOperationalSkills: all Markdown frontmatter parses cleanly for every assistant', () => {
    const files = planAiOperationalSkills(ALL_ASSISTANTS, 'playwright', 'typescript');
    const mdFiles = files.filter((f) => f.path.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
    for (const file of mdFiles) {
      const frontmatter = extractFrontmatter(file.source.text);
      expect(frontmatter, `${file.path} should have a --- frontmatter block`).toBeDefined();
      expect(
        () => parseYaml(frontmatter!),
        `${file.path}'s frontmatter must be valid YAML`,
      ).not.toThrow();
    }
  });

  it('regression: map-site (a description containing "Two modes: create...") parses as a plain string, not a nested mapping', () => {
    const files = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const mapSite = files.find((f) => f.path === '.agents/skills/map-site/SKILL.md');
    expect(mapSite).toBeDefined();
    const frontmatter = extractFrontmatter(mapSite!.source.text);
    const parsed = parseYaml(frontmatter!);
    expect(typeof parsed.description).toBe('string');
    expect(parsed.description).toContain('Two modes: create');
  });

  it('regression: argument-hint values starting with "[" parse as a string, not a flow-sequence array', () => {
    const files = planAiOperationalSkills(['claude'], 'playwright', 'typescript');
    const mapSite = files.find((f) => f.path === '.claude/skills/map-site/SKILL.md');
    expect(mapSite).toBeDefined();
    const frontmatter = extractFrontmatter(mapSite!.source.text);
    const parsed = parseYaml(frontmatter!);
    expect(typeof parsed['argument-hint']).toBe('string');
    expect(parsed['argument-hint']).toBe('[create|update]');
  });
});
