import { type Page } from '@playwright/test';
import { type Component, type ComponentClass } from './component';
import { Collection } from './collection';
import { type Scope, type LocatorSpec, buildLocator } from './scope';

/**
 * Base class for Page Objects. A subclass sets `path` and composes components via {@link BasePage.child}
 * / {@link BasePage.list} (scoped to the page root); tests call `goto()` then interact through them.
 */
export abstract class BasePage {
  /** Path (relative to the configured `baseURL`) this page lives at. */
  abstract readonly path: string;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to this page. */
  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  /** Declare a page-level component. */
  protected child<T extends Component>(
    Ctor: new (scope: Scope, spec: LocatorSpec) => T,
    spec: LocatorSpec,
  ): T {
    return new Ctor(this.page, spec);
  }

  /** Declare a page-level collection of same-typed components. */
  protected list<T extends Component>(Ctor: ComponentClass<T>, spec: LocatorSpec): Collection<T> {
    return new Collection(buildLocator(this.page, spec), Ctor);
  }

  /**
   * Wait for all global CSS transitions and Web Animations on the page to settle.
   * Eliminates layout shifting flakes during page navigation and heavy renders with zero arbitrary sleep.
   */
  async waitForAnimations(opts?: { timeout?: number }): Promise<void> {
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
