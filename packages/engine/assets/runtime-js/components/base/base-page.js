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
    await this.page.waitForFunction(
      () => {
        const animations = document.getAnimations ? document.getAnimations() : [];
        return animations.every((anim) => anim.playState !== 'running');
      },
      undefined,
      { timeout: opts?.timeout ?? 5000 },
    );
  }
}
