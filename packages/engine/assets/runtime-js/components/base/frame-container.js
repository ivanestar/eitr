import { Component } from './component.js';
import { Collection } from './collection.js';
import { buildLocator } from './scope.js';
/**
 * A container representing an embedded iframe.
 * Encapsulates the FrameLocator and provides child/list scoping within that frame.
 */
export class FrameContainer extends Component {
  frame;
  constructor(scope, spec) {
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
  childInFrame(Ctor, spec) {
    return new Ctor(this.frame, spec);
  }
  /** Declare a collection of components inside this iframe. */
  listInFrame(Ctor, spec) {
    return new Collection(buildLocator(this.frame, spec), Ctor);
  }
}
