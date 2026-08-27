import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Task 5: Animation & Heavy Render Synchronization Helper', () => {
  const tsComponentPath = path.resolve(
    process.cwd(),
    'packages/engine/assets/runtime/components/base/component.ts',
  );
  const tsBasePagePath = path.resolve(
    process.cwd(),
    'packages/engine/assets/runtime/components/base/base-page.ts',
  );

  it('AC-1: Component runtime asset provides waitForAnimations method', () => {
    const content = fs.readFileSync(tsComponentPath, 'utf8');
    expect(content).toContain('waitForAnimations');
    expect(content).toContain('getAnimations');
  });

  it('AC-2: BasePage runtime asset provides waitForAnimations method', () => {
    const content = fs.readFileSync(tsBasePagePath, 'utf8');
    expect(content).toContain('waitForAnimations');
    expect(content).toContain('getAnimations');
  });

  it('AC-3: Zero arbitrary sleep and pure Promise.all in animation waiter', () => {
    const componentContent = fs.readFileSync(tsComponentPath, 'utf8');
    expect(componentContent).toContain('Promise.all');
    // Ensure no hardcoded arbitrary page.waitForTimeout
    expect(componentContent).not.toContain('waitForTimeout');
  });

  it('AC-4: Zero-Emoji policy strictly maintained in runtime component assets', () => {
    const componentContent = fs.readFileSync(tsComponentPath, 'utf8');
    const basePageContent = fs.readFileSync(tsBasePagePath, 'utf8');

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(componentContent)).toBe(false);
    expect(emojiRegex.test(basePageContent)).toBe(false);
  });
});
