import { Component } from '../base/component.js';
/**
 * A range input slider control (`<input type="range">` or role="slider").
 */
export class Slider extends Component {
  /** Set numeric value for the slider. */
  async setValue(value) {
    await this.locator.fill(String(value));
  }
  /** Increase slider value with ArrowRight key. */
  async stepUp() {
    await this.locator.press('ArrowRight');
  }
  /** Decrease slider value with ArrowLeft key. */
  async stepDown() {
    await this.locator.press('ArrowLeft');
  }
  /** Point-in-time snapshot read of current slider value. */
  async valueNow() {
    return this.locator.inputValue();
  }
}
