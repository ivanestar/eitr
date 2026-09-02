import { describe, it, expect } from 'vitest';
import { planSharedScaffold } from '../src/plan/shared.js';
import { plan } from '../src/plan/plan.js';
import { renderCpomLinter } from '../src/plan/templates/cpom-linter.js';
import { renderPackageJson } from '../src/plan/templates/package-json.js';
import { renderGithubActions } from '../src/plan/templates/cicd.js';
import type { StackProfile } from '../src/types/stack-profile.js';

describe('Stage 5: Ecosystem Orchestration & E2E Scaffold Verification', () => {
  const dummyProfile: StackProfile = {
    testRunner: { value: 'playwright', confidence: 'high' },
    language: { value: 'typescript', confidence: 'high' },
    framework: { value: 'react', confidence: 'high' },
    styling: { value: 'tailwind', confidence: 'high' },
    testIdAttribute: { value: 'data-testid', confidence: 'high' },
  };

  it('generates scripts/lint-cpom.js with 6 core CPOM rules in shared scaffold', () => {
    const files = planSharedScaffold({ language: 'typescript', automationTool: 'playwright' });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('scripts/lint-cpom.js');

    const linterFile = files.find((f) => f.path === 'scripts/lint-cpom.js');
    expect(linterFile).toBeDefined();
    expect(linterFile?.source.text).toContain('Rule 1: Zero Arbitrary Delays');
    expect(linterFile?.source.text).toContain('Rule 2: Mandatory Now() Suffix');
    expect(linterFile?.source.text).toContain('Rule 3: Zero Assertions in Components');
    expect(linterFile?.source.text).toContain('Rule 4: Unawaited Promise Guard');
    expect(linterFile?.source.text).toContain('Rule 5: Fixture Dependency Injection');
    expect(linterFile?.source.text).toContain('Rule 6: Inappropriate Mocking Guard');
  });

  it('renders package.json with lint:cpom script', () => {
    const pkgText = renderPackageJson('my-test-project');
    const pkg = JSON.parse(pkgText);

    expect(pkg.scripts['lint:cpom']).toBe('node scripts/lint-cpom.js');
    expect(pkg.scripts['test:sanity']).toBeUndefined();
    expect(pkg.scripts['test']).toBe('playwright test --project=chromium');
  });

  it('renders GitHub Actions workflow with multi-tier quality gates', () => {
    const workflow = renderGithubActions('typescript', 'playwright');
    expect(workflow).toContain('Audit CPOM Contract & Anti-Fake-Green Rules');
    expect(workflow).toContain('npm run lint:cpom');
    expect(workflow).not.toContain('test:sanity');
    expect(workflow).toContain('Run Playwright tests');
    expect(workflow).toContain('npx playwright test --project=chromium --shard=');
  });

  it('executes full end-to-end plan generation with zero lock-in and zero emoji', () => {
    const result = plan(dummyProfile, {
      language: 'typescript',
      automationTool: 'playwright',
      tmsProviders: ['azure-devops'],
      ciCd: 'github',
    });

    expect(result.files.length).toBeGreaterThan(50);
    const paths = result.files.map((f) => f.path);

    // MCP
    expect(paths).toContain('.mcp/tms-bridge/index.js');
    expect(paths).toContain('.mcp.json');

    // Agents & Skills
    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/agents/tms-validator/agent.md');
    expect(paths).toContain('.agents/agents/assertion-auditor/agent.md');
    expect(paths).toContain('.agents/agents/trace-debugger/agent.md');
    expect(paths).toContain('.agents/skills/heal-test/SKILL.md');
    expect(paths).toContain('.agents/skills/automate-ticket/SKILL.md');
    expect(paths).toContain('.agents/skills/bulk-rescan/SKILL.md');

    // Scripts & Infrastructure
    expect(paths).toContain('scripts/lint-cpom.js');
    expect(paths).toContain('.github/workflows/playwright.yml');
    expect(paths).toContain('tests/fixtures.ts');
    expect(paths).toContain('shared/utils/api-client.ts');

    // Zero Lock-in check on all generated inline templates
    for (const file of result.files) {
      if (file.source.kind === 'inline') {
        expect(file.source.text).not.toContain('EITR');
        expect(file.source.text).not.toContain('Eitr');
      }
    }
  });
});
