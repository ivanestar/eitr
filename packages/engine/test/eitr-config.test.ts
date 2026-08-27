import { describe, it, expect } from 'vitest';
import { renderEitrConfig } from '../src/plan/templates/eitr-config.js';
import { renderPlaywrightConfig } from '../src/plan/templates/playwright-config.js';
import { muiProfile } from './helpers.js';

describe('renderEitrConfig (machine defaults, no baseURL)', () => {
  it('wires the profile testIdAttribute and keeps machine defaults, without a baseURL', () => {
    const profile = muiProfile();
    profile.testIdAttribute = {
      value: 'data-qa',
      confidence: 'high',
      source: 'default',
      evidence: [],
    };
    const out = renderEitrConfig(profile);

    expect(out).toContain("testIdAttribute: 'data-qa'");
    expect(out).toContain('export const eitrConfig');
    expect(out).toContain('satisfies Partial<PlaywrightTestConfig>');
    expect(out).toContain("testDir: './tests'");
    expect(out).toContain("['list']"); // console reporter
    expect(out).toContain("name: 'chromium'");
    expect(out).not.toContain('baseURL'); // baseURL belongs to playwright.config.ts only
  });

  it('automatically adds JUnit reporter when a CI/CD tool is specified', () => {
    const profile = muiProfile();
    const out = renderEitrConfig(profile, 'github');
    expect(out).toContain("['junit', { outputFile: 'playwright-report/junit-results.xml' }]");
  });
});

describe('renderPlaywrightConfig (real, user-owned config)', () => {
  it('spreads eitrConfig and pins the baseURL', () => {
    const out = renderPlaywrightConfig('http://app.test:3000');
    expect(out).toContain('defineConfig');
    expect(out).toContain("import { eitrConfig } from './eitr.config'");
    expect(out).toContain('...eitrConfig');
    expect(out).toContain('http://app.test:3000');
    expect(out).toContain('baseURL');
  });
});
