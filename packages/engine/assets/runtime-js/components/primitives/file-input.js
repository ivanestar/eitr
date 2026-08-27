import { Component } from '../base/component.js';
/**
 * A file upload. Located by CSS `input[type=file]` — file inputs have no ARIA role, so role-first
 * doesn't apply here. `setInputFiles` works even when the input is visually hidden behind a styled
 * button (the common case), because Playwright sets files on the element directly.
 */
export class FileInput extends Component {
  /** Select one or more files to upload. */
  async setFiles(files) {
    await this.locator.setInputFiles(files);
  }
  /** Clear the selected files. */
  async clear() {
    await this.locator.setInputFiles([]);
  }
}
