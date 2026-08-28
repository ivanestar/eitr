// Template for generating Dockerfile and .dockerignore for hermetic CI/CD container runs. create-if-absent.

export function renderDockerfile(tool?: string, language?: string): string {
  const lang = (language ?? 'typescript').toLowerCase();
  const t = (tool ?? 'playwright').toLowerCase();

  if (lang === 'python') {
    return `# Hermetic container configuration for Python Playwright test automation.
FROM mcr.microsoft.com/playwright/python:v1.50.0-noble

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && playwright install --with-deps

# Copy project files
COPY . .

# Set default CI environment variables
ENV CI=true

# Default test execution command
CMD ["pytest"]
`;
  }

  if (lang === 'csharp') {
    return `# Hermetic container configuration for C# .NET Playwright test automation.
FROM mcr.microsoft.com/playwright/dotnet:v1.50.0-noble

WORKDIR /app

# Restore dependencies
COPY *.csproj ./
RUN dotnet restore

# Copy and build project
COPY . .
RUN dotnet build -c Release

ENV CI=true

# Default test execution command
CMD ["dotnet", "test", "--no-build", "-c", "Release"]
`;
  }

  if (lang === 'java') {
    return `# Hermetic container configuration for Java Playwright test automation.
FROM mcr.microsoft.com/playwright/java:v1.50.0-noble

WORKDIR /app

# Cache dependencies
COPY pom.xml ./
RUN mvn dependency:go-offline

# Copy project and execute
COPY . .

ENV CI=true

CMD ["mvn", "test"]
`;
  }

  if (t === 'cypress') {
    return `# Hermetic container configuration for Cypress test automation.
FROM cypress/included:14.0.0

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy test files
COPY . .

ENV CI=true

# Default test execution command
CMD ["npx", "cypress", "run"]
`;
  }

  // Default: Playwright TypeScript / JavaScript
  return `# Hermetic container configuration for Playwright test automation.
FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# Install dependencies with locked versions
COPY package*.json ./
RUN npm ci

# Copy test code, components, and configuration
COPY . .

# Set CI environment indicator
ENV CI=true

# Default test execution command
CMD ["npx", "playwright", "test"]
`;
}

export function renderDockerignore(): string {
  return `node_modules/
test-results/
playwright-report/
blob-report/
cypress/videos/
cypress/screenshots/
.auth/
.tms-cache/
.git/
.github/
.gitlab/
.agents/
.claude/
.cursor/
.windsurf/
.codex/
bin/
obj/
target/
__pycache__/
.pytest_cache/
*.log
`;
}
