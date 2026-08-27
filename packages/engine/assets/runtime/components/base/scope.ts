import { type Page, type Locator, type FrameLocator } from '@playwright/test';

// #region Locator model
/** Where a locator is resolved from: a page, a container's locator, or an iframe. */
export type Scope = Page | Locator | FrameLocator;

/** ARIA roles the component library targets. */
export type AriaRole =
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'combobox'
  | 'listbox'
  | 'option'
  | 'heading'
  | 'slider'
  | 'dialog'
  | 'alertdialog'
  | 'menu'
  | 'menuitem'
  | 'table'
  | 'grid'
  | 'row'
  | 'cell'
  | 'gridcell'
  | 'columnheader'
  | 'rowheader'
  | 'radio'
  | 'radiogroup';

/**
 * How to find an element — a discriminated union with one strategy per `kind`.
 * Prefer role / label / text / testId over css; `custom` is the escape hatch.
 */
export type LocatorSpec =
  | { kind: 'role'; role: AriaRole; name?: string | RegExp; exact?: boolean }
  | { kind: 'testId'; testId: string }
  | { kind: 'label'; label: string | RegExp }
  | { kind: 'text'; text: string | RegExp }
  | { kind: 'css'; css: string }
  | { kind: 'fallback'; specs: LocatorSpec[] }
  | { kind: 'custom'; resolve: (s: Scope) => Locator; why: string };

/** Exhaustiveness helper: turns an unhandled `LocatorSpec` kind into a compile-time error. */
export function assertNever(x: never): never {
  throw new Error('unreachable LocatorSpec kind: ' + JSON.stringify(x));
}

/** Builds a Playwright `Locator` from a {@link LocatorSpec}, relative to `scope`. */
export function buildLocator(scope: Scope, spec: LocatorSpec): Locator {
  switch (spec.kind) {
    case 'role': {
      const options: { name?: string | RegExp; exact?: boolean } = {};
      if (spec.name !== undefined) options.name = spec.name;
      if (spec.exact !== undefined) options.exact = spec.exact;
      return scope.getByRole(spec.role, options);
    }
    case 'testId':
      return scope.getByTestId(spec.testId);
    case 'label':
      return scope.getByLabel(spec.label);
    case 'text':
      return scope.getByText(spec.text);
    case 'css':
      return scope.locator(spec.css);
    case 'fallback': {
      if (spec.specs.length === 0) {
        throw new Error('fallback LocatorSpec requires at least one spec');
      }
      let loc = buildLocator(scope, spec.specs[0]);
      for (let i = 1; i < spec.specs.length; i++) {
        loc = loc.or(buildLocator(scope, spec.specs[i]));
      }
      return loc;
    }
    case 'custom':
      return spec.resolve(scope);
    default:
      return assertNever(spec);
  }
}
// #endregion
