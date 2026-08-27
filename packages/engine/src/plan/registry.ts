import type { TargetGenerator } from './types.js';
import { PlaywrightTsGenerator } from './generators/playwright-ts.js';
import { PlaywrightJsGenerator } from './generators/playwright-js.js';
import { PytestPlaywrightGenerator } from './generators/pytest-playwright.js';
import { CypressTsGenerator } from './generators/cypress-ts.js';
import { CypressJsGenerator } from './generators/cypress-js.js';
import { CsharpPlaywrightGenerator } from './generators/csharp-playwright.js';
import { JavaPlaywrightMavenGenerator } from './generators/java-playwright-maven.js';
import { JavaPlaywrightGradleGenerator } from './generators/java-playwright-gradle.js';

export const TARGET_GENERATORS: TargetGenerator[] = [
  new PlaywrightTsGenerator(),
  new PlaywrightJsGenerator(),
  new PytestPlaywrightGenerator('playwright'),
  new PytestPlaywrightGenerator('pytest'),
  new CypressTsGenerator(),
  new CypressJsGenerator(),
  new CsharpPlaywrightGenerator(),
  new JavaPlaywrightMavenGenerator('playwright'),
  new JavaPlaywrightMavenGenerator('playwright-maven'),
  new JavaPlaywrightGradleGenerator(),
];
