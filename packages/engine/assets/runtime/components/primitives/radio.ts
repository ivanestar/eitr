import { Component } from '../base/component';
import { Container } from '../base/container';

/** A single radio button. */
export class RadioButton extends Component {
  /** Ensure it is checked. */
  async check(): Promise<void> {
    await this.locator.check();
  }

  /** Point-in-time snapshot read of the current checked state. */
  async isCheckedNow(): Promise<boolean> {
    return this.locator.isChecked();
  }
}

/** A group of radio buttons. */
export class RadioGroup extends Container {
  /** Find a radio button inside the group by its accessible name. */
  radio(name: string | RegExp): RadioButton {
    return this.child(RadioButton, { kind: 'role', role: 'radio', name });
  }

  /** Quick helper to check a radio button by name. */
  async select(name: string | RegExp): Promise<void> {
    await this.radio(name).check();
  }
}
