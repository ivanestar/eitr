import { describe, it, expect } from 'vitest';
import { renderDockerfile, renderDockerignore } from '../../engine/src/plan/templates/docker.js';
import { planSharedScaffold } from '../../engine/src/plan/shared.js';

describe('Task 3: Deterministic Dockerfile & Container Preset', () => {
  it('AC-1: renderDockerfile generates language & tool specific Dockerfiles', () => {
    // Playwright TypeScript
    const pwTs = renderDockerfile('playwright', 'typescript');
    expect(pwTs).toContain('FROM mcr.microsoft.com/playwright');
    expect(pwTs).toContain('WORKDIR /app');
    expect(pwTs).toContain('COPY package*.json');
    expect(pwTs).toContain('npm ci');
    expect(pwTs).toContain('CMD ["npx", "playwright", "test"]');

    // Cypress
    const cypress = renderDockerfile('cypress', 'typescript');
    expect(cypress).toContain('cypress');
    expect(cypress).toContain('npx');
    expect(cypress).toContain('cypress');

    // Python Playwright
    const python = renderDockerfile('playwright', 'python');
    expect(python).toContain('python');
    expect(python).toContain('pytest');

    // C# Playwright
    const csharp = renderDockerfile('playwright', 'csharp');
    expect(csharp).toContain('dotnet');

    // Java Playwright
    const java = renderDockerfile('playwright-maven', 'java');
    expect(java).toContain('mvn');
  });

  it('AC-2: renderDockerignore excludes node_modules, reports, caches and temporary assets', () => {
    const ignore = renderDockerignore();
    expect(ignore).toContain('node_modules/');
    expect(ignore).toContain('test-results/');
    expect(ignore).toContain('playwright-report/');
    expect(ignore).toContain('.auth/');
    expect(ignore).toContain('.tms-cache/');
    expect(ignore).toContain('.git/');
  });

  it('AC-3: planSharedScaffold includes Dockerfile and .dockerignore by default and supports suppression', () => {
    const defaultFiles = planSharedScaffold({});
    const dockerfile = defaultFiles.find((f) => f.path === 'Dockerfile');
    const dockerignore = defaultFiles.find((f) => f.path === '.dockerignore');

    expect(dockerfile).toBeDefined();
    expect(dockerfile?.writePolicy).toBe('create-if-absent');
    expect(dockerignore).toBeDefined();
    expect(dockerignore?.writePolicy).toBe('create-if-absent');

    // Suppressed when docker: false
    const suppressedFiles = planSharedScaffold({ docker: false });
    expect(suppressedFiles.find((f) => f.path === 'Dockerfile')).toBeUndefined();
    expect(suppressedFiles.find((f) => f.path === '.dockerignore')).toBeUndefined();
  });

  it('AC-4: Zero-Emoji and Zero Lock-in compliance in Dockerfile and .dockerignore', () => {
    const pwTs = renderDockerfile('playwright', 'typescript');
    const ignore = renderDockerignore();

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(pwTs)).toBe(false);
    expect(emojiRegex.test(ignore)).toBe(false);

    // Zero Lock-in
    expect(pwTs.toLowerCase()).not.toContain('eitr');
    expect(ignore.toLowerCase()).not.toContain('eitr');
  });
});
