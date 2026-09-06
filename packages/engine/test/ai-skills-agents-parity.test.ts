import { describe, it, expect } from 'vitest';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { planAiAgents } from '../src/plan/templates/ai-agents.js';

describe('Polymorphic AI Operational Skills & AI Agents Parity (AC-5, AC-6, AC-7)', () => {
  describe('Pillar 2: Operational Skills Polyglot Parity', () => {
    it('TypeScript Playwright: emits native commands, fixtures/auth.setup.ts, and process.env', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
      const authSkill = skills.find((s) => s.path.includes('auth-setup'))!;
      const authText = (authSkill.source as { text: string }).text;
      expect(authText).toContain('fixtures/auth.setup.ts');
      expect(authText).toContain('.auth/user.json');
      expect(authText).toContain('process.env');

      const automateSkill = skills.find((s) => s.path.includes('automate-test'))!;
      const autoText = (automateSkill.source as { text: string }).text;
      expect(autoText).toContain('npm test');
      expect(autoText).toContain('npx playwright test');
      expect(autoText).toContain('npm run lint:cpom');
      expect(autoText).toContain('tests/TC-');
    });

    it('TypeScript Cypress: emits cy.session, Cypress.env, cypress/e2e/ paths, and zero trace.zip', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'cypress', 'typescript');
      const authSkill = skills.find((s) => s.path.includes('auth-setup'))!;
      const authText = (authSkill.source as { text: string }).text;
      expect(authText).toContain('cy.session');
      expect(authText).toContain('Cypress.env');
      expect(authText).not.toContain('.auth/user.json');
      expect(authText).not.toContain('process.env');

      const automateSkill = skills.find((s) => s.path.includes('automate-test'))!;
      const autoText = (automateSkill.source as { text: string }).text;
      expect(autoText).toContain('npx cypress run --spec');
      expect(autoText).toContain('cypress/e2e/TC-');

      const healSkill = skills.find((s) => s.path.includes('heal-test'))!;
      const healText = (healSkill.source as { text: string }).text;
      expect(healText).not.toContain('trace.zip');
    });

    it('Python pytest: emits pytest, python scripts/lint_cpom.py, os.getenv, and fixtures/auth_setup.py', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'python');
      const authSkill = skills.find((s) => s.path.includes('auth-setup'))!;
      const authText = (authSkill.source as { text: string }).text;
      expect(authText).toContain('conftest.py');
      expect(authText).toContain('browser_context_args');
      expect(authText).toContain('fixtures/auth_setup.py');
      expect(authText).toContain('os.getenv');
      expect(authText).not.toContain('process.env');

      const automateSkill = skills.find((s) => s.path.includes('automate-test'))!;
      const autoText = (automateSkill.source as { text: string }).text;
      expect(autoText).toContain('pytest');
      expect(autoText).toContain('python scripts/lint_cpom.py');
      expect(autoText).toContain('tests/test_TC_');
      expect(autoText).not.toContain('npm test');
    });

    it('C# NUnit: emits dotnet test, dotnet build -t:LintCpom, Environment.GetEnvironmentVariable, and class filter', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'csharp');
      const authSkill = skills.find((s) => s.path.includes('auth-setup'))!;
      const authText = (authSkill.source as { text: string }).text;
      expect(authText).toContain('ContextOptions()');
      expect(authText).toContain('Environment.GetEnvironmentVariable');
      expect(authText).not.toContain('process.env');

      const automateSkill = skills.find((s) => s.path.includes('automate-test'))!;
      const autoText = (automateSkill.source as { text: string }).text;
      expect(autoText).toContain('dotnet test');
      expect(autoText).toContain('dotnet build -t:LintCpom');
      expect(autoText).toContain('tests/TC_');
      expect(autoText).toContain('FullyQualifiedName~');
      expect(autoText).not.toContain('npm test');
    });

    it('Java JUnit 5: emits mvn test / ./gradlew test, java scripts/LintCpom.java, and System.getenv', () => {
      const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'java');
      const authSkill = skills.find((s) => s.path.includes('auth-setup'))!;
      const authText = (authSkill.source as { text: string }).text;
      expect(authText).toContain('NewContextOptions');
      expect(authText).toContain('System.getenv');
      expect(authText).not.toContain('process.env');

      const automateSkill = skills.find((s) => s.path.includes('automate-test'))!;
      const autoText = (automateSkill.source as { text: string }).text;
      expect(autoText).toContain('mvn test');
      expect(autoText).toContain('java scripts/LintCpom.java');
      expect(autoText).toContain('src/test/java/tests/TC_');
      expect(autoText).not.toContain('npm test');
    });
  });

  describe('Pillar 3: AI Agents Polyglot Parity', () => {
    it('Python agents: emit snake_case page paths, _now() suffix, None return type, and zero Promise/test.step', () => {
      const agents = planAiAgents(['antigravity'], 'playwright', 'python');
      const architect = agents.find((a) => a.path.includes('sdet-architect'))!;
      const archText = (architect.source as { text: string }).text;
      expect(archText).toContain('_now()');
      expect(archText).not.toContain('Promise<void>');
      expect(archText).not.toContain('process.env');

      const pom = agents.find((a) => a.path.includes('pom-engineer'))!;
      const pomText = (pom.source as { text: string }).text;
      expect(pomText).toContain('components/pages/');
      expect(pomText).toContain('_page.py');
    });

    it('C# agents: emit PascalCase page paths, NowAsync() suffix, Task return type, and zero Promise/process.env', () => {
      const agents = planAiAgents(['antigravity'], 'playwright', 'csharp');
      const architect = agents.find((a) => a.path.includes('sdet-architect'))!;
      const archText = (architect.source as { text: string }).text;
      expect(archText).toContain('NowAsync()');
      expect(archText).toContain('Task');
      expect(archText).not.toContain('Promise<void>');
      expect(archText).not.toContain('process.env');

      const pom = agents.find((a) => a.path.includes('pom-engineer'))!;
      const pomText = (pom.source as { text: string }).text;
      expect(pomText).toContain('Page.cs');
    });

    it('Java agents: emit Java directory structure, Now() suffix, void return type, and zero Promise/process.env', () => {
      const agents = planAiAgents(['antigravity'], 'playwright', 'java');
      const architect = agents.find((a) => a.path.includes('sdet-architect'))!;
      const archText = (architect.source as { text: string }).text;
      expect(archText).not.toContain('Promise<void>');
      expect(archText).not.toContain('process.env');

      const pom = agents.find((a) => a.path.includes('pom-engineer'))!;
      const pomText = (pom.source as { text: string }).text;
      expect(pomText).toContain('src/main/java/components/pages/');
    });
  });
});
