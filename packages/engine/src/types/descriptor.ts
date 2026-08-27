import type { LocatorSpec } from './locator-spec.js';

// #region Select descriptor — canonical copy; mirrored verbatim into the runtime asset (assets/runtime/components/base/descriptor.ts)
/** How a hidden target is revealed before use (e.g. opening a dropdown). */
export type RevealRecipe =
  | { kind: 'none' }
  | { kind: 'click'; target: 'self' | LocatorSpec }
  | { kind: 'hover'; target: 'self' | LocatorSpec };

/** Locators describing a custom select / combobox: its trigger, listbox, and options. */
export interface SelectDescriptor {
  trigger: LocatorSpec;
  listbox: LocatorSpec;
  option: LocatorSpec;
  reveal: RevealRecipe;
}
// #endregion

/** An adapter's select strategy: the descriptor minus the app-specific trigger (supplied later). */
export type SelectStrategy = Omit<SelectDescriptor, 'trigger'>;

/** The adapter → base emission contract (only the select role is modelled today). */
export type Descriptor = { role: 'select'; select: SelectStrategy };
