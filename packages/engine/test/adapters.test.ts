import { describe, it, expect } from 'vitest';
import { muiAdapter } from '../src/plan/adapters/mui.js';
import { antdAdapter } from '../src/plan/adapters/antd.js';
import { radixAdapter } from '../src/plan/adapters/radix.js';
import { chakraAdapter } from '../src/plan/adapters/chakra.js';
import { tailwindAdapter } from '../src/plan/adapters/tailwind.js';
import { resolveAdapter } from '../src/plan/adapters/registry.js';
import type { StackProfile } from '../src/types/stack-profile.js';
import type { ComponentRole } from '../src/types/taxonomy.js';

function muiProfile(): StackProfile {
  return {
    schemaVersion: 1,
    framework: { value: 'react', confidence: 'high', source: 'package.json', evidence: [] },
    uiLibraries: [
      {
        id: 'mui',
        version: '5.15.10',
        dependencyKind: 'direct',
        confidence: 'high',
        source: 'lockfile',
        evidence: [],
      },
    ],
    packageManager: { value: 'npm', confidence: 'high', source: 'lockfile', evidence: [] },
    playwrightVersion: {
      value: '1.51.1',
      confidence: 'high',
      source: 'package.json',
      evidence: [],
    },
    moduleSystem: { value: 'ESM', confidence: 'high', source: 'package.json', evidence: [] },
    testIdAttribute: { value: 'data-testid', confidence: 'high', source: 'default', evidence: [] },
    selectorStrategy: { value: 'role-first', confidence: 'high', source: 'default', evidence: [] },
    target: { kind: 'single', root: '/fake' },
  };
}

function nonMuiProfile(): StackProfile {
  const profile = muiProfile();
  return { ...profile, uiLibraries: [] };
}

function customProfile(uiLib: 'antd' | 'radix' | 'chakra' | 'tailwind'): StackProfile {
  const profile = muiProfile();
  return {
    ...profile,
    uiLibraries: [
      {
        id: uiLib,
        version: '1.0.0',
        dependencyKind: 'direct',
        confidence: 'high',
        source: 'lockfile',
        evidence: [],
      },
    ],
  };
}

describe('Adapters strategyFor select', () => {
  const adapters = [muiAdapter, antdAdapter, radixAdapter, chakraAdapter, tailwindAdapter];

  it("returns a trigger-LESS SelectStrategy for 'select'", () => {
    for (const adapter of adapters) {
      const descriptor = adapter.strategyFor('select');

      let expectedListbox: any = { kind: 'role', role: 'listbox' };
      let expectedOption: any = { kind: 'role', role: 'option' };

      if (adapter.id === 'antd') {
        expectedListbox = { kind: 'css', css: '.ant-select-dropdown' };
        expectedOption = { kind: 'css', css: '.ant-select-item-option' };
      } else if (adapter.id === 'radix') {
        expectedListbox = { kind: 'css', css: '[role="listbox"][data-state="open"]' };
      }

      expect(descriptor, adapter.id).toEqual({
        role: 'select',
        select: {
          listbox: expectedListbox,
          option: expectedOption,
          reveal: { kind: 'click', target: 'self' },
        },
      });
      expect(descriptor && 'trigger' in descriptor.select).toBe(false);
    }
  });

  it('returns null for every other role', () => {
    const otherRoles: ComponentRole[] = ['button', 'link', 'textInput', 'checkbox'];
    for (const adapter of adapters) {
      for (const role of otherRoles) {
        expect(adapter.strategyFor(role), `${adapter.id}:${role}`).toBeNull();
      }
    }
  });
});

describe('resolveAdapter', () => {
  it('resolves muiAdapter for a profile with mui in uiLibraries', () => {
    expect(resolveAdapter(muiProfile())).toBe(muiAdapter);
  });

  it('resolves antdAdapter for a profile with antd', () => {
    expect(resolveAdapter(customProfile('antd'))).toBe(antdAdapter);
  });

  it('resolves radixAdapter for a profile with radix', () => {
    expect(resolveAdapter(customProfile('radix'))).toBe(radixAdapter);
  });

  it('resolves chakraAdapter for a profile with chakra', () => {
    expect(resolveAdapter(customProfile('chakra'))).toBe(chakraAdapter);
  });

  it('resolves tailwindAdapter for a profile with tailwind', () => {
    expect(resolveAdapter(customProfile('tailwind'))).toBe(tailwindAdapter);
  });

  it('resolves null when no adapter applies', () => {
    expect(resolveAdapter(nonMuiProfile())).toBeNull();
  });
});
