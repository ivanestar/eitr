// .prettierrc.json for the generated project (create-if-absent). The formatting authority for the
// project's own code — matches the style the scaffold engine emits, so `npm run format` is a no-op on
// generated files and keeps your added tests/Page Objects consistent.
export function renderPrettierrc(): string {
  const config = {
    singleQuote: true,
    printWidth: 100,
    semi: true,
    trailingComma: 'all',
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
