import { describe, it, expect } from 'vitest';
import { renderLoginPageSanitySpec } from '../../engine/src/plan/templates/sanity-spec.js';
import { renderLoginPageExample } from '../../engine/src/plan/templates/login-page-example.js';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';

describe('SOTA 2026 Test Format & Structure Modernization Suite', () => {
  it('AC-1 & AC-2 & AC-3: renderLoginPageSanitySpec enforces fixture DI, tag metadata objects, and expect.soft', () => {
    const sanitySpec = renderLoginPageSanitySpec();

    // 1. Fixture DI verification (no 'let loginPage' or 'new LoginPage' in beforeEach)
    expect(sanitySpec).toContain('base.extend<{ loginPage: LoginPage }>');
    expect(sanitySpec).not.toMatch(/let\s+loginPage\s*:\s*LoginPage/);

    // 2. Native tag metadata objects
    expect(sanitySpec).toContain("tag: ['@sanity', '@tier1']");
    expect(sanitySpec).toContain("tag: ['@sanity', '@tier2']");
    expect(sanitySpec).toContain("tag: ['@sanity', '@tier3']");

    // 3. Strategic soft assertions in Tier 2
    expect(sanitySpec).toContain('expect.soft');
  });

  it('AC-4: renderLoginPageExample adheres to 3-Tier Locator Priority (no raw CSS selectors)', () => {
    const pageExample = renderLoginPageExample();

    // 3-Tier Locator Priority check
    expect(pageExample).toContain("kind: 'testId', testId: 'username-input'");
    expect(pageExample).toContain("kind: 'testId', testId: 'password-input'");
    expect(pageExample).not.toMatch(/kind:\s*'css'/);
  });

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

  it('AC-6: Zero-Emoji compliance across modernized templates', () => {
    const sanitySpec = renderLoginPageSanitySpec();
    const pageExample = renderLoginPageExample();
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    expect(emojiRegex.test(sanitySpec)).toBe(false);
    expect(emojiRegex.test(pageExample)).toBe(false);
  });
});
