import { type LocatorSpec } from './scope';

// #region Select descriptor
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
