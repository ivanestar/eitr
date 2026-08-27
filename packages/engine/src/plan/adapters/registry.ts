import type { Adapter } from '../../types/adapter.js';
import type { StackProfile } from '../../types/stack-profile.js';
import { muiAdapter } from './mui.js';
import { antdAdapter } from './antd.js';
import { radixAdapter } from './radix.js';
import { chakraAdapter } from './chakra.js';
import { tailwindAdapter } from './tailwind.js';

export function resolveAdapter(profile: StackProfile): Adapter | null {
  if (muiAdapter.appliesTo(profile)) return muiAdapter;
  if (antdAdapter.appliesTo(profile)) return antdAdapter;
  if (radixAdapter.appliesTo(profile)) return radixAdapter;
  if (chakraAdapter.appliesTo(profile)) return chakraAdapter;
  if (tailwindAdapter.appliesTo(profile)) return tailwindAdapter;
  return null;
}
