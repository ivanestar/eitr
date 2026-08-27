import { Component } from '../base/component.js';
/** A text field. */
export class TextInput extends Component {
  /** Replace the field's value in one step. */
  async fill(value) {
    await this.locator.fill(value);
  }
  /** Clear the field. */
  async clear() {
    await this.locator.clear();
  }
  /**
   * Type character-by-character, firing per-key events — use this (not `fill`) when the field
   * reacts to keystrokes, e.g. an autocomplete that filters as you type.
   */
  async pressSequentially(text, opts) {
    await this.locator.pressSequentially(text, opts);
  }
  /**
   * The field's current value, right now (a one-shot, non-retrying read). To assert it use the
   * retrying `expect(input.locator).toHaveValue(...)`.
   */
  async valueNow() {
    return this.locator.inputValue();
  }
}
