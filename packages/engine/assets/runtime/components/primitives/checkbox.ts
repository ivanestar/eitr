import { Component } from '../base/component';

/** A checkbox or toggle. */
export class Checkbox extends Component {
  /** Ensure it is checked. */
  async check(): Promise<void> {
    await this.locator.check();
  }

  /** Ensure it is unchecked. */
  async uncheck(): Promise<void> {
    await this.locator.uncheck();
  }

  /** Set the checked state from a boolean (checks or unchecks as needed). */
  async setChecked(checked: boolean): Promise<void> {
    await this.locator.setChecked(checked);
  }

  /** Point-in-time snapshot read of the current checked state. */
  async isCheckedNow(): Promise<boolean> {
    return this.locator.isChecked();
  }
}
