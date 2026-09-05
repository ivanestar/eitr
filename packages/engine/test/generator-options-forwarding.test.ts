import { describe, it, expect } from 'vitest';
import { CsharpPlaywrightGenerator } from '../src/plan/generators/csharp-playwright.js';
import { PytestPlaywrightGenerator } from '../src/plan/generators/pytest-playwright.js';
import { CypressTsGenerator } from '../src/plan/generators/cypress-ts.js';
import { PlaywrightTsGenerator } from '../src/plan/generators/playwright-ts.js';
import type { StackProfile } from '../src/types/stack-profile.js';

const dummyProfile = {
  framework: { value: 'react' },
  testIdAttribute: { value: 'data-testid' },
} as any;

describe('TargetGenerator Options Forwarding to planSharedScaffold (AC-3)', () => {
  it('CsharpPlaywrightGenerator forwards language=csharp and automationTool=playwright to planSharedScaffold when opts is empty', () => {
    const generator = new CsharpPlaywrightGenerator();
    const files = generator.plan(dummyProfile, {});
    const paths = files.map((f) => f.path);

    // C# specific shared scaffold files must be present
    expect(paths).toContain('scripts/LintCpom.cs');
    expect(paths).not.toContain('scripts/lint_cpom.py');

    // Conventions markdown should be C# conventions
    const conventions = files.find((f) => f.path === 'CONVENTIONS.md');
    expect(conventions).toBeDefined();
    const content = (conventions!.source as { text: string }).text;
    expect(content).toContain('Shared.Utils.ReactHelpers');
  });

  it('PytestPlaywrightGenerator forwards language=python to planSharedScaffold when opts is empty', () => {
    const generator = new PytestPlaywrightGenerator();
    const files = generator.plan(dummyProfile, {});
    const paths = files.map((f) => f.path);

    expect(paths).toContain('scripts/lint_cpom.py');
    expect(paths).not.toContain('scripts/LintCpom.cs');

    const conventions = files.find((f) => f.path === 'CONVENTIONS.md');
    expect(conventions).toBeDefined();
    const content = (conventions!.source as { text: string }).text;
    expect(content).toContain('shared/utils/react.py');
  });

  it('CypressTsGenerator forwards automationTool=cypress to planSharedScaffold when opts is empty', () => {
    const generator = new CypressTsGenerator();
    const files = generator.plan(dummyProfile, {});
    const paths = files.map((f) => f.path);

    // Skills should be generated for cypress
    const authSkill = files.find((f) => f.path.includes('auth-setup'));
    expect(authSkill).toBeDefined();
    const skillContent = (authSkill!.source as { text: string }).text;
    expect(skillContent).toContain('cy.session');
    expect(skillContent).not.toContain('.auth/user.json');
  });

  it('PlaywrightTsGenerator forwards language=typescript and automationTool=playwright', () => {
    const generator = new PlaywrightTsGenerator();
    const files = generator.plan(dummyProfile, {});
    const paths = files.map((f) => f.path);

    expect(paths).not.toContain('scripts/lint_cpom.py');
    expect(paths).not.toContain('scripts/LintCpom.cs');
    expect(paths).toContain('scripts/lint-cpom.js');
  });
});
