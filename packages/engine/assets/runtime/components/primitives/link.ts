import { Component } from '../base/component';

/**
 * A hyperlink — native `<a href>` exposes role `link`. Follow it with `click()` (inherited from
 * {@link Component}).
 */
export class Link extends Component {
  /**
   * The `href` attribute, right now (a one-shot, non-retrying read). To assert it use the retrying
   * `expect(link.locator).toHaveAttribute('href', ...)`; use this only when you need the raw value.
   */
  async hrefNow(): Promise<string | null> {
    return this.locator.getAttribute('href');
  }
}
