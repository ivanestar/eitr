import { describe, it, expect } from 'vitest';
import { planAiAgents } from '../src/plan/templates/ai-agents.js';
import { renderExampleTest } from '../src/plan/templates/example-test.js';
import {
  renderPythonConftest,
  renderPythonExampleTest,
  renderPyprojectToml,
} from '../src/plan/templates/python/project.js';
import { renderGitHooks } from '../src/plan/templates/git-hooks.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { renderConventionsMd } from '../src/plan/templates/ai-rules.js';
import { PytestAdapter } from '../src/plan/adapters/tool/pytest.js';
import type { StackProfile } from '../src/types/stack-profile.js';

describe('DX Scaffolding Parity & Bugfix Suite', () => {
  const assistants = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

  describe('AC-1: sdet-architect Worked Example & CPOM primitives', () => {
    it('uses CPOM primitives, textNow(), and valid constructor arguments without non-existent BasePage methods', () => {
      const files = planAiAgents(['antigravity'], 'playwright', 'typescript');
      const architect = files.find((f) => f.path.includes('sdet-architect'));
      expect(architect).toBeDefined();
      const content = (architect!.source as { text: string }).text;

      // Checks from RC-01, RC-02, RC-03
      expect(content).toContain("import { TextInput } from '../primitives/text-input';");
      expect(content).toContain("import { Button } from '../primitives/button';");
      expect(content).toContain("import { Element } from '../primitives/element';");
      expect(content).toContain('this.child(TextInput,');
      expect(content).toContain('this.child(Button,');
      expect(content).toContain('errorTextNow(): Promise<string | null>');
      expect(content).toContain('return this.errorMessage.textNow();');

      // Negatives from NC-01, NC-02, NC-03
      expect(content).not.toContain('this.getByTestId(');
      expect(content).not.toContain('this.getByRole(');
      expect(content).not.toContain('{ root:');
      expect(content).not.toContain('.locator.textContent()');
    });
  });

  describe('AC-2: pom-engineer primitives catalog & scope contracts', () => {
    it('lists RadioButton/RadioGroup without Radio typo, clarifies Select vs NativeSelect, Dialog vs Table, and FrameContainer', () => {
      const files = planAiAgents(['antigravity'], 'playwright', 'typescript');
      const pomEngineer = files.find((f) => f.path.includes('pom-engineer'));
      expect(pomEngineer).toBeDefined();
      const content = (pomEngineer!.source as { text: string }).text;

      // RC-04: RadioButton, RadioGroup (no standalone `Radio,`)
      expect(content).toMatch(/RadioButton,\s*RadioGroup/);
      expect(content).not.toMatch(/\bRadio,\s*RadioButton\b/);

      // RC-05, NC-04: Select vs NativeSelect
      expect(content).toContain('SelectDescriptor');
      expect(content).toContain('NativeSelect');

      // RC-06, NC-05: Dialog vs Table scope
      expect(content).toContain('Dialog');
      expect(content).toContain('Table');

      // RC-07, NC-06: FrameContainer for iframes
      expect(content).toContain('FrameContainer');
    });
  });

  describe('AC-3: example-test.ts fixture consumption & clean locators', () => {
    it('imports from ./fixtures, includes fixture usage example, and has zero _react=/_vue= selectors', () => {
      const content = renderExampleTest('playwright', 'typescript');

      // RC-08, NC-08: import from @fixtures alias
      expect(content).toContain("from '@fixtures'");
      expect(content).not.toContain("from '@playwright/test'");
      expect(content).not.toContain("from './fixtures.js'");

      // RC-09: fixture injection comment
      expect(content).toContain('apiClient');

      // NC-07: zero legacy react/vue selector engines
      expect(content).not.toContain('_react=');
      expect(content).not.toContain('_vue=');
    });
  });

  describe('AC-4: Python scaffolding, fixtures & dependencies', () => {
    it('provides api_client fixture in conftest.py using collections.abc.Iterator and dynamic base_url', () => {
      const conftest = renderPythonConftest('pytest');
      expect(conftest).toContain('from collections.abc import Iterator');
      expect(conftest).toContain('def api_client(base_url: str) -> Iterator[ApiClient]:');
      expect(conftest).toContain('with ApiClient(base_url=base_url) as client:');
    });

    it('pyproject.toml includes httpx in core dependencies', () => {
      const pyproject = renderPyprojectToml();
      expect(pyproject).toMatch(/dependencies\s*=\s*\[[^\]]*"httpx>=0\.27\.0"[^\]]*\]/s);
    });

    it('renderPythonExampleTest uses web-first expect', () => {
      const testPy = renderPythonExampleTest();
      expect(testPy).toContain('expect(page.get_by_role("heading")).to_have_text("ok")');
      expect(testPy).not.toContain('assert page.get_by_role("heading").inner_text() == "ok"');
    });

    it('pytest adapter scaffolds shared/__init__.py and shared/utils/__init__.py', () => {
      const profile: StackProfile = {
        language: 'python',
        tool: 'pytest',
        runtime: 'python',
        packageManager: 'pip',
        framework: 'generic',
        features: [],
        toolOptions: {},
      };
      const files = new PytestAdapter().planFiles(profile, {});
      const paths = files.map((f) => f.path);
      expect(paths).toContain('shared/__init__.py');
      expect(paths).toContain('shared/utils/__init__.py');
    });
  });

  describe('AC-5: git-hooks.ts path casing & dynamic python runner', () => {
    it('executes scripts/lint_cpom.py with PYTHON="${PYTHON:-python3}" resolution', () => {
      const hookContent = renderGitHooks('python');
      expect(hookContent).toContain('scripts/lint_cpom.py');
      expect(hookContent).not.toContain('scripts/LintCpom.py');
      expect(hookContent).toContain('PYTHON="${PYTHON:-python3}"');
    });
  });

  describe('AC-6: /design-test-cases TMS issue recording', () => {
    it('specifies calling mcp__tms__create_issue when user approves', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
      const designSkill = skills.find((s) => s.path.includes('design-test-cases'));
      expect(designSkill).toBeDefined();
      const content = (designSkill!.source as { text: string }).text;
      expect(content).toContain('mcp__tms__create_issue');
    });
  });

  describe('AC-7: CONVENTIONS.md language-parameterized hydration helpers', () => {
    it('parameterizes hydration helper import path by stack language', () => {
      const tsConventions = renderConventionsMd('playwright', 'typescript');
      expect(tsConventions).toContain('shared/utils/react.ts');

      const pyConventions = renderConventionsMd('playwright', 'python');
      expect(pyConventions).toContain('shared/utils/react.py');

      const javaConventions = renderConventionsMd('playwright', 'java');
      expect(javaConventions).toContain('shared.utils.ReactHelpers');

      const csharpConventions = renderConventionsMd('playwright', 'csharp');
      expect(csharpConventions).toContain('Shared.Utils.ReactHelpers');
    });
  });

  describe('Zero-Config Default Verification (Anti-Blind-Spot Guard)', () => {
    it('planAiAgents() with zero arguments produces full default assistant files', () => {
      const files = planAiAgents();
      expect(files.length).toBeGreaterThan(0);
      const architect = files.find((f) => f.path.includes('sdet-architect'));
      expect(architect).toBeDefined();
    });

    it('renderExampleTest() with zero arguments defaults cleanly', () => {
      const content = renderExampleTest();
      expect(content).toContain("from '@fixtures'");
      expect(content).not.toContain('_react=');
    });

    it('renderConventionsMd() with zero arguments defaults to TypeScript and contains react hydration helper', () => {
      const content = renderConventionsMd();
      expect(content).toContain('shared/utils/react.ts');
    });

    it('renderGitHooks() with zero arguments defaults to bash hook', () => {
      const content = renderGitHooks();
      expect(content).toContain('npm run lint:cpom');
    });

    it('planAiOperationalSkills() with zero arguments produces default skill files', () => {
      const skills = planAiOperationalSkills();
      expect(skills.length).toBeGreaterThan(0);
      const designSkill = skills.find((s) => s.path.includes('design-test-cases'));
      expect(designSkill).toBeDefined();
    });
  });
});
