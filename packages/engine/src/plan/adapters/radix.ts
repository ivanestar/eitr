import type { Adapter } from '../../types/adapter.js';
import type { ComponentRole } from '../../types/taxonomy.js';
import type { Descriptor } from '../../types/descriptor.js';
import type { StackProfile } from '../../types/stack-profile.js';

export const radixAdapter: Adapter = {
  id: 'radix',
  appliesTo(profile: StackProfile): boolean {
    return profile.uiLibraries.some((lib) => lib.id === 'radix');
  },
  strategyFor(role: ComponentRole): Descriptor | null {
    if (role !== 'select') return null;
    return {
      role: 'select',
      select: {
        listbox: { kind: 'css', css: '[role="listbox"][data-state="open"]' },
        option: { kind: 'role', role: 'option' },
        reveal: { kind: 'click', target: 'self' },
      },
    };
  },
};
