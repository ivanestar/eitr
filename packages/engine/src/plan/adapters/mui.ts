import type { Adapter } from '../../types/adapter.js';
import type { ComponentRole } from '../../types/taxonomy.js';
import type { Descriptor } from '../../types/descriptor.js';
import type { StackProfile } from '../../types/stack-profile.js';

// strategyFor('select') returns a trigger-LESS SelectStrategy (listbox/option/reveal); the trigger
// is supplied later by the recon/generation step that emits concrete locators. null for every
// other role for now.
export const muiAdapter: Adapter = {
  id: 'mui',
  appliesTo(profile: StackProfile): boolean {
    return profile.uiLibraries.some((lib) => lib.id === 'mui');
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
