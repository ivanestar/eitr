import { describe, it, expect } from 'vitest';
import { planAiAgents } from '../../engine/src/plan/templates/ai-agents.js';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';
import {
  renderAgentsMd,
  renderClaudeMd,
  renderConventionsMd,
  renderAiGenerateText,
} from '../../engine/src/plan/templates/ai-rules.js';

describe('AC-1 to AC-6: Protocol 123 SDET Engine, Review Arbiter & Polyglot Frameworks', () => {
  const assistants = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

  it('AC-1: protocol-123 skill defines Ground Truth adjudication & False Positive filtering rules directly (no separate review-arbiter agent is generated - folded into the skill itself)', () => {
    const skillFiles = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const p123Files = skillFiles.filter((f) => f.path.includes('protocol-123'));
    expect(p123Files.length).toBeGreaterThanOrEqual(6);

    const content = (p123Files[0].source as { text: string }).text;
    expect(content).toContain('FALSE_POSITIVE');
    expect(content).toContain('HALLUCINATED_RULE');
    expect(content).toContain('OUT_OF_SCOPE');
    expect(content).toContain('ACCEPTED');
  });

  it('AC-2: sdet-orchestrator points at named pipeline skills rather than re-describing their phases inline', () => {
    const agentFiles = planAiAgents(assistants, 'playwright', 'typescript');
    const orchestratorFiles = agentFiles.filter((f) => f.path.includes('sdet-orchestrator'));
    expect(orchestratorFiles.length).toBeGreaterThanOrEqual(1);

    const sampleContent = (orchestratorFiles[0].source as { text: string }).text;
    expect(sampleContent).toContain('Named Pipeline Skills');
    expect(sampleContent).toContain('never reimplement, shortcut, or re-describe');
  });

  it('AC-3: protocol-123 skill is planned for all 6 assistants with 8-phase SDET lifecycle', () => {
    const skillFiles = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const p123Files = skillFiles.filter(
      (f) =>
        f.path.includes('protocol-123') ||
        (f.source.kind === 'inline' && f.source.text.includes('Protocol 123')),
    );

    expect(p123Files.length).toBeGreaterThanOrEqual(6);

    const sampleSkill = p123Files[0];
    const text = (sampleSkill.source as { text: string }).text;
    expect(text).toContain('Phase 0: Pre-Flight Baseline');
    expect(text).toContain('Phase 1: Recon, Live Web Search & Ingestion');
    expect(text).toContain('Phase 2: Spec Formulation');
    expect(text).toContain('Phase 3: Plan Review & Adjudication');
    expect(text).toContain('Phase 4: Human Intent Lock');
    expect(text).toContain('Phase 5: TDD Dual Synthesis');
    expect(text).toContain('Phase 6: Code Review & Adjudication');
    expect(text).toContain('Phase 7: Two-Strike Self-Healing');
    expect(text).toContain('Phase 8: Quality Gate & Final Handoff');
  });

  it('AC-4: ai-rules.ts enshrines Protocol 123 SDET standard, Review Swarm + Adjudication, and language/tool awareness', () => {
    const agentsMd = renderAgentsMd('playwright', 'typescript');
    expect(agentsMd).toContain('Protocol 123');
    expect(agentsMd).toContain('Adjudication');
    expect(agentsMd).toContain('Web-First');

    const claudeMd = renderClaudeMd('cypress', 'typescript');
    expect(claudeMd).toContain('Protocol 123');
    expect(claudeMd).toContain('Adjudication');
    expect(claudeMd).toContain('Cypress');

    const conventionsMd = renderConventionsMd('playwright', 'typescript');
    expect(conventionsMd).toContain('Protocol 123');
  });

  it('AC-5: Deterministic reporting schemas are defined in operational skills', () => {
    const skillFiles = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const p123 = skillFiles.find((f) => f.path.includes('protocol-123'));
    expect(p123).toBeDefined();

    const text = (p123!.source as { text: string }).text;
    expect(text).toContain('Automation Proposal Artifact');
    expect(text).toContain('Review Verdict Artifact');
    expect(text).toContain('Two-Strike Triage Report');
    expect(text).toContain('Final Handoff Report');
  });

  it('AC-6: Polyglot runner commands and file extensions correctly map across tools and languages', () => {
    const tsPlaywright = renderAiGenerateText('playwright', 'typescript');
    expect(tsPlaywright).toContain('npx playwright test');
    expect(tsPlaywright).toContain('spec.ts');

    const pyPlaywright = renderAiGenerateText('playwright', 'python');
    expect(pyPlaywright).toContain('pytest');
    expect(pyPlaywright).toContain('test_');

    const csharpPlaywright = renderAiGenerateText('playwright', 'csharp');
    expect(csharpPlaywright).toContain('dotnet test');

    const javaPlaywright = renderAiGenerateText('playwright', 'java');
    expect(javaPlaywright).toContain('mvn test');
  });
});
