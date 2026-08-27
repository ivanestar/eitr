import { buildLocator } from './scope.js';
/**
 * Base class for every UI component. Holds a lazy Playwright `Locator` built from a
 * {@link LocatorSpec} — no `await` in the constructor, so tests use web-first assertions on
 * `.locator` directly. Compose sub-components with {@link Component.child}.
 *
 * Every component carries the universal, actionability-checked actions below (Playwright auto-waits
 * for the element before each). Assertions are NOT wrapped here: use `expect(component.locator)…`,
 * which retries and gives the full matcher vocabulary. Point-in-time reads are suffixed `…Now()`.
 */
export class Component {
  locator;
  constructor(scope, spec) {
    this.locator = buildLocator(scope, spec);
  }
  /**
   * Wraps an already-resolved Locator (used by {@link Collection} items). Valid for the standard
   * (scope, spec) components; not for `Select`, whose constructor stores extra descriptor state.
   */
  static fromLocator(loc) {
    const inst = Object.create(this.prototype);
    inst.locator = loc;
    return inst;
  }
  /** The Playwright `Page` this component lives on. */
  page() {
    return this.locator.page();
  }
  /**
   * Declare a child component scoped to this component's locator, e.g.
   * `get submit() { return this.child(Button, { kind: 'role', role: 'button', name: 'Submit' }); }`.
   */
  child(Ctor, spec) {
    return new Ctor(this.locator, spec);
  }
  // --- Universal actions (auto-waiting; delegate to Playwright's actionability-checked API) ---
  /** Click the element. Note: `{ force: true }` bypasses actionability checks and is a flake source. */
  async click(opts) {
    await this.locator.click(opts);
  }
  /** Double-click the element. Note: `{ force: true }` bypasses actionability checks (flake source). */
  async dblclick(opts) {
    await this.locator.dblclick(opts);
  }
  /** Hover over the element. */
  async hover(opts) {
    await this.locator.hover(opts);
  }
  /** Focus the element. */
  async focus(opts) {
    await this.locator.focus(opts);
  }
  /** Press a key (or chord, e.g. `'Control+A'`) while the element is focused. */
  async press(key, opts) {
    await this.locator.press(key, opts);
  }
  /** Drag this element onto `target`. */
  async dragTo(target, opts) {
    await this.locator.dragTo(target, opts);
  }
  /** Select the element's text content (e.g. before typing over it). */
  async selectText(opts) {
    await this.locator.selectText(opts);
  }
  /**
   * Wait until the element reaches `state` (default `'visible'`). This is Playwright's own wait
   * primitive, not a manual poll. For assertions prefer `expect(component.locator).toBeVisible()`
   * (it retries); reserve this for gating on `'hidden'` / `'detached'` before the next step.
   */
  async waitFor(opts) {
    await this.locator.waitFor(opts);
  }
  /**
   * Wait for CSS transitions and Web Animations API animations on this element and its subtree to finish.
   * Eliminates UI race conditions on animated dialogs, accordions, and dropdowns with zero arbitrary sleep.
   */
  async waitForAnimations(opts) {
    await this.locator.evaluate(async (element, timeout) => {
      const animations = element.getAnimations ? element.getAnimations({ subtree: true }) : [];
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
  // --- Point-in-time reads (NON-retrying snapshots; suffixed …Now) ---
  /**
   * The element's text content, right now (a one-shot, non-retrying read). To assert text use the
   * retrying `expect(component.locator).toHaveText(...)` / `.toContainText(...)`.
   */
  async textNow() {
    return this.locator.textContent();
  }
  /**
   * An attribute value, right now (a one-shot, non-retrying read). To assert an attribute use the
   * retrying `expect(component.locator).toHaveAttribute(name, ...)`.
   */
  async attrNow(name) {
    return this.locator.getAttribute(name);
  }
}
