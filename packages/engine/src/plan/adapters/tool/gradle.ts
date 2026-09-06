import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL } from '../../types.js';
import {
  renderJavaBuildGradle,
  renderJavaApiClient,
  renderJavaExampleTest,
  renderJavaProjectReadme,
  renderJavaEnvConfig,
} from '../../templates/java/project.js';
import { renderEnvExample } from '../../templates/env-example.js';

export class GradleAdapter implements ToolAdapter {
  readonly id = 'playwright-gradle';

  planFiles(_profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const projectName = opts.projectName ?? 'java-playwright-tests';
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;

    return [
      {
        path: 'build.gradle',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderJavaBuildGradle({ projectName }) },
      },
      {
        path: 'src/main/java/shared/utils/ApiClient.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaApiClient() },
      },
      {
        path: 'src/main/java/shared/utils/EnvConfig.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaEnvConfig() },
      },
      {
        path: '.env',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: {
          kind: 'inline',
          text: renderEnvExample(baseUrl, opts.taskTracker, opts.tmsProviders),
        },
      },
      {
        path: 'src/test/java/tests/SmokeTest.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderJavaExampleTest() },
      },
      {
        path: 'README.md',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: {
          kind: 'inline',
          text: renderJavaProjectReadme({ projectName, baseUrl, buildTool: 'gradle' }),
        },
      },
    ];
  }
}

export { GradleAdapter as JavaPlaywrightGradleAdapter };
