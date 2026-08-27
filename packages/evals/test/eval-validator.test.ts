import { describe, it, expect } from 'vitest';
import { validateMethodSafetyContract } from '../src/eval-validator.js';

describe('Eval Validator - Method Safety Contract', () => {
  it('validates a complying code adapter successfully', () => {
    const validCode = `
import { Component, Button } from '@components';

export class CustomDropdown extends Component {
  get trigger() {
    return this.child(Button, '.custom-combo-trigger');
  }

  async selectOption(value: string): Promise<void> {
    await this.trigger.click();
    await this.page.locator(\`.custom-combo-item[data-value="\${value}"]\`).click();
  }

  async valueNow(): Promise<string> {
    return await this.page.locator('.custom-combo-value').innerText();
  }
}
`;
    const validation = validateMethodSafetyContract(validCode);

    expect(validation.errors).toEqual([]);
    expect(validation.passed).toBe(true);
  });

  it('detects violations of the Method Safety Contract in non-complying code', () => {
    const invalidCode = `
import { Component, Button } from '@components';

export class CustomDropdown extends Component {
  // Violation 1: Async getter
  async get trigger() {
    return this.child(Button, '.custom-combo-trigger');
  }

  // Violation 2: Action method not async
  selectOption(value: string): void {
    // Violation 3: Assertion inside component
    expect(value).not.toBeNull();
    this.page.locator('.custom-combo-item').click();
  }

  // Violation 4: Snapshot read lacks "Now" suffix
  getValue(): Promise<string> {
    return this.page.locator('.custom-combo-value').innerText();
  }
}
`;
    const validation = validateMethodSafetyContract(invalidCode);

    expect(validation.passed).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    const hasExpectErr = validation.errors.some(
      (e) => e.includes('expect') && e.includes('forbidden'),
    );
    const hasAsyncGetterErr = validation.errors.some(
      (e) => e.includes('Getter') && e.includes('must not be async'),
    );
    const hasSnapshotErr = validation.errors.some((e) => e.includes('end with "Now"'));

    expect(hasExpectErr).toBe(true);
    expect(hasAsyncGetterErr).toBe(true);
    expect(hasSnapshotErr).toBe(true);
  });
});
