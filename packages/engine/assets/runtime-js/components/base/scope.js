/** Exhaustiveness helper: turns an unhandled `LocatorSpec` kind into a compile-time error. */
export function assertNever(x) {
  throw new Error('unreachable LocatorSpec kind: ' + JSON.stringify(x));
}
/** Builds a Playwright `Locator` from a {@link LocatorSpec}, relative to `scope`. */
export function buildLocator(scope, spec) {
  switch (spec.kind) {
    case 'role': {
      const options = {};
      if (spec.name !== undefined) options.name = spec.name;
      if (spec.exact !== undefined) options.exact = spec.exact;
      return scope.getByRole(spec.role, options);
    }
    case 'testId':
      return scope.getByTestId(spec.testId);
    case 'label':
      return scope.getByLabel(spec.label);
    case 'text':
      return scope.getByText(spec.text);
    case 'css':
      return scope.locator(spec.css);
    case 'fallback': {
      if (spec.specs.length === 0) {
        throw new Error('fallback LocatorSpec requires at least one spec');
      }
      let loc = buildLocator(scope, spec.specs[0]);
      for (let i = 1; i < spec.specs.length; i++) {
        loc = loc.or(buildLocator(scope, spec.specs[i]));
      }
      return loc;
    }
    case 'custom':
      return spec.resolve(scope);
    default:
      return assertNever(spec);
  }
}
// #endregion
