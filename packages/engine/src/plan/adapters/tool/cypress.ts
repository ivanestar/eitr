import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { ToolAdapter, PlanOptions } from '../../types.js';
import { DEFAULT_BASE_URL } from '../../types.js';
import {
  renderCypressEitrConfig,
  renderCypressConfig,
  renderCypressPackageJson,
  renderCypressTsConfig,
  renderCypressComponentBase,
  renderCypressBasePage,
  renderCypressButton,
  renderCypressTextInput,
  renderCypressCheckbox,
  renderCypressNativeSelect,
  renderCypressSelect,
  renderCypressElement,
  renderCypressHeading,
  renderCypressLink,
  renderCypressFileInput,
  renderCypressRadio,
  renderCypressPrimitivesIndex,
  renderCypressDialog,
  renderCypressTable,
  renderCypressWidgetsIndex,
  renderCypressApiClient,
  renderCypressExampleTest,
  renderCypressProjectReadme,
} from '../../templates/cypress/project.js';
import { renderEnvExample } from '../../templates/env-example.js';

export class CypressAdapter implements ToolAdapter {
  readonly id = 'cypress';

  planFiles(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const projectName = opts.projectName ?? 'cypress-tests';
    const ciCd = opts.ciCd ?? 'none';

    const files: FileDescriptor[] = [
      {
        path: 'eitr.config.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderCypressEitrConfig(profile, ciCd) },
      },
      {
        path: 'cypress.config.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderCypressConfig(baseUrl) },
      },
      {
        path: 'package.json',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCypressPackageJson(projectName) },
      },
      {
        path: 'tsconfig.json',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCypressTsConfig() },
      },
    ];

    files.push(
      // CPOM base classes
      {
        path: 'components/base/component.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCypressComponentBase() },
      },
      {
        path: 'components/base/base-page.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCypressBasePage() },
      },
      // Primitives
      {
        path: 'components/primitives/button.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressButton() },
      },
      {
        path: 'components/primitives/text-input.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressTextInput() },
      },
      {
        path: 'components/primitives/checkbox.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressCheckbox() },
      },
      {
        path: 'components/primitives/native-select.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressNativeSelect() },
      },
      {
        path: 'components/primitives/select.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressSelect() },
      },
      {
        path: 'components/primitives/element.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressElement() },
      },
      {
        path: 'components/primitives/heading.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressHeading() },
      },
      {
        path: 'components/primitives/link.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressLink() },
      },
      {
        path: 'components/primitives/file-input.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressFileInput() },
      },
      {
        path: 'components/primitives/radio.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressRadio() },
      },
      {
        path: 'components/primitives/index.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'adapter' },
        source: { kind: 'inline', text: renderCypressPrimitivesIndex() },
      },
      // Widgets
      {
        path: 'components/widgets/dialog.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressDialog() },
      },
      {
        path: 'components/widgets/table.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressTable() },
      },
      {
        path: 'components/widgets/index.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'adapter' },
        source: { kind: 'inline', text: renderCypressWidgetsIndex() },
      },
      {
        path: 'shared/utils/api-client.ts',
        writePolicy: 'regenerate',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCypressApiClient() },
      },
      {
        path: 'cypress/e2e/smoke.cy.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCypressExampleTest() },
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
        path: 'README.md',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: {
          kind: 'inline',
          text: renderCypressProjectReadme({ projectName, baseUrl }),
        },
      },
    );

    return files;
  }
}
