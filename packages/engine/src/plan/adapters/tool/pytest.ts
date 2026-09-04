import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL } from '../../types.js';
import {
  renderPyprojectToml,
  renderPythonConftest,
  renderPythonEnvExample,
  renderPythonTestBat,
  renderPythonTestSh,
  renderPythonExampleTest,
  renderPythonAuthSetup,
  renderPythonApiClient,
  renderPythonProjectReadme,
} from '../../templates/python/project.js';

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
      cia('.env.example', renderPythonEnvExample({ baseUrl })),
      cia('test.bat', renderPythonTestBat()),
      cia('test.sh', renderPythonTestSh()),
      cia('tests/test_smoke.py', renderPythonExampleTest({ baseUrl })),
      cia('tests/test_auth_setup.py', renderPythonAuthSetup()),
      cia('shared/__init__.py', '"""Shared package."""\n'),
      cia('shared/utils/__init__.py', '"""Shared utilities package."""\n'),
      cia('shared/utils/api_client.py', renderPythonApiClient({ baseUrl })),
      cia('README.md', renderPythonProjectReadme({ projectName, baseUrl })),
    ];
  }
}

export { PytestAdapter as PytestPlaywrightAdapter };
