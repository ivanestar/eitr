import { type Page } from '@playwright/test';
import { Component } from '../base/component';
import { Button } from '../primitives/button';

/**
 * A modal dialog. Dialogs portal to `<body>`, so it is ALWAYS resolved from the page root (the ctor
 * takes a `Page`, so you can't accidentally scope it to a container), matching role `dialog` OR
 * `alertdialog`, topmost via `.last()`. Its CONTENTS are inside the dialog's own subtree, so child
 * getters scope to `this.locator`.
 */
export class Dialog extends Component {
  constructor(page: Page) {
    super(page, {
      kind: 'custom',
      why: 'topmost dialog/alertdialog resolved from the page root',
      resolve: (s) => s.getByRole('dialog').or(s.getByRole('alertdialog')).last(),
    });
  }

  /** A button inside the dialog, by its accessible name. */
  button(name: string | RegExp): Button {
    return this.child(Button, { kind: 'role', role: 'button', name });
  }
}
