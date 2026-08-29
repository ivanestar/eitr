import { Component } from '../base/component.js';
/**
 * A range input slider control (`<input type="range">` or role="slider").
 */
export class Slider extends Component {
  /**
   * Set numeric value for the slider via the element's native value setter, dispatching
   * both `input` and `change` events. More reliable cross-browser than `fill()` for
   * `<input type="range">` (whose value is not "typed" character-by-character) and works
   * correctly against framework-controlled inputs (e.g. React) that override the plain
   * `.value =` assignment.
   */
  async setValue(value) {
    await this.locator.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
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
