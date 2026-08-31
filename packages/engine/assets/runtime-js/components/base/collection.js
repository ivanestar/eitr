/**
 * A set of same-typed components (list rows, dropdown options, …). Assert cardinality with a
 * web-first assertion, e.g. `await expect(collection.locator).toHaveCount(3)`.
 */
export class Collection {
  locator;
  item;
  constructor(locator, item) {
    this.locator = locator;
    this.item = item;
  }
  /** The nth item (0-based). */
  nth(i) {
    return this.wrap(this.locator.nth(i));
  }
  /** The first item. */
  first() {
    return this.wrap(this.locator.first());
  }
  /** The last item. */
  last() {
    return this.wrap(this.locator.last());
  }
  /** A narrowed collection (e.g. by visible text). */
  filter(o) {
    return new Collection(this.locator.filter(o), this.item);
  }
  /**
   * How many items currently match — a one-shot, non-retrying snapshot. To assert cardinality use
   * the retrying `await expect(collection.locator).toHaveCount(n)`.
   */
  countNow() {
    return this.locator.count();
  }
  /**
   * All matching item locators, right now — a one-shot, non-retrying snapshot. To assert cardinality
   * use the retrying `await expect(collection.locator).toHaveCount(n)`.
   */
  allNow() {
    return this.locator.all();
  }
  // ComponentClass models only the constructor (clean inference); every component class also carries
  // the inherited static fromLocator, reached here to wrap an already-resolved Locator. Keep this the
  // ONLY cast — do NOT fold fromLocator into ComponentClass or T re-widens toward Component.
  wrap(loc) {
    return this.item.fromLocator(loc);
  }
}
