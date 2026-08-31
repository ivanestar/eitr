import { Component } from '../base/component.js';
/** A checkbox or toggle. */
export class Checkbox extends Component {
  /** Ensure it is checked. */
  async check() {
    await this.locator.check();
  }
  /** Ensure it is unchecked. */
  async uncheck() {
    await this.locator.uncheck();
  }
  /** Set the checked state from a boolean (checks or unchecks as needed). */
  async setChecked(checked) {
    await this.locator.setChecked(checked);
  }
  /** Point-in-time snapshot read of the current checked state. */
  async isCheckedNow() {
    return this.locator.isChecked();
  }
}
