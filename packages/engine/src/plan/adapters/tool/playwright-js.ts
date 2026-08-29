import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL, DEFAULT_PROJECT_NAME } from '../../types.js';
import {
  renderEitrJsConfig,
  renderPlaywrightJsConfig,
  renderJsPackageJson,
  renderJsExampleTest,
  renderJsFixtures,
  renderJsAuthSetup,
  renderJsApiClient,
  renderJsProjectReadme,
} from '../../templates/javascript/project.js';
import { renderEnvExample } from '../../templates/env-example.js';

export class PlaywrightJsAdapter implements ToolAdapter {
  readonly id = 'playwright';

  planFiles(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const projectName = opts.projectName ?? DEFAULT_PROJECT_NAME;
    const ciCd = opts.ciCd ?? 'none';

    return [
      {
        path: 'eitr.config.js',
        writePolicy: 'regenerate',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderEitrJsConfig(profile, ciCd) },
      },
      {
        path: 'playwright.config.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderPlaywrightJsConfig(baseUrl) },
      },
      {
        path: 'package.json',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderJsPackageJson(projectName) },
      },
      {
        path: 'tests/smoke.spec.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsExampleTest(profile.framework.value) },
      },
      {
        path: 'tests/fixtures.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsFixtures() },
      },
      {
        path: 'tests/auth.setup.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsAuthSetup() },
      },
      {
        path: '.env.example',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: {
          kind: 'inline',
          text: renderEnvExample(baseUrl, opts.taskTracker, opts.tmsProviders),
        },
      },
      {
        path: 'shared/utils/api-client.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderJsApiClient() },
      },
      {
        path: 'README.md',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderJsProjectReadme({ projectName, baseUrl }) },
      },
    ];
  }
}
