// overrides/README.md — create-if-absent seed (provenance origin 'seed'). Written once; never
// overwritten by a later run (the overrides/ tree is where real hand-customization lives). It sits
// beside components/ inside the project, so extensions import from ../components/.
export function renderOverridesReadme(): string {
  return `# overrides/

This directory is yours. The framework generator never overwrites files here (create-if-absent).

Import from the generated component library (\`../components/...\`) to extend or override behavior
instead of editing \`components/\` directly — that tree is 100% tool-owned and regenerated on every run.
`;
}
