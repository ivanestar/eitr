import { type Locator } from '@playwright/test';
import { Component } from '../base/component';

/**
 * A native HTML `<select>` (role `combobox` when single, `listbox` when `multiple`). For a custom
 * combobox whose options render in a portal/overlay, use {@link Select} instead.
 */
export class NativeSelect extends Component {
  /**
   * Select option(s) by value, label, or index — accepts the same argument as Playwright's
   * `selectOption` (a string value, `{ label }` / `{ index }` / `{ value }`, or an array for
   * multi-selects).
   */
  async selectOption(values: Parameters<Locator['selectOption']>[0]): Promise<void> {
    await this.locator.selectOption(values);
  }
}
