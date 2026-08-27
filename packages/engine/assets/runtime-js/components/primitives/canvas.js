import { Component } from '../base/component.js';
export class Canvas extends Component {
  constructor(scope, spec) {
    super(scope, spec);
  }
  /**
   * Click at a relative percentage coordinate inside the canvas (0.0 to 1.0).
   */
  async clickAtRelative(relX, relY) {
    const box = await this.locator.boundingBox();
    if (!box) {
      throw new Error('Cannot interact with canvas: bounding box not found.');
    }
    const x = box.x + box.width * Math.max(0, Math.min(1, relX));
    const y = box.y + box.height * Math.max(0, Math.min(1, relY));
    await this.page().mouse.click(x, y);
  }
  /**
   * Draw a path on the canvas by moving mouse through relative points.
   */
  async drawPath(points) {
    if (points.length === 0) return;
    const box = await this.locator.boundingBox();
    if (!box) {
      throw new Error('Cannot draw on canvas: bounding box not found.');
    }
    const page = this.page();
    const first = points[0];
    await page.mouse.move(box.x + box.width * first.relX, box.y + box.height * first.relY);
    await page.mouse.down();
    for (let i = 1; i < points.length; i++) {
      const pt = points[i];
      await page.mouse.move(box.x + box.width * pt.relX, box.y + box.height * pt.relY, {
        steps: 3,
      });
    }
    await page.mouse.up();
  }
}
