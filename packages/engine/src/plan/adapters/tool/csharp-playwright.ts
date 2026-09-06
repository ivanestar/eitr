import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import {
  renderCsharpCsproj,
  renderCsharpRunsettings,
  renderCsharpApiClient,
  renderCsharpExampleTest,
  renderCsharpProjectReadme,
  renderCsharpEnvSetup,
} from '../../templates/csharp/project.js';
import { renderEnvExample } from '../../templates/env-example.js';

export class CsharpPlaywrightAdapter implements ToolAdapter {
  readonly id = 'playwright';

  planFiles(_profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? 'http://localhost:3000';
    const projectName = opts.projectName ?? 'PlaywrightCsharpTests';

    return [
      {
        path: `${projectName}.csproj`,
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCsharpCsproj({ projectName, baseUrl }) },
      },
      {
        path: 'test.runsettings',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCsharpRunsettings({ projectName, baseUrl }) },
      },
      {
        path: 'shared/utils/ApiClient.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCsharpApiClient() },
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
        path: 'EnvSetup.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCsharpEnvSetup() },
      },
      {
        path: 'tests/SmokeTest.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCsharpExampleTest() },
      },
      {
        path: 'README.md',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCsharpProjectReadme({ projectName, baseUrl }) },
      },
    ];
  }
}
