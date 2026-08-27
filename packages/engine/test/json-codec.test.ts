import { describe, it, expect } from 'vitest';
import { encodeJson, decodeJson } from '../src/persist/json-codec.js';
import type { LocatorSpec } from '../src/types/locator-spec.js';

describe('json-codec', () => {
  it('encodes a RegExp as {__regex:{source,flags}}, never as {}', () => {
    const spec: LocatorSpec = { kind: 'role', role: 'button', name: /^Sign in$/i };
    const text = encodeJson(spec);
    const parsedRaw = JSON.parse(text) as { name: { __regex: { source: string; flags: string } } };
    expect(parsedRaw.name).toEqual({ __regex: { source: '^Sign in$', flags: 'i' } });
    expect(text).not.toContain('{}');
  });

  it('decodeJson reconstructs an identical RegExp (source + flags)', () => {
    const spec: LocatorSpec = { kind: 'role', role: 'heading', name: /dashboard/i };
    const decoded = decodeJson<LocatorSpec>(encodeJson(spec));
    expect(decoded.kind).toBe('role');
    if (decoded.kind === 'role') {
      expect(decoded.name).toBeInstanceOf(RegExp);
      expect((decoded.name as RegExp).source).toBe('dashboard');
      expect((decoded.name as RegExp).flags).toBe('i');
    }
  });

  it('leaves a string name untouched (only RegExp is transformed)', () => {
    const spec: LocatorSpec = { kind: 'role', role: 'combobox', name: 'Environment' };
    const decoded = decodeJson<LocatorSpec>(encodeJson(spec));
    expect(decoded).toEqual(spec);
  });

  it('round-trips a RegExp-bearing spec through encode -> decode unchanged', () => {
    const spec: LocatorSpec = { kind: 'role', role: 'heading', name: /dashboard/i };
    expect(decodeJson<LocatorSpec>(encodeJson(spec))).toEqual(spec);
  });
});
