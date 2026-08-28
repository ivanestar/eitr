import { describe, it, expect } from 'vitest';
import { renderReactHelpers } from '../src/plan/templates/react-helpers.js';
import { renderVueHelpers } from '../src/plan/templates/vue-helpers.js';
import { renderSvelteHelpers } from '../src/plan/templates/svelte-helpers.js';
import { renderAngularHelpers } from '../src/plan/templates/angular-helpers.js';

describe('Framework Hydration Helper Content', () => {
  it('renders React hydration helper with a network-idle wait and no lock-in strings', () => {
    const text = renderReactHelpers();
    expect(text).toContain('waitForReactHydration');
    expect(text).toContain("waitForLoadState('domcontentloaded')");
    expect(text).toContain("waitForLoadState('networkidle')");
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });

  it('renders Vue hydration helper with a network-idle wait and no lock-in strings', () => {
    const text = renderVueHelpers();
    expect(text).toContain('waitForVueHydration');
    expect(text).toContain("waitForLoadState('domcontentloaded')");
    expect(text).toContain("waitForLoadState('networkidle')");
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });

  it('renders Svelte hydration helper with a network-idle wait and no lock-in strings', () => {
    const text = renderSvelteHelpers();
    expect(text).toContain('waitForSvelteHydration');
    expect(text).toContain("waitForLoadState('domcontentloaded')");
    expect(text).toContain("waitForLoadState('networkidle')");
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });

  it('renders Angular hydration helper with Zone.js testability polling and no lock-in strings', () => {
    const text = renderAngularHelpers();
    expect(text).toContain('waitForAngularHydration');
    expect(text).toContain('getAllAngularTestabilities');
    expect(text).toContain('whenStable');
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });
});
