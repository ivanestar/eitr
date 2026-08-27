import { type Locator } from '@playwright/test';
import { Component } from '../base/component';

/** A text field. */
export class TextInput extends Component {
  /** Replace the field's value in one step. */
  async fill(value: string): Promise<void> {
    await this.locator.fill(value);
  }

  /** Clear the field. */
  async clear(): Promise<void> {
    await this.locator.clear();
  }

  /**
   * Type character-by-character, firing per-key events — use this (not `fill`) when the field
   * reacts to keystrokes, e.g. an autocomplete that filters as you type.
   */
  async pressSequentially(
    text: string,
    opts?: Parameters<Locator['pressSequentially']>[1],
  ): Promise<void> {
    await this.locator.pressSequentially(text, opts);
  }

  /**
   * The field's current value, right now (a one-shot, non-retrying read). To assert it use the
   * retrying `expect(input.locator).toHaveValue(...)`.
   */
  async valueNow(): Promise<string> {
    return this.locator.inputValue();
  }
}
