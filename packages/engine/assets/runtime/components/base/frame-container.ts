import { type FrameLocator } from '@playwright/test';
import { Component, type ComponentClass } from './component';
import { Collection } from './collection';
import { type Scope, type LocatorSpec, buildLocator } from './scope';

/**
 * A container representing an embedded iframe.
 * Encapsulates the FrameLocator and provides child/list scoping within that frame.
 */
export class FrameContainer extends Component {
  readonly frame: FrameLocator;

  constructor(scope: Scope, spec: LocatorSpec) {
    super(scope, spec);
    if ('frameLocator' in scope && typeof scope.frameLocator === 'function') {
      if (spec.kind === 'css') {
        this.frame = scope.frameLocator(spec.css);
      } else if (spec.kind === 'testId') {
        this.frame = scope.frameLocator(`[data-testid="${spec.testId}"]`);
      } else {
        throw new Error(
          `FrameContainer expects spec of kind 'css' or 'testId', received '${spec.kind}'`,
        );
      }
    } else {
      throw new Error('FrameContainer requires a scope supporting frameLocator');
    }
  }

  /** Declare a child component inside this iframe. */
  protected childInFrame<T extends Component>(Ctor: ComponentClass<T>, spec: LocatorSpec): T {
    return new Ctor(this.frame, spec);
  }

  /** Declare a collection of components inside this iframe. */
  protected listInFrame<T extends Component>(
    Ctor: ComponentClass<T>,
    spec: LocatorSpec,
  ): Collection<T> {
    return new Collection(buildLocator(this.frame, spec), Ctor);
  }
}
