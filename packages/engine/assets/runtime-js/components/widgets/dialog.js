import { Component } from '../base/component.js';
import { Button } from '../primitives/button.js';
/**
 * A modal dialog. Dialogs portal to `<body>`, so it is ALWAYS resolved from the page root (the ctor
 * takes a `Page`, so you can't accidentally scope it to a container), matching role `dialog` OR
 * `alertdialog`, topmost via `.last()`. Its CONTENTS are inside the dialog's own subtree, so child
 * getters scope to `this.locator`.
 */
export class Dialog extends Component {
  constructor(page) {
    super(page, {
      kind: 'custom',
      why: 'topmost dialog/alertdialog resolved from the page root',
      resolve: (s) => s.getByRole('dialog').or(s.getByRole('alertdialog')).last(),
    });
  }
  /** A button inside the dialog, by its accessible name. */
  button(name) {
    return this.child(Button, { kind: 'role', role: 'button', name });
  }
}
