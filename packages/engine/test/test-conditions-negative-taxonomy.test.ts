import { describe, it, expect } from 'vitest';
import { renderTestConditionsTypes } from '../src/plan/templates/test-conditions-types.js';
import { renderTestConditionsValidator } from '../src/plan/templates/test-conditions-validator.js';
import { renderTestConditionsEngine } from '../src/plan/templates/test-conditions-engine.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';

describe('Stage 2: 9-Category Negative Taxonomy & Defensive Oracle Polarity', () => {
  const NEGATIVE_CATEGORIES = [
    'invalid_input',
    'boundary',
    'missing_precondition',
    'concurrent_conflict',
    'state_violation',
    'permission_denied',
    'external_failure',
    'data_integrity',
    'error_path',
  ] as const;

  describe('AC-1: Schema Types (test-conditions.types.ts)', () => {
    it('exports NegativeCategory union with all 9 categories and adds architectural-invariant technique', () => {
      const typesContent = renderTestConditionsTypes();

      // NegativeCategory union
      expect(typesContent).toContain('export type NegativeCategory =');
      for (const cat of NEGATIVE_CATEGORIES) {
        expect(typesContent).toContain(`'${cat}'`);
      }

      // TestConditionTechnique
      expect(typesContent).toContain("'architectural-invariant'");

      // TestCondition member
      expect(typesContent).toMatch(/negativeCategory\?:\s*NegativeCategory/);
      expect(typesContent).toContain('Defensive Oracle Polarity');
    });
  });

  describe('AC-2: Mechanical Validation (validate-test-conditions.mjs)', () => {
    it('includes NEGATIVE_CATEGORY_VALUES set and architectural-invariant technique', () => {
      const validatorCode = renderTestConditionsValidator();

      expect(validatorCode).toContain('NEGATIVE_CATEGORY_VALUES');
      for (const cat of NEGATIVE_CATEGORIES) {
        expect(validatorCode).toContain(`'${cat}'`);
      }
      expect(validatorCode).toContain("'architectural-invariant'");
      expect(validatorCode).toContain('checklist-based|architectural-invariant');
    });

    it('enforces validation rules for negativeCategory, scenario, and defensive oracles', () => {
      const validatorCode = renderTestConditionsValidator();

      // Rejects negativeCategory on positive conditions
      expect(validatorCode).toContain('negativeCategory cannot be set when scenario is "positive"');

      // Mandates negativeCategory for architectural-invariant
      expect(validatorCode).toContain("technique === 'architectural-invariant'");

      // Rejects network status >= 500 under Defensive Oracle Polarity
      expect(validatorCode).toMatch(/status\s*>=\s*500/);
      expect(validatorCode).toContain('Defensive Oracle Polarity');
    });
  });

  describe('AC-3 & AC-7: Deterministic Generation & Invariant Preservation (generate-test-conditions.mjs)', () => {
    it('tags boundary and checklist negative conditions with negativeCategory', () => {
      const engineCode = renderTestConditionsEngine();

      expect(engineCode).toMatch(/negativeCategory.*['"]boundary['"]/);
      expect(engineCode).toMatch(/negativeCategory.*['"]invalid_input['"]/);
    });

    it('preserves pre-existing architectural-invariant conditions across generation passes', () => {
      const engineCode = renderTestConditionsEngine();

      expect(engineCode).toContain("c.technique === 'architectural-invariant'");
      expect(engineCode).toMatch(/invariants|invariantConditions/i);
    });

    it('salts conditionId hash for parameterless architectural-invariant conditions to prevent collision', () => {
      const engineCode = renderTestConditionsEngine();

      expect(engineCode).toContain('architectural-invariant');
      expect(engineCode).toMatch(/negativeCategory.*description|extra/);
    });
  });

  describe('AC-4: Operational Skill (/define-test-conditions)', () => {
    it('instructs agent to design route-level invariants across 9 categories in Step 2', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
      const defineSkill = skills.find((s) => s.path.includes('define-test-conditions'));
      expect(defineSkill).toBeDefined();
      const content = (defineSkill!.source as { text: string }).text;

      for (const cat of NEGATIVE_CATEGORIES) {
        expect(content).toContain(cat);
      }
      expect(content).toContain('architectural-invariant');
      expect(content).not.toContain('with conditions: [] and unsatisfiedPairs: [] left empty');
    });

    it('enforces Defensive Oracle Polarity in Step 6 Human Sign-Off Gateway', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
      const defineSkill = skills.find((s) => s.path.includes('define-test-conditions'));
      const content = (defineSkill!.source as { text: string }).text;

      expect(content).toContain('Defensive Oracle Polarity');
      expect(content).toContain('state');
      expect(content).toContain('network');
    });
  });

  describe('AC-5: Test Design Skill (/design-test-cases)', () => {
    it('integrates negativeCategory and defensive expected result templates in Step 4', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
      const designSkill = skills.find((s) => s.path.includes('design-test-cases'));
      expect(designSkill).toBeDefined();
      const content = (designSkill!.source as { text: string }).text;

      expect(content).toContain('negativeCategory');
      expect(content).toContain('Defensive Oracle Polarity');
    });
  });

  describe('AC-6: Zero-Config Default Verification (Anti-Blind-Spot Guard)', () => {
    it('all modified template generators run with zero arguments without errors', () => {
      const types = renderTestConditionsTypes();
      expect(types).toBeDefined();
      expect(types.length).toBeGreaterThan(0);

      const validator = renderTestConditionsValidator();
      expect(validator).toBeDefined();
      expect(validator.length).toBeGreaterThan(0);

      const engine = renderTestConditionsEngine();
      expect(engine).toBeDefined();
      expect(engine.length).toBeGreaterThan(0);

      const skills = planAiOperationalSkills();
      expect(skills.length).toBeGreaterThan(0);
    });
  });
});
