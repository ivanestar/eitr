import type { Adapter } from '../../types/adapter.js';
import type { ComponentRole } from '../../types/taxonomy.js';
import type { Descriptor } from '../../types/descriptor.js';
import type { StackProfile } from '../../types/stack-profile.js';

export const chakraAdapter: Adapter = {
  id: 'chakra',
  appliesTo(profile: StackProfile): boolean {
    return profile.uiLibraries.some((lib) => lib.id === 'chakra');
  },
  strategyFor(role: ComponentRole): Descriptor | null {
    if (role !== 'select') return null;
    return {
      role: 'select',
      select: {
        listbox: { kind: 'role', role: 'listbox' },
        option: { kind: 'role', role: 'option' },
        reveal: { kind: 'click', target: 'self' },
      },
    };
  },
};
