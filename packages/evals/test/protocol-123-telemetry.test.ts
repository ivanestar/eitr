import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';
import {
  renderAiGenerateText,
  renderConventionsMd,
} from '../../engine/src/plan/templates/ai-rules.js';

describe('Task 1: Token, Cost & Time Telemetry in Protocol 123', () => {
  const assistants = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

  it('AC-1: ai-operational-skills.ts defines Telemetry Summary table in protocol-123 skill', () => {
    const skillFiles = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const p123Files = skillFiles.filter((f) => f.path.includes('protocol-123'));
    expect(p123Files.length).toBeGreaterThanOrEqual(6);

    const sample = p123Files[0];
    const content = (sample.source as { text: string }).text;
    expect(content).toContain('Protocol 123 Telemetry Summary');
    expect(content).toContain('Est. Tokens');
    expect(content).toContain('Est. Cost');
    expect(content).toContain('Duration');
  });

  it('AC-2: ai-rules.ts enshrines Telemetry Summary in renderAiGenerateText and renderConventionsMd', () => {
    const generateText = renderAiGenerateText('playwright', 'typescript');
    expect(generateText).toContain('Protocol 123 Telemetry Summary');
    expect(generateText).toContain('Est. Tokens');
    expect(generateText).toContain('Est. Cost');

    const conventionsMd = renderConventionsMd('playwright', 'typescript');
    expect(conventionsMd).toContain('Telemetry Summary');
  });

  it('AC-3: protocol-123 SKILL.md and AGENTS.md include Telemetry Summary in Phase 8', () => {
    const skillPath = path.resolve(process.cwd(), '.agents/skills/protocol-123/SKILL.md');
    const skillContent = fs.readFileSync(skillPath, 'utf8');
    expect(skillContent).toContain('Protocol 123 Telemetry Summary');
    expect(skillContent).toContain('Est. Tokens');
    expect(skillContent).toContain('Est. Cost');

    const agentsMdPath = path.resolve(process.cwd(), 'AGENTS.md');
    const agentsMdContent = fs.readFileSync(agentsMdPath, 'utf8');
    expect(agentsMdContent).toContain('Telemetry Summary');
  });

  it('AC-4: Zero-Emoji policy strictly maintained across telemetry definitions', () => {
    const generateText = renderAiGenerateText('playwright', 'typescript');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(generateText)).toBe(false);
  });
});
