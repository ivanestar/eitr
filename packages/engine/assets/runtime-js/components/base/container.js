import { Component } from './component.js';
import { Collection } from './collection.js';
import { buildLocator } from './scope.js';
/**
 * A component that also acts as a scope for nested components — its `.locator` is the root its
 * children resolve against. Declare children with {@link Component.child} and collections with
 * {@link Container.list} inside a subclass.
 */
export class Container extends Component {
  /** Declare a collection of same-typed child components scoped to this container. */
  list(Ctor, spec) {
    return new Collection(buildLocator(this.locator, spec), Ctor);
  }
}
