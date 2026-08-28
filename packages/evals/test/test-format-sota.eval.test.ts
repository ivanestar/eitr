import { describe, it, expect } from 'vitest';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';

describe('SOTA 2026 Test Format & Structure Modernization Suite', () => {
  it('AC-5: /automate-ticket operational skill enforces native tag metadata and fixture DI', () => {
    const skills = planAiOperationalSkills(
      ['cursor', 'claude', 'antigravity'],
      'playwright',
      'typescript',
    );
    const automateSkill = skills.find((s) => s.path.includes('automate-ticket'));
    expect(automateSkill).toBeDefined();

    const content = (automateSkill?.source as { text: string }).text;
    expect(content).toContain('tag:');
    expect(content).toContain('test.extend');
  });
});
