import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL } from '../../types.js';
import {
  renderJavaPom,
  renderJavaApiClient,
  renderJavaExampleTest,
  renderJavaProjectReadme,
} from '../../templates/java/project.js';

export class MavenAdapter implements ToolAdapter {
  readonly id = 'playwright-maven';

  planFiles(_profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const projectName = opts.projectName ?? 'java-playwright-tests';
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;

    return [
      {
        path: 'pom.xml',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderJavaPom({ projectName }) },
      },
      {
        path: 'src/main/java/shared/utils/ApiClient.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaApiClient() },
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
          text: renderJavaProjectReadme({ projectName, baseUrl, buildTool: 'maven' }),
        },
      },
    ];
  }
}

export { MavenAdapter as JavaPlaywrightMavenAdapter };
