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
  readonly isTs: boolean;

  constructor(isTs: boolean = true) {
    this.isTs = isTs;
  }

  planFiles(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const projectName = opts.projectName ?? 'cypress-tests';
    const ciCd = opts.ciCd ?? 'none';
    const isTs = this.isTs;
    const ext = isTs ? 'ts' : 'js';

    const files: FileDescriptor[] = [
      {
        path: `eitr.config.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderCypressEitrConfig(profile, isTs, ciCd) },
      },
      {
        path: `cypress.config.${ext}`,
        writePolicy: 'create-if-absent',
        provenance: { origin: 'config' },
        source: { kind: 'inline', text: renderCypressConfig(baseUrl, isTs) },
      },
      {
        path: 'package.json',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCypressPackageJson(projectName, isTs) },
      },
    ];

    if (isTs) {
      files.push({
        path: 'tsconfig.json',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCypressTsConfig() },
      });
    }

    files.push(
      // CPOM base classes
      {
        path: `components/base/component.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCypressComponentBase(isTs) },
      },
      {
        path: `components/base/base-page.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCypressBasePage(isTs) },
      },
      // Primitives
      {
        path: `components/primitives/button.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressButton(isTs) },
      },
      {
        path: `components/primitives/text-input.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressTextInput(isTs) },
      },
      {
        path: `components/primitives/checkbox.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressCheckbox(isTs) },
      },
      {
        path: `components/primitives/native-select.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressNativeSelect(isTs) },
      },
      {
        path: `components/primitives/link.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressLink(isTs) },
      },
      {
        path: `components/primitives/file-input.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressFileInput(isTs) },
      },
      {
        path: `components/primitives/radio.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressRadio(isTs) },
      },
      {
        path: `components/primitives/index.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'adapter' },
        source: { kind: 'inline', text: renderCypressPrimitivesIndex() },
      },
      // Widgets
      {
        path: `components/widgets/dialog.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressDialog(isTs) },
      },
      {
        path: `components/widgets/table.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCypressTable(isTs) },
      },
      {
        path: `components/widgets/index.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'adapter' },
        source: { kind: 'inline', text: renderCypressWidgetsIndex() },
      },
      {
        path: `shared/utils/api-client.${ext}`,
        writePolicy: 'regenerate',
        provenance: { origin: 'project' },
        source: { kind: 'inline', text: renderCypressApiClient(isTs) },
      },
      {
        path: `cypress/e2e/smoke.cy.${ext}`,
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
          text: renderCypressProjectReadme({ projectName, baseUrl, isTs }),
        },
      },
    );

    return files;
  }
}
