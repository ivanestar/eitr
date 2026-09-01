// overrides/README.md — create-if-absent seed (provenance origin 'seed'). Written once; never
// overwritten by a later run (the overrides/ tree is where real hand-customization lives). It sits
// beside components/ inside the project, so extensions import from ../components/.
export function renderOverridesReadme(): string {
  return `# overrides/

This directory is yours. The framework generator never overwrites files here (create-if-absent).

Import from the generated component library (\`../components/...\`) to extend or override behavior
instead of editing \`components/\` directly — that tree is generated once (create-if-absent, same as
this directory) and never touched again, but treating it as tool-owned keeps future manual updates
and any AI-assisted regeneration conflict-free.
`;
}
