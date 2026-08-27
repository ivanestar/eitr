// vscode configurations for the generated project. create-if-absent.

export function renderVscodeExtensions(tool: string = 'playwright'): string {
  const ext =
    tool === 'cypress'
      ? 'cypress.cypress-intellij-by-cypress-io'
      : tool === 'pytest'
        ? 'ms-python.python'
        : 'ms-playwright.playwright';
  return `{
  "recommendations": ["${ext}", "esbenp.prettier-vscode"]
}
`;
}

export function renderVscodeLaunch(
  tool: string = 'playwright',
  _language: string = 'typescript',
): string {
  if (tool === 'cypress') {
    return `{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Cypress Open",
      "program": "\${workspaceRoot}/node_modules/cypress/bin/cypress",
      "args": ["open"],
      "console": "integratedTerminal"
    }
  ]
}
`;
  }
  if (tool === 'pytest') {
    return `{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Pytest",
      "type": "python",
      "request": "launch",
      "module": "pytest",
      "args": ["\${relativeFile}"],
      "console": "integratedTerminal"
    }
  ]
}
`;
  }
  return `{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Current Playwright Test",
      "program": "\${workspaceRoot}/node_modules/@playwright/test/cli.js",
      "args": ["test", "\${relativeFile}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
`;
}
