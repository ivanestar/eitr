import { describe, it, expect } from 'vitest';
import { plan } from '../src/plan/plan.js';
import { muiProfile } from './helpers.js';

describe('plan() framework & CI/CD matrix integration', () => {
  const languages = ['typescript', 'javascript', 'python', 'csharp', 'java'] as const;
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
      case 'javascript':
        return 'js';
      default:
        return 'ts';
    }
  }

  // Framework helpers (react.ts, vue.ts, etc.) are emitted only by TS, JS, and Python adapters.
  const LANGS_WITH_FRAMEWORK_HELPERS = ['typescript', 'javascript', 'python'];

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
          } else {
            expect(filePaths.some((p) => p.startsWith('.github/workflows/'))).toBe(false);
            expect(filePaths).not.toContain('.gitlab-ci.yml');
            expect(filePaths).not.toContain('Jenkinsfile');
            expect(filePaths).not.toContain('teamcity-instructions.md');
          }
        });
      }
    }
  }
});
