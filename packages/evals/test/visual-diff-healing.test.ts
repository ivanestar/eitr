import { describe, it, expect } from 'vitest';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';
import {
  renderAiGenerateText,
  renderConventionsMd,
} from '../../engine/src/plan/templates/ai-rules.js';

describe('Task 4: Visual Diff & Screenshot Overlay in Self-Healing', () => {
  const assistants = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

  it('AC-1/2: heal-test operational skill incorporates Visual Diffing in 4-Point Trace Triage (the sole surviving self-healing implementation - the former trace-debugger agent duplicated this and was removed)', () => {
    const skills = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const healSkill = skills.find((s) => s.path.includes('heal-test'));
    expect(healSkill).toBeDefined();

    const content = (healSkill?.source as { text: string }).text;
    expect(content).toContain('Visual Diff & Screenshot Overlay');
    expect(content).toContain('Visual Confidence');
    expect(content).toContain('Semantic Text/Icon Shift');
  });

  it('AC-3: ai-rules.ts documents Visual Diff analysis in self-healing', () => {
    const generateText = renderAiGenerateText('playwright', 'typescript');
    expect(generateText).toContain('Visual Diff');

    const conventionsMd = renderConventionsMd('playwright', 'typescript');
    expect(conventionsMd).toContain('Visual Diff');
  });

  it('AC-4: Zero-Emoji policy strictly maintained across all visual diff healing prompts', () => {
    const skills = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const healSkill = skills.find((s) => s.path.includes('heal-test'));
    const content = (healSkill?.source as { text: string }).text;

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(content)).toBe(false);
  });
});
