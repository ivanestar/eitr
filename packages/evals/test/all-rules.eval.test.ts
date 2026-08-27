import { describe, it, expect } from 'vitest';
import {
  renderClaudeMd,
  renderAgentsMd,
  renderConventionsMd,
  renderCursorrulesGenerate,
  renderWindsurfGenerate,
  renderCopilotInstructions,
  renderGeminiGenerate,
  renderCodexGenerate,
} from '../../engine/src/plan/templates/ai-rules.js';
import { gradeRulesParity } from '../src/graders/rules-parity-grader.js';

describe('All AI Assistant Rules Parity Evaluation Benchmark', () => {
  // 1. CLAUDE.md
  it('1. Evaluates CLAUDE.md rule template compliance', () => {
    const claudeMd = renderClaudeMd('playwright', 'typescript');
    const grade = gradeRulesParity(claudeMd);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 2. AGENTS.md
  it('2. Evaluates AGENTS.md rule template compliance', () => {
    const agentsMd = renderAgentsMd('playwright', 'typescript');
    const grade = gradeRulesParity(agentsMd);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 3. CONVENTIONS.md
  it('3. Evaluates CONVENTIONS.md rule template compliance', () => {
    const conventionsMd = renderConventionsMd('playwright', 'typescript');
    const grade = gradeRulesParity(conventionsMd);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 4. Cursor Rules (.cursor/rules)
  it('4. Evaluates Cursor rules template compliance', () => {
    const cursorRules = renderCursorrulesGenerate('playwright', 'typescript');
    const grade = gradeRulesParity(cursorRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 5. Windsurf Rules
  it('5. Evaluates Windsurf rules template compliance', () => {
    const windsurfRules = renderWindsurfGenerate('playwright', 'typescript');
    const grade = gradeRulesParity(windsurfRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 6. GitHub Copilot Instructions
  it('6. Evaluates Copilot instructions template compliance', () => {
    const copilotRules = renderCopilotInstructions('playwright', 'typescript');
    const grade = gradeRulesParity(copilotRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 7. Gemini CLI Rules
  it('7. Evaluates Gemini CLI rules template compliance', () => {
    const geminiRules = renderGeminiGenerate('playwright', 'typescript');
    const grade = gradeRulesParity(geminiRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 8. OpenAI Codex Rules
  it('8. Evaluates Codex rules template compliance', () => {
    const codexRules = renderCodexGenerate('playwright', 'typescript');
    const grade = gradeRulesParity(codexRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });
});
