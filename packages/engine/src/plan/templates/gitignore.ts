// .gitignore for the generated project. Ignores install/run outputs, temporary files, and .eitr/ metadata.
export function renderGitignore(tool: string = 'playwright', language?: string): string {
  if (language === 'csharp') {
    return `bin/
obj/
TestResults/
test-results/
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/launch.json
!.vscode/mcp.json
.auth/
.eitr/
.eitr-tmp/
.env
.env.*
!.env.example
auth.json
.DS_Store
Thumbs.db
`;
  }
  if (language === 'java') {
    return `target/
build/
.gradle/
test-results/
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/launch.json
!.vscode/mcp.json
*.iml
.auth/
.eitr/
.eitr-tmp/
.env
.env.*
!.env.example
auth.json
.DS_Store
Thumbs.db
`;
  }
  if (tool === 'cypress') {
    return `node_modules/
cypress/screenshots/
cypress/videos/
cypress/downloads/
test-results/
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/launch.json
!.vscode/mcp.json
.auth/
.eitr/
.eitr-tmp/
.env
.env.*
!.env.example
auth.json
*.tsbuildinfo
.DS_Store
Thumbs.db
`;
  }
  if (tool === 'pytest') {
    return `.venv/
__pycache__/
.pytest_cache/
test-results/
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/launch.json
!.vscode/mcp.json
.auth/
.eitr/
.eitr-tmp/
.env
.env.*
!.env.example
auth.json
*.tsbuildinfo
.DS_Store
Thumbs.db
`;
  }
  return `node_modules/
test-results/
playwright-report/
blob-report/
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/launch.json
!.vscode/mcp.json
.auth/
.eitr/
.eitr-tmp/
.env
.env.*
!.env.example
auth.json
*.tsbuildinfo
.DS_Store
Thumbs.db
`;
}
