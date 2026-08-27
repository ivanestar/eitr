import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL, DEFAULT_PROJECT_NAME } from '../../types.js';
import { renderEitrConfig } from '../../templates/eitr-config.js';
import { renderPlaywrightConfig } from '../../templates/playwright-config.js';
import { renderPackageJson } from '../../templates/package-json.js';
import { renderExampleTest } from '../../templates/example-test.js';
import { renderFixtures } from '../../templates/fixtures.js';
import { renderAuthSetup } from '../../templates/auth-setup.js';
import { renderEnvExample } from '../../templates/env-example.js';
import { renderApiClient } from '../../templates/api-client.js';
import { renderProjectReadme } from '../../templates/readme.js';

export class PlaywrightAdapter implements ToolAdapter {
  readonly id = 'playwright';

  planFiles(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const projectName = opts.projectName ?? DEFAULT_PROJECT_NAME;
    const ciCd = opts.ciCd ?? 'none';

    return [
      {
        path: 'eitr.config.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderEitrConfig(profile, ciCd) },
      },
      {
        path: 'playwright.config.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderPlaywrightConfig(baseUrl) },
      },
      {
        path: 'package.json',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderPackageJson(projectName) },
      },
      {
        path: 'tests/smoke.spec.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderExampleTest(profile.framework.value) },
      },
      {
        path: 'tests/fixtures.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderFixtures() },
      },
      {
        path: 'tests/auth.setup.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderAuthSetup() },
      },
      {
        path: '.env.example',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderEnvExample(baseUrl) },
      },
      {
        path: 'shared/utils/api-client.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderApiClient() },
      },
      {
        path: 'README.md',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderProjectReadme(projectName, profile.framework.value) },
      },
    ];
  }
}
