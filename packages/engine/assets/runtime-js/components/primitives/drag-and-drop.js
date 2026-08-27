import { Component } from '../base/component.js';
export class DragAndDrop extends Component {
  constructor(scope, spec) {
    super(scope, spec);
  }
  /**
   * Drag this component and drop it directly onto the target locator or component.
   */
  async dragToTarget(target) {
    const targetLocator = target instanceof Component ? target.locator : target;
    await this.locator.dragTo(targetLocator);
  }
  /**
   * Drag this component by a relative pixel offset (dx, dy).
   */
  async dragByOffset(dx, dy) {
    const box = await this.locator.boundingBox();
    if (!box) {
      throw new Error('Cannot drag element: bounding box not found in DOM.');
    }
    const page = this.page();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
    await page.mouse.up();
  }
}
