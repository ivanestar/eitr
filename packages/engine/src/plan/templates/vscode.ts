// vscode configurations for the generated project. create-if-absent.

export function renderVscodeExtensions(
  tool: string = 'playwright',
  language: string = 'typescript',
): string {
  let ext: string;
  if (tool === 'cypress') {
    ext = 'cypress.cypress-intellij-by-cypress-io';
  } else if (tool === 'pytest') {
    ext = 'ms-python.python';
  } else if (language === 'java') {
    ext = 'redhat.java';
  } else if (language === 'csharp') {
    ext = 'ms-dotnettools.csharp';
  } else {
    ext = 'ms-playwright.playwright';
  }

  // Prettier is only relevant for TypeScript/JavaScript projects.
  const prettierExt =
    language === 'java' || language === 'csharp' ? '' : ', "esbenp.prettier-vscode"';

  return `{
  "recommendations": ["${ext}"${prettierExt}]
}
`;
}

export function renderVscodeLaunch(
  tool: string = 'playwright',
  language: string = 'typescript',
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
  if (language === 'java') {
    return `{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "java",
      "name": "Debug Current Playwright Test",
      "request": "launch",
      "mainClass": "org.junit.platform.console.ConsoleLauncher",
      "args": ["--select-class=\${command:java.test.currentClass}"],
      "console": "integratedTerminal"
    }
  ]
}
`;
  }
  if (language === 'csharp') {
    return `{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "coreclr",
      "name": "Debug Current NUnit Test",
      "request": "launch",
      "program": "dotnet",
      "args": ["test", "--filter", "FullyQualifiedName~\${input:testName}"],
      "console": "integratedTerminal"
    }
  ],
  "inputs": [
    {
      "id": "testName",
      "type": "promptString",
      "description": "Fully-qualified NUnit test name to run"
    }
  ]
}
`;
  }
  // Default: TypeScript / JavaScript + Playwright
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
