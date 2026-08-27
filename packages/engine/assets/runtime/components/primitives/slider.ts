import { Component } from '../base/component';

/**
 * A range input slider control (`<input type="range">` or role="slider").
 */
export class Slider extends Component {
  /** Set numeric value for the slider. */
  async setValue(value: string | number): Promise<void> {
    await this.locator.fill(String(value));
  }

  /** Increase slider value with ArrowRight key. */
  async stepUp(): Promise<void> {
    await this.locator.press('ArrowRight');
  }

  /** Decrease slider value with ArrowLeft key. */
  async stepDown(): Promise<void> {
    await this.locator.press('ArrowLeft');
  }

  /** Point-in-time snapshot read of current slider value. */
  async valueNow(): Promise<string> {
    return this.locator.inputValue();
  }
}
