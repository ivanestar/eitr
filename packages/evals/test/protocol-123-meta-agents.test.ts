import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Protocol 123 Meta-Agents Suite (.agents/agents/)', () => {
  const agentsDir = path.resolve(process.cwd(), '.agents/agents');

  const EXPECTED_META_AGENTS = [
    'architect',
    'web-researcher',
    'test-writer',
    'eval-engineer',
    'code-reviewer',
    'review-arbiter',
    'core-developer',
    'qa-guard',
    'doc-sync-enforcer',
    'framework-auditor',
    'skill-reviewer',
    'innovation-brainstormer',
    'npm-release-engineer',
  ];

  it('all 13 specialized meta-agents exist on disk with valid AGENT.md definitions', () => {
    for (const agentName of EXPECTED_META_AGENTS) {
      const agentFile = path.join(agentsDir, agentName, 'AGENT.md');
      expect(fs.existsSync(agentFile), `Expected agent file to exist: ${agentFile}`).toBe(true);

      const content = fs.readFileSync(agentFile, 'utf8');
      expect(content.length).toBeGreaterThan(100);

      // Verify YAML frontmatter
      expect(content).toMatch(/^---\r?\nname:\s*[a-z0-9_-]+\r?\ndescription:/);

      // Zero-Emoji policy
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiRegex.test(content), `Found emoji in ${agentName}/AGENT.md`).toBe(false);
    }
  });

  it('verifies web-researcher meta-agent enforces live search and recommendations', () => {
    const content = fs.readFileSync(path.join(agentsDir, 'web-researcher', 'AGENT.md'), 'utf8');
    expect(content).toContain('Live Web Search');
    expect(content).toContain('Whitelisted Domains');
    expect(content).toContain('Web Research Findings Artifact');
    expect(content).toContain('Good Example');
    expect(content).toContain('Bad Example');
  });

  it('verifies review-arbiter meta-agent enforces false-positive filtering and judge verdicts', () => {
    const content = fs.readFileSync(path.join(agentsDir, 'review-arbiter', 'AGENT.md'), 'utf8');
    expect(content).toContain('Review Arbiter');
    expect(content).toContain('FALSE_POSITIVE');
    expect(content).toContain('HALLUCINATED_RULE');
    expect(content).toContain('OUT_OF_SCOPE');
    expect(content).toContain('Review Arbiter Verdict Artifact');
    expect(content).toContain('Good Example');
    expect(content).toContain('Bad Example');
  });

  it('verifies eval-engineer meta-agent enforces prompt eval parity', () => {
    const content = fs.readFileSync(path.join(agentsDir, 'eval-engineer', 'AGENT.md'), 'utf8');
    expect(content).toContain('Prompt Evaluation');
    expect(content).toContain('Mandatory Eval Parity');
    expect(content).toContain('Negative Constraint Bans');
    expect(content).toContain('Good Example');
    expect(content).toContain('Bad Example');
  });

  it('verifies test-writer meta-agent enforces test-first and zero-config rules', () => {
    const content = fs.readFileSync(path.join(agentsDir, 'test-writer', 'AGENT.md'), 'utf8');
    expect(content).toContain('Test-First Execution');
    expect(content).toContain('Zero-Config Default Verification');
    expect(content).toContain('Sandbox Isolation');
  });

  it('verifies code-reviewer meta-agent folds in security and flake/determinism audits', () => {
    const content = fs.readFileSync(path.join(agentsDir, 'code-reviewer', 'AGENT.md'), 'utf8');
    expect(content).toContain('Diff Entropy & Secret Scanning');
    expect(content).toContain('Path Traversal');
    expect(content).toContain('Gitignore & Artifact Isolation');
    expect(content).toContain('Zero Arbitrary Sleep');
    expect(content).toContain('Proper Asynchronous Order');
  });

  it('verifies npm-release-engineer meta-agent enforces 5-stage release protocol and safe tagging', () => {
    const content = fs.readFileSync(
      path.join(agentsDir, 'npm-release-engineer', 'AGENT.md'),
      'utf8',
    );
    expect(content).toContain('SemVer Version & Scope Parity');
    expect(content).toContain('Static Quality, Language & Integrity Gates');
    expect(content).toContain('Tarball Dry-Run & Sandbox Verification');
    expect(content).toContain('Git OpSec Commit & Release Tagging');
    expect(content).toContain('Production NPM Publication & Verification');
    expect(content).toContain('git-safe-commit.mjs');
    expect(content).toContain('@onlytests/eitr');
    expect(content).toContain('Good Example');
    expect(content).toContain('Bad Example');
  });

  it('verifies Protocol 123 SKILL.md integrates web-researcher, review-arbiter, and eval parity', () => {
    const skillContent = fs.readFileSync(
      path.resolve(process.cwd(), '.agents/skills/protocol-123/SKILL.md'),
      'utf8',
    );
    expect(skillContent).toContain('web-researcher');
    expect(skillContent).toContain('review-arbiter');
    expect(skillContent).toContain('eval-engineer');
    expect(skillContent).toContain('Mandatory Eval Parity');
    expect(skillContent).toContain('npm run eval');
    expect(skillContent).toContain('Test Quality Rubric');
  });
});
