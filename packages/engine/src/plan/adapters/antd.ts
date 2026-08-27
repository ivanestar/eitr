import type { Adapter } from '../../types/adapter.js';
import type { ComponentRole } from '../../types/taxonomy.js';
import type { Descriptor } from '../../types/descriptor.js';
import type { StackProfile } from '../../types/stack-profile.js';

export const antdAdapter: Adapter = {
  id: 'antd',
  appliesTo(profile: StackProfile): boolean {
    return profile.uiLibraries.some((lib) => lib.id === 'antd');
  },
  strategyFor(role: ComponentRole): Descriptor | null {
    if (role !== 'select') return null;
    return {
      role: 'select',
      select: {
        listbox: { kind: 'css', css: '.ant-select-dropdown' },
        option: { kind: 'css', css: '.ant-select-item-option' },
        reveal: { kind: 'click', target: 'self' },
      },
    };
  },
};
