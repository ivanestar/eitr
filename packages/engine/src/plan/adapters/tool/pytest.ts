import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL } from '../../types.js';
import {
  renderPyprojectToml,
  renderPythonConftest,
  renderPythonTestBat,
  renderPythonTestSh,
  renderPythonExampleTest,
  renderPythonAuthSetup,
  renderPythonApiClient,
  renderPythonProjectReadme,
} from '../../templates/python/project.js';
import { renderEnvExample } from '../../templates/env-example.js';

export class PytestAdapter implements ToolAdapter {
  readonly id = 'pytest';

  planFiles(_profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const projectName = opts.projectName ?? 'pytest-tests';

    const cia = (path: string, text: string): FileDescriptor => ({
      path,
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text },
    });

    return [
      cia('pyproject.toml', renderPyprojectToml({ projectName, baseUrl })),
      cia('conftest.py', renderPythonConftest({ baseUrl })),
      cia('.env', renderEnvExample(baseUrl, opts.taskTracker, opts.tmsProviders)),
      cia('test.bat', renderPythonTestBat()),
      cia('test.sh', renderPythonTestSh()),
      cia('tests/test_smoke.py', renderPythonExampleTest({ baseUrl })),
      cia('fixtures/auth_setup.py', renderPythonAuthSetup()),
      cia('fixtures/__init__.py', '"""Fixtures package."""\n'),
      cia('shared/__init__.py', '"""Shared package."""\n'),
      cia('shared/utils/__init__.py', '"""Shared utilities package."""\n'),
      cia('shared/utils/api_client.py', renderPythonApiClient({ baseUrl })),
      cia('README.md', renderPythonProjectReadme({ projectName, baseUrl })),
    ];
  }
}

export { PytestAdapter as PytestPlaywrightAdapter };
