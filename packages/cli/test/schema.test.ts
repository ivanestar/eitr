import { describe, it, expect } from 'vitest';
import { QUESTIONS } from '../src/questionnaire/schema.js';
import { validateAnswer } from '../src/questionnaire/validators.js';

describe('AI_ASSISTANT_CHOICES includes aider', () => {
  const aiAssistantsQuestion = QUESTIONS.find((q) => q.id === 'aiAssistants');

  it('exposes aider as a selectable AI assistant choice', () => {
    expect(aiAssistantsQuestion).toBeDefined();
    if (aiAssistantsQuestion?.kind === 'multiselect') {
      const values = aiAssistantsQuestion.choices.map((c) => c.value);
      expect(values).toContain('aider');
    }
  });

  it('accepts aider as a valid non-interactive (--yes/prefill) value, not rejected as an invalid choice', () => {
    if (!aiAssistantsQuestion) throw new Error('aiAssistants question not found');
    const result = validateAnswer(aiAssistantsQuestion, 'aider');
    expect(result.ok).toBe(true);
  });
});
