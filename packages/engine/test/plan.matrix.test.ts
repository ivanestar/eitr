import { describe, it, expect } from 'vitest';
import { plan } from '../src/plan/plan.js';
import { UnsupportedLanguageError } from '../src/plan/types.js';
import { muiProfile } from './helpers.js';

describe('plan() framework & CI/CD matrix integration', () => {
  const languages = ['typescript', 'python', 'csharp', 'java'] as const;
  const frameworks = ['react', 'vue', 'svelte', 'angular', 'unknown'] as const;
  const ciCds = ['github', 'gitlab', 'jenkins', 'teamcity', 'none'] as const;

  function automationToolFor(language: string): string {
    switch (language) {
      case 'python':
        return 'pytest';
      case 'java':
        return 'playwright-maven';
      default:
        return 'playwright';
    }
  }

  function extFor(language: string): string {
    switch (language) {
      case 'python':
        return 'py';
      case 'java':
        return 'java';
      case 'csharp':
        return 'cs';
      default:
        return 'ts';
    }
  }

  // Framework helpers (react.ts, vue.ts, etc.) are emitted only by the TS and Python adapters.
  const LANGS_WITH_FRAMEWORK_HELPERS = ['typescript', 'python'];

  for (const language of languages) {
    for (const framework of frameworks) {
      for (const ciCd of ciCds) {
        it(`generates correct files for language="${language}" framework="${framework}" and ciCd="${ciCd}"`, () => {
          const profile = muiProfile();
          profile.framework.value = framework;

          const result = plan(profile, {
            baseUrl: 'http://localhost:4173',
            projectName: 'test-app',
            language,
            automationTool: automationToolFor(language),
            ciCd,
          });

          const filePaths = result.files.map((f) => f.path);
          const ext = extFor(language);

          // 1. Assert framework-specific helper files (only for languages that emit them)
          if (LANGS_WITH_FRAMEWORK_HELPERS.includes(language)) {
            if (framework === 'react') {
              expect(filePaths).toContain(`shared/utils/react.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/vue.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/svelte.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/angular.${ext}`);
            } else if (framework === 'vue') {
              expect(filePaths).toContain(`shared/utils/vue.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/react.${ext}`);
            } else if (framework === 'svelte') {
              expect(filePaths).toContain(`shared/utils/svelte.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/react.${ext}`);
            } else if (framework === 'angular') {
              expect(filePaths).toContain(`shared/utils/angular.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/react.${ext}`);
            } else {
              expect(filePaths).not.toContain(`shared/utils/react.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/vue.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/svelte.${ext}`);
              expect(filePaths).not.toContain(`shared/utils/angular.${ext}`);
            }
          }

          // 2. Assert CI/CD workflow files
          if (ciCd === 'github') {
            expect(filePaths.some((p) => p.startsWith('.github/workflows/'))).toBe(true);
            expect(filePaths).not.toContain('.gitlab-ci.yml');
            expect(filePaths).not.toContain('Jenkinsfile');
            expect(filePaths).not.toContain('teamcity-instructions.md');
          } else if (ciCd === 'gitlab') {
            expect(filePaths).toContain('.gitlab-ci.yml');
            expect(filePaths.some((p) => p.startsWith('.github/workflows/'))).toBe(false);
          } else if (ciCd === 'jenkins') {
            expect(filePaths).toContain('Jenkinsfile');
          } else if (ciCd === 'teamcity') {
            expect(filePaths).toContain('teamcity-instructions.md');
            expect(filePaths).toContain('.teamcity/settings.kts');
            expect(filePaths).toContain('.teamcity/pom.xml');
          } else {
            expect(filePaths.some((p) => p.startsWith('.github/workflows/'))).toBe(false);
            expect(filePaths).not.toContain('.gitlab-ci.yml');
            expect(filePaths).not.toContain('Jenkinsfile');
            expect(filePaths).not.toContain('teamcity-instructions.md');
            expect(filePaths).not.toContain('.teamcity/settings.kts');
            expect(filePaths).not.toContain('.teamcity/pom.xml');
          }
        });
      }
    }
  }

  it('throws UnsupportedLanguageError for a removed language target (javascript)', () => {
    expect(() =>
      plan(muiProfile(), {
        language: 'javascript',
        automationTool: 'playwright',
      }),
    ).toThrow(UnsupportedLanguageError);
  });

  it('emits scripts/orchestrate-swarm.mjs only when at least one AI assistant is configured', () => {
    const withDefaultAssistants = plan(muiProfile(), {
      language: 'typescript',
      automationTool: 'playwright',
    });
    expect(withDefaultAssistants.files.map((f) => f.path)).toContain(
      'scripts/orchestrate-swarm.mjs',
    );

    const withNoAssistants = plan(muiProfile(), {
      language: 'typescript',
      automationTool: 'playwright',
      aiAssistants: [],
    });
    expect(withNoAssistants.files.map((f) => f.path)).not.toContain(
      'scripts/orchestrate-swarm.mjs',
    );
  });

  // AC1 (ADR 0012 Stage 1) - the two static business-intent files follow the exact same
  // AI-assistant gating as orchestrate-swarm.mjs above; Step 6's own runtime behavior is a
  // separate, opt-in question these two files are unaffected by (see plan D5).
  it('emits docs/analysis/business-intent.types.ts and scripts/validate-business-intent.mjs only when at least one AI assistant is configured', () => {
    const withDefaultAssistants = plan(muiProfile(), {
      language: 'typescript',
      automationTool: 'playwright',
    });
    const defaultPaths = withDefaultAssistants.files.map((f) => f.path);
    expect(defaultPaths).toContain('docs/analysis/business-intent.types.ts');
    expect(defaultPaths).toContain('scripts/validate-business-intent.mjs');

    const withNoAssistants = plan(muiProfile(), {
      language: 'typescript',
      automationTool: 'playwright',
      aiAssistants: [],
    });
    const noAssistantPaths = withNoAssistants.files.map((f) => f.path);
    expect(noAssistantPaths).not.toContain('docs/analysis/business-intent.types.ts');
    expect(noAssistantPaths).not.toContain('scripts/validate-business-intent.mjs');
  });
});
