import type { Page, Locator } from '@playwright/test';

export interface VisualMaskOptions {
  mask?: Locator[];
  maskColor?: string;
}

/**
 * Creates Playwright screenshot mask options for dynamic UI elements (timestamps, dynamic avatars, dates).
 */
export function createVisualMaskOptions(
  page: Page,
  selectors: string[] = [
    '[data-testid*="time"]',
    '[data-testid*="avatar"]',
    '[data-testid*="date"]',
  ],
  maskColor = '#FF00FF',
): VisualMaskOptions {
  return {
    mask: selectors.map((sel) => page.locator(sel)),
    maskColor,
  };
}
