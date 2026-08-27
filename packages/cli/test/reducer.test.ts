import { describe, it, expect } from 'vitest';
import { answersToInitAnswers } from '../src/questionnaire/reducer.js';

describe('answersToInitAnswers', () => {
  it('includes stack hints when both are known', () => {
    expect(
      answersToInitAnswers({
        startUrl: 'https://x.io/',
        outputDir: 'e2e',
        language: 'typescript',
        automationTool: 'playwright',
        framework: 'react',
        uiLibrary: 'mui',
        ciCd: 'none',
      }),
    ).toEqual({
      schemaVersion: 1,
      startUrl: 'https://x.io/',
      outputDir: 'e2e',
      stackHints: {
        language: 'typescript',
        automationTool: 'playwright',
        framework: 'react',
        uiLibrary: 'mui',
      },
    });
  });

  it('omits hints that are "unknown"', () => {
    expect(
      answersToInitAnswers({
        startUrl: 'https://x.io/',
        outputDir: '.',
        language: 'typescript',
        automationTool: 'playwright',
        framework: 'unknown',
        uiLibrary: 'unknown',
        ciCd: 'none',
      }),
    ).toEqual({
      schemaVersion: 1,
      startUrl: 'https://x.io/',
      outputDir: '.',
      stackHints: {
        language: 'typescript',
        automationTool: 'playwright',
      },
    });
  });

  it('keeps only the known hint when one side is unknown', () => {
    expect(
      answersToInitAnswers({
        startUrl: 'https://x.io/',
        outputDir: '.',
        language: 'typescript',
        automationTool: 'playwright',
        framework: 'unknown',
        uiLibrary: 'tailwind',
        ciCd: 'none',
      }),
    ).toEqual({
      schemaVersion: 1,
      startUrl: 'https://x.io/',
      outputDir: '.',
      stackHints: {
        language: 'typescript',
        automationTool: 'playwright',
        uiLibrary: 'tailwind',
      },
    });
  });

  it('is pure: identical input yields identical output', () => {
    const input = {
      startUrl: 'https://x.io/',
      outputDir: '.',
      language: 'typescript',
      automationTool: 'playwright',
      framework: 'vue',
      uiLibrary: 'none',
      ciCd: 'none',
    };
    expect(answersToInitAnswers({ ...input })).toEqual(answersToInitAnswers({ ...input }));
  });
});
