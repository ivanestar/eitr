// Shared helper for embedding arbitrary prose (an agent/skill description, an argument hint) into
// a single YAML frontmatter line safely. Two real generation bugs already shipped from
// interpolating this kind of free text into YAML unquoted before this became unconditional:
// an unescaped `argument-hint: [create|update]` parsed as a flow-sequence (array) instead of a
// string, and an unescaped `description: ...Two modes: create...` failed to parse at all (a
// colon+space inside a plain scalar reads as a nested mapping to a YAML 1.2 parser). Always
// double-quoting removes this whole bug class instead of only the one field that happened to
// break first - not conditional on whether the current value looks safe, since a future edit to
// any description can silently reintroduce either failure mode.

export function yamlSafeScalar(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
