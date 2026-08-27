import { Collection } from './collection.js';
import { buildLocator } from './scope.js';
/**
 * Base class for Page Objects. A subclass sets `path` and composes components via {@link BasePage.child}
 * / {@link BasePage.list} (scoped to the page root); tests call `goto()` then interact through them.
 */
export class BasePage {
  page;
  constructor(page) {
    this.page = page;
  }
  /** Navigate to this page. */
  async goto() {
    await this.page.goto(this.path);
  }
  /** Declare a page-level component. */
  child(Ctor, spec) {
    return new Ctor(this.page, spec);
  }
  /** Declare a page-level collection of same-typed components. */
  list(Ctor, spec) {
    return new Collection(buildLocator(this.page, spec), Ctor);
  }
  /**
   * Wait for all global CSS transitions and Web Animations on the page to settle.
   * Eliminates layout shifting flakes during page navigation and heavy renders with zero arbitrary sleep.
   */
  async waitForAnimations(opts) {
    await this.page.evaluate(async (timeout) => {
      const animations = document.getAnimations ? document.getAnimations() : [];
      await Promise.all(
        animations.map((anim) =>
          Promise.race([
            anim.finished,
            new Promise((resolve) => setTimeout(resolve, timeout ?? 5000)),
          ]),
        ),
      );
    }, opts?.timeout);
  }
}
