import { describe, it, expect } from 'vitest';
import { renderPythonSelect } from '../src/plan/templates/python/components.js';
import { renderJavaSelect } from '../src/plan/templates/java/project.js';
import { renderCsharpSelect } from '../src/plan/templates/csharp/project.js';
import { renderCypressSelect } from '../src/plan/templates/cypress/project.js';

/**
 * Regression guard for the semantics bug found and fixed in the CPOM cross-language parity
 * batch: Python's `Select` originally duplicated `NativeSelect` (native <select> wrapper)
 * instead of porting TypeScript's descriptor/listbox-overlay `Select`. Every language's
 * `Select` render function must resolve a listbox/option overlay and reveal it (never a bare
 * native-select call as its only action), so this mislabeling cannot silently recur.
 */
describe('Cross-language Select semantics parity', () => {
  const cases: Array<{ name: string; text: string }> = [
    { name: 'Python', text: renderPythonSelect() },
    { name: 'Java', text: renderJavaSelect() },
    { name: 'C#', text: renderCsharpSelect() },
    { name: 'Cypress TS', text: renderCypressSelect() },
  ];

  for (const { name, text } of cases) {
    describe(name, () => {
      it('resolves a listbox overlay and a reveal recipe', () => {
        expect(text).toMatch(/listbox/i);
        expect(text).toMatch(/reveal|open\(/i);
        expect(text).toMatch(/option/i);
      });

      it('does not use a bare native-select call as its only action', () => {
        expect(text).not.toMatch(/\bselect_option\(/);
        expect(text).not.toMatch(/\bSelectOptionAsync\(/);
        expect(text).not.toMatch(/\.selectOption\(/);
        expect(text).not.toMatch(/\.select\(/);
      });

      it('contains zero Lock-in ("EITR"/"Eitr") strings', () => {
        expect(text).not.toContain('EITR');
        expect(text).not.toContain('Eitr');
      });
    });
  }
});
