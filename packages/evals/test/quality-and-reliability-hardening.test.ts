import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE_ASSET_FILES } from '../../engine/src/plan/assets.js';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';
import {
  renderConventionsMd,
  renderAiGenerateText,
} from '../../engine/src/plan/templates/ai-rules.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('AC-1 to AC-5: EITR Quality, Reliability & CPOM Primitives Hardening', () => {
  it('AC-1: registers new CPOM primitives and FrameContainer in BASE_ASSET_FILES', () => {
    expect(BASE_ASSET_FILES['components/base/frame-container.ts']).toBe(
      'components/base/frame-container.ts',
    );
    expect(BASE_ASSET_FILES['components/primitives/element.ts']).toBe(
      'components/primitives/element.ts',
    );
    expect(BASE_ASSET_FILES['components/primitives/heading.ts']).toBe(
      'components/primitives/heading.ts',
    );
    // Slider is a situational primitive (2026-08-31) - pom-engineer synthesizes it on demand
    // instead of it being unconditionally scaffolded; it must NOT be in the base asset manifest.
    expect(BASE_ASSET_FILES['components/primitives/slider.ts']).toBeUndefined();
  });

  it('AC-1: physical files exist in packages/engine/assets/runtime/', async () => {
    const runtimeBase = path.join(repoRoot, 'packages/engine/assets/runtime');
    const frameContainer = await fs.readFile(
      path.join(runtimeBase, 'components/base/frame-container.ts'),
      'utf8',
    );
    const element = await fs.readFile(
      path.join(runtimeBase, 'components/primitives/element.ts'),
      'utf8',
    );
    const heading = await fs.readFile(
      path.join(runtimeBase, 'components/primitives/heading.ts'),
      'utf8',
    );

    expect(frameContainer).toContain('export class FrameContainer extends Component');
    expect(frameContainer).toContain('childInFrame');
    expect(element).toContain('export class Element extends Component');
    expect(heading).toContain('export class Heading extends Component');
  });

  it('AC-2: scope.ts contains slider in AriaRole', async () => {
    const scopeTs = await fs.readFile(
      path.join(repoRoot, 'packages/engine/assets/runtime/components/base/scope.ts'),
      'utf8',
    );
    expect(scopeTs).toContain("'slider'");
  });

  it('AC-3: ai-operational-skills.ts mandates Race-Free Event Synchronization', () => {
    const skillsFiles = planAiOperationalSkills(['gemini'], 'playwright', 'typescript');
    const automateTicket = skillsFiles.find((f) => f.path.includes('automate-ticket'));
    const scanPom = skillsFiles.find((f) => f.path.includes('scan-and-generate-pom'));

    expect(automateTicket).toBeDefined();
    const automateContent = (automateTicket!.source as { text: string }).text;
    expect(automateContent).toContain('Promise.all([page.waitForEvent(');
    expect(automateContent).toContain('dialog');

    expect(scanPom).toBeDefined();
    const scanContent = (scanPom!.source as { text: string }).text;
    expect(scanContent).toContain('Web-First');
  });

  it('AC-4: ai-rules.ts enforces Web-First Matchers and prohibits *Now() in assertions', () => {
    const conventionsMd = renderConventionsMd('playwright', 'typescript');
    expect(conventionsMd).toContain('Web-First');
    expect(conventionsMd).toContain('Now()');

    const generateText = renderAiGenerateText('playwright', 'typescript');
    expect(generateText).toContain('Promise.all([page.waitForEvent(');
  });

  it('AC-5: components/primitives/index.ts exports element, heading, slider', async () => {
    const primitivesIndex = await fs.readFile(
      path.join(repoRoot, 'packages/engine/assets/runtime/components/primitives/index.ts'),
      'utf8',
    );
    expect(primitivesIndex).toContain("export * from './element';");
    expect(primitivesIndex).toContain("export * from './heading';");
    // Slider is a situational, on-demand-synthesized primitive (2026-08-31) - must NOT be
    // unconditionally exported from the default barrel.
    expect(primitivesIndex).not.toContain("export * from './slider';");
  });
});
