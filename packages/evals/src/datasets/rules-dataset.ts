/**
 * Golden Dataset for evaluating all Rule Documents across all 6 AI Assistants.
 */

export interface GoldenRuleCase {
  ruleName:
    | 'CLAUDE.md'
    | 'AGENTS.md'
    | 'CONVENTIONS.md'
    | '.cursor/rules'
    | '.windsurf'
    | '.codex'
    | '.github/copilot';
  assistant: string;
  mandatoryStandards: {
    rulePatterns: string[];
    forbiddenPatterns: string[];
  };
}

export const GOLDEN_RULES_DATASET: GoldenRuleCase[] = [
  {
    ruleName: 'CLAUDE.md',
    assistant: 'Claude Code',
    mandatoryStandards: {
      rulePatterns: [
        'Component-Page Object Model',
        '3-Tier Locator Priority',
        'Now() suffix',
        'Zero Assertions in Components',
        'Linear AST',
      ],
      forbiddenPatterns: ['EITR', 'Eitr', 'sleep(', 'waitForTimeout'],
    },
  },
  {
    ruleName: 'AGENTS.md',
    assistant: 'Antigravity / Multi-Agent',
    mandatoryStandards: {
      rulePatterns: [
        'Zero-Emoji Policy',
        'Zero Lock-in',
        'Two-Strike Rule',
        'Fail-Fast',
        'Shared Primitives First',
      ],
      forbiddenPatterns: ['EITR', 'Eitr'],
    },
  },
  {
    ruleName: 'CONVENTIONS.md',
    assistant: 'Universal SDET Standards',
    mandatoryStandards: {
      rulePatterns: [
        'Method Safety Contract',
        'Now() suffix for snapshot readers',
        'Action methods async',
        'this.child(',
      ],
      forbiddenPatterns: ['expect('],
    },
  },
  {
    ruleName: '.cursor/rules',
    assistant: 'Cursor',
    mandatoryStandards: {
      rulePatterns: ['Component Page Object Model', 'getByTestId', 'Now() suffix'],
      forbiddenPatterns: ['EITR', 'Eitr'],
    },
  },
];
