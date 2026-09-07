import { describe, it, expect } from 'vitest';
import {
  renderClaudeMd,
  renderAgentsMd,
  renderConventionsMd,
  renderCursorRuleFile,
  renderDevinRuleFile,
  renderCopilotInstructions,
  renderCopilotPathInstructions,
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

  // 2. AGENTS.md - read natively by Antigravity, Aider, Codex CLI, Cursor, and Devin Desktop
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

  // 4. Cursor Rules (.cursor/rules/*.mdc)
  it('4. Evaluates Cursor rules template compliance', () => {
    const cursorRules = renderCursorRuleFile('generate', 'playwright', 'typescript');
    const grade = gradeRulesParity(cursorRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 5. Devin Desktop Rules (.devin/rules/*.md) - Windsurf's 2026 rebrand
  it('5. Evaluates Devin Desktop rules template compliance', () => {
    const devinRules = renderDevinRuleFile('generate', 'playwright', 'typescript');
    const grade = gradeRulesParity(devinRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // 6. GitHub Copilot Instructions (repo-wide overview)
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

  // 7. GitHub Copilot path-scoped instructions (.github/instructions/*.instructions.md)
  it('7. Evaluates Copilot path-scoped instructions template compliance', () => {
    const copilotPathRules = renderCopilotPathInstructions('generate', 'playwright', 'typescript');
    const grade = gradeRulesParity(copilotPathRules);
    expect(grade.hasZeroEmoji).toBe(true);
    expect(grade.hasZeroLockIn).toBe(true);
    expect(grade.has3TierLocators).toBe(true);
    expect(grade.hasCpomMethodSafety).toBe(true);
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });
});
