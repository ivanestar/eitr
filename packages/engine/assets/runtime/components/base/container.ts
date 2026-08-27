import { Component, type ComponentClass } from './component';
import { Collection } from './collection';
import { type LocatorSpec, buildLocator } from './scope';

/**
 * A component that also acts as a scope for nested components — its `.locator` is the root its
 * children resolve against. Declare children with {@link Component.child} and collections with
 * {@link Container.list} inside a subclass.
 */
export class Container extends Component {
  /** Declare a collection of same-typed child components scoped to this container. */
  protected list<T extends Component>(Ctor: ComponentClass<T>, spec: LocatorSpec): Collection<T> {
    return new Collection(buildLocator(this.locator, spec), Ctor);
  }
}
