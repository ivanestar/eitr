import { describe, it, expect, vi, afterEach } from 'vitest';
// Default (CJS-interop) import: 'node:fs' named/namespace exports are read-only live bindings that
// vi.spyOn cannot redefine, but the default export is the same mutable CJS exports object, so its
// methods CAN be stubbed for the duration of a single test.
import fs from 'node:fs';
import { plan } from '../src/plan/plan.js';
import { ENGINE_VERSION } from '../src/version.js';
import { muiProfile, planOptions } from './helpers.js';

describe('plan() purity (D1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs untouched with fs and network stubbed to throw on any access', () => {
    const profile = muiProfile();
    const opts = planOptions();

    const throwErr = (label: string): never => {
      throw new Error(`plan() must not touch ${label}`);
    };
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => throwErr('fs.readFileSync'));
    vi.spyOn(fs.promises, 'readFile').mockImplementation(
      () => throwErr('fs.promises.readFile') as never,
    );
    const originalFetch = globalThis.fetch;
    // @ts-expect-error -- intentionally poisoning fetch for the duration of this test
    globalThis.fetch = () => throwErr('fetch');

    try {
      const result = plan(profile, opts);
      expect(result.engineVersion).toBe(ENGINE_VERSION);
      expect(result.files.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
