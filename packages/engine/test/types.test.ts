import { describe, it, expect, vi } from 'vitest';
import type { Locator } from '@playwright/test';
import {
  buildLocator,
  assertNever,
  type LocatorSpec,
  type Scope,
} from '../src/types/locator-spec.js';
import { Component } from '../assets/runtime/components/base/component';
import { Collection } from '../assets/runtime/components/base/collection';
import { Button } from '../assets/runtime/components/primitives/button';
import { Option } from '../assets/runtime/components/primitives/select';

// A minimal stand-in for Page/Locator/FrameLocator exposing only the methods buildLocator calls.
// Cast to Scope (rather than typed structurally) since the real Playwright types are huge.
function fakeScope() {
  const fakeLocator = { marker: 'fake-locator' } as unknown as Locator;
  const scope = {
    getByRole: vi.fn(() => fakeLocator),
    getByTestId: vi.fn(() => fakeLocator),
    getByLabel: vi.fn(() => fakeLocator),
    getByText: vi.fn(() => fakeLocator),
    locator: vi.fn(() => fakeLocator),
  };
  return { scope: scope as unknown as Scope, raw: scope, fakeLocator };
}

describe('buildLocator', () => {
  it('role: passes name + exact through when present', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'role', role: 'button', name: 'Sign in', exact: true };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.getByRole).toHaveBeenCalledWith('button', { name: 'Sign in', exact: true });
  });

  it('role: omits name/exact from options when absent (exactOptionalPropertyTypes-safe)', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'role', role: 'heading' };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.getByRole).toHaveBeenCalledWith('heading', {});
  });

  it('role: accepts a RegExp name', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'role', role: 'heading', name: /dashboard/i };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.getByRole).toHaveBeenCalledWith('heading', { name: /dashboard/i });
  });

  it('testId', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'testId', testId: 'submit-btn' };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.getByTestId).toHaveBeenCalledWith('submit-btn');
  });

  it('label', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'label', label: 'Username' };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.getByLabel).toHaveBeenCalledWith('Username');
  });

  it('text', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'text', text: 'Welcome' };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.getByText).toHaveBeenCalledWith('Welcome');
  });

  it('css', () => {
    const { scope, raw, fakeLocator } = fakeScope();
    const spec: LocatorSpec = { kind: 'css', css: '.btn-primary' };
    expect(buildLocator(scope, spec)).toBe(fakeLocator);
    expect(raw.locator).toHaveBeenCalledWith('.btn-primary');
  });

  it('custom: delegates to resolve(scope)', () => {
    const { scope } = fakeScope();
    const customLocator = { marker: 'custom' } as unknown as Locator;
    const resolve = vi.fn(() => customLocator);
    const spec: LocatorSpec = { kind: 'custom', resolve, why: 'test escape hatch' };
    expect(buildLocator(scope, spec)).toBe(customLocator);
    expect(resolve).toHaveBeenCalledWith(scope);
  });

  it('assertNever throws on a synthetic bad kind', () => {
    const bogus = { kind: 'bogus' } as unknown as never;
    expect(() => assertNever(bogus)).toThrow(/unreachable LocatorSpec kind/);
  });
});

describe('Component.fromLocator', () => {
  it('wraps an existing Locator by identity for Button (bypasses the (scope,spec) ctor)', () => {
    const fakeLocator = { marker: 'btn-locator' } as unknown as Locator;
    const btn = Button.fromLocator(fakeLocator);
    expect(btn).toBeInstanceOf(Button);
    expect(btn).toBeInstanceOf(Component);
    expect(btn.locator).toBe(fakeLocator);
  });

  it('wraps an existing Locator by identity for Option (the Collection item class)', () => {
    const fakeLocator = { marker: 'opt-locator' } as unknown as Locator;
    const opt = Option.fromLocator(fakeLocator);
    expect(opt).toBeInstanceOf(Option);
    expect(opt.locator).toBe(fakeLocator);
  });
});

describe('Collection.nth', () => {
  it('returns the item component type through item.fromLocator (no cast chain)', () => {
    const nthLocator = { marker: 'nth-locator' } as unknown as Locator;
    const rootLocator = { nth: vi.fn(() => nthLocator) } as unknown as Locator;
    const collection = new Collection(rootLocator, Button);

    const item = collection.nth(2);

    expect(rootLocator.nth).toHaveBeenCalledWith(2);
    expect(item).toBeInstanceOf(Button);
    expect(item.locator).toBe(nthLocator);
  });
});
