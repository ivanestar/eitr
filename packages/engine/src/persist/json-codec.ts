// RegExp-safe persistence for any .eitr file that stores a LocatorSpec (which may carry a
// RegExp `name`). Rationale: JSON.stringify(/x/i) === '{}' silently destroys a RegExp, so a spec
// like /dashboard/i would not survive a round-trip through disk. Currently used by apply() for
// .eitr/manifest.json (and by the recon/generation steps when they persist specs). 'custom'
// LocatorSpec (carrying a function) is never persisted, so a generic deep transform is safe.

interface EncodedRegExp {
  __regex: { source: string; flags: string };
}

function isEncodedRegExp(value: unknown): value is EncodedRegExp {
  return typeof value === 'object' && value !== null && '__regex' in value;
}

export function encodeJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => (v instanceof RegExp ? { __regex: { source: v.source, flags: v.flags } } : v),
    2,
  );
}

export function decodeJson<T>(text: string): T {
  return JSON.parse(text, (_key, v) =>
    isEncodedRegExp(v) ? new RegExp(v.__regex.source, v.__regex.flags) : v,
  ) as T;
}
