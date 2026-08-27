import { Component } from '../base/component.js';
import { Collection } from '../base/collection.js';
import { buildLocator } from '../base/scope.js';
/** One option within a Select's listbox. */
export class Option extends Component {}
/**
 * A custom select / combobox whose options render in an overlay (portal) at the page root
 * rather than inside the trigger's DOM subtree — so the listbox is resolved from the page.
 */
export class Select extends Component {
  desc;
  constructor(scope, desc) {
    super(scope, desc.trigger);
    this.desc = desc;
  }
  /** Open the dropdown. */
  async open() {
    if (this.desc.reveal.kind === 'none') return;
    const targetLoc =
      this.desc.reveal.target === 'self'
        ? this.locator
        : buildLocator(this.locator, this.desc.reveal.target);
    if (this.desc.reveal.kind === 'hover') {
      await targetLoc.hover();
    } else {
      await targetLoc.click();
    }
  }
  /** The listbox overlay, resolved from the page root (topmost via `.last()`). */
  listbox() {
    return buildLocator(this.page(), this.desc.listbox).last();
  }
  /** The options within the (opened) listbox. */
  options() {
    return new Collection(buildLocator(this.listbox(), this.desc.option), Option);
  }
  /** Open the dropdown and pick the option matching `name`. */
  async choose(name) {
    await this.open();
    const optionLoc = buildLocator(this.listbox(), this.desc.option);
    await optionLoc.filter({ hasText: name }).first().click();
  }
}
