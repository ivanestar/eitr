import { type Page, type Locator } from '@playwright/test';
import { type Scope, type LocatorSpec, buildLocator } from './scope';

/**
 * A component class usable as a {@link Collection} item: a concrete component whose constructor
 * takes `(scope, spec)`. Modelling just the constructor keeps type inference unambiguous and
 * excludes descriptor-ctor components (like `Select`) from collections at compile time.
 */
export type ComponentClass<T extends Component> = new (scope: Scope, spec: LocatorSpec) => T;

/**
 * Base class for every UI component. Holds a lazy Playwright `Locator` built from a
 * {@link LocatorSpec} — no `await` in the constructor, so tests use web-first assertions on
 * `.locator` directly. Compose sub-components with {@link Component.child}.
 *
 * Every component carries the universal, actionability-checked actions below (Playwright auto-waits
 * for the element before each). Assertions are NOT wrapped here: use `expect(component.locator)…`,
 * which retries and gives the full matcher vocabulary. Point-in-time reads are suffixed `…Now()`.
 */
export abstract class Component {
  readonly locator: Locator;

  constructor(scope: Scope, spec: LocatorSpec) {
    this.locator = buildLocator(scope, spec);
  }

  /**
   * Wraps an already-resolved Locator (used by {@link Collection} items). Valid for the standard
   * (scope, spec) components; not for `Select`, whose constructor stores extra descriptor state.
   */
  static fromLocator<T extends Component>(this: { prototype: T }, loc: Locator): T {
    const inst = Object.create(this.prototype) as T;
    (inst as { locator: Locator }).locator = loc;
    return inst;
  }

  /** The Playwright `Page` this component lives on. */
  page(): Page {
    return this.locator.page();
  }

  /**
   * Declare a child component scoped to this component's locator, e.g.
   * `get submit() { return this.child(Button, { kind: 'role', role: 'button', name: 'Submit' }); }`.
   */
  protected child<T extends Component>(
    Ctor: new (scope: Scope, spec: LocatorSpec) => T,
    spec: LocatorSpec,
  ): T {
    return new Ctor(this.locator, spec);
  }

  // --- Universal actions (auto-waiting; delegate to Playwright's actionability-checked API) ---

  /** Click the element. Note: `{ force: true }` bypasses actionability checks and is a flake source. */
  async click(opts?: Parameters<Locator['click']>[0]): Promise<void> {
    await this.locator.click(opts);
  }

  /** Double-click the element. Note: `{ force: true }` bypasses actionability checks (flake source). */
  async dblclick(opts?: Parameters<Locator['dblclick']>[0]): Promise<void> {
    await this.locator.dblclick(opts);
  }

  /** Hover over the element. */
  async hover(opts?: Parameters<Locator['hover']>[0]): Promise<void> {
    await this.locator.hover(opts);
  }

  /** Focus the element. */
  async focus(opts?: Parameters<Locator['focus']>[0]): Promise<void> {
    await this.locator.focus(opts);
  }

  /** Press a key (or chord, e.g. `'Control+A'`) while the element is focused. */
  async press(key: string, opts?: Parameters<Locator['press']>[1]): Promise<void> {
    await this.locator.press(key, opts);
  }

  /** Drag this element onto `target`. */
  async dragTo(target: Locator, opts?: Parameters<Locator['dragTo']>[1]): Promise<void> {
    await this.locator.dragTo(target, opts);
  }

  /** Select the element's text content (e.g. before typing over it). */
  async selectText(opts?: Parameters<Locator['selectText']>[0]): Promise<void> {
    await this.locator.selectText(opts);
  }

  /**
   * Wait until the element reaches `state` (default `'visible'`). This is Playwright's own wait
   * primitive, not a manual poll. For assertions prefer `expect(component.locator).toBeVisible()`
   * (it retries); reserve this for gating on `'hidden'` / `'detached'` before the next step.
   */
  async waitFor(opts?: Parameters<Locator['waitFor']>[0]): Promise<void> {
    await this.locator.waitFor(opts);
  }

  /**
   * Wait for CSS transitions and Web Animations API animations on this element and its subtree to finish.
   * Eliminates UI race conditions on animated dialogs, accordions, and dropdowns with zero arbitrary sleep.
   */
  async waitForAnimations(opts?: { timeout?: number }): Promise<void> {
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
  async textNow(): Promise<string | null> {
    return this.locator.textContent();
  }

  /**
   * An attribute value, right now (a one-shot, non-retrying read). To assert an attribute use the
   * retrying `expect(component.locator).toHaveAttribute(name, ...)`.
   */
  async attrNow(name: string): Promise<string | null> {
    return this.locator.getAttribute(name);
  }
}
