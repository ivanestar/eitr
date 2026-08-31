import { describe, it, expect } from 'vitest';
import { baselineStackProfile } from '../src/index.js';
import { TARGET_GENERATORS } from '../src/plan/plan.js';

describe('Target Generators Parity Audit', () => {
  const profile = baselineStackProfile('/tmp/test-project');
  const opts = { baseUrl: 'https://example.com', projectName: 'test-project' };

  it('has registered target generators', () => {
    expect(TARGET_GENERATORS.length).toBeGreaterThanOrEqual(6);
  });

  for (const generator of TARGET_GENERATORS) {
    describe(`Generator parity: ${generator.language} + ${generator.automationTool}`, () => {
      const files = generator.plan(profile, opts);
      const paths = files.map((f) => f.path.toLowerCase());

      it('emits an English README.md with run instructions', () => {
        const readmeFile = files.find((f) => f.path === 'README.md');
        expect(readmeFile).toBeDefined();
        const text = (readmeFile?.source as { text: string }).text;
        expect(text).toBeTypeOf('string');
        expect(text.length).toBeGreaterThan(50);
        // Assert English run instructions section
        expect(text.toLowerCase()).toMatch(/## (run|quick start)/);
      });

      it('emits core component base abstractions', () => {
        const fileNames = files.map((f) => f.path.split('/').pop()?.toLowerCase() ?? '');
        const hasComponent = fileNames.some(
          (n) => /^component[\._-]/.test(n) || /^component\.(ts|js|py|java|cs)$/.test(n),
        );
        const hasBasePage = fileNames.some((n) => /^base[-_]?page\.(ts|js|py|java|cs)$/.test(n));

        expect(hasComponent).toBe(true);
        expect(hasBasePage).toBe(true);

        if (
          generator.automationTool.includes('playwright') ||
          generator.automationTool === 'pytest'
        ) {
          const hasScope = fileNames.some((n) => /^scope\.(ts|js|py|java|cs)$/.test(n));
          const hasContainer = fileNames.some((n) => /^container\.(ts|js|py|java|cs)$/.test(n));
          const hasCollection = fileNames.some((n) => /^collection\.(ts|js|py|java|cs)$/.test(n));

          expect(hasScope).toBe(true);
          expect(hasContainer).toBe(true);
          expect(hasCollection).toBe(true);
        }
      });

      it('emits standard primitives (Button, TextInput, Checkbox, Link, FileInput)', () => {
        const fileNames = files.map((f) => f.path.split('/').pop()?.toLowerCase() ?? '');
        const hasButton = fileNames.some((n) => n.startsWith('button.'));
        const hasTextInput = fileNames.some(
          (n) =>
            n.startsWith('textinput.') ||
            n.startsWith('text-input.') ||
            n.startsWith('text_input.'),
        );
        const hasCheckbox = fileNames.some((n) => n.startsWith('checkbox.'));
        const hasLink = fileNames.some((n) => n.startsWith('link.'));
        const hasFileInput = fileNames.some(
          (n) =>
            n.startsWith('fileinput.') ||
            n.startsWith('file-input.') ||
            n.startsWith('file_input.'),
        );

        expect(hasButton).toBe(true);
        expect(hasTextInput).toBe(true);
        expect(hasCheckbox).toBe(true);
        expect(hasLink).toBe(true);
        expect(hasFileInput).toBe(true);
      });

      it('emits Select, Element, Heading', () => {
        const fileNames = files.map((f) => f.path.split('/').pop()?.toLowerCase() ?? '');
        const hasSelect = fileNames.some((n) => /^select\.(ts|js|py|java|cs)$/.test(n));
        const hasElement = fileNames.some((n) => /^element\.(ts|js|py|java|cs)$/.test(n));
        const hasHeading = fileNames.some((n) => /^heading\.(ts|js|py|java|cs)$/.test(n));

        expect(hasSelect).toBe(true);
        expect(hasElement).toBe(true);
        expect(hasHeading).toBe(true);
      });

      if (!generator.automationTool.includes('cypress')) {
        it('emits FrameContainer', () => {
          const fileNames = files.map((f) => f.path.split('/').pop()?.toLowerCase() ?? '');
          const hasFrameContainer = fileNames.some((n) =>
            /^frame[-_]?container\.(ts|js|py|java|cs)$/.test(n),
          );
          expect(hasFrameContainer).toBe(true);
        });
      }

      it('emits standard widgets (Dialog, Table)', () => {
        const hasDialog = paths.some((p) => p.includes('dialog'));
        const hasTable = paths.some((p) => p.includes('table'));

        expect(hasDialog).toBe(true);
        expect(hasTable).toBe(true);
      });

      it('emits a starter smoke or spec test', () => {
        const hasSmoke = paths.some(
          (p) => p.includes('smoke') || p.includes('spec') || p.includes('test'),
        );
        expect(hasSmoke).toBe(true);
      });

      if (!generator.automationTool.includes('cypress')) {
        it.each(['react', 'vue', 'svelte', 'angular'])(
          'emits framework helpers when profile framework is %s',
          (framework) => {
            const frameworkProfile = {
              ...profile,
              framework: { value: framework, label: framework, confidence: 1 },
            };
            const frameworkFiles = generator.plan(frameworkProfile, opts);
            const hasFrameworkHelper = frameworkFiles.some((f) =>
              f.path.toLowerCase().includes(framework),
            );
            expect(hasFrameworkHelper).toBe(true);
          },
        );
      }
    });
  }
});
