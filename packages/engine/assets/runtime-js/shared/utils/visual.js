/**
 * Creates Playwright screenshot mask options for dynamic UI elements (timestamps, dynamic avatars, dates).
 */
export function createVisualMaskOptions(
  page,
  selectors = ['[data-testid*="time"]', '[data-testid*="avatar"]', '[data-testid*="date"]'],
  maskColor = '#FF00FF',
) {
  return {
    mask: selectors.map((sel) => page.locator(sel)),
    maskColor,
  };
}
