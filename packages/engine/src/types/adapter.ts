import type { ComponentRole } from './taxonomy.js';
import type { Descriptor } from './descriptor.js';
import type { StackProfile } from './stack-profile.js';

export interface Adapter {
  readonly id: string;
  appliesTo(profile: StackProfile): boolean;
  strategyFor(role: ComponentRole): Descriptor | null; // non-null ONLY for 'select' in Slice 1
}
